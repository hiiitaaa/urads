/**
 * 認証ミドルウェア
 * X-License-Id ヘッダーからライセンスIDを取得してcontextに付与
 */
import { createMiddleware } from 'hono/factory';
import type { Env } from '../env.js';

const DEV_LICENSE_ID = 'dev-license';

type Variables = {
  licenseId: string;
};

/**
 * ライセンスIDをcontextに付与するミドルウェア
 * 開発時は X-License-Id がなければ dev-license をフォールバック
 */
export const licenseMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  const licenseId = c.req.header('X-License-Id') || DEV_LICENSE_ID;
  c.set('licenseId', licenseId);
  await next();
});

/**
 * アカウントが指定ライセンスに属するか検証
 */
export async function assertAccountOwnership(
  db: D1Database,
  accountId: string,
  licenseId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await db.prepare(
    'SELECT id FROM accounts WHERE id = ? AND license_id = ?'
  ).bind(accountId, licenseId).first();

  if (!result) {
    return { ok: false, error: 'このアカウントへのアクセス権がありません' };
  }

  return { ok: true };
}
