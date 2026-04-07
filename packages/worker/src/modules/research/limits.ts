/**
 * リサーチAPI レートリミット管理
 * license_id単位（グローバル）で管理。アカウント切替でリセットしない。
 */

export const RESEARCH_LIMITS = {
  profile: { official: 200, safe: 160 },        // 回/時
  threads: { official: 200, safe: 160 },        // 回/時
  keyword_search: { official: 100, safe: 80 },  // 回/時
} as const;

export type ResearchEndpoint = keyof typeof RESEARCH_LIMITS;

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * 過去1時間のAPI呼び出し数（スライディングウィンドウ）
 */
export async function getResearchCallCount1h(
  db: D1Database, licenseId: string, endpoint: ResearchEndpoint,
): Promise<number> {
  const since = Date.now() - ONE_HOUR_MS;
  const result = await db.prepare(
    'SELECT COUNT(*) as cnt FROM research_api_calls WHERE license_id = ? AND endpoint = ? AND called_at >= ?'
  ).bind(licenseId, endpoint, since).first<{ cnt: number }>();
  return result?.cnt || 0;
}

/**
 * API呼び出し可能かチェック
 */
export async function canCallResearchApi(
  db: D1Database, licenseId: string, endpoint: ResearchEndpoint,
): Promise<{ ok: boolean; reason?: string; remaining?: number }> {
  const count = await getResearchCallCount1h(db, licenseId, endpoint);
  const limit = RESEARCH_LIMITS[endpoint].safe;
  const remaining = limit - count;

  if (remaining <= 0) {
    return {
      ok: false,
      reason: `${endpoint} APIの1時間あたりの上限（${limit}回）に達しています。しばらく待ってから再試行してください。`,
      remaining: 0,
    };
  }

  return { ok: true, remaining };
}

/**
 * API呼び出しを記録
 */
export async function recordResearchApiCall(
  db: D1Database, licenseId: string, endpoint: ResearchEndpoint,
): Promise<void> {
  await db.prepare(
    'INSERT INTO research_api_calls (license_id, endpoint, called_at) VALUES (?, ?, ?)'
  ).bind(licenseId, endpoint, Date.now()).run();
}

/**
 * 全エンドポイントの残量を一括取得
 */
export async function getResearchBudget(
  db: D1Database, licenseId: string,
): Promise<Record<ResearchEndpoint, { used: number; limit: number; remaining: number }>> {
  const endpoints: ResearchEndpoint[] = ['profile', 'threads', 'keyword_search'];
  const budget = {} as Record<ResearchEndpoint, { used: number; limit: number; remaining: number }>;

  for (const ep of endpoints) {
    const used = await getResearchCallCount1h(db, licenseId, ep);
    const limit = RESEARCH_LIMITS[ep].safe;
    budget[ep] = { used, limit, remaining: Math.max(0, limit - used) };
  }

  return budget;
}

/**
 * 古いAPI呼び出しログを削除（24時間以上前）
 */
export async function cleanupOldCalls(db: D1Database): Promise<void> {
  const cutoff = Date.now() - 24 * ONE_HOUR_MS;
  await db.prepare('DELETE FROM research_api_calls WHERE called_at < ?').bind(cutoff).run();
}

/**
 * 古い非バズ投稿を削除（retention_days超え）
 */
export async function cleanupOldScrapedPosts(db: D1Database): Promise<void> {
  // 全ライセンスの設定を取得して、それぞれの保持期間で削除
  const { results: settings } = await db.prepare(
    'SELECT license_id, retention_days FROM research_settings'
  ).all();

  for (const setting of settings) {
    const days = (setting.retention_days as number) || 90;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    await db.prepare(
      `DELETE FROM scraped_posts
       WHERE is_buzz = 0
         AND scraped_at < ?
         AND benchmark_id IN (SELECT id FROM benchmarks WHERE license_id = ?)`
    ).bind(cutoff, setting.license_id).run();
  }
}

/**
 * スクレイプ予算を計算（実行前の表示用）
 */
export function estimateScrapeBudget(benchmarkCount: number, maxPages: number): {
  profileCalls: number;
  threadsCalls: number;
  total: number;
} {
  const profileCalls = benchmarkCount; // 1 profile call per benchmark
  const threadsCalls = benchmarkCount * maxPages; // N pages per benchmark
  return {
    profileCalls,
    threadsCalls,
    total: profileCalls + threadsCalls,
  };
}
