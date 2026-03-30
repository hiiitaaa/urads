/**
 * リプライルールエンジン
 * キーワードマッチ or ランダムで返信テキストを決定
 */

interface KeywordMatchConfig {
  triggers: string[];
  response: string;
}

interface RandomConfig {
  responses: string[];
}

type RuleConfig = KeywordMatchConfig | RandomConfig;

interface Rule {
  id: string;
  type: 'keyword_match' | 'random';
  config: RuleConfig;
  max_replies: number;
  reply_count: number;
  reply_once_per_user: number;
  cooldown_seconds: number;
}

/**
 * ルールを評価して返信テキストを返す（null = マッチしない）
 */
export function evaluateRule(rule: Rule, triggerText: string): string | null {
  // 上限チェック
  if (rule.reply_count >= rule.max_replies) return null;

  if (rule.type === 'keyword_match') {
    const config = rule.config as KeywordMatchConfig;
    const normalized = triggerText.toLowerCase().trim();
    const matched = config.triggers.some(
      (t) => normalized.includes(t.toLowerCase()),
    );
    return matched ? config.response : null;
  }

  if (rule.type === 'random') {
    const config = rule.config as RandomConfig;
    if (config.responses.length === 0) return null;
    const idx = Math.floor(Math.random() * config.responses.length);
    return config.responses[idx];
  }

  return null;
}

/**
 * 複数ルールからマッチする最初のルールを見つけて返信テキストを返す
 */
export function findMatchingRule(
  rules: Rule[],
  triggerText: string,
): { rule: Rule; response: string } | null {
  for (const rule of rules) {
    const response = evaluateRule(rule, triggerText);
    if (response !== null) {
      return { rule, response };
    }
  }
  return null;
}
