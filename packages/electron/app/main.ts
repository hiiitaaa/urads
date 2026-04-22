import log from './logger';

process.on('uncaughtException', (err) => log.error('Uncaught exception:', err));
process.on('unhandledRejection', (err) => log.error('Unhandled rejection:', err));

import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import { openAuthWindow } from './modules/auth/threads-oauth';
import { net } from 'electron';
import { copyFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { processMessage, getSessionInfo, clearHistory, cancelMessage, listSkills } from './modules/chat/session-manager';
import { MessageQueue } from './modules/chat/message-queue';
import { getActiveMessages } from './modules/chat/session-store';

const chatQueue = new MessageQueue(processMessage);
import { scrapeTrending, scrapeBenchmark, scrapeSearch, scrapeOwnInsights, openLoginBrowser } from './modules/scraper/feed-scraper';
import { execFile, type ChildProcess } from 'child_process';
import { getApiBase } from './modules/config/api-base';
import { setWorkersUrl, isSetupCompleted, completeSetup } from './modules/config/app-config-store';
import { LocalClaudeCodeExecutor } from './modules/ai/local-executor';
import { runBuzzRewrite, type RunBuzzRewriteInput } from './modules/ai/buzz-rewrite-orchestrator';

const aiExecutor = new LocalClaudeCodeExecutor();

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Urads',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// IPC: Threads OAuth認証
// 1. Workers から認可URLを取得
// 2. BrowserWindow で認可コード取得
// 3. Workers にコードを送ってトークン交換+保存
ipcMain.handle('threads:auth', async () => {
  // 1. 認可URL取得
  const apiBase = getApiBase();
  log.info(`[threads:auth] Step 1: Fetching auth URL from ${apiBase}/license/auth-url`);
  const urlRes = await net.fetch(`${apiBase}/license/auth-url`);
  log.info(`[threads:auth] Step 1 response: ${urlRes.status} ${urlRes.statusText}`);
  const authData = await urlRes.json() as {
    url: string; state: string; redirect_uri: string;
  };
  log.info(`[threads:auth] Step 1 data: redirect_uri=${authData.redirect_uri}, hasUrl=${!!authData.url}`);

  // 2. 認可コード取得
  log.info('[threads:auth] Step 2: Opening auth window');
  const code = await openAuthWindow(authData.url, authData.redirect_uri);
  log.info(`[threads:auth] Step 2: Got auth code (length=${code.length})`);

  // 3. Workers でトークン交換+D1保存
  log.info('[threads:auth] Step 3: Exchanging code for token');
  const exchangeRes = await net.fetch(`${apiBase}/license/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  log.info(`[threads:auth] Step 3 response: ${exchangeRes.status} ${exchangeRes.statusText}`);

  if (!exchangeRes.ok) {
    const err = await exchangeRes.json() as { error: string };
    log.error(`[threads:auth] Exchange failed: ${JSON.stringify(err)}`);
    throw new Error(err.error);
  }

  const result = await exchangeRes.json();
  log.info('[threads:auth] Auth completed successfully');
  return result;
});

// IPC: 保存済みアカウント一覧を取得
ipcMain.handle('threads:getAccounts', async () => {
  log.info(`[threads:getAccounts] Fetching from ${getApiBase()}/accounts`);
  const response = await net.fetch(`${getApiBase()}/accounts`);
  log.info(`[threads:getAccounts] Response: ${response.status}`);
  const data = await response.json() as { accounts: unknown[] };
  log.info(`[threads:getAccounts] Got ${data.accounts?.length ?? 0} accounts`);
  return data.accounts;
});

// IPC: アカウント削除
ipcMain.handle('threads:deleteAccount', async (_event, accountId: string) => {
  await net.fetch(`${getApiBase()}/accounts/${accountId}`, { method: 'DELETE' });
  return { deleted: true };
});

// IPC: ollama テキスト生成（ローカルLLM）
let ollamaProcess: ChildProcess | null = null;

ipcMain.handle('ai:generate:ollama', async (_event, opts: { prompt: string; model?: string }) => {
  return new Promise((resolve, reject) => {
    ollamaProcess = execFile(
      'ollama', ['run', opts.model || 'llama3', opts.prompt],
      { encoding: 'utf-8', timeout: 120000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        ollamaProcess = null;
        if (error) {
          if ((error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
            reject(new Error('ollama生成がタイムアウトしました（120秒）'));
          } else {
            reject(new Error(`ollamaエラー: ${(stderr || '').slice(0, 200)}`));
          }
        } else {
          resolve({ text: stdout.trim() });
        }
      },
    );
  });
});

// IPC: ollama 生成キャンセル
ipcMain.handle('ai:generate:cancel', async () => {
  if (ollamaProcess) {
    ollamaProcess.kill();
    ollamaProcess = null;
    return { cancelled: true };
  }
  return { cancelled: false };
});

// IPC: ollama 可用性チェック
ipcMain.handle('ai:ollama:check', async () => {
  return new Promise((resolve) => {
    execFile('ollama', ['--version'], { timeout: 5000 }, (error, stdout) => {
      if (error) {
        resolve({ available: false });
      } else {
        resolve({ available: true, version: stdout.trim() });
      }
    });
  });
});

// IPC: チャットエージェント（V2セッション管理 + スキル + キュー）
ipcMain.handle('chat:sendMessage', async (_event, payload: { message?: string; skill?: string }) => {
  return chatQueue.enqueue(payload);
});

ipcMain.handle('chat:listSkills', async () => {
  return listSkills();
});

ipcMain.handle('chat:getHistory', async () => {
  return getActiveMessages();
});

ipcMain.handle('chat:cancelMessage', async () => {
  cancelMessage();
  return { cancelled: true };
});

ipcMain.handle('ai:runBuzzRewrite', async (_event, input: RunBuzzRewriteInput) => {
  if (!input || typeof input.scraped_post_id !== 'string' || typeof input.account_id !== 'string') {
    return { ok: false, skipped: false, error: 'scraped_post_id と account_id が必要です' };
  }
  return runBuzzRewrite(aiExecutor, input);
});

ipcMain.handle('chat:getSessionInfo', async () => {
  return getSessionInfo();
});

// IPC: メディアアップロード
// メディアはThreads APIがダウンロードできる公開URLが必要なため、本番Workersに直接アップロード
const MEDIA_ARCHIVE_DIR = join(app.getPath('userData'), 'media-archive');

ipcMain.handle('media:pickFiles', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '画像', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
      { name: '動画', extensions: ['mp4', 'mov', 'webm'] },
      { name: 'すべて', extensions: ['*'] },
    ],
  });
  if (result.canceled) return { files: [] };
  return { files: result.filePaths };
});

ipcMain.handle('media:upload', async (_event, filePath: string) => {
  try {
    const fileData = readFileSync(filePath);
    const fileName = filePath.split(/[/\\]/).pop() || 'file';
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp',
      mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';

    // FormDataでアップロード
    const formData = new FormData();
    formData.append('file', new Blob([fileData], { type: contentType }), fileName);

    const res = await net.fetch(`${getApiBase()}/media/upload`, {
      method: 'POST',
      body: formData as unknown as BodyInit,
    });

    if (!res.ok) {
      const err = await res.json() as { error: string };
      return { ok: false, error: err.error };
    }

    const data = await res.json() as { key: string; url: string; size: number; type: string };

    // ローカルアーカイブにコピー
    const archiveDir = join(MEDIA_ARCHIVE_DIR, data.key.replace(/[/\\]/g, '_'));
    if (!existsSync(MEDIA_ARCHIVE_DIR)) mkdirSync(MEDIA_ARCHIVE_DIR, { recursive: true });
    if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });
    const archivePath = join(archiveDir, fileName);
    copyFileSync(filePath, archivePath);

    return { ok: true, ...data, localArchivePath: archivePath };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('media:delete', async (_event, key: string) => {
  try {
    await net.fetch(`${getApiBase()}/media/${key}`, { method: 'DELETE' });
    return { ok: true };
  } catch {
    return { ok: false };
  }
});

// IPC: スクレイパー（レートリミット + 同時起動防止）
let scrapeHistory: number[] = [];
let scraperBusy = false;

ipcMain.handle('scraper:login', async () => {
  if (scraperBusy) return { ok: false, error: '別のスクレイプが実行中です。完了を待ってください。' };
  scraperBusy = true;
  try {
    return await openLoginBrowser();
  } finally {
    scraperBusy = false;
  }
});

ipcMain.handle('scraper:benchmark', async (_event, handle: string, benchmarkId: string) => {
  if (scraperBusy) return { ok: false, error: '別のスクレイプが実行中です。' };
  scraperBusy = true;
  try {
    return await scrapeBenchmark(handle, benchmarkId);
  } finally {
    scraperBusy = false;
  }
});

// IPC: 自分のInsights取得
ipcMain.handle('insights:refresh', async (_event, handle: string, accountId: string) => {
  if (scraperBusy) return { ok: false, error: '別のスクレイプが実行中です。' };
  scraperBusy = true;
  try {
    return await scrapeOwnInsights(handle, accountId);
  } finally {
    scraperBusy = false;
  }
});

// 起動時自動Insightsリフレッシュ（6時間以上経過していたら）
async function autoRefreshInsights(): Promise<void> {
  if (!isSetupCompleted() || !getApiBase()) return;
  try {
    const accRes = await net.fetch(`${getApiBase()}/accounts`);
    const accData = await accRes.json() as { accounts: Array<{ id: string; threads_handle: string }> };
    if (!accData.accounts || accData.accounts.length === 0) return;

    const acc = accData.accounts[0];
    const checkRes = await net.fetch(
      `${getApiBase()}/posts/insights/last-check?account_id=${acc.id}`
    );
    const checkData = await checkRes.json() as { last_check: number };

    const SIX_HOURS = 6 * 60 * 60 * 1000;
    if (Date.now() - (checkData.last_check || 0) > SIX_HOURS) {
      log.info('Auto-refresh insights: starting...');
      const result = await scrapeOwnInsights(acc.threads_handle, acc.id);
      log.info(`Auto-refresh insights: ${result.ok ? `${(result as { saved: number }).saved} saved` : (result as { error: string }).error}`);
    }
  } catch (err) {
    log.warn('Auto-refresh insights failed:', err);
  }
}

// 検索専用カウンター（トレンドとは別、cooldownなし）
let searchHistory: number[] = [];

ipcMain.handle('scraper:search', async (_event, query: string) => {
  if (scraperBusy) return { ok: false, error: '別のスクレイプが実行中です。' };
  if (!query || query.length < 2) return { ok: false, error: '検索キーワードは2文字以上必要です。' };

  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  searchHistory = searchHistory.filter((t) => now - t < ONE_DAY);

  if (searchHistory.length >= 10) {
    return { ok: false, error: `1日の検索上限（10回）に達しています（${searchHistory.length}/10）。` };
  }

  scraperBusy = true;
  try {
    const result = await scrapeSearch(query);
    if (result.ok) {
      searchHistory.push(now);
    }
    const remaining = 10 - searchHistory.filter((t) => Date.now() - t < ONE_DAY).length;
    return { ...result, remaining, used: 10 - remaining };
  } finally {
    scraperBusy = false;
  }
});

ipcMain.handle('scraper:trending', async () => {
  if (scraperBusy) return { ok: false, error: '別のスクレイプが実行中です。完了を待ってください。' };

  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const THIRTY_MIN = 30 * 60 * 1000;

  scrapeHistory = scrapeHistory.filter((t) => now - t < ONE_DAY);

  if (scrapeHistory.length >= 5) {
    return { ok: false, error: `1日のスクレイプ上限（5回）に達しています（${scrapeHistory.length}/5）。明日再度お試しください。` };
  }

  const lastScrape = scrapeHistory[scrapeHistory.length - 1];
  if (lastScrape && now - lastScrape < THIRTY_MIN) {
    const waitMin = Math.ceil((THIRTY_MIN - (now - lastScrape)) / 60000);
    return { ok: false, error: `前回のスクレイプから${waitMin}分待ってください（最低30分間隔）。残り${scrapeHistory.length}/5回。` };
  }

  scraperBusy = true;
  try {
    const result = await scrapeTrending();

    // 成功した場合のみカウント消費
    if (result.ok) {
      scrapeHistory.push(now);
      log.info(`Scrape success: ${result.posts?.length || 0} posts. Usage: ${scrapeHistory.length}/5`);
    } else {
      log.warn(`Scrape failed (not counted): ${result.error}`);
    }

    // 残り回数を結果に付与
    const remaining = 5 - scrapeHistory.filter((t) => Date.now() - t < 24 * 60 * 60 * 1000).length;
    return { ...result, remaining, used: 5 - remaining };
  } finally {
    scraperBusy = false;
  }
});

ipcMain.handle('chat:clearHistory', async () => {
  await clearHistory();
  return { cleared: true };
});

// IPC: アプリ設定（セットアップウィザード用）
ipcMain.handle('config:getApiBase', () => getApiBase());

ipcMain.handle('config:setApiBase', async (_event, url: string) => {
  validateUrl(url);
  setWorkersUrl(url);
  return { ok: true };
});

ipcMain.handle('config:isSetupCompleted', () => isSetupCompleted());

ipcMain.handle('config:completeSetup', () => {
  completeSetup();
  return { ok: true };
});

/** URL安全性チェック（IPC経由の入力をバリデーション） */
function validateUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.username || parsed.password) {
    throw new Error('認証情報を含むURLは使用できません');
  }
  const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !isLocalhost) {
    throw new Error('URLは https:// で始まる必要があります（localhost は http 可）');
  }
}

ipcMain.handle('config:testConnection', async (_event, url: string) => {
  log.info(`[config:testConnection] Testing: ${url}`);
  try {
    validateUrl(url);
    const res = await net.fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
    log.info(`[config:testConnection] Response: ${res.status}`);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json() as { status: string; timestamp: number };
    log.info(`[config:testConnection] OK: ${JSON.stringify(data)}`);
    return { ok: true, timestamp: data.timestamp };
  } catch (err) {
    log.error(`[config:testConnection] Failed: ${err}`);
    return { ok: false, error: err instanceof Error ? err.message : 'タイムアウト' };
  }
});

app.whenReady().then(() => {
  createWindow();
  // 起動30秒後にInsights自動リフレッシュ（Dockerが起動するのを待つ）
  setTimeout(() => autoRefreshInsights().catch(() => {}), 30000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
