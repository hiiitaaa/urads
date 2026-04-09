/**
 * Threads OAuth 2.0 — Electron側は認可コード取得のみ
 * トークン交換はWorkers側で行う（App Secretをクライアントに持たせない）
 */
import { BrowserWindow } from 'electron';
import log from '../../logger';

/**
 * OAuth認可ウィンドウを開いて認可コードを取得する
 */
export function openAuthWindow(authUrl: string, redirectUri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    log.info(`[oauth] Opening auth window, redirectUri=${redirectUri}`);

    const authWindow = new BrowserWindow({
      width: 600,
      height: 700,
      title: 'Threads ログイン',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    let resolved = false;

    const handleUrl = (url: string) => {
      log.info(`[oauth] Navigation: ${url.substring(0, 100)}...`);
      if (resolved) return;
      if (url.startsWith(redirectUri)) {
        resolved = true;
        const parsed = new URL(url);
        const code = parsed.searchParams.get('code');
        const error = parsed.searchParams.get('error');
        const errorReason = parsed.searchParams.get('error_reason');
        const errorDesc = parsed.searchParams.get('error_description');
        log.info(`[oauth] Redirect captured: code=${!!code}, error=${error}, reason=${errorReason}, desc=${errorDesc}`);
        if (code) {
          authWindow.close();
          resolve(code);
        } else {
          authWindow.close();
          reject(new Error(`認証エラー: ${error || '不明'} (${errorReason || ''}: ${errorDesc || ''})`));
        }
      }
    };

    authWindow.webContents.on('will-redirect', (_event, url) => handleUrl(url));
    authWindow.webContents.on('will-navigate', (_event, url) => handleUrl(url));
    authWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      log.error(`[oauth] Page load failed: code=${errorCode}, desc=${errorDescription}, url=${validatedURL}`);
    });
    authWindow.webContents.on('did-finish-load', () => {
      const currentUrl = authWindow.webContents.getURL();
      log.info(`[oauth] Page loaded: ${currentUrl.substring(0, 100)}`);
    });

    authWindow.on('closed', () => {
      if (!resolved) {
        log.warn('[oauth] Auth window closed by user');
        reject(new Error('ユーザーが認証をキャンセルしました'));
      }
    });

    authWindow.loadURL(authUrl);
  });
}
