import { createLogger, hydrateFromLogFile, getEntries, getLogFilePath, onEntry, type LogFilter } from './unified-logger';

const appLog = createLogger('app');
const errorLog = createLogger('error');

process.on('uncaughtException', (err) => errorLog.error('Uncaught exception', { error: String(err), stack: (err as Error)?.stack }));
process.on('unhandledRejection', (err) => errorLog.error('Unhandled rejection', { error: String(err) }));

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
import { loggedFetch } from './modules/utils/logged-fetch';

// --- handleWithLog: 全IPCハンドラの自動計装 ---
const ipcLog = createLogger('ipc');

function summarizeArg(arg: unknown): string {
  if (arg === undefined || arg === null) return String(arg);
  if (typeof arg === 'string') return arg.length > 100 ? arg.slice(0, 100) + '...' : arg;
  if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
  try {
    const s = JSON.stringify(arg);
    return s.length > 100 ? s.slice(0, 100) + '...' : s;
  } catch {
    return '[object]';
  }
}

function handleWithLog(channel: string, handler: (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, async (event, ...args) => {
    const argSummary = args.length > 0 ? args.map(summarizeArg).join(', ') : '';
    ipcLog.info(`invoke: ${channel}`, argSummary ? { args: argSummary } : undefined);
    const start = Date.now();
    try {
      const result = await handler(event, ...args);
      ipcLog.debug(`result: ${channel}`, { ms: Date.now() - start });
      return result;
    } catch (err) {
      ipcLog.error(`failed: ${channel}`, { ms: Date.now() - start, error: String(err) });
      throw err;
    }
  });
}

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

  // リアルタイムログ配信
  onEntry((entry) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('logs:push', entry);
    }
  });
}

// --- ログ関連IPC ---
handleWithLog('logs:get', async (_event, filter?: LogFilter) => {
  return getEntries(filter as LogFilter | undefined);
});

handleWithLog('logs:getFilePath', async () => {
  return getLogFilePath();
});

handleWithLog('logs:logAction', async (_event, action: string, detail?: unknown) => {
  const uiLog = createLogger('ui');
  uiLog.info(action as string, detail);
  return { ok: true };
});

// --- IPC: Threads OAuth認証 ---
handleWithLog('threads:auth', async () => {
  const urlRes = await loggedFetch(`${getApiBase()}/license/auth-url`);
  const { url: authUrl, redirect_uri: redirectUri } = await urlRes.json() as {
    url: string; state: string; redirect_uri: string;
  };

  const code = await openAuthWindow(authUrl, redirectUri);

  const exchangeRes = await loggedFetch(`${getApiBase()}/license/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (!exchangeRes.ok) {
    const err = await exchangeRes.json() as { error: string };
    throw new Error(err.error);
  }

  return exchangeRes.json();
});

// --- IPC: アカウント ---
handleWithLog('threads:getAccounts', async () => {
  const response = await loggedFetch(`${getApiBase()}/accounts`);
  const data = await response.json() as { accounts: unknown[] };
  return data.accounts;
});

handleWithLog('threads:deleteAccount', async (_event, accountId: unknown) => {
  await loggedFetch(`${getApiBase()}/accounts/${accountId}`, { method: 'DELETE' });
  return { deleted: true };
});

// --- IPC: ollama ---
let ollamaProcess: ChildProcess | null = null;

handleWithLog('ai:generate:ollama', async (_event, opts: unknown) => {
  const { prompt, model } = opts as { prompt: string; model?: string };
  return new Promise((resolve, reject) => {
    ollamaProcess = execFile(
      'ollama', ['run', model || 'llama3', prompt],
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

handleWithLog('ai:generate:cancel', async () => {
  if (ollamaProcess) {
    ollamaProcess.kill();
    ollamaProcess = null;
    return { cancelled: true };
  }
  return { cancelled: false };
});

handleWithLog('ai:ollama:check', async () => {
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

// --- IPC: チャットエージェント ---
handleWithLog('chat:sendMessage', async (_event, payload: unknown) => {
  return chatQueue.enqueue(payload as { message?: string; skill?: string });
});

handleWithLog('chat:listSkills', async () => {
  return listSkills();
});

handleWithLog('chat:getHistory', async () => {
  return getActiveMessages();
});

handleWithLog('chat:cancelMessage', async () => {
  cancelMessage();
  return { cancelled: true };
});

handleWithLog('chat:getSessionInfo', async () => {
  return getSessionInfo();
});

// --- IPC: メディアアップロード ---
const MEDIA_ARCHIVE_DIR = join(app.getPath('userData'), 'media-archive');

handleWithLog('media:pickFiles', async () => {
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

handleWithLog('media:upload', async (_event, filePath: unknown) => {
  try {
    const fp = filePath as string;
    const fileData = readFileSync(fp);
    const fileName = fp.split(/[/\\]/).pop() || 'file';
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp',
      mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';

    const formData = new FormData();
    formData.append('file', new Blob([fileData], { type: contentType }), fileName);

    const res = await loggedFetch(`${getApiBase()}/media/upload`, {
      method: 'POST',
      body: formData as unknown as BodyInit,
    });

    if (!res.ok) {
      const err = await res.json() as { error: string };
      return { ok: false, error: err.error };
    }

    const data = await res.json() as { key: string; url: string; size: number; type: string };

    const archiveDir = join(MEDIA_ARCHIVE_DIR, data.key.replace(/[/\\]/g, '_'));
    if (!existsSync(MEDIA_ARCHIVE_DIR)) mkdirSync(MEDIA_ARCHIVE_DIR, { recursive: true });
    if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });
    const archivePath = join(archiveDir, fileName);
    copyFileSync(fp, archivePath);

    return { ok: true, ...data, localArchivePath: archivePath };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

handleWithLog('media:delete', async (_event, key: unknown) => {
  try {
    await loggedFetch(`${getApiBase()}/media/${key}`, { method: 'DELETE' });
    return { ok: true };
  } catch {
    return { ok: false };
  }
});

// --- IPC: スクレイパー ---
let scrapeHistory: number[] = [];
let scraperBusy = false;
let scraperBusyTask = ''; // 何が実行中かの表示用
const scraperLog = createLogger('scraper');

function scraperBusyError(): { ok: false; error: string } {
  return { ok: false, error: `${scraperBusyTask || 'スクレイプ'}が実行中です。完了を待ってください。` };
}

handleWithLog('scraper:login', async () => {
  if (scraperBusy) return scraperBusyError();
  scraperBusy = true; scraperBusyTask = 'Threadsログイン';
  try {
    return await openLoginBrowser();
  } finally {
    scraperBusy = false; scraperBusyTask = '';
  }
});

handleWithLog('scraper:benchmark', async (_event, handle: unknown, benchmarkId: unknown) => {
  if (scraperBusy) return scraperBusyError();
  scraperBusy = true; scraperBusyTask = 'ベンチマーク取得';
  try {
    return await scrapeBenchmark(handle as string, benchmarkId as string);
  } finally {
    scraperBusy = false; scraperBusyTask = '';
  }
});

handleWithLog('insights:refresh', async (_event, handle: unknown, accountId: unknown) => {
  if (scraperBusy) return scraperBusyError();
  scraperBusy = true; scraperBusyTask = 'Insights更新';
  try {
    return await scrapeOwnInsights(handle as string, accountId as string);
  } finally {
    scraperBusy = false; scraperBusyTask = '';
  }
});

// 起動時自動Insightsリフレッシュ
async function autoRefreshInsights(): Promise<void> {
  try {
    const accRes = await loggedFetch(`${getApiBase()}/accounts`);
    const accData = await accRes.json() as { accounts: Array<{ id: string; threads_handle: string }> };
    if (!accData.accounts || accData.accounts.length === 0) return;

    const acc = accData.accounts[0];
    const checkRes = await loggedFetch(
      `${getApiBase()}/posts/insights/last-check?account_id=${acc.id}`
    );
    const checkData = await checkRes.json() as { last_check: number };

    const SIX_HOURS = 6 * 60 * 60 * 1000;
    if (Date.now() - (checkData.last_check || 0) > SIX_HOURS) {
      if (scraperBusy) {
        appLog.info('Auto-refresh insights: スクレイプ実行中のためスキップ');
        return;
      }
      scraperBusy = true; scraperBusyTask = 'Insights自動更新';
      appLog.info('Auto-refresh insights: starting...');
      try {
        const result = await scrapeOwnInsights(acc.threads_handle, acc.id);
        appLog.info(`Auto-refresh insights: ${result.ok ? `${(result as { saved: number }).saved} saved` : (result as { error: string }).error}`);
      } finally {
        scraperBusy = false; scraperBusyTask = '';
      }
    }
  } catch (err) {
    appLog.warn('Auto-refresh insights failed', { error: String(err) });
  }
}

// --- 定時リサーチスケジューラー ---
let scheduledResearchTimer: ReturnType<typeof setTimeout> | null = null;
let researchSchedule = { enabled: false, hour: 9, minute: 0, types: ['trending'] as string[] };

function startResearchScheduler(): void {
  if (scheduledResearchTimer) clearTimeout(scheduledResearchTimer);
  if (!researchSchedule.enabled) return;

  const now = new Date();
  const target = new Date();
  target.setHours(researchSchedule.hour, researchSchedule.minute, 0, 0);

  // If the target time has passed today, schedule for tomorrow
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  const delay = target.getTime() - now.getTime();
  appLog.info(`定時リサーチ: 次回 ${target.toLocaleString('ja-JP')} (${Math.floor(delay / 60000)}分後)`);

  scheduledResearchTimer = setTimeout(async () => {
    appLog.info('定時リサーチ: 実行開始');
    try {
      if (scraperBusy) {
        appLog.warn('定時リサーチ: 別のスクレイプが実行中のためスキップ');
      } else {
        for (const type of researchSchedule.types) {
          if (scraperBusy) break;
          // ランダム遅延（1-5分）で人間らしく
          const jitter = Math.floor(Math.random() * 4 * 60 * 1000) + 60000;
          await new Promise(r => setTimeout(r, jitter));

          if (type === 'trending') {
            scraperBusy = true;
            try {
              const result = await scrapeTrending();
              appLog.info(`定時リサーチ(トレンド): ${result.ok ? `${(result as any).posts?.length || 0}件` : (result as any).error}`);
            } finally {
              scraperBusy = false; scraperBusyTask = '';
            }
          } else if (type === 'insights') {
            scraperBusy = true;
            try {
              const accRes = await loggedFetch(`${getApiBase()}/accounts`);
              const accData = await accRes.json() as { accounts: Array<{ id: string; threads_handle: string }> };
              if (accData.accounts?.[0]) {
                const acc = accData.accounts[0];
                const result = await scrapeOwnInsights(acc.threads_handle, acc.id);
                appLog.info(`定時リサーチ(Insights): ${result.ok ? `${(result as any).saved}件保存` : (result as any).error}`);
              }
            } finally {
              scraperBusy = false; scraperBusyTask = '';
            }
          }
        }
      }
    } catch (err) {
      appLog.error('定時リサーチ: 失敗', { error: String(err) });
    }
    // 次の日のスケジュール
    startResearchScheduler();
  }, delay);
}

/** D1からスケジュール設定を読み込み */
async function loadScheduleFromD1(): Promise<void> {
  try {
    const res = await loggedFetch(`${getApiBase()}/research/settings`);
    const data = await res.json() as {
      schedule_enabled?: number; schedule_hour?: number; schedule_minute?: number; schedule_types?: string;
    };
    researchSchedule = {
      enabled: !!data.schedule_enabled,
      hour: data.schedule_hour ?? 9,
      minute: data.schedule_minute ?? 0,
      types: (() => { try { return JSON.parse(data.schedule_types || '["trending"]'); } catch { return ['trending']; } })(),
    };
    appLog.info(`スケジュール設定読み込み: ${researchSchedule.enabled ? `${researchSchedule.hour}:${String(researchSchedule.minute).padStart(2, '0')} [${researchSchedule.types.join(',')}]` : '無効'}`);
  } catch {
    appLog.debug('スケジュール設定読み込み失敗（デフォルト使用）');
  }
}

handleWithLog('research:getSchedule', async () => {
  return researchSchedule;
});

handleWithLog('research:setSchedule', async (_event, schedule: unknown) => {
  const s = schedule as { enabled: boolean; hour: number; minute: number; types: string[] };
  researchSchedule = {
    enabled: !!s.enabled,
    hour: Math.max(0, Math.min(23, s.hour || 0)),
    minute: Math.max(0, Math.min(59, s.minute || 0)),
    types: Array.isArray(s.types) ? s.types.filter(t => ['trending', 'insights'].includes(t)) : ['trending'],
  };
  startResearchScheduler();

  // D1に永続化
  try {
    await loggedFetch(`${getApiBase()}/research/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schedule_enabled: researchSchedule.enabled ? 1 : 0,
        schedule_hour: researchSchedule.hour,
        schedule_minute: researchSchedule.minute,
        schedule_types: JSON.stringify(researchSchedule.types),
      }),
    });
  } catch { /* 永続化失敗は無視 */ }

  return { ok: true, schedule: researchSchedule };
});

// 検索専用カウンター
let searchHistory: number[] = [];

handleWithLog('scraper:search', async (_event, query: unknown) => {
  const q = query as string;
  if (scraperBusy) return scraperBusyError();
  if (!q || q.length < 2) return { ok: false, error: '検索キーワードは2文字以上必要です。' };

  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  searchHistory = searchHistory.filter((t) => now - t < ONE_DAY);

  if (searchHistory.length >= 10) {
    scraperLog.warn(`検索上限到達: ${searchHistory.length}/10`);
    return { ok: false, error: `1日の検索上限（10回）に達しています（${searchHistory.length}/10）。` };
  }

  scraperBusy = true; scraperBusyTask = `キーワード検索「${q}」`;
  try {
    // リサーチ設定からスクロール量+フィルタを取得
    let scrollRounds = 3;
    let maxResults = 50;
    let minLikes = 0;
    try {
      const settingsRes = await loggedFetch(`${getApiBase()}/research/settings`);
      const settings = await settingsRes.json() as { max_pages?: number; search_max_results?: number; search_min_likes?: number };
      scrollRounds = Math.max(2, Math.min(5, (settings.max_pages || 2) + 1));
      maxResults = settings.search_max_results || 50;
      minLikes = settings.search_min_likes || 0;
    } catch { /* デフォルト使用 */ }

    const result = await scrapeSearch(q, scrollRounds, maxResults, minLikes);
    if (result.ok) {
      searchHistory.push(now);
    }
    const remaining = 10 - searchHistory.filter((t) => Date.now() - t < ONE_DAY).length;
    return { ...result, remaining, used: 10 - remaining };
  } finally {
    scraperBusy = false; scraperBusyTask = '';
  }
});

handleWithLog('scraper:trending', async () => {
  if (scraperBusy) return scraperBusyError();

  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const THIRTY_MIN = 30 * 60 * 1000;

  scrapeHistory = scrapeHistory.filter((t) => now - t < ONE_DAY);

  if (scrapeHistory.length >= 5) {
    scraperLog.warn(`トレンド上限到達: ${scrapeHistory.length}/5`);
    return { ok: false, error: `1日のスクレイプ上限（5回）に達しています（${scrapeHistory.length}/5）。明日再度お試しください。` };
  }

  const lastScrape = scrapeHistory[scrapeHistory.length - 1];
  if (lastScrape && now - lastScrape < THIRTY_MIN) {
    const waitMin = Math.ceil((THIRTY_MIN - (now - lastScrape)) / 60000);
    return { ok: false, error: `前回のスクレイプから${waitMin}分待ってください（最低30分間隔）。残り${scrapeHistory.length}/5回。` };
  }

  scraperBusy = true; scraperBusyTask = 'トレンド取得';
  try {
    const result = await scrapeTrending();

    if (result.ok) {
      scrapeHistory.push(now);
      scraperLog.info(`トレンド取得成功: ${result.posts?.length || 0}件`, { usage: `${scrapeHistory.length}/5` });
    } else {
      scraperLog.warn(`トレンド取得失敗（カウント消費なし）`, { error: result.error });
    }

    const remaining = 5 - scrapeHistory.filter((t) => Date.now() - t < 24 * 60 * 60 * 1000).length;
    return { ...result, remaining, used: 5 - remaining };
  } finally {
    scraperBusy = false; scraperBusyTask = '';
  }
});

handleWithLog('chat:clearHistory', async () => {
  await clearHistory();
  return { cleared: true };
});

// --- IPC: 外部URL ---
handleWithLog('app:openExternal', async (_event, url: unknown) => {
  const u = String(url);
  // Only allow threads.net URLs for safety
  if (u.startsWith('https://www.threads.net/')) {
    shell.openExternal(u);
    return { ok: true };
  }
  return { ok: false, error: 'URLが許可されていません' };
});

// --- IPC: アプリ設定 ---
handleWithLog('config:getApiBase', () => getApiBase());

handleWithLog('config:setApiBase', async (_event, url: unknown) => {
  setWorkersUrl(url as string);
  return { ok: true };
});

handleWithLog('config:isSetupCompleted', () => isSetupCompleted());

handleWithLog('config:completeSetup', () => {
  completeSetup();
  return { ok: true };
});

handleWithLog('config:testConnection', async (_event, url: unknown) => {
  try {
    const res = await loggedFetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json() as { status: string; timestamp: number };
    return { ok: true, timestamp: data.timestamp };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'タイムアウト' };
  }
});

// --- アプリライフサイクル ---
app.whenReady().then(() => {
  hydrateFromLogFile();
  appLog.info('App started', { version: app.getVersion(), platform: process.platform });
  createWindow();
  appLog.info('Main window created');
  setTimeout(() => autoRefreshInsights().catch(() => {}), 30000);
  // D1からスケジュール設定を読み込んでタイマー開始
  setTimeout(() => loadScheduleFromD1().then(() => startResearchScheduler()).catch(() => {}), 5000);
});

app.on('window-all-closed', () => {
  appLog.info('All windows closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
