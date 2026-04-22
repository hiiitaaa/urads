/**
 * Web版: API URLとライセンスIDは環境変数から取得
 * .env に以下を設定:
 *   VITE_API_BASE=https://your-worker.workers.dev
 *   VITE_LICENSE_ID=your-license-id
 */
export const API_BASE = import.meta.env.VITE_API_BASE as string || '';
const LICENSE_ID = import.meta.env.VITE_LICENSE_ID as string || '';

/**
 * X-License-Id ヘッダー付きfetchラッパー
 * 全APIリクエストでこれを使う
 */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  if (LICENSE_ID) {
    headers['X-License-Id'] = LICENSE_ID;
  }
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });
}
