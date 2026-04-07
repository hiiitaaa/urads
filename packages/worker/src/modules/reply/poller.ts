/**
 * リプライポーリング
 * Cronで定期実行。投稿に紐づいたルールのリプライを取得→自動返信
 */
import type { Env } from '../../env.js';
import { findMatchingRule } from './engine.js';
import { postReply } from '../post/threads-api.js';
import { canReply } from '../post/safety.js';
import { decryptFieldSafe } from '../../infrastructure/crypto.js';

const THREADS_API = 'https://graph.threads.net/v1.0';

interface ThreadsReply {
  id: string;
  text: string;
  username: string;
  timestamp: string;
}

export async function pollReplies(env: Env): Promise<void> {
  // アクティブなルール（threads_post_id必須）を取得
  const { results: activeRules } = await env.DB.prepare(
    `SELECT r.id, r.threads_post_id, r.account_id, r.type, r.config, r.max_replies, r.reply_count,
            r.reply_once_per_user, r.cooldown_seconds,
            a.threads_user_id, a.access_token
     FROM reply_rules r
     JOIN accounts a ON a.id = r.account_id
     WHERE r.active = 1
       AND r.reply_count < r.max_replies
       AND (r.expires_at IS NULL OR r.expires_at > ?)
       AND (a.token_expires_at IS NULL OR a.token_expires_at > ?)`
  ).bind(Date.now(), Date.now()).all();

  if (activeRules.length === 0) return;

  // アカウントごとにグループ化
  const byAccount = new Map<string, typeof activeRules>();
  for (const rule of activeRules) {
    const key = rule.account_id as string;
    if (!byAccount.has(key)) byAccount.set(key, []);
    byAccount.get(key)!.push(rule);
  }

  for (const [accountId, rules] of byAccount) {
    const accessToken = await decryptFieldSafe(env.ENCRYPTION_KEY, rules[0].access_token as string);
    const userId = rules[0].threads_user_id as string;

    // アカウント単位のリプライレートリミットチェック
    const replyCheck = await canReply(env.DB, accountId);
    if (!replyCheck.ok) {
      console.log(`Poll: skipped account ${accountId} — ${replyCheck.reason}`);
      continue;
    }

    // ルールが紐づいている投稿IDを収集（重複排除）
    const postIds = [...new Set(rules.map((r) => r.threads_post_id as string))];

    try {
      for (const postId of postIds) {
        // この投稿に紐づくルール
        const applicableRules = rules.filter((r) => r.threads_post_id === postId);

        // リプライ取得
        const repliesRes = await fetch(
          `${THREADS_API}/${postId}/replies?fields=id,text,username,timestamp&access_token=${accessToken}`
        );
        if (!repliesRes.ok) continue;

        const repliesData = await repliesRes.json() as { data: ThreadsReply[] };
        if (!repliesData.data || repliesData.data.length === 0) continue;

        for (const reply of repliesData.data) {
          // 重複排除（Threads reply IDベース）
          const existing = await env.DB.prepare(
            'SELECT id FROM reply_logs WHERE trigger_reply_id = ? LIMIT 1'
          ).bind(reply.id).first();
          if (existing) continue;

          // リプライレートリミット再チェック（ループ内で上限に達する可能性）
          const recheck = await canReply(env.DB, accountId);
          if (!recheck.ok) break;

          // ルール評価
          const parsedRules = applicableRules.map((r) => ({
            id: r.id as string,
            type: r.type as 'keyword_match' | 'random',
            config: JSON.parse(r.config as string),
            max_replies: r.max_replies as number,
            reply_count: r.reply_count as number,
            reply_once_per_user: r.reply_once_per_user as number,
            cooldown_seconds: r.cooldown_seconds as number,
          }));

          const match = findMatchingRule(parsedRules, reply.text);
          if (!match) continue;

          // reply_once_per_user チェック
          if (match.rule.reply_once_per_user) {
            const alreadyReplied = await env.DB.prepare(
              'SELECT id FROM reply_logs WHERE rule_id = ? AND trigger_user_id = ? LIMIT 1'
            ).bind(match.rule.id, reply.username).first();
            if (alreadyReplied) continue;
          }

          // ルール個別クールダウンチェック
          const lastRuleReply = await env.DB.prepare(
            'SELECT replied_at FROM reply_logs WHERE rule_id = ? ORDER BY replied_at DESC LIMIT 1'
          ).bind(match.rule.id).first<{ replied_at: number }>();

          if (lastRuleReply) {
            const elapsed = (Date.now() - lastRuleReply.replied_at) / 1000;
            if (elapsed < match.rule.cooldown_seconds) continue;
          }

          // 自動返信
          try {
            const result = await postReply(userId, accessToken, match.response, reply.id);

            await env.DB.prepare(
              'UPDATE reply_rules SET reply_count = reply_count + 1 WHERE id = ?'
            ).bind(match.rule.id).run();

            await env.DB.prepare(
              `INSERT INTO reply_logs (id, rule_id, trigger_user_id, trigger_text, response_text, threads_reply_id, trigger_reply_id, account_id, replied_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              crypto.randomUUID(), match.rule.id, reply.username,
              reply.text, match.response, result.id, reply.id, accountId, Date.now(),
            ).run();

            console.log(`Poll: replied to @${reply.username} on ${postId}`);
            // 安全ルール: 1サイクルで1アカウントにつき1件だけ返信
            // 次のリプライは次のCronサイクル（2分後）で処理
            return;
          } catch (err) {
            console.error(`Poll: reply failed:`, err instanceof Error ? err.message : err);
          }
        }
      }
    } catch (err) {
      console.error(`Poll: error for account ${accountId}:`, err instanceof Error ? err.message : err);
    }
  }
}
