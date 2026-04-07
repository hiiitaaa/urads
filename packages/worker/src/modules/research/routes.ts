import { Hono } from 'hono';
import type { Env } from '../../env.js';
import { getResearchBudget, cleanupOldCalls, estimateScrapeBudget, canCallResearchApi } from './limits.js';
import { scrapeProfile, scrapePosts, searchKeyword } from './scraper.js';
import { redetectBuzz, analyzePostingPattern } from './analyzer.js';
import { analyzeHashtags, analyzeBuzzKeywords } from './text-analyzer.js';

export const researchRoutes = new Hono<{ Bindings: Env }>();

const DEV_LICENSE_ID = 'dev-license';

function getLicenseId(c: { get: (key: string) => unknown }): string {
  return (c.get('licenseId') as string) || DEV_LICENSE_ID;
}

/**
 * ベンチマークが指定ライセンスに属するか検証
 */
async function assertBenchmarkOwnership(
  db: D1Database, benchmarkId: string, licenseId: string,
): Promise<{ ok: true; benchmark: Record<string, unknown> } | { ok: false }> {
  const benchmark = await db.prepare(
    'SELECT * FROM benchmarks WHERE id = ? AND license_id = ?'
  ).bind(benchmarkId, licenseId).first();

  if (!benchmark) return { ok: false };
  return { ok: true, benchmark };
}

// GET /research/benchmarks — ベンチマーク一覧
researchRoutes.get('/benchmarks', async (c) => {
  const licenseId = getLicenseId(c);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM benchmarks WHERE license_id = ? ORDER BY created_at DESC'
  ).bind(licenseId).all();
  return c.json({ benchmarks: results });
});

// POST /research/benchmarks — ベンチマーク追加
researchRoutes.post('/benchmarks', async (c) => {
  const licenseId = getLicenseId(c);
  const body = await c.req.json();

  if (!body.threads_handle || typeof body.threads_handle !== 'string') {
    return c.json({ error: 'threads_handle は必須です' }, 400);
  }

  const handle = body.threads_handle.replace('@', '').trim();

  // Fix 5: 重複チェック
  const existing = await c.env.DB.prepare(
    'SELECT id FROM benchmarks WHERE license_id = ? AND threads_handle = ?'
  ).bind(licenseId, handle).first();

  if (existing) {
    return c.json({ error: `@${handle} は既に登録されています` }, 409);
  }

  // ハンドル→User ID 自動変換
  // 方法1: HTMLから抽出（Workers→threads.net fetch）
  // 方法2: Threads APIのprofile_discovery（アクセストークン必要）
  let threadsUserId = body.threads_user_id || null;
  let resolveMethod = 'manual';

  if (!threadsUserId) {
    // 方法1: HTMLフェッチ（Workersから直接）
    try {
      const profileRes = await fetch(`https://www.threads.net/@${handle}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ja,en;q=0.9',
        },
        redirect: 'follow',
      });
      if (profileRes.ok) {
        const html = await profileRes.text();
        // 複数パターンで抽出を試みる
        const patterns = [
          /"user_id":"(\d+)"/,
          /"userID":"(\d+)"/,
          /profilePage_(\d+)/,
          /"id":"(\d+)","username"/,
        ];
        for (const pattern of patterns) {
          const match = html.match(pattern);
          if (match) {
            threadsUserId = match[1];
            resolveMethod = 'html';
            break;
          }
        }
      }
    } catch (err) {
      console.warn(`HTML resolve failed for @${handle}:`, err instanceof Error ? err.message : err);
    }

    // 方法2: 方法1が失敗した場合、Threads APIで試行（アカウントのトークン使用）
    if (!threadsUserId) {
      try {
        const account = await c.env.DB.prepare(
          'SELECT access_token FROM accounts WHERE license_id = ? LIMIT 1'
        ).bind(licenseId).first<{ access_token: string }>();

        if (account) {
          // Instagram公開API（Threads/Instagramは同じユーザーID体系）
          const apiRes = await fetch(
            `https://i.instagram.com/api/v1/users/web_profile_info/?username=${handle}`,
            { headers: { 'User-Agent': 'Instagram 275.0.0.27.98', 'X-IG-App-ID': '936619743392459' } }
          );
          if (apiRes.ok) {
            const data = await apiRes.json() as { data?: { user?: { id?: string } } };
            if (data.data?.user?.id) {
              threadsUserId = data.data.user.id;
              resolveMethod = 'instagram_api';
            }
          }
        }
      } catch {
        // APIフォールバックも失敗 → ID無しで登録続行
      }
    }

    if (threadsUserId) {
      console.log(`Resolved @${handle} → user_id: ${threadsUserId} (via ${resolveMethod})`);
    } else {
      console.warn(`Could not resolve @${handle} to user_id. Registration continues without ID.`);
    }
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO benchmarks (id, license_id, threads_handle, threads_user_id, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, licenseId, handle, threadsUserId, body.note || null, Date.now()).run();

  return c.json({ id, created: true }, 201);
});

// DELETE /research/benchmarks/:id — ベンチマーク削除（Fix 1: license_idチェック）
researchRoutes.delete('/benchmarks/:id', async (c) => {
  const licenseId = getLicenseId(c);
  const id = c.req.param('id');

  const ownership = await assertBenchmarkOwnership(c.env.DB, id, licenseId);
  if (!ownership.ok) {
    return c.json({ error: 'このベンチマークへのアクセス権がありません' }, 403);
  }

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM scraped_posts WHERE benchmark_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM benchmarks WHERE id = ? AND license_id = ?').bind(id, licenseId),
  ]);
  return c.json({ deleted: true });
});

// PUT /research/benchmarks/:id/update-profile — Playwrightスクレイプ後のプロフィール更新
researchRoutes.put('/benchmarks/:id/update-profile', async (c) => {
  const licenseId = getLicenseId(c);
  const benchmarkId = c.req.param('id');

  const ownership = await assertBenchmarkOwnership(c.env.DB, benchmarkId, licenseId);
  if (!ownership.ok) return c.json({ error: 'アクセス権がありません' }, 403);

  const body = await c.req.json();
  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.threads_user_id) { updates.push('threads_user_id = ?'); params.push(body.threads_user_id); }
  if (body.display_name) { updates.push('display_name = ?'); params.push(body.display_name); }
  if (body.follower_count !== undefined) { updates.push('follower_count = ?'); params.push(body.follower_count); }

  updates.push("status = 'active'");
  updates.push('status_changed_at = ?'); params.push(Date.now());
  updates.push('last_scraped_at = ?'); params.push(Date.now());

  params.push(benchmarkId);

  await c.env.DB.prepare(
    `UPDATE benchmarks SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...params).run();

  return c.json({ updated: true });
});

// POST /research/benchmarks/:id/save-posts — Playwrightスクレイプ投稿をscraped_postsに保存
researchRoutes.post('/benchmarks/:id/save-posts', async (c) => {
  const licenseId = getLicenseId(c);
  const benchmarkId = c.req.param('id');

  const ownership = await assertBenchmarkOwnership(c.env.DB, benchmarkId, licenseId);
  if (!ownership.ok) return c.json({ error: 'アクセス権がありません' }, 403);

  const body = await c.req.json();
  const posts = body.posts as Array<{ id: string; text: string; likes: number; replies: number; reposts: number }>;

  if (!Array.isArray(posts)) return c.json({ error: 'posts array required' }, 400);

  // バズ設定取得
  const settings = await c.env.DB.prepare(
    'SELECT buzz_likes, buzz_replies, buzz_reposts FROM research_settings WHERE license_id = ?'
  ).bind(licenseId).first<{ buzz_likes: number; buzz_replies: number; buzz_reposts: number }>();
  const buzzLikes = settings?.buzz_likes ?? 1000;
  const buzzReplies = settings?.buzz_replies ?? 100;
  const buzzReposts = settings?.buzz_reposts ?? 50;

  let saved = 0;
  for (const post of posts) {
    const likes = post.likes ?? 0;
    const replies = post.replies ?? 0;
    const reposts = post.reposts ?? 0;
    const isBuzz = (likes >= buzzLikes || replies >= buzzReplies || reposts >= buzzReposts) ? 1 : 0;

    await c.env.DB.prepare(
      `INSERT INTO scraped_posts (id, benchmark_id, threads_post_id, content, likes, replies, reposts, is_buzz, source, scraped_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'playwright', ?)
       ON CONFLICT(benchmark_id, threads_post_id) DO UPDATE SET
         likes = ?, replies = ?, reposts = ?, is_buzz = ?, scraped_at = ?`
    ).bind(
      crypto.randomUUID(), benchmarkId, post.id || crypto.randomUUID(),
      post.text || null, likes, replies, reposts, isBuzz, Date.now(),
      likes, replies, reposts, isBuzz, Date.now(),
    ).run();
    saved++;
  }

  // last_scraped_at更新
  await c.env.DB.prepare(
    'UPDATE benchmarks SET last_scraped_at = ? WHERE id = ?'
  ).bind(Date.now(), benchmarkId).run();

  return c.json({ saved });
});

// POST /research/benchmarks/:id/scrape — API経由スクレイプ（従来方式、フォールバック）
researchRoutes.post('/benchmarks/:id/scrape', async (c) => {
  const licenseId = getLicenseId(c);
  const benchmarkId = c.req.param('id');

  const ownership = await assertBenchmarkOwnership(c.env.DB, benchmarkId, licenseId);
  if (!ownership.ok) {
    return c.json({ error: 'このベンチマークへのアクセス権がありません' }, 403);
  }

  const account = await c.env.DB.prepare(
    'SELECT access_token, threads_user_id FROM accounts WHERE license_id = ? LIMIT 1'
  ).bind(licenseId).first<{ access_token: string; threads_user_id: string }>();

  if (!account) {
    return c.json({ error: 'アカウントが連携されていません' }, 400);
  }

  const settings = await c.env.DB.prepare(
    'SELECT max_pages FROM research_settings WHERE license_id = ?'
  ).bind(licenseId).first<{ max_pages: number }>();
  const maxPages = settings?.max_pages || 2;

  // バジェット確認
  const budget = await getResearchBudget(c.env.DB, licenseId);
  const estimate = estimateScrapeBudget(1, maxPages);

  if (budget.profile.remaining < estimate.profileCalls) {
    return c.json({ error: `プロフィールAPIの残量が不足しています（残り${budget.profile.remaining}回）` }, 429);
  }
  if (budget.threads.remaining < estimate.threadsCalls) {
    return c.json({ error: `投稿APIの残量が不足しています（残り${budget.threads.remaining}回）` }, 429);
  }

  const profileResult = await scrapeProfile(c.env.DB, licenseId, account.access_token, benchmarkId);
  if (!profileResult.ok) {
    return c.json({ error: profileResult.error }, 400);
  }

  const postsResult = await scrapePosts(
    c.env.DB, licenseId, account.access_token,
    benchmarkId, profileResult.profile.id, maxPages,
  );

  if (!postsResult.ok) {
    return c.json({ error: postsResult.error, profile: profileResult.profile }, 400);
  }

  await cleanupOldCalls(c.env.DB);

  return c.json({
    profile: profileResult.profile,
    posts_collected: postsResult.count,
    budget: await getResearchBudget(c.env.DB, licenseId),
  });
});

// GET /research/benchmarks/:id/posts — 収集投稿一覧（Fix 1: license_idチェック）
researchRoutes.get('/benchmarks/:id/posts', async (c) => {
  const licenseId = getLicenseId(c);
  const benchmarkId = c.req.param('id');

  const ownership = await assertBenchmarkOwnership(c.env.DB, benchmarkId, licenseId);
  if (!ownership.ok) {
    return c.json({ error: 'このベンチマークへのアクセス権がありません' }, 403);
  }

  const buzzOnly = c.req.query('buzz') === '1';
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);

  let query = 'SELECT * FROM scraped_posts WHERE benchmark_id = ?';
  if (buzzOnly) query += ' AND is_buzz = 1';
  query += ' ORDER BY likes DESC, scraped_at DESC LIMIT ?';

  const { results } = await c.env.DB.prepare(query).bind(benchmarkId, limit).all();
  return c.json({ posts: results, total: results.length });
});

// GET /research/benchmarks/:id/analysis — 投稿パターン分析（Fix 1: license_idチェック）
researchRoutes.get('/benchmarks/:id/analysis', async (c) => {
  const licenseId = getLicenseId(c);
  const benchmarkId = c.req.param('id');

  const ownership = await assertBenchmarkOwnership(c.env.DB, benchmarkId, licenseId);
  if (!ownership.ok) {
    return c.json({ error: 'このベンチマークへのアクセス権がありません' }, 403);
  }

  const analysis = await analyzePostingPattern(c.env.DB, benchmarkId);
  return c.json(analysis);
});

// GET /research/benchmarks/:id/hashtags — ハッシュタグ分析
researchRoutes.get('/benchmarks/:id/hashtags', async (c) => {
  const licenseId = getLicenseId(c);
  const benchmarkId = c.req.param('id');

  const ownership = await assertBenchmarkOwnership(c.env.DB, benchmarkId, licenseId);
  if (!ownership.ok) return c.json({ error: 'アクセス権がありません' }, 403);

  const hashtags = await analyzeHashtags(c.env.DB, benchmarkId);
  return c.json({ hashtags });
});

// GET /research/benchmarks/:id/keywords — バズワード分析
researchRoutes.get('/benchmarks/:id/keywords', async (c) => {
  const licenseId = getLicenseId(c);
  const benchmarkId = c.req.param('id');

  const ownership = await assertBenchmarkOwnership(c.env.DB, benchmarkId, licenseId);
  if (!ownership.ok) return c.json({ error: 'アクセス権がありません' }, 403);

  const keywords = await analyzeBuzzKeywords(c.env.DB, benchmarkId);
  return c.json({ keywords });
});

// GET /research/search — キーワード検索（Fix 3: バジェットチェック追加）
researchRoutes.get('/search', async (c) => {
  const licenseId = getLicenseId(c);
  const query = c.req.query('q');

  if (!query || query.length < 2) {
    return c.json({ error: '検索キーワードは2文字以上必要です' }, 400);
  }

  // Fix 3: 事前バジェットチェック
  const budgetCheck = await canCallResearchApi(c.env.DB, licenseId, 'keyword_search');
  if (!budgetCheck.ok) {
    return c.json({ error: budgetCheck.reason, remaining: 0 }, 429);
  }

  const account = await c.env.DB.prepare(
    'SELECT access_token FROM accounts WHERE license_id = ? LIMIT 1'
  ).bind(licenseId).first<{ access_token: string }>();

  if (!account) {
    return c.json({ error: 'アカウントが連携されていません' }, 400);
  }

  const result = await searchKeyword(c.env.DB, licenseId, account.access_token, query);
  if (!result.ok) return c.json({ error: result.error }, 400);

  return c.json({ posts: result.posts, budget: await getResearchBudget(c.env.DB, licenseId) });
});

// GET /research/limits — API残量表示
researchRoutes.get('/limits', async (c) => {
  const licenseId = getLicenseId(c);
  const budget = await getResearchBudget(c.env.DB, licenseId);
  return c.json({ budget });
});

// GET /research/settings — 設定取得
researchRoutes.get('/settings', async (c) => {
  const licenseId = getLicenseId(c);
  const settings = await c.env.DB.prepare(
    'SELECT * FROM research_settings WHERE license_id = ?'
  ).bind(licenseId).first();

  if (!settings) {
    return c.json({ buzz_likes: 1000, buzz_replies: 100, buzz_reposts: 50, retention_days: 90, max_pages: 2 });
  }
  return c.json(settings);
});

// PUT /research/settings — 設定更新（Fix 2: バリデーション追加）
researchRoutes.put('/settings', async (c) => {
  const licenseId = getLicenseId(c);
  const body = await c.req.json();

  // Fix 2: 設定値バリデーション
  const buzzLikes = Number(body.buzz_likes ?? 1000);
  const buzzReplies = Number(body.buzz_replies ?? 100);
  const buzzReposts = Number(body.buzz_reposts ?? 50);
  const retentionDays = Number(body.retention_days ?? 90);
  const maxPages = Number(body.max_pages ?? 2);

  const errors: string[] = [];
  if (isNaN(buzzLikes) || buzzLikes < 0 || buzzLikes > 100000) errors.push('buzz_likes: 0〜100000');
  if (isNaN(buzzReplies) || buzzReplies < 0 || buzzReplies > 10000) errors.push('buzz_replies: 0〜10000');
  if (isNaN(buzzReposts) || buzzReposts < 0 || buzzReposts > 10000) errors.push('buzz_reposts: 0〜10000');
  if (isNaN(retentionDays) || retentionDays < 7 || retentionDays > 365) errors.push('retention_days: 7〜365');
  if (isNaN(maxPages) || maxPages < 1 || maxPages > 4) errors.push('max_pages: 1〜4');

  if (errors.length > 0) {
    return c.json({ error: `設定値が範囲外です: ${errors.join(', ')}` }, 400);
  }

  await c.env.DB.prepare(
    `INSERT INTO research_settings (license_id, buzz_likes, buzz_replies, buzz_reposts, retention_days, max_pages, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(license_id) DO UPDATE SET
       buzz_likes = ?, buzz_replies = ?, buzz_reposts = ?, retention_days = ?, max_pages = ?, updated_at = ?`
  ).bind(
    licenseId, buzzLikes, buzzReplies, buzzReposts, retentionDays, maxPages, Date.now(),
    buzzLikes, buzzReplies, buzzReposts, retentionDays, maxPages, Date.now(),
  ).run();

  return c.json({ updated: true });
});
