/**
 * Threads OAuth 2.0 — Electron側は認可コード取得のみ
 * トークン交換はWorkers側で行う（App Secretをクライアントに持たせない）
 */
import { BrowserWindow } from 'electron';

/**
 * OAuth認可ウィンドウを開いて認可コードを取得する
 */
export function openAuthWindow(authUrl: string, redirectUri: string): Promise<string> {
  return new Promise((resolve, reject) => {
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
      if (resolved) return;
      if (url.startsWith(redirectUri)) {
        resolved = true;
        const parsed = new URL(url);
        const code = parsed.searchParams.get('code');
        if (code) {
          authWindow.close();
          resolve(code);
        } else {
          const error = parsed.searchParams.get('error');
          authWindow.close();
          reject(new Error(`認証エラー: ${error || '不明'}`));
        }
      }
    };

    authWindow.webContents.on('will-redirect', (_event, url) => handleUrl(url));
    authWindow.webContents.on('will-navigate', (_event, url) => handleUrl(url));

    authWindow.on('closed', () => {
      if (!resolved) reject(new Error('ユーザーが認証をキャンセルしました'));
    });

    authWindow.loadURL(authUrl);
  });
}
