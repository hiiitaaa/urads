/**
 * アカウント関連の共通ヘルパー
 */
import { decryptFieldSafe } from './crypto.js';

interface AccountWithToken {
  id: string;
  threads_user_id: string;
  access_token: string;
  token_expires_at: number | null;
  license_id: string;
}

/**
 * アカウント取得 + トークン期限チェック + access_token復号
 */
export async function getAccountWithValidToken(
  env: Pick<{ DB: D1Database; ENCRYPTION_KEY: string }, 'DB' | 'ENCRYPTION_KEY'>,
  accountId: string,
): Promise<{ ok: true; account: AccountWithToken } | { ok: false; error: string; code: string }> {
  const account = await env.DB.prepare(
    'SELECT id, threads_user_id, access_token, token_expires_at, license_id FROM accounts WHERE id = ?'
  ).bind(accountId).first<AccountWithToken>();

  if (!account) {
    return { ok: false, error: 'アカウントが見つかりません', code: 'NOT_FOUND' };
  }

  // token_expires_at が null → 有効扱い（既存データ互換）
  if (account.token_expires_at !== null && account.token_expires_at < Date.now()) {
    return {
      ok: false,
      error: 'アクセストークンが期限切れです。設定画面から再認証してください。',
      code: 'TOKEN_EXPIRED',
    };
  }

  // access_token復号（平文フォールバック付き）
  account.access_token = await decryptFieldSafe(env.ENCRYPTION_KEY, account.access_token);

  return { ok: true, account };
}

/**
 * アカウント所有権チェック
 */
export async function assertAccountOwnership(
  db: D1Database,
  accountId: string,
  licenseId: string,
): Promise<boolean> {
  const result = await db.prepare(
    'SELECT id FROM accounts WHERE id = ? AND license_id = ?'
  ).bind(accountId, licenseId).first();

  return !!result;
}
