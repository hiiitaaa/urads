import { describe, it, expect } from 'vitest';
import { filterVariantsByGuardrail, pickDefaultVariant } from './filter-variants.js';
import type { BuzzRewriteVariant } from './buzz-rewrite-types.js';

const ORIG = '今日のカードが見せてくれたのは、片思いの相手との距離が縮まるサインです。';

const UNIQUE_VARIANT: BuzzRewriteVariant = {
  content: '星が教えてくれた今日のメッセージは、恋の芽を育てる勇気です。',
  reasoning: 'structural reuse',
};

const COPY_VARIANT: BuzzRewriteVariant = {
  content: ORIG, // 丸パクリ
  reasoning: 'verbatim',
};

const TOO_LONG_VARIANT: BuzzRewriteVariant = {
  content: 'あ'.repeat(501),
  reasoning: 'padding',
};

describe('filterVariantsByGuardrail', () => {
  it('passes clean variants', () => {
    const r = filterVariantsByGuardrail([UNIQUE_VARIANT], ORIG);
    expect(r.passed).toHaveLength(1);
    expect(r.failed).toHaveLength(0);
    expect(r.passed[0].guardrail.passed).toBe(true);
  });

  it('fails copy variants', () => {
    const r = filterVariantsByGuardrail([COPY_VARIANT], ORIG);
    expect(r.passed).toHaveLength(0);
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0].guardrail.passed).toBe(false);
  });

  it('fails too-long variants', () => {
    const r = filterVariantsByGuardrail([TOO_LONG_VARIANT], ORIG);
    expect(r.passed).toHaveLength(0);
    expect(r.failed[0].guardrail.failures.map((f) => f.code)).toContain('TOO_LONG');
  });

  it('handles mixed batch', () => {
    const r = filterVariantsByGuardrail(
      [UNIQUE_VARIANT, COPY_VARIANT, TOO_LONG_VARIANT],
      ORIG,
    );
    expect(r.passed).toHaveLength(1);
    expect(r.failed).toHaveLength(2);
  });

  it('preserves variant fields (content, reasoning, is_default)', () => {
    const v: BuzzRewriteVariant = {
      content: UNIQUE_VARIANT.content,
      reasoning: 'keep me',
      is_default: true,
      self_eval: { tone_match: 'high' },
    };
    const r = filterVariantsByGuardrail([v], ORIG);
    expect(r.passed[0].reasoning).toBe('keep me');
    expect(r.passed[0].is_default).toBe(true);
    expect(r.passed[0].self_eval?.tone_match).toBe('high');
  });

  it('empty input', () => {
    const r = filterVariantsByGuardrail([], ORIG);
    expect(r.passed).toHaveLength(0);
    expect(r.failed).toHaveLength(0);
  });

  it('respects custom settings (loosened threshold)', () => {
    const r = filterVariantsByGuardrail(
      [COPY_VARIANT],
      ORIG,
      { maxNgramHits: 100, maxTokenOverlap: 1.01, maxLength: 10000 },
    );
    expect(r.passed).toHaveLength(1);
  });
});

describe('pickDefaultVariant', () => {
  it('returns null for empty list', () => {
    expect(pickDefaultVariant([])).toBeNull();
  });

  it('prefers is_default=true', () => {
    const passed = [
      { content: 'a', reasoning: '', guardrail: {} as any },
      { content: 'b', reasoning: '', is_default: true, guardrail: {} as any },
      { content: 'c', reasoning: '', guardrail: {} as any },
    ];
    expect(pickDefaultVariant(passed as any)?.content).toBe('b');
  });

  it('falls back to first when no is_default', () => {
    const passed = [
      { content: 'a', reasoning: '', guardrail: {} as any },
      { content: 'b', reasoning: '', guardrail: {} as any },
    ];
    expect(pickDefaultVariant(passed as any)?.content).toBe('a');
  });
});
