import { Hono } from 'hono';
import type { Env } from '../../env.js';
import { encryptField } from '../../infrastructure/crypto.js';
import { buildPrompt, sanitizeVariable } from './presets.js';
import { generateWithClaude, cleanupOldGenerations } from './generator.js';

export const aiRoutes = new Hono<{ Bindings: Env }>();

const DEV_LICENSE_ID = 'dev-license';
function getLicenseId(c: { get: (key: string) => unknown }): string {
  return (c.get('licenseId') as string) || DEV_LICENSE_ID;
}

// POST /ai/generate — テキスト生成（Claude）
aiRoutes.post('/generate', async (c) => {
  const licenseId = getLicenseId(c);
  const body = await c.req.json();

  if (!body.prompt || typeof body.prompt !== 'string') {
    return c.json({ error: 'プロンプトは必須です' }, 400);
  }

  if (body.prompt.length > 2000) {
    return c.json({ error: 'プロンプトは2000文字以内にしてください' }, 400);
  }

  // コンテキスト付きプロンプト構築
  let finalPrompt = body.prompt;
  if (body.context_type && body.context_data) {
    finalPrompt = buildContextPrompt(body.context_type, body.context_data, body.prompt);
  }

  const settings = await c.env.DB.prepare(
    'SELECT claude_model, max_tokens FROM ai_settings WHERE license_id = ?'
  ).bind(licenseId).first<{ claude_model: string; max_tokens: number }>();

  try {
    const result = await generateWithClaude(c.env.DB, licenseId, c.env.ENCRYPTION_KEY, {
      prompt: finalPrompt,
      model: body.model || settings?.claude_model || 'claude-haiku-4-5-20251001',
      maxTokens: body.max_tokens || settings?.max_tokens || 300,
    });

    return c.json({
      text: result.text,
      model: result.model,
      tokens_used: result.tokensUsed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 400);
  }
});

// GET /ai/presets — プリセット一覧（builtin + ユーザー定義）
aiRoutes.get('/presets', async (c) => {
  const licenseId = getLicenseId(c);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM ai_presets WHERE license_id IS NULL OR license_id = ? ORDER BY is_builtin DESC, created_at'
  ).bind(licenseId).all();

  const presets = results.map((r) => ({
    ...r,
    variables: JSON.parse(r.variables as string),
  }));

  return c.json({ presets });
});

// POST /ai/presets — ユーザープリセット作成
aiRoutes.post('/presets', async (c) => {
  const licenseId = getLicenseId(c);
  const body = await c.req.json();

  if (!body.name || !body.prompt_template) {
    return c.json({ error: 'name と prompt_template は必須です' }, 400);
  }

  const id = crypto.randomUUID();
  const variables = body.variables || [];

  await c.env.DB.prepare(
    `INSERT INTO ai_presets (id, license_id, name, description, prompt_template, variables, is_builtin, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
  ).bind(id, licenseId, body.name, body.description || null, body.prompt_template, JSON.stringify(variables), Date.now()).run();

  return c.json({ id, created: true }, 201);
});

// DELETE /ai/presets/:id — ユーザープリセット削除（builtinは削除不可）
aiRoutes.delete('/presets/:id', async (c) => {
  const id = c.req.param('id');
  const licenseId = getLicenseId(c);

  const preset = await c.env.DB.prepare(
    'SELECT is_builtin, license_id FROM ai_presets WHERE id = ?'
  ).bind(id).first<{ is_builtin: number; license_id: string | null }>();

  if (!preset) return c.json({ error: 'プリセットが見つかりません' }, 404);
  if (preset.is_builtin) return c.json({ error: '組み込みプリセットは削除できません' }, 403);
  if (preset.license_id !== licenseId) return c.json({ error: 'アクセス権がありません' }, 403);

  await c.env.DB.prepare('DELETE FROM ai_presets WHERE id = ?').bind(id).run();
  return c.json({ deleted: true });
});

// GET /ai/generations — 生成履歴
aiRoutes.get('/generations', async (c) => {
  const licenseId = getLicenseId(c);
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM ai_generations WHERE license_id = ? ORDER BY created_at DESC LIMIT ?'
  ).bind(licenseId, limit).all();

  return c.json({ generations: results });
});

// GET /ai/settings — AI設定取得（APIキーはマスク）
aiRoutes.get('/settings', async (c) => {
  const licenseId = getLicenseId(c);
  const settings = await c.env.DB.prepare(
    'SELECT ai_provider, claude_model, ollama_model, max_tokens, key_source, retention_days, claude_api_key FROM ai_settings WHERE license_id = ?'
  ).bind(licenseId).first();

  if (!settings) {
    return c.json({
      ai_provider: 'claude', claude_model: 'claude-haiku-4-5-20251001',
      ollama_model: 'llama3', max_tokens: 300, key_source: 'own',
      retention_days: 30, has_claude_key: false,
    });
  }

  return c.json({
    ai_provider: settings.ai_provider,
    claude_model: settings.claude_model,
    ollama_model: settings.ollama_model,
    max_tokens: settings.max_tokens,
    key_source: settings.key_source,
    retention_days: settings.retention_days,
    has_claude_key: !!(settings.claude_api_key),
  });
});

// PUT /ai/settings — AI設定更新
aiRoutes.put('/settings', async (c) => {
  const licenseId = getLicenseId(c);
  const body = await c.req.json();

  // バリデーション
  const maxTokens = Number(body.max_tokens ?? 300);
  if (isNaN(maxTokens) || maxTokens < 100 || maxTokens > 500) {
    return c.json({ error: 'max_tokens: 100〜500' }, 400);
  }

  // APIキーが提供された場合は暗号化して保存
  let encryptedKey: string | null = null;
  if (body.claude_api_key && typeof body.claude_api_key === 'string' && body.claude_api_key.trim()) {
    encryptedKey = await encryptField(c.env.ENCRYPTION_KEY, body.claude_api_key.trim());
  }

  // 既存設定があるかチェック
  const existing = await c.env.DB.prepare(
    'SELECT license_id FROM ai_settings WHERE license_id = ?'
  ).bind(licenseId).first();

  if (existing) {
    // APIキーが提供された場合のみ更新
    if (encryptedKey) {
      await c.env.DB.prepare(
        `UPDATE ai_settings SET ai_provider = ?, claude_api_key = ?, claude_model = ?, ollama_model = ?, max_tokens = ?, key_source = ?, updated_at = ? WHERE license_id = ?`
      ).bind(
        body.ai_provider || 'claude', encryptedKey,
        body.claude_model || 'claude-haiku-4-5-20251001',
        body.ollama_model || 'llama3', maxTokens,
        body.key_source || 'own', Date.now(), licenseId,
      ).run();
    } else {
      await c.env.DB.prepare(
        `UPDATE ai_settings SET ai_provider = ?, claude_model = ?, ollama_model = ?, max_tokens = ?, key_source = ?, updated_at = ? WHERE license_id = ?`
      ).bind(
        body.ai_provider || 'claude',
        body.claude_model || 'claude-haiku-4-5-20251001',
        body.ollama_model || 'llama3', maxTokens,
        body.key_source || 'own', Date.now(), licenseId,
      ).run();
    }
  } else {
    await c.env.DB.prepare(
      `INSERT INTO ai_settings (license_id, ai_provider, claude_api_key, claude_model, ollama_model, max_tokens, key_source, retention_days, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 30, ?)`
    ).bind(
      licenseId, body.ai_provider || 'claude', encryptedKey,
      body.claude_model || 'claude-haiku-4-5-20251001',
      body.ollama_model || 'llama3', maxTokens,
      body.key_source || 'own', Date.now(),
    ).run();
  }

  return c.json({ updated: true });
});

// Export cleanup function for cron
export { cleanupOldGenerations };

/**
 * コンテキストタイプに応じたプロンプト構築
 */
function buildContextPrompt(contextType: string, contextData: unknown, userPrompt: string): string {
  const data = contextData as Record<string, unknown>;

  switch (contextType) {
    case 'posting_time':
      return `以下の投稿時間帯別エンゲージメントデータを分析し、最適な投稿時間帯と理由を具体的にアドバイスしてください。

データ:
${JSON.stringify(data, null, 2)}

${userPrompt || '投稿時間の最適化について提案してください。'}`;

    case 'hashtag_suggest':
      return `以下の投稿内容に最適なハッシュタグを5〜10個提案してください。Threadsで使える形式（#タグ）で出力してください。

投稿内容:
${data.content || userPrompt}

${data.hashtag_data ? `参考: 同ジャンルで効果的なハッシュタグデータ:\n${JSON.stringify(data.hashtag_data)}` : ''}`;

    case 'content_strategy':
      return `以下のバズ投稿分析データをもとに、今後のコンテンツ戦略を提案してください。

バズキーワード: ${JSON.stringify(data.keywords || [])}
ハッシュタグ傾向: ${JSON.stringify(data.hashtags || [])}
投稿パターン: ${JSON.stringify(data.patterns || {})}

${userPrompt || '具体的なコンテンツ戦略を3つ提案してください。'}`;

    case 'template_variation':
      return `以下のテンプレートをベースに、トーンや表現を変えた3つのバリエーションを作成してください。各バリエーションは500文字以内で、そのまま投稿できる形式にしてください。

元のテンプレート:
${data.template || userPrompt}

バリエーションを番号付きで出力してください。`;

    default:
      return userPrompt;
  }
}
