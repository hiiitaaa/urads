/**
 * 分析エンジン
 * バズ検知・投稿パターン分析
 */

/**
 * バズ投稿を再判定（設定変更後に実行）
 */
export async function redetectBuzz(
  db: D1Database, licenseId: string, benchmarkId: string,
): Promise<number> {
  const settings = await db.prepare(
    'SELECT buzz_likes, buzz_replies, buzz_reposts, buzz_engagement_rate FROM research_settings WHERE license_id = ?'
  ).bind(licenseId).first<{ buzz_likes: number; buzz_replies: number; buzz_reposts: number; buzz_engagement_rate: number }>();

  if (!settings) return 0;

  const buzzEngRate = settings.buzz_engagement_rate || 0.08;

  // 全投稿のバズフラグをリセット
  await db.prepare(
    'UPDATE scraped_posts SET is_buzz = 0 WHERE benchmark_id IN (SELECT id FROM benchmarks WHERE license_id = ?) AND benchmark_id = ?'
  ).bind(licenseId, benchmarkId).run();

  // engagement_rate based (when follower_snapshot available) OR absolute fallback
  const result = await db.prepare(
    `UPDATE scraped_posts SET is_buzz = 1
     WHERE benchmark_id IN (SELECT id FROM benchmarks WHERE license_id = ?)
       AND benchmark_id = ?
       AND (
         (follower_snapshot IS NOT NULL AND engagement_rate >= ?)
         OR
         (follower_snapshot IS NULL AND (likes >= ? OR replies >= ? OR reposts >= ?))
       )`
  ).bind(licenseId, benchmarkId, buzzEngRate, settings.buzz_likes, settings.buzz_replies, settings.buzz_reposts).run();

  return result.meta.changes || 0;
}

/**
 * 投稿パターン分析（時間帯・曜日）
 */
export async function analyzePostingPattern(
  db: D1Database, benchmarkId: string,
): Promise<{
  hourly: Record<number, number>;
  total: number;
  avgLikes: number;
  avgReplies: number;
  buzzRate: number;
}> {
  const { results } = await db.prepare(
    'SELECT posted_at, likes, replies, reposts, is_buzz FROM scraped_posts WHERE benchmark_id = ? AND posted_at IS NOT NULL'
  ).bind(benchmarkId).all();

  const hourly: Record<number, number> = {};
  let totalLikes = 0;
  let totalReplies = 0;
  let buzzCount = 0;

  for (const post of results) {
    if (post.posted_at) {
      const hour = new Date(post.posted_at as number).getHours();
      hourly[hour] = (hourly[hour] || 0) + 1;
    }
    totalLikes += (post.likes as number) ?? 0;
    totalReplies += (post.replies as number) ?? 0;
    if (post.is_buzz) buzzCount++;
  }

  const total = results.length;
  return {
    hourly,
    total,
    avgLikes: total > 0 ? Math.round(totalLikes / total) : 0,
    avgReplies: total > 0 ? Math.round(totalReplies / total) : 0,
    buzzRate: total > 0 ? Math.round((buzzCount / total) * 100) : 0,
  };
}
