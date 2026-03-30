import type { Env } from '../../env.js';
import { postText, postImage, postVideo, postCarousel } from './threads-api.js';
import { canPost, checkThreadsQuota } from './safety.js';
import { deleteR2Media } from './media-cleanup.js';
import { getAccountWithValidToken } from '../../infrastructure/account-helpers.js';

/**
 * 予約投稿Cron
 *
 * 安全ルール:
 * - 1回のCron実行で最大1件のみ投稿（10分以内に2投稿 → 凍結リスク）
 * - canPost() で10分間隔 + 時間/日上限をチェック
 * - 429エラーはリトライ（次のCronサイクルで）
 */
export async function handleCron(env: Env): Promise<void> {
  const now = Date.now();

  // 期限到達した予約投稿を取得（1件だけ。10分ルール厳守）
  const { results } = await env.DB.prepare(
    `SELECT id, content, media_type, media_urls, account_id
     FROM posts
     WHERE status = 'scheduled' AND scheduled_at <= ?
     ORDER BY scheduled_at
     LIMIT 1`
  ).bind(now).all();

  if (results.length === 0) return;

  const post = results[0];
  const accountId = post.account_id as string;

  // アカウント取得 + トークン復号 + 期限チェック
  const accountResult = await getAccountWithValidToken(env, accountId);
  if (!accountResult.ok) {
    console.log(`Cron: skipped ${post.id} — ${accountResult.error}`);
    return;
  }
  const account = accountResult.account;

  // 安全チェック: 10分間隔・時間/日上限
  const check = await canPost(env.DB, accountId);
  if (!check.ok) {
    console.log(`Cron: skipped ${post.id} — ${check.reason}`);
    return;
  }

  // Threads API側のクォータチェック
  const quota = await checkThreadsQuota(account.threads_user_id, account.access_token);
  if (!quota.withinLimit) {
    console.log(`Cron: skipped ${post.id} — Threads quota exceeded`);
    return;
  }

  try {
    const mediaType = post.media_type as string | null;
    const mediaUrls: string[] = post.media_urls ? JSON.parse(post.media_urls as string) : [];
    const content = post.content as string;

    let result;
    if (mediaType === 'image' && mediaUrls.length === 1) {
      result = await postImage(account.threads_user_id, account.access_token, content, mediaUrls[0]);
    } else if (mediaType === 'video' && mediaUrls.length === 1) {
      result = await postVideo(account.threads_user_id, account.access_token, content, mediaUrls[0]);
    } else if (mediaType === 'carousel' && mediaUrls.length >= 2) {
      result = await postCarousel(account.threads_user_id, account.access_token, content, mediaUrls);
    } else {
      result = await postText(account.threads_user_id, account.access_token, content);
    }

    await env.DB.prepare(
      'UPDATE posts SET status = ?, threads_id = ?, posted_at = ?, updated_at = ? WHERE id = ?'
    ).bind('posted', result.id, Date.now(), Date.now(), post.id).run();

    console.log(`Cron: posted ${post.id} → ${result.id}`);

    // 投稿完了 → R2メディア削除
    if (mediaUrls.length > 0) {
      await deleteR2Media(env.MEDIA, mediaUrls);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('429')) {
      console.warn(`Cron: rate limited ${post.id}, will retry next cycle`);
      return;
    }

    await env.DB.prepare(
      'UPDATE posts SET status = ?, error = ?, updated_at = ? WHERE id = ?'
    ).bind('failed', message, Date.now(), post.id).run();

    console.error(`Cron: failed ${post.id}:`, message);
  }
}
