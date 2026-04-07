import { Hono } from 'hono';
import type { Env } from '../../env.js';
import { postText, postImage, postVideo, postCarousel } from './threads-api.js';
import { canPost, addJitterToSchedule, checkThreadsQuota, LIMITS } from './safety.js';
import { getAccountWithValidToken } from '../../infrastructure/account-helpers.js';
import { validateCreatePost } from '../../infrastructure/validate.js';
import { assertAccountOwnership } from '../../infrastructure/auth-middleware.js';
import { deleteR2Media } from './media-cleanup.js';

export const postRoutes = new Hono<{ Bindings: Env }>();

// POST /posts — 即時投稿 or 予約作成
postRoutes.post('/', async (c) => {
  const body = await c.req.json();

  // 入力バリデーション
  const validation = validateCreatePost(body);
  if (!validation.ok) {
    return c.json({ status: 'rejected', errors: validation.errors }, 400);
  }

  const now = Date.now();
  const isScheduled = !!body.scheduled_at;

  // アカウント所有権チェック
  const licenseId = c.get('licenseId' as never) as string || 'dev-license';
  const ownership = await assertAccountOwnership(c.env.DB, body.account_id, licenseId);
  if (!ownership.ok) {
    return c.json({ status: 'rejected', error: ownership.error }, 403);
  }

  // 安全チェック（即時投稿の場合）
  if (!isScheduled) {
    const check = await canPost(c.env.DB, body.account_id);
    if (!check.ok) {
      return c.json({ status: 'rejected', error: check.reason }, 429);
    }
  }

  const id = crypto.randomUUID();

  // 予約投稿にはランダム遅延を追加
  let scheduledAt = body.scheduled_at || null;
  if (isScheduled && scheduledAt) {
    scheduledAt = addJitterToSchedule(scheduledAt);
  }

  await c.env.DB.prepare(
    `INSERT INTO posts (id, account_id, content, media_type, media_urls, status, scheduled_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, body.account_id, body.content,
    body.media_type || null,
    body.media_urls ? JSON.stringify(body.media_urls) : null,
    isScheduled ? 'scheduled' : 'posting',
    scheduledAt, now, now
  ).run();

  // 即時投稿
  if (!isScheduled) {
    try {
      // アカウント取得 + トークン期限チェック
      const accountResult = await getAccountWithValidToken(c.env, body.account_id);
      if (!accountResult.ok) {
        await c.env.DB.prepare(
          'UPDATE posts SET status = ?, error = ?, updated_at = ? WHERE id = ?'
        ).bind('failed', accountResult.error, now, id).run();
        return c.json({ id, status: 'failed', error: accountResult.error, code: accountResult.code }, 400);
      }

      const account = accountResult.account;

      // Threads API側のクォータもチェック
      const quota = await checkThreadsQuota(account.threads_user_id, account.access_token);
      if (!quota.withinLimit) {
        await c.env.DB.prepare(
          'UPDATE posts SET status = ?, error = ?, updated_at = ? WHERE id = ?'
        ).bind('failed', `Threads API側の投稿上限に達しています（${quota.usage}/${quota.limit}）`, now, id).run();
        return c.json({
          id, status: 'failed',
          error: `Threads API側の投稿上限に達しています（${quota.usage}/${quota.limit}）`,
        }, 429);
      }

      // media_type に応じて投稿関数を分岐
      let result;
      const mediaType = body.media_type || null;
      const mediaUrls = body.media_urls || [];

      if (mediaType === 'image' && mediaUrls.length === 1) {
        result = await postImage(account.threads_user_id, account.access_token, body.content, mediaUrls[0]);
      } else if (mediaType === 'video' && mediaUrls.length === 1) {
        result = await postVideo(account.threads_user_id, account.access_token, body.content, mediaUrls[0]);
      } else if (mediaType === 'carousel' && mediaUrls.length >= 2) {
        result = await postCarousel(account.threads_user_id, account.access_token, body.content, mediaUrls);
      } else {
        result = await postText(account.threads_user_id, account.access_token, body.content);
      }

      await c.env.DB.prepare(
        'UPDATE posts SET status = ?, threads_id = ?, posted_at = ?, updated_at = ? WHERE id = ?'
      ).bind('posted', result.id, Date.now(), Date.now(), id).run();

      // 投稿完了 → R2メディアをバックグラウンド削除（レスポンスをブロックしない）
      if (mediaUrls.length > 0) {
        c.executionCtx.waitUntil(deleteR2Media(c.env.MEDIA, mediaUrls));
      }

      return c.json({ id, status: 'posted', threads_id: result.id }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await c.env.DB.prepare(
        'UPDATE posts SET status = ?, error = ?, updated_at = ? WHERE id = ?'
      ).bind('failed', message, Date.now(), id).run();

      return c.json({ id, status: 'failed', error: message }, 500);
    }
  }

  return c.json({ id, status: 'scheduled', scheduled_at: scheduledAt }, 201);
});

// GET /posts/quota — 現在のクォータ状況を返す
postRoutes.get('/quota', async (c) => {
  const accountId = c.req.query('account_id');
  if (!accountId) return c.json({ error: 'account_id required' }, 400);

  const check = await canPost(c.env.DB, accountId);

  return c.json({
    can_post: check.ok,
    reason: check.reason || null,
    limits: {
      posts_per_24h: LIMITS.posts.safe,
      min_interval_minutes: LIMITS.minIntervalMs / 60000,
    },
  });
});

// GET /posts — 投稿履歴
postRoutes.get('/', async (c) => {
  const accountId = c.req.query('account_id');
  const status = c.req.query('status');

  let query = 'SELECT * FROM posts WHERE 1=1';
  const params: unknown[] = [];

  if (accountId) {
    query += ' AND account_id = ?';
    params.push(accountId);
  }
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC LIMIT 50';

  const stmt = c.env.DB.prepare(query);
  const { results } = params.length > 0
    ? await stmt.bind(...params).all()
    : await stmt.all();

  return c.json({ posts: results, total: results.length });
});

// POST /posts/insights — insightsデータ保存（Electronから呼ぶ）
postRoutes.post('/insights', async (c) => {
  const body = await c.req.json();
  const posts = body.posts as Array<{
    threads_id: string; content_preview?: string;
    likes: number; replies: number; reposts: number; quotes?: number;
  }>;

  if (!Array.isArray(posts) || !body.account_id) {
    return c.json({ error: 'account_id and posts array required' }, 400);
  }

  let saved = 0;
  for (const p of posts) {
    if (!p.threads_id) continue;
    await c.env.DB.prepare(
      `INSERT INTO post_insights (id, account_id, threads_id, content_preview, likes, replies, reposts, quotes, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(), body.account_id, p.threads_id,
      p.content_preview || null,
      p.likes ?? 0, p.replies ?? 0, p.reposts ?? 0, p.quotes ?? 0,
      Date.now(),
    ).run();
    saved++;
  }

  return c.json({ saved });
});

// GET /posts/insights — 最新insights付き投稿一覧（スコア計算込み）
postRoutes.get('/insights', async (c) => {
  const accountId = c.req.query('account_id');
  if (!accountId) return c.json({ error: 'account_id required' }, 400);

  const { results } = await c.env.DB.prepare(
    `SELECT pi.threads_id, pi.content_preview, pi.likes, pi.replies, pi.reposts, pi.quotes, pi.fetched_at,
            (pi.likes * 1 + pi.replies * 5 + pi.reposts * 4 + COALESCE(pi.quotes, 0) * 3) AS score
     FROM post_insights pi
     INNER JOIN (
       SELECT threads_id, MAX(fetched_at) AS max_fetched
       FROM post_insights WHERE account_id = ?
       GROUP BY threads_id
     ) latest ON pi.threads_id = latest.threads_id AND pi.fetched_at = latest.max_fetched
     WHERE pi.account_id = ?
     ORDER BY score DESC`
  ).bind(accountId, accountId).all();

  return c.json({ insights: results, total: results.length });
});

// GET /posts/insights/trends — 特定投稿のエンゲージメント推移
postRoutes.get('/insights/trends', async (c) => {
  const accountId = c.req.query('account_id');
  const threadsId = c.req.query('threads_id');
  if (!accountId || !threadsId) return c.json({ error: 'account_id and threads_id required' }, 400);

  const { results } = await c.env.DB.prepare(
    `SELECT likes, replies, reposts, quotes, fetched_at,
            (likes * 1 + replies * 5 + reposts * 4 + COALESCE(quotes, 0) * 3) AS score
     FROM post_insights
     WHERE account_id = ? AND threads_id = ?
     ORDER BY fetched_at ASC`
  ).bind(accountId, threadsId).all();

  return c.json({ trends: results });
});

// GET /posts/insights/time-analysis — 投稿時間帯別の平均エンゲージメント
postRoutes.get('/insights/time-analysis', async (c) => {
  const accountId = c.req.query('account_id');
  if (!accountId) return c.json({ error: 'account_id required' }, 400);

  // postsテーブルのposted_atとinsightsの最新スコアを結合
  const { results } = await c.env.DB.prepare(
    `SELECT p.posted_at,
            COALESCE(latest.score, 0) AS score,
            COALESCE(latest.likes, 0) AS likes,
            COALESCE(latest.replies, 0) AS replies
     FROM posts p
     LEFT JOIN (
       SELECT pi.threads_id, pi.likes, pi.replies,
              (pi.likes * 1 + pi.replies * 5 + pi.reposts * 4 + COALESCE(pi.quotes, 0) * 3) AS score
       FROM post_insights pi
       INNER JOIN (
         SELECT threads_id, MAX(fetched_at) AS max_fetched
         FROM post_insights WHERE account_id = ?
         GROUP BY threads_id
       ) m ON pi.threads_id = m.threads_id AND pi.fetched_at = m.max_fetched
       WHERE pi.account_id = ?
     ) latest ON p.threads_id = latest.threads_id
     WHERE p.account_id = ? AND p.status = 'posted' AND p.posted_at IS NOT NULL`
  ).bind(accountId, accountId, accountId).all();

  // 時間帯別に集計
  const hourly: Record<number, { total: number; count: number }> = {};
  for (let h = 0; h < 24; h++) hourly[h] = { total: 0, count: 0 };

  for (const row of results) {
    const postedAt = row.posted_at as number;
    if (!postedAt) continue;
    const hour = new Date(postedAt).getHours();
    hourly[hour].total += (row.score as number) || 0;
    hourly[hour].count += 1;
  }

  const analysis = Object.entries(hourly).map(([hour, data]) => ({
    hour: Number(hour),
    avgScore: data.count > 0 ? Math.round(data.total / data.count) : 0,
    postCount: data.count,
  }));

  return c.json({ analysis });
});

// GET /posts/insights/last-check — 最終チェック日時
postRoutes.get('/insights/last-check', async (c) => {
  const accountId = c.req.query('account_id');
  if (!accountId) return c.json({ error: 'account_id required' }, 400);

  const result = await c.env.DB.prepare(
    'SELECT MAX(fetched_at) as last_check FROM post_insights WHERE account_id = ?'
  ).bind(accountId).first<{ last_check: number | null }>();

  return c.json({ last_check: result?.last_check || 0 });
});

// === テンプレート ===

// GET /posts/templates — テンプレート一覧
postRoutes.get('/templates', async (c) => {
  const licenseId = c.get('licenseId' as never) as string || 'dev-license';
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM post_templates WHERE license_id = ? ORDER BY usage_count DESC, updated_at DESC'
  ).bind(licenseId).all();
  return c.json({ templates: results, total: results.length });
});

// POST /posts/templates — テンプレート作成
postRoutes.post('/templates', async (c) => {
  const licenseId = c.get('licenseId' as never) as string || 'dev-license';
  const body = await c.req.json();

  if (!body.name?.trim() || !body.content?.trim()) {
    return c.json({ error: 'name と content は必須です' }, 400);
  }
  if (body.content.length > 500) {
    return c.json({ error: 'content は500文字以内にしてください' }, 400);
  }

  const id = crypto.randomUUID();
  const now = Date.now();

  // variables を content から自動抽出
  const varMatches = body.content.match(/\{\{(.+?)\}\}/g);
  const variables = varMatches
    ? JSON.stringify([...new Set(varMatches.map((m: string) => m.slice(2, -2)))])
    : null;

  await c.env.DB.prepare(
    `INSERT INTO post_templates (id, license_id, name, content, variables, category, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, licenseId, body.name.trim(), body.content.trim(), variables, body.category || null, now, now).run();

  return c.json({ id, name: body.name.trim() }, 201);
});

// PUT /posts/templates/:id — テンプレート更新
postRoutes.put('/templates/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  if (body.content && body.content.length > 500) {
    return c.json({ error: 'content は500文字以内にしてください' }, 400);
  }

  const updates: string[] = ['updated_at = ?'];
  const params: unknown[] = [Date.now()];

  if (body.name) { updates.push('name = ?'); params.push(body.name.trim()); }
  if (body.content) {
    updates.push('content = ?'); params.push(body.content.trim());
    // variables を再抽出
    const varMatches = body.content.match(/\{\{(.+?)\}\}/g);
    const variables = varMatches
      ? JSON.stringify([...new Set(varMatches.map((m: string) => m.slice(2, -2)))])
      : null;
    updates.push('variables = ?'); params.push(variables);
  }
  if (body.category !== undefined) { updates.push('category = ?'); params.push(body.category || null); }

  params.push(id);
  await c.env.DB.prepare(
    `UPDATE post_templates SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...params).run();

  return c.json({ updated: true });
});

// DELETE /posts/templates/:id — テンプレート削除
postRoutes.delete('/templates/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM post_templates WHERE id = ?').bind(id).run();
  return c.json({ deleted: true });
});

// GET /posts/:id
postRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const post = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();

  if (!post) return c.json({ code: 'NOT_FOUND', message: '投稿が見つかりません' }, 404);
  return c.json(post);
});

// DELETE /posts/:id — 投稿削除（draft/scheduled/failed）+ R2メディア削除
postRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');

  // 削除前にmedia_urlsを取得
  const post = await c.env.DB.prepare(
    "SELECT media_urls FROM posts WHERE id = ? AND status IN ('draft', 'scheduled', 'failed')"
  ).bind(id).first<{ media_urls: string | null }>();

  if (post?.media_urls) {
    try {
      const urls: string[] = JSON.parse(post.media_urls);
      await deleteR2Media(c.env.MEDIA, urls);
    } catch { /* JSON parse失敗は無視 */ }
  }

  await c.env.DB.prepare(
    "DELETE FROM posts WHERE id = ? AND status IN ('draft', 'scheduled', 'failed')"
  ).bind(id).run();

  return c.json({ deleted: true });
});
