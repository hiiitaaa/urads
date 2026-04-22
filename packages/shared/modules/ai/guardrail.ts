/**
 * 決定的ガードレール（設計書 §5.5）
 *
 * AI 自己評価に頼らず、機械判定で著作権リスクと Threads 規約違反を検知する。
 * 純粋関数、Electron / Worker / Web で共通利用。
 */

export interface GuardrailSettings {
  maxNgramHits?: number; // default 3 (runs)
  maxTokenOverlap?: number; // default 0.6
  bannedPhrases?: string[]; // default [] (空文字はスキップ)
  maxLength?: number; // default 500
}

export type GuardrailFailureCode =
  | 'NGRAM_OVERLAP'
  | 'TOKEN_OVERLAP'
  | 'BANNED_PHRASE'
  | 'TOO_LONG';

export interface GuardrailFailure {
  code: GuardrailFailureCode;
  detail: string;
}

export interface GuardrailResult {
  passed: boolean;
  ngramHits: number; // 連続一致 run 数
  tokenOverlap: number; // 0..1
  bannedPhraseHits: string[];
  length: number;
  failures: GuardrailFailure[];
}

const NGRAM_SIZE = 5;

const DEFAULTS = {
  maxNgramHits: 3,
  maxTokenOverlap: 0.6,
  bannedPhrases: [] as string[],
  maxLength: 500,
};

/**
 * 軽量正規化: trim + 連続空白を 1 スペースに圧縮。長さ判定・禁止フレーズ検出で使う。
 */
function normalizeLight(s: string): string {
  return s.trim().replace(/[\s\u3000]+/g, ' ');
}

/**
 * 比較用正規化: 全ての空白・改行を除去。
 * 「空白挿入だけで類似度を下げる」という自明な回避を塞ぐため、ngram / Jaccard 計算では
 * 空白由来のバイグラムを作らない。日本語は元々空白なし、英文は単語境界が消えるが
 * 表層類似判定には支障なし（連続 5-gram が一致すれば検出できる）。
 */
function normalizeForComparison(s: string): string {
  return s.replace(/[\s\u3000]+/g, '');
}

function ngrams(s: string, n: number): string[] {
  if (s.length < n) return [];
  const out: string[] = [];
  for (let i = 0; i <= s.length - n; i++) {
    out.push(s.slice(i, i + n));
  }
  return out;
}

/**
 * リライト側で原文と n 字以上連続一致する「区間（run）」をカウント。
 * 重なり合う複数の n-gram が連続で一致した場合は 1 run にまとめる。
 */
function countNgramRuns(original: string, rewritten: string, n: number): number {
  if (original.length < n || rewritten.length < n) return 0;
  const originalSet = new Set(ngrams(original, n));
  if (originalSet.size === 0) return 0;

  let runs = 0;
  let inRun = false;
  const rewrittenNgrams = ngrams(rewritten, n);
  for (const g of rewrittenNgrams) {
    if (originalSet.has(g)) {
      if (!inRun) {
        runs++;
        inRun = true;
      }
    } else {
      inRun = false;
    }
  }
  return runs;
}

/**
 * 文字バイグラム Jaccard 係数。分母 0 は 0 扱い。
 */
function jaccardBigram(a: string, b: string): number {
  const A = new Set(ngrams(a, 2));
  const B = new Set(ngrams(b, 2));
  if (A.size === 0 && B.size === 0) return 0;

  let inter = 0;
  for (const g of A) {
    if (B.has(g)) inter++;
  }
  const union = A.size + B.size - inter;
  if (union === 0) return 0;
  return inter / union;
}

/**
 * 禁止フレーズ判定（部分一致、ケース非依存、空文字はスキップ）。
 */
function detectBannedPhrases(text: string, banned: string[]): string[] {
  if (banned.length === 0) return [];
  const hay = text.toLowerCase();
  const hits: string[] = [];
  for (const raw of banned) {
    if (!raw) continue;
    const needle = raw.toLowerCase();
    if (hay.includes(needle)) hits.push(raw);
  }
  return hits;
}

export function checkGuardrails(
  original: string,
  rewritten: string,
  settings?: GuardrailSettings,
): GuardrailResult {
  const cfg = {
    maxNgramHits: settings?.maxNgramHits ?? DEFAULTS.maxNgramHits,
    maxTokenOverlap: settings?.maxTokenOverlap ?? DEFAULTS.maxTokenOverlap,
    bannedPhrases: settings?.bannedPhrases ?? DEFAULTS.bannedPhrases,
    maxLength: settings?.maxLength ?? DEFAULTS.maxLength,
  };

  const origCompare = normalizeForComparison(original);
  const rewCompare = normalizeForComparison(rewritten);
  const rewLight = normalizeLight(rewritten);

  const ngramHits = countNgramRuns(origCompare, rewCompare, NGRAM_SIZE);
  const tokenOverlap = jaccardBigram(origCompare, rewCompare);
  const bannedPhraseHits = detectBannedPhrases(rewLight, cfg.bannedPhrases);
  const length = rewLight.length;

  const failures: GuardrailFailure[] = [];
  if (ngramHits >= cfg.maxNgramHits) {
    failures.push({
      code: 'NGRAM_OVERLAP',
      detail: `5字以上連続一致が ${ngramHits} 箇所（閾値: ${cfg.maxNgramHits}）`,
    });
  }
  if (tokenOverlap > cfg.maxTokenOverlap) {
    failures.push({
      code: 'TOKEN_OVERLAP',
      detail: `トークン一致率 ${(tokenOverlap * 100).toFixed(1)}%（閾値: ${(cfg.maxTokenOverlap * 100).toFixed(0)}%）`,
    });
  }
  if (bannedPhraseHits.length > 0) {
    failures.push({
      code: 'BANNED_PHRASE',
      detail: `禁止フレーズ検出: ${bannedPhraseHits.join(', ')}`,
    });
  }
  if (length > cfg.maxLength) {
    failures.push({
      code: 'TOO_LONG',
      detail: `${length} 字（上限 ${cfg.maxLength}）`,
    });
  }

  return {
    passed: failures.length === 0,
    ngramHits,
    tokenOverlap,
    bannedPhraseHits,
    length,
    failures,
  };
}
