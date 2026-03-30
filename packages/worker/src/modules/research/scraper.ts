/**
 * Threads API ベースのデータ収集
 * 全API呼び出しをレートリミットチェック+記録でラップ
 */
import { canCallResearchApi, recordResearchApiCall, type ResearchEndpoint } from './limits.js';

const THREADS_API = 'https://graph.threads.net/v1.0';

/**
 * レートリミット付きAPI呼び出しラッパー
 */
async function rateLimitedFetch(
  db: D1Database, licenseId: string, endpoint: ResearchEndpoint,
  url: string,
): Promise<Response | { error: string }> {
  const check = await canCallResearchApi(db, licenseId, endpoint);
  if (!check.ok) {
    return { error: check.reason! };
  }

  const res = await fetch(url);
  await recordResearchApiCall(db, licenseId, endpoint);
  return res;
}

interface ThreadsProfile {
  id: string;
  username: string;
  name?: string;
  threads_profile_picture_url?: string;
  threads_biography?: string;
  is_verified?: boolean;
  follower_count?: number;
}

interface ThreadsPost {
  id: string;
  text?: string;
  media_type?: string;
  media_url?: string;
  timestamp?: string;
  permalink?: string;
  like_count?: number;
  reply_count?: number;
  repost_count?: number;
  quote_count?: number;
}

/**
 * 競合プロフィールを取得
 */
export async function scrapeProfile(
  db: D1Database, licenseId: string, accessToken: string, benchmarkId: string,
): Promise<{ ok: true; profile: ThreadsProfile } | { ok: false; error: string }> {
  // まずベンチマーク情報を取得
  const benchmark = await db.prepare(
    'SELECT threads_user_id, threads_handle FROM benchmarks WHERE id = ?'
  ).bind(benchmarkId).first<{ threads_user_id: string | null; threads_handle: string }>();

  if (!benchmark) return { ok: false, error: 'ベンチマークが見つかりません' };

  // threads_user_idが未取得の場合、handleから検索が必要
  // Note: Threads APIにはhandle→user_id変換のエンドポイントがないため、
  // threads_user_idは手動入力 or プロフィール検索で取得する必要がある
  if (!benchmark.threads_user_id) {
    return { ok: false, error: 'Threads User IDが未設定です。ベンチマーク編集で設定してください。' };
  }

  const url = `${THREADS_API}/${benchmark.threads_user_id}?fields=id,username,name,threads_profile_picture_url,threads_biography,is_verified,follower_count&access_token=${accessToken}`;

  const res = await rateLimitedFetch(db, licenseId, 'profile', url);
  if ('error' in res) return { ok: false, error: res.error };

  if (!res.ok) {
    const status = res.status;
    const newStatus = status === 404 ? 'not_found' : status === 403 ? 'private' : 'error';
    await db.prepare(
      'UPDATE benchmarks SET status = ?, status_changed_at = ? WHERE id = ?'
    ).bind(newStatus, Date.now(), benchmarkId).run();
    return { ok: false, error: `プロフィール取得失敗 (${status})` };
  }

  const profile = await res.json() as ThreadsProfile;

  // ベンチマーク情報を更新
  await db.prepare(
    `UPDATE benchmarks SET threads_user_id = ?, display_name = ?, follower_count = ?,
     status = 'active', status_changed_at = ?, last_scraped_at = ? WHERE id = ?`
  ).bind(
    profile.id, profile.name ?? null, profile.follower_count ?? null,
    Date.now(), Date.now(), benchmarkId,
  ).run();

  return { ok: true, profile };
}

/**
 * 競合の投稿を収集
 */
export async function scrapePosts(
  db: D1Database, licenseId: string, accessToken: string,
  benchmarkId: string, userId: string, maxPages: number,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  // バズ設定を取得
  const settings = await db.prepare(
    'SELECT buzz_likes, buzz_replies, buzz_reposts FROM research_settings WHERE license_id = ?'
  ).bind(licenseId).first<{ buzz_likes: number; buzz_replies: number; buzz_reposts: number }>();

  const buzzLikes = settings?.buzz_likes || 1000;
  const buzzReplies = settings?.buzz_replies || 100;
  const buzzReposts = settings?.buzz_reposts || 50;

  let totalSaved = 0;
  let afterCursor: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    let url = `${THREADS_API}/${userId}/threads?fields=id,text,media_type,media_url,timestamp,permalink,like_count,reply_count,repost_count,quote_count&limit=25&access_token=${accessToken}`;
    if (afterCursor) url += `&after=${afterCursor}`;

    const res = await rateLimitedFetch(db, licenseId, 'threads', url);
    if ('error' in res) return { ok: false, error: res.error };
    if (!res.ok) return { ok: false, error: `投稿取得失敗 (${res.status})` };

    const data = await res.json() as {
      data: ThreadsPost[];
      paging?: { cursors?: { after?: string } };
    };

    if (!data.data || data.data.length === 0) break;

    for (const post of data.data) {
      const likes = post.like_count || 0;
      const replies = post.reply_count || 0;
      const reposts = post.repost_count || 0;
      const quotes = post.quote_count || 0;
      const isBuzz = (likes >= buzzLikes || replies >= buzzReplies || reposts >= buzzReposts) ? 1 : 0;

      // INSERT OR REPLACE で既存投稿のエンゲージメントを更新
      await db.prepare(
        `INSERT INTO scraped_posts (id, benchmark_id, threads_post_id, content, media_urls, likes, replies, reposts, quotes, is_buzz, source, posted_at, scraped_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'api', ?, ?)
         ON CONFLICT(benchmark_id, threads_post_id) DO UPDATE SET
           likes = ?, replies = ?, reposts = ?, quotes = ?, is_buzz = ?, scraped_at = ?`
      ).bind(
        crypto.randomUUID(), benchmarkId, post.id,
        post.text || null,
        post.media_url ? JSON.stringify([post.media_url]) : null,
        likes, replies, reposts, quotes, isBuzz,
        post.timestamp ? new Date(post.timestamp).getTime() : null, Date.now(),
        // ON CONFLICT UPDATE values
        likes, replies, reposts, quotes, isBuzz, Date.now(),
      ).run();

      totalSaved++;
    }

    // 次のページ
    afterCursor = data.paging?.cursors?.after || null;
    if (!afterCursor) break;
  }

  // last_scraped_at更新
  await db.prepare(
    'UPDATE benchmarks SET last_scraped_at = ? WHERE id = ?'
  ).bind(Date.now(), benchmarkId).run();

  return { ok: true, count: totalSaved };
}

/**
 * キーワード検索
 */
export async function searchKeyword(
  db: D1Database, licenseId: string, accessToken: string, query: string,
): Promise<{ ok: true; posts: ThreadsPost[] } | { ok: false; error: string }> {
  const url = `${THREADS_API}/threads/search?q=${encodeURIComponent(query)}&fields=id,text,username,timestamp,like_count,reply_count,repost_count,quote_count,permalink&limit=25&access_token=${accessToken}`;

  const res = await rateLimitedFetch(db, licenseId, 'keyword_search', url);
  if ('error' in res) return { ok: false, error: res.error };
  if (!res.ok) return { ok: false, error: `検索失敗 (${res.status})` };

  const data = await res.json() as { data: ThreadsPost[] };
  return { ok: true, posts: data.data || [] };
}
