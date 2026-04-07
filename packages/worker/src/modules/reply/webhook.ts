/**
 * Threads Webhook ハンドラー
 * リプライ通知を受信 → ルール評価 → 自動返信
 */
import { Hono } from 'hono';
import type { Env } from '../../env.js';
import { findMatchingRule } from './engine.js';
import { postReply } from '../post/threads-api.js';
import { decryptFieldSafe } from '../../infrastructure/crypto.js';

export const webhookRoutes = new Hono<{ Bindings: Env }>();

// GET /webhook — Meta Webhook検証（サブスクリプション確認）
webhookRoutes.get('/', async (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  // verify_token は専用の環境変数で管理（ENCRYPTION_KEYとは分離）
  const verifyToken = c.env.WEBHOOK_VERIFY_TOKEN || 'urads-webhook-verify';

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('Webhook verified');
    return c.text(challenge || '', 200);
  }

  return c.text('Forbidden', 403);
});

// POST /webhook — Threads からのイベント受信
webhookRoutes.post('/', async (c) => {
  const body = await c.req.json();

  // Threads Webhook のペイロード構造
  // { object: "page", entry: [{ id, time, messaging/changes }] }
  const entries = body.entry || [];

  for (const entry of entries) {
    const changes = entry.changes || [];

    for (const change of changes) {
      if (change.field === 'replies') {
        await handleReply(c.env, change.value);
      }
    }
  }

  return c.text('OK', 200);
});

interface ReplyEvent {
  from: { id: string; username?: string };
  id: string;       // リプライのThreads ID
  text: string;     // リプライ本文
  parent_id: string; // 親投稿のID
  timestamp: string;
}

async function handleReply(env: Env, event: ReplyEvent): Promise<void> {
  const triggerUserId = event.from.id;
  const triggerText = event.text || '';
  const parentId = event.parent_id;
  const replyToId = event.id;

  console.log(`Webhook: reply from ${triggerUserId} on ${parentId}: "${triggerText}"`);

  // 該当投稿に紐づくアクティブなルールを取得
  const { results: rules } = await env.DB.prepare(
    `SELECT r.*, a.threads_user_id, a.access_token
     FROM reply_rules r
     JOIN accounts a ON a.id = r.account_id
     WHERE r.active = 1
       AND (r.post_id = ? OR r.post_id IS NULL)
       AND (r.expires_at IS NULL OR r.expires_at > ?)
       AND r.reply_count < r.max_replies
     ORDER BY r.created_at`
  ).bind(parentId, Date.now()).all();

  if (rules.length === 0) return;

  // ルールをパースして評価用に変換
  const parsedRules = rules.map((r) => ({
    id: r.id as string,
    type: r.type as 'keyword_match' | 'random',
    config: JSON.parse(r.config as string),
    max_replies: r.max_replies as number,
    reply_count: r.reply_count as number,
    reply_once_per_user: r.reply_once_per_user as number,
    cooldown_seconds: r.cooldown_seconds as number,
    threads_user_id: r.threads_user_id as string,
    access_token: r.access_token as string, // 復号は使用時に行う
  }));

  // マッチするルールを探す
  const match = findMatchingRule(parsedRules, triggerText);
  if (!match) return;

  const matchedRule = parsedRules.find((r) => r.id === match.rule.id)!;

  // reply_once_per_user チェック
  if (matchedRule.reply_once_per_user) {
    const existing = await env.DB.prepare(
      'SELECT id FROM reply_logs WHERE rule_id = ? AND trigger_user_id = ? LIMIT 1'
    ).bind(matchedRule.id, triggerUserId).first();

    if (existing) {
      console.log(`Webhook: skipped (already replied to user ${triggerUserId})`);
      return;
    }
  }

  // クールダウンチェック
  const lastReply = await env.DB.prepare(
    'SELECT replied_at FROM reply_logs WHERE rule_id = ? ORDER BY replied_at DESC LIMIT 1'
  ).bind(matchedRule.id).first<{ replied_at: number }>();

  if (lastReply) {
    const elapsed = (Date.now() - lastReply.replied_at) / 1000;
    if (elapsed < matchedRule.cooldown_seconds) {
      console.log(`Webhook: cooldown (${elapsed.toFixed(0)}s < ${matchedRule.cooldown_seconds}s)`);
      return;
    }
  }

  // Threads APIでリプライ（access_token復号）
  try {
    const decryptedToken = await decryptFieldSafe(env.ENCRYPTION_KEY, matchedRule.access_token);
    const result = await postReply(
      matchedRule.threads_user_id,
      decryptedToken,
      match.response,
      replyToId,
    );

    // カウント更新 + ログ記録
    await env.DB.prepare(
      'UPDATE reply_rules SET reply_count = reply_count + 1 WHERE id = ?'
    ).bind(matchedRule.id).run();

    await env.DB.prepare(
      `INSERT INTO reply_logs (id, rule_id, trigger_user_id, trigger_text, response_text, threads_reply_id, replied_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(), matchedRule.id, triggerUserId,
      triggerText, match.response, result.id, Date.now(),
    ).run();

    console.log(`Webhook: replied ${result.id} to ${triggerUserId}`);
  } catch (err) {
    console.error(`Webhook: reply failed:`, err instanceof Error ? err.message : err);
  }
}
