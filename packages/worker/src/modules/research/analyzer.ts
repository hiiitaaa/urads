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
    'SELECT buzz_likes, buzz_replies, buzz_reposts FROM research_settings WHERE license_id = ?'
  ).bind(licenseId).first<{ buzz_likes: number; buzz_replies: number; buzz_reposts: number }>();

  if (!settings) return 0;

  // 全投稿のバズフラグをリセット
  await db.prepare(
    'UPDATE scraped_posts SET is_buzz = 0 WHERE benchmark_id = ?'
  ).bind(benchmarkId).run();

  // 閾値超えをバズに設定
  const result = await db.prepare(
    `UPDATE scraped_posts SET is_buzz = 1
     WHERE benchmark_id = ?
       AND (likes >= ? OR replies >= ? OR reposts >= ?)`
  ).bind(benchmarkId, settings.buzz_likes, settings.buzz_replies, settings.buzz_reposts).run();

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
