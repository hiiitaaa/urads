import { Hono } from 'hono';
import type { Env } from '../../env.js';

export const accountRoutes = new Hono<{ Bindings: Env }>();

// 開発用: ライセンス認証スキップ。配布時に middleware で差し替え
const DEV_LICENSE_ID = 'dev-license';

// GET /accounts — アカウント一覧
accountRoutes.get('/', async (c) => {
  const licenseId = c.req.header('X-License-Id') || DEV_LICENSE_ID;

  const { results } = await c.env.DB.prepare(
    'SELECT id, threads_user_id, threads_handle, display_name, token_expires_at, created_at FROM accounts WHERE license_id = ?'
  ).bind(licenseId).all();

  return c.json({ accounts: results });
});

// POST /accounts — アカウント追加（OAuth完了後に呼ぶ）
accountRoutes.post('/', async (c) => {
  const licenseId = c.req.header('X-License-Id') || DEV_LICENSE_ID;

  // 上限チェック
  const count = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM accounts WHERE license_id = ?'
  ).bind(licenseId).first<{ cnt: number }>();

  if (count && count.cnt >= 5) {
    return c.json({ code: 'ACCOUNT_LIMIT', message: 'アカウント上限（5）に達しています' }, 403);
  }

  const body = await c.req.json();
  const now = Date.now();

  // 同じthreads_user_idがあれば更新、なければ挿入
  const existing = await c.env.DB.prepare(
    'SELECT id FROM accounts WHERE license_id = ? AND threads_user_id = ?'
  ).bind(licenseId, body.threads_user_id).first();

  if (existing) {
    await c.env.DB.prepare(
      `UPDATE accounts SET access_token = ?, threads_handle = ?, display_name = ?, token_expires_at = ?, updated_at = ? WHERE id = ?`
    ).bind(
      body.access_token, body.threads_handle,
      body.display_name || null, body.token_expires_at || null,
      now, existing.id
    ).run();

    return c.json({ id: existing.id, threads_handle: body.threads_handle, updated: true });
  }

  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    `INSERT INTO accounts (id, license_id, threads_user_id, threads_handle, display_name, access_token, refresh_token, token_expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, licenseId, body.threads_user_id, body.threads_handle,
    body.display_name || null, body.access_token,
    body.refresh_token || null, body.token_expires_at || null,
    now, now
  ).run();

  return c.json({ id, threads_handle: body.threads_handle, created: true }, 201);
});

// GET /accounts/:id/token — トークン取得（投稿時に使う）
accountRoutes.get('/:id/token', async (c) => {
  const id = c.req.param('id');
  const account = await c.env.DB.prepare(
    'SELECT access_token, token_expires_at FROM accounts WHERE id = ?'
  ).bind(id).first();

  if (!account) return c.json({ code: 'NOT_FOUND', message: 'アカウントが見つかりません' }, 404);
  return c.json({ access_token: account.access_token, token_expires_at: account.token_expires_at });
});

// DELETE /accounts/:id
accountRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');

  // 外部キー制約のため関連データをアトミックに削除
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM reply_logs WHERE rule_id IN (SELECT id FROM reply_rules WHERE account_id = ?)').bind(id),
    c.env.DB.prepare('DELETE FROM reply_rules WHERE account_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM posts WHERE account_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM account_states WHERE account_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(id),
  ]);

  return c.json({ deleted: true });
});
