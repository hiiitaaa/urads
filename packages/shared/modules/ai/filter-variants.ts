import { checkGuardrails, type GuardrailSettings } from './guardrail.js';
import type { BuzzRewriteVariant, SavedRewriteVariant } from './buzz-rewrite-types.js';

export interface FilterVariantsResult {
  passed: SavedRewriteVariant[];
  failed: SavedRewriteVariant[];
}

/**
 * buzz-rewrite skill が返す variants 各々にガードレールを適用し、
 * 合否で振り分ける。各 variant には guardrail 結果が付与される。
 */
export function filterVariantsByGuardrail(
  variants: BuzzRewriteVariant[],
  originalContent: string,
  settings?: GuardrailSettings,
): FilterVariantsResult {
  const passed: SavedRewriteVariant[] = [];
  const failed: SavedRewriteVariant[] = [];

  for (const v of variants) {
    const guardrail = checkGuardrails(originalContent, v.content, settings);
    const saved: SavedRewriteVariant = { ...v, guardrail };
    if (guardrail.passed) passed.push(saved);
    else failed.push(saved);
  }

  return { passed, failed };
}

/**
 * passed variants の中から採用案を選ぶ。
 *   1. is_default: true を最優先
 *   2. なければ先頭
 */
export function pickDefaultVariant(passed: SavedRewriteVariant[]): SavedRewriteVariant | null {
  if (passed.length === 0) return null;
  const defaulted = passed.find((v) => v.is_default);
  return defaulted ?? passed[0];
}
