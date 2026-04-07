import { Hono } from 'hono';
import type { Env } from '../../env.js';
import { validateCreateReplyRule } from '../../infrastructure/validate.js';

export const replyRoutes = new Hono<{ Bindings: Env }>();

// GET /replies/rules — ルール一覧
replyRoutes.get('/rules', async (c) => {
  const accountId = c.req.query('account_id');

  let query = 'SELECT * FROM reply_rules WHERE 1=1';
  const params: unknown[] = [];

  if (accountId) {
    query += ' AND account_id = ?';
    params.push(accountId);
  }

  query += ' ORDER BY created_at DESC';

  const stmt = c.env.DB.prepare(query);
  const { results } = params.length > 0
    ? await stmt.bind(...params).all()
    : await stmt.all();

  // configをパース
  const rules = results.map((r) => ({
    ...r,
    config: JSON.parse(r.config as string),
  }));

  return c.json({ rules });
});

// POST /replies/rules — ルール作成
replyRoutes.post('/rules', async (c) => {
  const body = await c.req.json();

  // 入力バリデーション
  const validation = validateCreateReplyRule(body);
  if (!validation.ok) {
    return c.json({ errors: validation.errors }, 400);
  }

  const id = crypto.randomUUID();
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO reply_rules (id, threads_post_id, account_id, type, config, max_replies, reply_once_per_user, cooldown_seconds, expires_at, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).bind(
    id,
    body.threads_post_id,
    body.account_id,
    body.type,
    JSON.stringify(body.config),
    body.max_replies || 200,
    body.reply_once_per_user !== false ? 1 : 0,
    body.cooldown_seconds || 60, // デフォルト60秒（5秒は自動化判定リスク）
    body.expires_at || null,
    now,
  ).run();

  return c.json({ id, created: true }, 201);
});

// PUT /replies/rules/:id — ルール更新
replyRoutes.put('/rules/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const now = Date.now();

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.config !== undefined) {
    updates.push('config = ?');
    params.push(JSON.stringify(body.config));
  }
  if (body.active !== undefined) {
    updates.push('active = ?');
    params.push(body.active ? 1 : 0);
  }
  if (body.max_replies !== undefined) {
    updates.push('max_replies = ?');
    params.push(body.max_replies);
  }
  if (body.cooldown_seconds !== undefined) {
    updates.push('cooldown_seconds = ?');
    params.push(body.cooldown_seconds);
  }
  if (body.expires_at !== undefined) {
    updates.push('expires_at = ?');
    params.push(body.expires_at);
  }

  if (updates.length === 0) {
    return c.json({ error: '更新項目がありません' }, 400);
  }

  params.push(id);

  await c.env.DB.prepare(
    `UPDATE reply_rules SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...params).run();

  return c.json({ updated: true });
});

// DELETE /replies/rules/:id — ルール削除
replyRoutes.delete('/rules/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM reply_logs WHERE rule_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM reply_rules WHERE id = ?').bind(id).run();
  return c.json({ deleted: true });
});

// GET /replies/logs — リプライ実行ログ
replyRoutes.get('/logs', async (c) => {
  const ruleId = c.req.query('rule_id');
  const limit = parseInt(c.req.query('limit') || '50');

  let query = 'SELECT * FROM reply_logs';
  const params: unknown[] = [];

  if (ruleId) {
    query += ' WHERE rule_id = ?';
    params.push(ruleId);
  }

  query += ' ORDER BY replied_at DESC LIMIT ?';
  params.push(limit);

  const stmt = c.env.DB.prepare(query);
  const { results } = await stmt.bind(...params).all();

  return c.json({ logs: results, total: results.length });
});
