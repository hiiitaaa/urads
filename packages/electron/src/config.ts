/**
 * アプリケーション設定
 * ウィザードで設定されたWorkers URLをmain processから取得
 */
const PRODUCTION_API = 'https://urads-api.nohara-ce.workers.dev';
const config = { apiBase: PRODUCTION_API };

export function getApiBase(): string {
  return config.apiBase;
}

export async function initApiBase(): Promise<void> {
  try {
    config.apiBase = await (window as unknown as { urads: { configGetApiBase: () => Promise<string> } }).urads.configGetApiBase();
  } catch {
    // preload未読み込み時はデフォルト値を使用
  }
}

/**
 * 後方互換: 既存コンポーネントは `${API_BASE}/...` でfetchしている
 * initApiBase()後にアクセスすれば更新された値が取れるようにProxyで動的解決
 */
export const API_BASE = new Proxy({} as { toString: () => string }, {
  get(_target, prop) {
    if (prop === Symbol.toPrimitive || prop === 'toString' || prop === 'valueOf') {
      return () => config.apiBase;
    }
    return undefined;
  },
}) as unknown as string;
