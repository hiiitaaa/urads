/**
 * 投稿安全レイヤー
 * レートリミット・投稿間隔・ランダム遅延を管理
 */

/**
 * 安全リミット設定
 *
 * 凍結リスクの実績データ（2026-03確認済み）:
 * - 10分以内に2投稿以上 → 凍結リスク大
 * - 1時間で10投稿以上 → 凍結リスク大
 * - 1時間で50〜100以上のアクション（いいね/フォロー/リプライ） → 不自然判定
 * - 同じ時間間隔での投稿 → 自動化判定
 * - 毎投稿リンク付き → スパム判定
 * - 新規アカウントは特に厳しい
 */
export const LIMITS = {
  // 投稿
  posts: { official: 250, safe: 24 },       // 24h（実質10/時が凍結ライン → 24件/日が安全）
  postsPerHour: 6,                          // 1時間あたり最大6件（10件で凍結リスク）
  minIntervalMs: 10 * 60 * 1000,           // 投稿: 最低10分間隔（10分2件で凍結リスクのため）

  // リプライ
  replies: { official: 1000, safe: 50 },    // 1時間あたり最大50件（50-100で不自然判定）
  repliesPerDay: 200,                       // 24h上限
  replyMinIntervalMs: 60 * 1000,           // リプライ: 最低60秒間隔

  // 削除
  deletes: { official: 100, safe: 50 },     // 24h

  // ジッター（予約投稿のランダム遅延）
  jitterMinMs: 5 * 60 * 1000,              // 5分〜（同時刻予約の衝突防止）
  jitterMaxMs: 15 * 60 * 1000,             // 〜15分

  // Cron内の投稿間遅延
  cronDelayMs: 10 * 60 * 1000,             // 10分（10分2件ルールを絶対守る）

  // 1時間あたりの全アクション上限（投稿+リプライ+いいね+フォロー）
  actionsPerHour: 40,                       // 50-100で不自然判定 → 40で安全
} as const;

/**
 * 24時間以内の投稿数を取得
 */
export async function getPostCount24h(db: D1Database, accountId: string): Promise<number> {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const result = await db.prepare(
    "SELECT COUNT(*) as cnt FROM posts WHERE account_id = ? AND status = 'posted' AND posted_at >= ?"
  ).bind(accountId, since).first<{ cnt: number }>();
  return result?.cnt || 0;
}

/**
 * 直近の投稿日時を取得
 */
export async function getLastPostTime(db: D1Database, accountId: string): Promise<number | null> {
  const result = await db.prepare(
    "SELECT posted_at FROM posts WHERE account_id = ? AND status = 'posted' ORDER BY posted_at DESC LIMIT 1"
  ).bind(accountId).first<{ posted_at: number }>();
  return result?.posted_at || null;
}

/**
 * 投稿可能かチェック（理由付き）
 */
export async function canPost(db: D1Database, accountId: string): Promise<{ ok: boolean; reason?: string }> {
  // 24時間の投稿数チェック
  const count = await getPostCount24h(db, accountId);
  if (count >= LIMITS.posts.safe) {
    return {
      ok: false,
      reason: `24時間の投稿上限（${LIMITS.posts.safe}件）に達しています。現在${count}件。`,
    };
  }

  // 1時間あたりの投稿数チェック
  const since1h = Date.now() - 60 * 60 * 1000;
  const hourResult = await db.prepare(
    "SELECT COUNT(*) as cnt FROM posts WHERE account_id = ? AND status = 'posted' AND posted_at >= ?"
  ).bind(accountId, since1h).first<{ cnt: number }>();
  const hourCount = hourResult?.cnt || 0;
  if (hourCount >= LIMITS.postsPerHour) {
    return {
      ok: false,
      reason: `1時間あたりの投稿上限（${LIMITS.postsPerHour}件）に達しています。現在${hourCount}件/時。しばらく待ってください。`,
    };
  }

  // 最低投稿間隔チェック（10分）
  const lastTime = await getLastPostTime(db, accountId);
  if (lastTime) {
    const elapsed = Date.now() - lastTime;
    if (elapsed < LIMITS.minIntervalMs) {
      const waitMin = Math.ceil((LIMITS.minIntervalMs - elapsed) / 60000);
      return {
        ok: false,
        reason: `前回の投稿から${waitMin}分待ってください（最低${LIMITS.minIntervalMs / 60000}分間隔）。`,
      };
    }
  }

  return { ok: true };
}

/**
 * ランダム遅延（ジッター）を生成（ミリ秒）
 */
export function getJitterMs(): number {
  return LIMITS.jitterMinMs + Math.random() * (LIMITS.jitterMaxMs - LIMITS.jitterMinMs);
}

/**
 * 予約時刻にジッターを追加
 */
export function addJitterToSchedule(scheduledAt: number): number {
  return scheduledAt + getJitterMs();
}

/**
 * Threads APIのクォータを確認
 */
export async function checkThreadsQuota(
  userId: string,
  accessToken: string,
): Promise<{ withinLimit: boolean; usage?: number; limit?: number; error?: string }> {
  try {
    const res = await fetch(
      `https://graph.threads.net/v1.0/${userId}/threads_publishing_limit?fields=quota_usage,config&access_token=${accessToken}`
    );

    if (!res.ok) {
      const status = res.status;
      // 5xx = Meta障害 → 投稿許可（障害時にブロックしない）
      if (status >= 500) {
        console.warn(`Quota check: Meta API 5xx (${status}), allowing post`);
        return { withinLimit: true };
      }
      // 4xx = 認証エラー等 → 投稿拒否
      console.warn(`Quota check: API error ${status}, blocking post`);
      return { withinLimit: false, error: `Threads API returned ${status}` };
    }

    const data = await res.json() as {
      data: Array<{ quota_usage: number; config: { quota_total: number } }>;
    };

    if (data.data && data.data.length > 0) {
      const usage = data.data[0].quota_usage;
      const limit = data.data[0].config.quota_total;
      return {
        withinLimit: usage < LIMITS.posts.safe,
        usage,
        limit,
      };
    }

    return { withinLimit: true };
  } catch (err) {
    console.error('Quota check failed:', err instanceof Error ? err.message : err);
    return { withinLimit: false, error: 'クォータ確認に失敗しました' };
  }
}

// ================================================================
// リプライ用レートリミット
// ================================================================

/**
 * 24時間以内のリプライ数を取得（アカウント単位）
 */
export async function getReplyCount24h(db: D1Database, accountId: string): Promise<number> {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const result = await db.prepare(
    'SELECT COUNT(*) as cnt FROM reply_logs WHERE account_id = ? AND replied_at >= ?'
  ).bind(accountId, since).first<{ cnt: number }>();
  return result?.cnt || 0;
}

/**
 * 直近のリプライ日時を取得（アカウント単位）
 */
export async function getLastReplyTime(db: D1Database, accountId: string): Promise<number | null> {
  const result = await db.prepare(
    'SELECT replied_at FROM reply_logs WHERE account_id = ? ORDER BY replied_at DESC LIMIT 1'
  ).bind(accountId).first<{ replied_at: number }>();
  return result?.replied_at || null;
}

/**
 * リプライ可能かチェック（アカウント単位）
 */
export async function canReply(db: D1Database, accountId: string): Promise<{ ok: boolean; reason?: string }> {
  // 24時間のリプライ数チェック
  const count = await getReplyCount24h(db, accountId);
  if (count >= LIMITS.repliesPerDay) {
    return {
      ok: false,
      reason: `24時間のリプライ上限（${LIMITS.repliesPerDay}件）に達しています。現在${count}件。`,
    };
  }

  // 1時間あたりのリプライ数チェック
  const since1h = Date.now() - 60 * 60 * 1000;
  const hourResult = await db.prepare(
    'SELECT COUNT(*) as cnt FROM reply_logs WHERE account_id = ? AND replied_at >= ?'
  ).bind(accountId, since1h).first<{ cnt: number }>();
  const hourCount = hourResult?.cnt || 0;
  if (hourCount >= LIMITS.replies.safe) {
    return {
      ok: false,
      reason: `1時間あたりのリプライ上限（${LIMITS.replies.safe}件）に達しています。現在${hourCount}件/時。`,
    };
  }

  // 最低リプライ間隔チェック
  const lastTime = await getLastReplyTime(db, accountId);
  if (lastTime) {
    const elapsed = Date.now() - lastTime;
    if (elapsed < LIMITS.replyMinIntervalMs) {
      return {
        ok: false,
        reason: `前回のリプライから${Math.ceil((LIMITS.replyMinIntervalMs - elapsed) / 1000)}秒待ってください。`,
      };
    }
  }

  return { ok: true };
}

/**
 * 指数バックオフの待機時間を計算
 */
export function getBackoffMs(attempt: number): number {
  // 1分 → 2分 → 4分 → 8分（最大8分）
  const base = 60 * 1000;
  return Math.min(base * Math.pow(2, attempt), 8 * 60 * 1000);
}
