/**
 * テキスト分析: ハッシュタグ抽出 + キーワード抽出
 */

/**
 * ハッシュタグを抽出
 */
export function extractHashtags(content: string): string[] {
  const matches = content.match(/#[^\s#、。！？!?,.]+/g);
  if (!matches) return [];
  return matches.map((m) => m.toLowerCase());
}

// 日本語ストップワード（助詞・助動詞・接続詞・一般的すぎる語）
const STOP_WORDS = new Set([
  'の', 'に', 'は', 'を', 'た', 'が', 'で', 'て', 'と', 'し', 'れ', 'さ',
  'ある', 'いる', 'も', 'する', 'から', 'な', 'こと', 'として', 'い', 'や',
  'れる', 'など', 'なっ', 'ない', 'この', 'ため', 'その', 'あっ', 'よう',
  'また', 'もの', 'という', 'あり', 'まで', 'られ', 'なる', 'へ', 'か',
  'だ', 'これ', 'によって', 'により', 'おり', 'より', 'による', 'ず',
  'なり', 'られる', 'において', 'ば', 'なかっ', 'なく', 'しかし', 'について',
  'せ', 'だっ', 'そう', 'けど', 'って', 'じゃ', 'です', 'ます', 'でも',
  'それ', 'あの', 'この', 'どの', 'その', 'ここ', 'そこ', 'どこ',
  'www', 'http', 'https', 'com', 'jp', 'the', 'and', 'for', 'that', 'this',
]);

/**
 * 日本語テキストからキーワードを簡易抽出
 * 助詞・空白で分割し、2文字以上の意味のある語を返す
 */
export function extractKeywords(content: string): string[] {
  // ハッシュタグ・URL・メンションを除去
  const cleaned = content
    .replace(/#[^\s]+/g, '')
    .replace(/https?:\/\/[^\s]+/g, '')
    .replace(/@[^\s]+/g, '')
    .replace(/\n/g, ' ');

  // 助詞・句読点・記号で分割
  const parts = cleaned.split(/[、。！？!?.,\s\n\r\t()（）「」『』【】\[\]{}""''・：；:;～〜…]+/);

  const words: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length < 2) continue;
    if (STOP_WORDS.has(trimmed)) continue;
    if (/^\d+$/.test(trimmed)) continue;
    words.push(trimmed);
  }

  return words;
}

/**
 * 頻度カウント（上位N件）
 */
export function countFrequency(items: string[], topN: number = 30): Array<{ word: string; count: number }> {
  const freq: Record<string, number> = {};
  for (const item of items) {
    freq[item] = (freq[item] || 0) + 1;
  }
  return Object.entries(freq)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

/**
 * ハッシュタグ × エンゲージメント相関分析
 */
export async function analyzeHashtags(
  db: D1Database,
  benchmarkId: string,
): Promise<Array<{ hashtag: string; count: number; avgLikes: number; avgReplies: number; avgScore: number }>> {
  const { results } = await db.prepare(
    'SELECT content, likes, replies, reposts, quotes FROM scraped_posts WHERE benchmark_id = ? AND content IS NOT NULL'
  ).bind(benchmarkId).all();

  const hashtagStats: Record<string, { count: number; totalLikes: number; totalReplies: number; totalScore: number }> = {};

  for (const row of results) {
    const content = row.content as string;
    const likes = (row.likes as number) || 0;
    const replies = (row.replies as number) || 0;
    const reposts = (row.reposts as number) || 0;
    const quotes = (row.quotes as number) || 0;
    const score = likes + replies * 5 + reposts * 4 + quotes * 3;

    const hashtags = extractHashtags(content);
    for (const tag of hashtags) {
      if (!hashtagStats[tag]) hashtagStats[tag] = { count: 0, totalLikes: 0, totalReplies: 0, totalScore: 0 };
      hashtagStats[tag].count += 1;
      hashtagStats[tag].totalLikes += likes;
      hashtagStats[tag].totalReplies += replies;
      hashtagStats[tag].totalScore += score;
    }
  }

  return Object.entries(hashtagStats)
    .map(([hashtag, stats]) => ({
      hashtag,
      count: stats.count,
      avgLikes: Math.round(stats.totalLikes / stats.count),
      avgReplies: Math.round(stats.totalReplies / stats.count),
      avgScore: Math.round(stats.totalScore / stats.count),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);
}

/**
 * バズ投稿のキーワード分析
 */
export async function analyzeBuzzKeywords(
  db: D1Database,
  benchmarkId: string,
): Promise<Array<{ word: string; count: number; samplePost: string }>> {
  const { results } = await db.prepare(
    'SELECT content FROM scraped_posts WHERE benchmark_id = ? AND is_buzz = 1 AND content IS NOT NULL'
  ).bind(benchmarkId).all();

  const allKeywords: string[] = [];
  const wordSamples: Record<string, string> = {};

  for (const row of results) {
    const content = row.content as string;
    const keywords = extractKeywords(content);
    for (const kw of keywords) {
      allKeywords.push(kw);
      if (!wordSamples[kw]) wordSamples[kw] = content.slice(0, 100);
    }
  }

  const freq = countFrequency(allKeywords, 30);
  return freq.map((f) => ({
    ...f,
    samplePost: wordSamples[f.word] || '',
  }));
}
