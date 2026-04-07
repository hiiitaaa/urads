/**
 * R2メディア自動削除
 * - 投稿成功後のR2ファイル削除
 * - orphanメディアの定期クリーンアップ
 */

/**
 * メディアURLからR2キーを抽出
 * URL例: https://urads-api.workers.dev/media/uploads/1711234567890-uuid.jpg
 * R2キー: uploads/1711234567890-uuid.jpg
 */
export function extractR2Key(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\/media\/(uploads\/.+)$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * R2メディアを削除
 * 個別の削除失敗はログ出力のみ（呼び出し元には伝搬しない）
 */
export async function deleteR2Media(media: R2Bucket, urls: string[]): Promise<void> {
  for (const url of urls) {
    try {
      const key = extractR2Key(url);
      if (key) {
        await media.delete(key);
        console.log(`R2 cleanup: deleted ${key}`);
      }
    } catch (err) {
      console.warn(`R2 cleanup: failed to delete ${url}:`, err);
    }
  }
}

/**
 * orphanメディアのクリーンアップ（毎時Cron）
 *
 * 対象:
 * - failed + 24時間以上前
 * - posting + 1時間以上前（Workerタイムアウト等で放置）
 * - scheduled + 48時間以上前（アカウント削除等で実行されない）
 */
export async function cleanupOrphanMedia(db: D1Database, media: R2Bucket): Promise<void> {
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  const TWENTY_FOUR_HOURS = 24 * ONE_HOUR;
  const FORTY_EIGHT_HOURS = 48 * ONE_HOUR;

  const { results } = await db.prepare(
    `SELECT id, media_urls FROM posts
     WHERE media_urls IS NOT NULL AND (
       (status = 'failed' AND updated_at < ?)
       OR (status = 'posting' AND updated_at < ?)
       OR (status = 'scheduled' AND scheduled_at < ?)
     )`
  ).bind(
    now - TWENTY_FOUR_HOURS,
    now - ONE_HOUR,
    now - FORTY_EIGHT_HOURS,
  ).all();

  if (results.length === 0) return;

  console.log(`R2 orphan cleanup: ${results.length} posts to clean`);

  for (const row of results) {
    try {
      const urls: string[] = JSON.parse(row.media_urls as string);
      await deleteR2Media(media, urls);

      // media_urlsをNULLに更新して再処理防止
      await db.prepare(
        'UPDATE posts SET media_urls = NULL, updated_at = ? WHERE id = ?'
      ).bind(now, row.id).run();
    } catch (err) {
      console.warn(`R2 orphan cleanup: failed for post ${row.id}:`, err);
    }
  }
}
