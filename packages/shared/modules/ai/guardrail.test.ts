import { describe, it, expect } from 'vitest';
import { checkGuardrails } from './guardrail.js';

describe('checkGuardrails', () => {
  const ORIG = '今日のカードが見せてくれたのは、片思いの相手との距離が縮まるサインです。';

  it('same string: ngram run detected', () => {
    const r = checkGuardrails(ORIG, ORIG);
    expect(r.ngramHits).toBeGreaterThanOrEqual(1); // 全長一致 = 1 連続 run
    // tokenOverlap も1.0なので TOKEN_OVERLAP でも失格する
    expect(r.failures.map((f) => f.code)).toContain('TOKEN_OVERLAP');
    expect(r.passed).toBe(false);
  });

  it('same string: tokenOverlap = 1.0', () => {
    const r = checkGuardrails(ORIG, ORIG);
    expect(r.tokenOverlap).toBeCloseTo(1.0, 3);
  });

  it('unrelated text: passed', () => {
    const r = checkGuardrails(ORIG, '今夜はラーメン食べて寝る予定。');
    expect(r.passed).toBe(true);
    expect(r.ngramHits).toBe(0);
  });

  it('structural reuse with vocabulary swap: passes threshold', () => {
    // 偶然「てくれたのは、」が共有されるので ngramHits=1 になりうるが、閾値 3 未満で合格
    const r = checkGuardrails(
      ORIG,
      '星が教えてくれたのは、恋の向こうにある未来への光でした。',
    );
    expect(r.ngramHits).toBeLessThan(3);
    expect(r.passed).toBe(true);
  });

  it('single 10-char verbatim run: 1 run counted (not 6)', () => {
    const orig = 'こんにちは、今日もよろしくお願いします。';
    // 10字連続コピー「今日もよろしくお願い」= 1 run
    const rew = '全然違う話題だけど今日もよろしくお願いするね。';
    const r = checkGuardrails(orig, rew);
    expect(r.ngramHits).toBe(1);
  });

  it('whitespace-insertion evasion is fully blocked', () => {
    const orig = 'カードが見せてくれたのは愛の光です';
    const rew = ' カード が 見せて くれた の は 愛 の 光 です '; // 空白挿入で回避試行
    const r = checkGuardrails(orig, rew);
    // 比較用正規化で全空白除去 → 原文とほぼ同じ文字列 → 高い tokenOverlap + ngram run
    expect(r.tokenOverlap).toBeGreaterThan(0.9);
    expect(r.ngramHits).toBeGreaterThanOrEqual(1);
    expect(r.passed).toBe(false);
  });

  it('banned phrase hit (case-insensitive)', () => {
    const r = checkGuardrails(ORIG, 'Hello BAD_WORD everyone', {
      bannedPhrases: ['bad_word'],
    });
    expect(r.bannedPhraseHits).toEqual(['bad_word']);
    expect(r.failures.map((f) => f.code)).toContain('BANNED_PHRASE');
  });

  it('banned with empty string: skipped', () => {
    const r = checkGuardrails(ORIG, 'any text', { bannedPhrases: ['', 'nonexistent'] });
    expect(r.bannedPhraseHits).toEqual([]);
  });

  it('501 chars: TOO_LONG', () => {
    const rew = 'a'.repeat(501);
    const r = checkGuardrails('xxx', rew);
    expect(r.length).toBe(501);
    expect(r.failures.map((f) => f.code)).toContain('TOO_LONG');
  });

  it('500 chars exactly: passes length check', () => {
    const rew = 'あ'.repeat(500);
    const r = checkGuardrails('xxx', rew);
    expect(r.length).toBe(500);
    expect(r.failures.map((f) => f.code)).not.toContain('TOO_LONG');
  });

  it('rewritten < 5 chars: ngramHits=0', () => {
    const r = checkGuardrails(ORIG, 'short');
    expect(r.ngramHits).toBe(0);
  });

  it('threshold override: same string passes when maxNgramHits=10 and maxTokenOverlap=1.01', () => {
    const r = checkGuardrails(ORIG, ORIG, { maxNgramHits: 10, maxTokenOverlap: 1.01 });
    expect(r.failures.map((f) => f.code)).not.toContain('NGRAM_OVERLAP');
    expect(r.failures.map((f) => f.code)).not.toContain('TOKEN_OVERLAP');
    expect(r.passed).toBe(true);
    // メトリクス値は元のまま
    expect(r.tokenOverlap).toBeCloseTo(1.0, 3);
  });

  it('multiple simultaneous violations', () => {
    // 3つ以上の run を作るため、異なる部分を複数コピー
    const orig = 'あいうえお、かきくけこ、さしすせそ、たちつてと';
    const banned = ['禁止'];
    // リライトに 3つの 5字連続一致を別々の場所に配置 + 禁止フレーズ + 501字超
    const rew =
      'あいうえおXXXかきくけこYYYさしすせそZZZ 禁止ワード' + 'x'.repeat(500);
    const r = checkGuardrails(orig, rew, { bannedPhrases: banned });
    const codes = r.failures.map((f) => f.code);
    expect(codes).toContain('NGRAM_OVERLAP');
    expect(codes).toContain('BANNED_PHRASE');
    expect(codes).toContain('TOO_LONG');
    expect(r.failures.length).toBeGreaterThanOrEqual(3);
    // 注: TOKEN_OVERLAP は rew が 500字のノイズで覆われるため低く、ここでは発火しない
    // （実コンテンツの丸パクリで高くなるケースは other tests で検証済）
  });
});
