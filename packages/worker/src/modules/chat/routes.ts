import { Hono } from 'hono';
import type { Env } from '../../env.js';

export const chatRoutes = new Hono<{ Bindings: Env }>();

const DEV_LICENSE_ID = 'dev-license';
function getLicenseId(c: { get: (key: string) => unknown }): string {
  return (c.get('licenseId') as string) || DEV_LICENSE_ID;
}

// POST /chat/log — ツール実行ログ記録
chatRoutes.post('/log', async (c) => {
  const licenseId = getLicenseId(c);
  const body = await c.req.json();

  await c.env.DB.prepare(
    `INSERT INTO chat_tool_executions (id, license_id, tool_name, tool_input, tool_result, confirmed, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(), licenseId,
    body.tool_name, JSON.stringify(body.tool_input),
    JSON.stringify(body.tool_result), body.confirmed ? 1 : 0, Date.now(),
  ).run();

  return c.json({ logged: true });
});

// GET /chat/logs — 監査ログ一覧
chatRoutes.get('/logs', async (c) => {
  const licenseId = getLicenseId(c);
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM chat_tool_executions WHERE license_id = ? ORDER BY created_at DESC LIMIT ?'
  ).bind(licenseId, limit).all();

  return c.json({ logs: results });
});

// GET /chat/settings — アシスタント名+カスタム指示取得
chatRoutes.get('/settings', async (c) => {
  const licenseId = getLicenseId(c);
  const settings = await c.env.DB.prepare(
    'SELECT assistant_name, custom_instructions FROM ai_settings WHERE license_id = ?'
  ).bind(licenseId).first<{ assistant_name: string | null; custom_instructions: string | null }>();

  return c.json({
    assistant_name: settings?.assistant_name || 'Navi',
    custom_instructions: settings?.custom_instructions || '',
  });
});

// PUT /chat/settings — アシスタント名+カスタム指示更新
chatRoutes.put('/settings', async (c) => {
  const licenseId = getLicenseId(c);
  const body = await c.req.json();

  if (body.assistant_name && (typeof body.assistant_name !== 'string' || body.assistant_name.trim().length > 20)) {
    return c.json({ error: '名前は1〜20文字で入力してください' }, 400);
  }

  if (body.custom_instructions && typeof body.custom_instructions === 'string' && body.custom_instructions.length > 5000) {
    return c.json({ error: 'カスタム指示は5000文字以内にしてください' }, 400);
  }

  const updates: string[] = ['updated_at = ?'];
  const params: unknown[] = [Date.now()];

  if (body.assistant_name) {
    updates.push('assistant_name = ?');
    params.push(body.assistant_name.trim());
  }
  if (body.custom_instructions !== undefined) {
    updates.push('custom_instructions = ?');
    params.push(body.custom_instructions.trim() || null);
  }

  params.push(licenseId);

  await c.env.DB.prepare(
    `UPDATE ai_settings SET ${updates.join(', ')} WHERE license_id = ?`
  ).bind(...params).run();

  return c.json({ updated: true });
});

// POST /chat/trending — トレンド投稿を保存
chatRoutes.post('/trending', async (c) => {
  const licenseId = getLicenseId(c);
  const body = await c.req.json();
  const posts = body.posts as Array<{ username: string; text: string; likes: number; replies: number; reposts: number }>;

  if (!Array.isArray(posts)) return c.json({ error: 'posts array required' }, 400);

  for (const p of posts) {
    const score = (p.likes || 0) * 1 + (p.replies || 0) * 5 + (p.reposts || 0) * 4;
    await c.env.DB.prepare(
      `INSERT INTO trending_posts (id, license_id, username, content, likes, replies, reposts, score, scraped_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(crypto.randomUUID(), licenseId, p.username || '', p.text || '', p.likes || 0, p.replies || 0, p.reposts || 0, score, Date.now()).run();
  }

  return c.json({ saved: posts.length });
});

// GET /chat/trending — トレンド投稿取得（直近100件）
chatRoutes.get('/trending', async (c) => {
  const licenseId = getLicenseId(c);
  const limit = Math.min(parseInt(c.req.query('limit') || '100'), 200);

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM trending_posts WHERE license_id = ? ORDER BY scraped_at DESC, score DESC LIMIT ?'
  ).bind(licenseId, limit).all();

  return c.json({ posts: results });
});

// GET /chat/skill-context — 最新のスキル結果取得
chatRoutes.get('/skill-context', async (c) => {
  const licenseId = getLicenseId(c);
  const skillName = c.req.query('skill_name');

  if (!skillName) return c.json({ error: 'skill_name is required' }, 400);

  const result = await c.env.DB.prepare(
    'SELECT output_summary, created_at FROM skill_contexts WHERE license_id = ? AND skill_name = ? ORDER BY created_at DESC LIMIT 1'
  ).bind(licenseId, skillName).first();

  if (!result) return c.json({ context: null });
  return c.json({ context: JSON.parse(result.output_summary as string), created_at: result.created_at });
});

// POST /chat/skill-context — スキル結果保存
chatRoutes.post('/skill-context', async (c) => {
  const licenseId = getLicenseId(c);
  const body = await c.req.json();

  if (!body.skill_name || !body.output_summary) {
    return c.json({ error: 'skill_name and output_summary are required' }, 400);
  }

  await c.env.DB.prepare(
    'INSERT INTO skill_contexts (id, license_id, skill_name, output_summary, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(crypto.randomUUID(), licenseId, body.skill_name, JSON.stringify(body.output_summary), Date.now()).run();

  return c.json({ saved: true });
});
