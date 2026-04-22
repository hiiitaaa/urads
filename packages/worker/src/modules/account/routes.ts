import { Hono } from 'hono';
import type { Env } from '../../env.js';
import { hashContent } from './hash.js';
import { PERSONA_CONTENT_MAX_LENGTH } from '@urads/shared';

export const accountRoutes = new Hono<{ Bindings: Env }>();

// 開発用: ライセンス認証スキップ。配布時に middleware で差し替え
const DEV_LICENSE_ID = 'dev-license';

async function ensureAccountOwned(
  db: D1Database,
  accountId: string,
  licenseId: string,
): Promise<boolean> {
  const row = await db.prepare(
    'SELECT id FROM accounts WHERE id = ? AND license_id = ?'
  ).bind(accountId, licenseId).first();
  return row !== null;
}

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
    c.env.DB.prepare('DELETE FROM account_persona WHERE account_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(id),
  ]);

  return c.json({ deleted: true });
});

// GET /accounts/:id/persona — 世界観取得
accountRoutes.get('/:id/persona', async (c) => {
  const id = c.req.param('id');
  const licenseId = c.req.header('X-License-Id') || DEV_LICENSE_ID;

  if (!(await ensureAccountOwned(c.env.DB, id, licenseId))) {
    return c.json({ code: 'NOT_FOUND', message: 'アカウントが見つかりません' }, 404);
  }

  const row = await c.env.DB.prepare(
    'SELECT content, schema_version, hash, updated_at, created_at FROM account_persona WHERE account_id = ?'
  ).bind(id).first<{ content: string; schema_version: number; hash: string; updated_at: number; created_at: number }>();

  if (!row) {
    return c.json({ code: 'NOT_SET', message: '世界観が未設定です' }, 404);
  }

  return c.json({
    account_id: id,
    content: row.content,
    schema_version: row.schema_version,
    hash: row.hash,
    updated_at: row.updated_at,
    created_at: row.created_at,
  });
});

// PUT /accounts/:id/persona — 世界観 upsert
accountRoutes.put('/:id/persona', async (c) => {
  const id = c.req.param('id');
  const licenseId = c.req.header('X-License-Id') || DEV_LICENSE_ID;

  if (!(await ensureAccountOwned(c.env.DB, id, licenseId))) {
    return c.json({ code: 'NOT_FOUND', message: 'アカウントが見つかりません' }, 404);
  }

  const body = await c.req.json<{ content?: unknown }>();
  if (typeof body.content !== 'string' || body.content.length === 0) {
    return c.json({ code: 'INVALID', message: 'content は必須です' }, 400);
  }
  if (body.content.length > PERSONA_CONTENT_MAX_LENGTH) {
    return c.json({ code: 'TOO_LARGE', message: `content は ${PERSONA_CONTENT_MAX_LENGTH} 字以内にしてください` }, 400);
  }

  const hash = await hashContent(body.content);
  const now = Date.now();
  const schemaVersion = 1;

  await c.env.DB.prepare(
    `INSERT INTO account_persona (account_id, content, schema_version, hash, updated_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET
       content = excluded.content,
       schema_version = excluded.schema_version,
       hash = excluded.hash,
       updated_at = excluded.updated_at`
  ).bind(id, body.content, schemaVersion, hash, now, now).run();

  return c.json({ hash, updated_at: now, schema_version: schemaVersion });
});
