/**
 * API_BASE 一元管理
 * 環境変数 > ユーザー設定 > デフォルト(localhost)
 */
import { getWorkersUrl } from './app-config-store';

export function getApiBase(): string {
  if (process.env.URADS_API_BASE) return process.env.URADS_API_BASE;
  return getWorkersUrl();
}
