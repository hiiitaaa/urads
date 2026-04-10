/**
 * ログ付きfetchラッパー
 * net.fetch（Electronメインプロセス）と標準fetchの両方に対応
 */
import { net } from 'electron';
import { createLogger } from '../../unified-logger';

const apiLog = createLogger('api');

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url.slice(0, 100);
  }
}

/**
 * ログ付きfetch
 * @param url リクエストURL
 * @param init fetchオプション
 * @param useNet true=net.fetch（Electron）、false=標準fetch（スクレイパー等）
 */
export async function loggedFetch(
  url: string,
  init?: RequestInit,
  useNet: boolean = true,
): Promise<Response> {
  const method = init?.method || 'GET';
  const short = shortenUrl(url);

  apiLog.info(`${method} ${short}`);
  const start = Date.now();

  try {
    const res = useNet ? await net.fetch(url, init) : await fetch(url, init);
    const ms = Date.now() - start;
    const logFn = res.ok ? apiLog.info : apiLog.warn;
    logFn(`${method} ${short} -> ${res.status}`, { ms });
    return res;
  } catch (err) {
    const ms = Date.now() - start;
    apiLog.error(`${method} ${short} failed`, { ms, error: String(err) });
    throw err;
  }
}
