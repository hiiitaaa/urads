/**
 * Playwright ブラウザ管理
 * stealth対策 + 人間らしい動き + Cookie永続化
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

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
    browser = await chromium.launch({
      channel: 'chrome', // システムのGoogle Chromeを使用
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
    } catch {
      // 復号失敗は無視（再ログインが必要）
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
  }
}

/**
 * ログイン状態チェック
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  try {
    const loginForm = await page.locator('input[name="username"]').count();
    return loginForm === 0;
  } catch {
    return false;
  }
}

// =====================
// 人間らしい動き
// =====================

/**
 * ランダム遅延
 */
export async function humanDelay(page: Page, min = 2000, max = 5000): Promise<void> {
  const delay = min + Math.random() * (max - min);
  await page.waitForTimeout(delay);
}

/**
 * 段階的スクロール
 */
export async function humanScroll(page: Page, steps = 3): Promise<void> {
  for (let i = 0; i < steps; i++) {
    const distance = 100 + Math.random() * 300;
    await page.mouse.wheel(0, distance);
    await humanDelay(page, 1000, 3000);
  }
}
