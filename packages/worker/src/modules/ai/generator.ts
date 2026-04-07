/**
 * AI テキスト生成（Claude API）
 * APIキーはD1から暗号化復号して使用
 */
import { decryptField } from '../../infrastructure/crypto.js';
import { SYSTEM_PROMPT } from './presets.js';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ALLOWED_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-20250514'];
const TIMEOUT_MS = 25000;

interface GenerateOptions {
  prompt: string;
  model: string;
  maxTokens: number;
}

interface GenerateResult {
  text: string;
  model: string;
  tokensUsed: number;
}

/**
 * レートリミットチェック（AI生成用）
 */
export async function canGenerate(
  db: D1Database, licenseId: string, keySource: string,
): Promise<{ ok: boolean; reason?: string }> {
  const since1h = Date.now() - 60 * 60 * 1000;
  const since24h = Date.now() - 24 * 60 * 60 * 1000;

  const hourCount = await db.prepare(
    "SELECT COUNT(*) as cnt FROM ai_api_calls WHERE license_id = ? AND provider = 'claude' AND called_at >= ?"
  ).bind(licenseId, since1h).first<{ cnt: number }>();

  const hourlyCount = hourCount?.cnt || 0;

  if (keySource === 'platform') {
    // プラットフォームキー: 10/時 + 50/日
    if (hourlyCount >= 10) {
      return { ok: false, reason: `プラットフォームキーの1時間あたりの上限（10回）に達しています` };
    }
    const dayCount = await db.prepare(
      "SELECT COUNT(*) as cnt FROM ai_api_calls WHERE license_id = ? AND provider = 'claude' AND called_at >= ?"
    ).bind(licenseId, since24h).first<{ cnt: number }>();
    if ((dayCount?.cnt || 0) >= 50) {
      return { ok: false, reason: `プラットフォームキーの1日あたりの上限（50回）に達しています` };
    }
  } else {
    // BYOKキー: 60/時
    if (hourlyCount >= 60) {
      return { ok: false, reason: `1時間あたりの上限（60回）に達しています` };
    }
  }

  return { ok: true };
}

/**
 * Claude APIでテキスト生成
 */
export async function generateWithClaude(
  db: D1Database,
  licenseId: string,
  encryptionKey: string,
  options: GenerateOptions,
): Promise<GenerateResult> {
  // 設定取得（カスタム指示含む）
  const settings = await db.prepare(
    'SELECT claude_api_key, key_source, custom_instructions FROM ai_settings WHERE license_id = ?'
  ).bind(licenseId).first<{ claude_api_key: string | null; key_source: string; custom_instructions: string | null }>();

  if (!settings?.claude_api_key) {
    throw new Error('Claude APIキーが設定されていません。設定画面から入力してください。');
  }

  // レートリミットチェック
  const rateCheck = await canGenerate(db, licenseId, settings.key_source);
  if (!rateCheck.ok) {
    throw new Error(rateCheck.reason!);
  }

  // モデル検証
  const model = ALLOWED_MODELS.includes(options.model) ? options.model : ALLOWED_MODELS[0];

  // APIキー復号
  const apiKey = await decryptField(encryptionKey, settings.claude_api_key);

  // Claude API呼び出し（25秒タイムアウト）
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: Math.min(options.maxTokens, 500),
        system: settings.custom_instructions
          ? `${SYSTEM_PROMPT}\n\n## ユーザーのカスタム指示\n${settings.custom_instructions}`
          : SYSTEM_PROMPT,
        messages: [{ role: 'user', content: options.prompt }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Claude API エラー (${res.status}): ${err.slice(0, 200)}`);
    }

    const data = await res.json() as {
      content: Array<{ text: string }>;
      usage?: { input_tokens: number; output_tokens: number };
    };

    const text = data.content?.[0]?.text || '';
    const tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);

    // API呼び出し記録
    await db.prepare(
      'INSERT INTO ai_api_calls (license_id, provider, called_at) VALUES (?, ?, ?)'
    ).bind(licenseId, 'claude', Date.now()).run();

    // 生成履歴記録
    await db.prepare(
      `INSERT INTO ai_generations (id, license_id, type, provider, model, prompt, result_text, tokens_used, created_at)
       VALUES (?, ?, 'text', 'claude', ?, ?, ?, ?, ?)`
    ).bind(crypto.randomUUID(), licenseId, model, options.prompt, text, tokensUsed, Date.now()).run();

    return { text, model, tokensUsed };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 古い生成履歴を削除
 */
export async function cleanupOldGenerations(db: D1Database): Promise<void> {
  const { results: settings } = await db.prepare(
    'SELECT license_id, retention_days FROM ai_settings'
  ).all();

  for (const setting of settings) {
    const days = (setting.retention_days as number) || 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    await db.prepare(
      'DELETE FROM ai_generations WHERE license_id = ? AND created_at < ?'
    ).bind(setting.license_id, cutoff).run();
  }

  // 古いAPI呼び出しログも削除（24時間以上前）
  await db.prepare(
    'DELETE FROM ai_api_calls WHERE called_at < ?'
  ).bind(Date.now() - 24 * 60 * 60 * 1000).run();
}
