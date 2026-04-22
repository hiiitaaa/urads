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

// POST /posts/rewrite-draft — バズリライト由来の下書き保存（冪等）
postRoutes.post('/rewrite-draft', async (c) => {
  const body = await c.req.json<{
    account_id?: unknown;
    content?: unknown;
    source_scraped_post_id?: unknown;
    persona_hash?: unknown;
    rewrite_metadata?: unknown;
  }>();

  if (typeof body.account_id !== 'string' || !body.account_id) {
    return c.json({ code: 'INVALID', message: 'account_id 必須' }, 400);
  }
  if (typeof body.content !== 'string' || !body.content.trim()) {
    return c.json({ code: 'INVALID', message: 'content 必須' }, 400);
  }
  if (body.content.length > 500) {
    return c.json({ code: 'TOO_LONG', message: 'content は 500 字以内（Threads 制限）' }, 400);
  }
  if (typeof body.source_scraped_post_id !== 'string' || !body.source_scraped_post_id) {
    return c.json({ code: 'INVALID', message: 'source_scraped_post_id 必須' }, 400);
  }
  if (typeof body.persona_hash !== 'string' || !body.persona_hash) {
    return c.json({ code: 'INVALID', message: 'persona_hash 必須' }, 400);
  }
  if (typeof body.rewrite_metadata !== 'object' || body.rewrite_metadata === null) {
    return c.json({ code: 'INVALID', message: 'rewrite_metadata は object 必須' }, 400);
  }

  const licenseId = (c.get('licenseId' as never) as string) || 'dev-license';
  const ownership = await assertAccountOwnership(c.env.DB, body.account_id, licenseId);
  if (!ownership.ok) {
    return c.json({ code: 'FORBIDDEN', message: ownership.error }, 403);
  }

  const now = Date.now();
  const id = crypto.randomUUID();
  const metadataJson = JSON.stringify(body.rewrite_metadata);

  // ON CONFLICT DO NOTHING で冪等化（エラー文字列に依存しない）
  // 部分 UNIQUE の target を書かない形（WHERE がある場合 SQLite は conflict arbiter を自動推論）
  const result = await c.env.DB.prepare(
    `INSERT INTO posts (id, account_id, content, status, source_scraped_post_id, persona_hash, rewrite_metadata, created_at, updated_at)
     VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?)
     ON CONFLICT DO NOTHING`
  ).bind(
    id, body.account_id, body.content,
    body.source_scraped_post_id, body.persona_hash, metadataJson,
    now, now,
  ).run();

  // meta.changes===1 なら新規挿入、0 なら conflict で既存あり
  const inserted = (result.meta as { changes?: number } | undefined)?.changes === 1;
  if (inserted) {
    return c.json({ id, created: true }, 201);
  }

  // 既存下書きの id を返して冪等性を担保
  const existing = await c.env.DB.prepare(
    'SELECT id FROM posts WHERE source_scraped_post_id = ? AND persona_hash = ?'
  ).bind(body.source_scraped_post_id, body.persona_hash).first<{ id: string }>();
  if (existing) {
    return c.json({ id: existing.id, created: false });
  }
  return c.json({ code: 'DB_ERROR', message: 'INSERT skipped but no existing row' }, 500);
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

// GET /posts/insights/last-check — 最終チェック日時
postRoutes.get('/insights/last-check', async (c) => {
  const accountId = c.req.query('account_id');
  if (!accountId) return c.json({ error: 'account_id required' }, 400);

  const result = await c.env.DB.prepare(
    'SELECT MAX(fetched_at) as last_check FROM post_insights WHERE account_id = ?'
  ).bind(accountId).first<{ last_check: number | null }>();

  return c.json({ last_check: result?.last_check || 0 });
});

// GET /posts/:id
postRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const post = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();

  if (!post) return c.json({ code: 'NOT_FOUND', message: '投稿が見つかりません' }, 404);
  return c.json(post);
});

// PATCH /posts/:id — 下書きの content 更新（draft のみ）
postRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ content?: unknown }>();

  if (typeof body.content !== 'string' || !body.content.trim()) {
    return c.json({ code: 'INVALID', message: 'content 必須' }, 400);
  }
  if (body.content.length > 500) {
    return c.json({ code: 'TOO_LONG', message: 'content は 500 字以内（Threads 制限）' }, 400);
  }

  const row = await c.env.DB.prepare(
    "SELECT account_id, status FROM posts WHERE id = ?"
  ).bind(id).first<{ account_id: string; status: string }>();

  if (!row) return c.json({ code: 'NOT_FOUND', message: '投稿が見つかりません' }, 404);
  if (row.status !== 'draft') {
    return c.json({ code: 'INVALID_STATE', message: 'draft 状態の投稿のみ編集できます' }, 409);
  }

  const licenseId = (c.get('licenseId' as never) as string) || 'dev-license';
  const ownership = await assertAccountOwnership(c.env.DB, row.account_id, licenseId);
  if (!ownership.ok) {
    return c.json({ code: 'FORBIDDEN', message: ownership.error }, 403);
  }

  await c.env.DB.prepare(
    'UPDATE posts SET content = ?, updated_at = ? WHERE id = ?'
  ).bind(body.content, Date.now(), id).run();

  return c.json({ id, updated: true });
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
