/**
 * Playwright ブラウザ管理
 * stealth対策 + 人間らしい動き + Cookie永続化
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { createLogger } from '../../unified-logger';

const log = createLogger('scraper');

const STORAGE_STATE_PATH = join(app.getPath('userData'), 'threads-browser-state.enc');
const ENCRYPTION_KEY = 'urads-scraper-cookie-key-32byte!'; // 32 bytes for AES-256

let browser: Browser | null = null;
let context: BrowserContext | null = null;

/**
 * stealth パッチ（navigator.webdriver除去等）
 */
const STEALTH_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  delete navigator.__proto__.webdriver;

  Object.defineProperty(navigator, 'plugins', {
    get: () => [1, 2, 3, 4, 5],
  });

  Object.defineProperty(navigator, 'languages', {
    get: () => ['ja', 'en-US', 'en'],
  });

  window.chrome = { runtime: {} };
`;

/**
 * ブラウザ起動（headless or headed）
 */
export async function launchBrowser(headed = false): Promise<{ context: BrowserContext; page: Page }> {
  if (!browser || !browser.isConnected()) {
    log.info(`Chrome起動: ${headed ? 'headed' : 'headless'}`);
    browser = await chromium.launch({
      channel: 'chrome',
      headless: !headed,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });
  }

  // Cookie復元（暗号化ファイルから）
  let storageState: unknown = undefined;
  if (existsSync(STORAGE_STATE_PATH)) {
    try {
      const encrypted = readFileSync(STORAGE_STATE_PATH, 'utf-8');
      const decrypted = decryptCookies(encrypted);
      storageState = JSON.parse(decrypted);
      // ログイン中のアカウントを特定
      const state = storageState as { cookies?: Array<{ name: string; value: string }> };
      const userCookie = state.cookies?.find(c => c.name === 'ds_user_id' || c.name === 'sessionid');
      const userIdCookie = state.cookies?.find(c => c.name === 'ds_user_id');
      log.info(`Cookie復元: 成功 (user_id=${userIdCookie?.value || '不明'}, cookies=${state.cookies?.length || 0}件)`);
    } catch {
      log.warn('Cookie復元: 失敗（再ログイン必要）');
    }
  }

  context = await browser.newContext({
    storageState,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  });

  const page = await context.newPage();

  // stealth パッチ適用
  await page.addInitScript(STEALTH_SCRIPT);

  return { context, page };
}

/**
 * Cookie暗号化保存
 */
export async function saveStorageState(): Promise<void> {
  if (context) {
    const state = await context.storageState();
    const encrypted = encryptCookies(JSON.stringify(state));
    writeFileSync(STORAGE_STATE_PATH, encrypted, { mode: 0o600 });
  }
}

/**
 * 保存済みCookieからログイン中のThreadsユーザーIDを取得
 */
export function getScraperUserId(): string | null {
  if (!existsSync(STORAGE_STATE_PATH)) return null;
  try {
    const encrypted = readFileSync(STORAGE_STATE_PATH, 'utf-8');
    const decrypted = decryptCookies(encrypted);
    const state = JSON.parse(decrypted) as { cookies?: Array<{ name: string; value: string }> };
    const userIdCookie = state.cookies?.find(c => c.name === 'ds_user_id');
    return userIdCookie?.value || null;
  } catch {
    return null;
  }
}

// --- 許可済みユーザーID管理 ---
const ALLOWED_USERS_PATH = join(app.getPath('userData'), 'scraper-allowed-users.json');
const LAST_REFRESH_PATH = join(app.getPath('userData'), 'scraper-last-refresh.txt');

export function saveAllowedUserId(userId: string): void {
  let list: string[] = [];
  try {
    if (existsSync(ALLOWED_USERS_PATH)) {
      list = JSON.parse(readFileSync(ALLOWED_USERS_PATH, 'utf-8'));
    }
  } catch { /* 破損時は空リスト */ }
  if (!list.includes(userId)) list.push(userId);
  writeFileSync(ALLOWED_USERS_PATH, JSON.stringify(list), { mode: 0o600 });
  log.info(`許可リスト更新: ${userId} (${list.length}件)`);
}

export function isAllowedUserId(userId: string): boolean {
  try {
    if (!existsSync(ALLOWED_USERS_PATH)) return false;
    const list = JSON.parse(readFileSync(ALLOWED_USERS_PATH, 'utf-8')) as string[];
    return list.includes(userId);
  } catch {
    return false;
  }
}

/**
 * Cookie自動延長（1日1回）
 * headless で threads.net を開き、Cookie を更新する
 */
export async function refreshSession(): Promise<{ ok: boolean; authenticated: boolean }> {
  // Cookieなければスキップ
  if (!existsSync(STORAGE_STATE_PATH)) {
    return { ok: false, authenticated: false };
  }

  // 24時間以内に延長済みならスキップ
  try {
    if (existsSync(LAST_REFRESH_PATH)) {
      const lastRefresh = parseInt(readFileSync(LAST_REFRESH_PATH, 'utf-8'), 10);
      if (Date.now() - lastRefresh < 24 * 60 * 60 * 1000) {
        log.info('Cookie延長: 24時間以内に実行済み、スキップ');
        return { ok: true, authenticated: true };
      }
    }
  } catch { /* ファイル破損時は続行 */ }

  try {
    log.info('Cookie延長: 開始');
    const { page } = await launchBrowser(false);

    await page.goto('https://www.threads.net/', {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });

    const authed = await isAuthenticated(page);
    await saveStorageState();
    await closeBrowser();

    if (authed) {
      writeFileSync(LAST_REFRESH_PATH, String(Date.now()));
      const userId = getScraperUserId();
      log.info(`Cookie延長: 成功 (user_id=${userId})`);
      return { ok: true, authenticated: true };
    } else {
      log.warn('Cookie延長: セッション期限切れ（再ログイン必要）');
      return { ok: true, authenticated: false };
    }
  } catch (err) {
    await closeBrowser().catch(() => {});
    log.warn('Cookie延長: 失敗', { error: String(err) });
    return { ok: false, authenticated: false };
  }
}

/**
 * AES-256-CBC暗号化
 */
function encryptCookies(plaintext: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'utf-8'), iv);
  let encrypted = cipher.update(plaintext, 'utf-8', 'base64');
  encrypted += cipher.final('base64');
  return iv.toString('base64') + '.' + encrypted;
}

/**
 * AES-256-CBC復号
 */
function decryptCookies(encrypted: string): string {
  const parts = encrypted.split('.');
  if (parts.length !== 2) throw new Error('Invalid encrypted format');
  const iv = Buffer.from(parts[0], 'base64');
  const decipher = createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'utf-8'), iv);
  let decrypted = decipher.update(parts[1], 'base64', 'utf-8');
  decrypted += decipher.final('utf-8');
  return decrypted;
}

/**
 * ブラウザ終了
 */
export async function closeBrowser(): Promise<void> {
  if (context) {
    await saveStorageState();
    await context.close();
    context = null;
  }
  if (browser) {
    await browser.close();
    browser = null;
    log.info('Chrome終了');
  }
}

/**
 * ログイン状態チェック
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  try {
    // 複数の方法でログインページを検出
    const loginForm = await page.locator('input[name="username"]').count();
    if (loginForm > 0) return false;

    // ページタイトルで検出（「Threads・ログイン」等）
    const title = await page.title();
    if (title.includes('ログイン') || title.includes('Login') || title.includes('Sign in')) {
      log.warn(`認証NG: ページタイトル="${title}"`);
      return false;
    }

    // URLで検出（/login にリダイレクトされた場合）
    const url = page.url();
    if (url.includes('/login') || url.includes('/accounts/login')) {
      log.warn(`認証NG: URL="${url}"`);
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

// =====================
// 人間らしい動き
// =====================

/** 正規分布に近いランダム値（中央に寄りやすい＝人間的） */
function gaussRandom(min: number, max: number): number {
  // Box-Muller法の簡易版: 2つの一様乱数の平均で中央寄りに
  const u = (Math.random() + Math.random() + Math.random()) / 3;
  return min + u * (max - min);
}

/**
 * ランダム遅延（人間的な分布）
 * たまに長い「ぼーっとする」時間が入る
 */
export async function humanDelay(page: Page, min = 2000, max = 5000): Promise<void> {
  // 5%の確率で「気が散る」長めの間（読み込み待ちや通知確認）
  const distracted = Math.random() < 0.05;
  const delay = distracted
    ? gaussRandom(max, max * 2.5)
    : gaussRandom(min, max);
  await page.waitForTimeout(delay);
}

/**
 * マウスをランダムに動かす（コンテンツを眺めている風）
 */
async function humanMouseWander(page: Page): Promise<void> {
  const viewport = page.viewportSize() || { width: 1280, height: 720 };
  const moves = 1 + Math.floor(Math.random() * 3); // 1-3回動かす

  for (let i = 0; i < moves; i++) {
    // コンテンツエリア内をゆるく移動（端には行かない）
    const x = gaussRandom(viewport.width * 0.15, viewport.width * 0.85);
    const y = gaussRandom(viewport.height * 0.2, viewport.height * 0.8);
    const steps = Math.floor(gaussRandom(8, 25)); // 移動の滑らかさ
    await page.mouse.move(x, y, { steps });
    await page.waitForTimeout(gaussRandom(200, 800));
  }
}

/**
 * 段階的スクロール（人間のブラウジングを模倣）
 *
 * 人間の特徴:
 * - スクロール量がバラバラ（興味ある投稿で止まる）
 * - たまに上に戻る（読み直し）
 * - マウスがコンテンツ上を動く
 * - 「読む」間がある（投稿の長さに応じて）
 */
export async function humanScroll(page: Page, steps = 3): Promise<void> {
  for (let i = 0; i < steps; i++) {
    // ── スクロール速度にリズムをつける ──
    // 序盤はゆっくり、中盤は速め、終盤はまたゆっくり
    const progress = i / Math.max(steps - 1, 1);
    const speedFactor = 1 - 0.4 * Math.sin(progress * Math.PI); // 0.6〜1.0

    // スクロール量: 150〜500px（速度ファクター適用）
    const baseDistance = gaussRandom(150, 500);
    const distance = baseDistance * speedFactor;

    // ── スクロール実行 ──
    await page.mouse.wheel(0, distance);

    // ── 「読む」時間（スクロール後の停止） ──
    const readTime = gaussRandom(1200, 4000);
    await page.waitForTimeout(readTime);

    // ── 30%の確率でマウスを動かす（コンテンツを眺めている風） ──
    if (Math.random() < 0.3) {
      await humanMouseWander(page);
    }

    // ── 12%の確率で少し上に戻る（読み直し） ──
    if (Math.random() < 0.12 && i > 0) {
      const scrollBack = gaussRandom(50, 200);
      await page.mouse.wheel(0, -scrollBack);
      await page.waitForTimeout(gaussRandom(800, 2500));
    }

    // ── 8%の確率で長めの「読み込み待ち」（投稿を読んでいる） ──
    if (Math.random() < 0.08) {
      await page.waitForTimeout(gaussRandom(3000, 7000));
    }
  }
}
