/**
 * SKILL.md 本体 + 入力 JSON から、unstable_v2_prompt に渡す完全プロンプトを組み立てる純粋関数。
 */
export function composeSkillPrompt(
  skillName: string,
  skillBodyWithoutFrontmatter: string,
  input: unknown,
): string {
  const inputJson = JSON.stringify(input, null, 2);
  return `[System: スキル「${skillName}」を実行します]

${skillBodyWithoutFrontmatter.trim()}

---

## 実行入力（JSON）
\`\`\`json
${inputJson}
\`\`\`

このスキルの仕様どおりに処理し、**結果は \`\`\`json ... \`\`\` のコードフェンスで返してください**。説明文は最小限に。`;
}

/**
 * Claude からの出力テキストから JSON を抽出。
 * 優先順位:
 *   1. 最初の ```json フェンス
 *   2. 最初の ``` フェンス（言語指定なし）
 *   3. トップレベルの { ... } ブロック（中括弧のネスト追跡）
 *   4. トップレベルの [ ... ] ブロック
 *
 * パース失敗 or 見つからない → null
 */
export function extractJson<T = unknown>(raw: string): T | null {
  if (!raw) return null;

  const fenceJson = raw.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenceJson && fenceJson[1]) {
    const parsed = tryParse<T>(fenceJson[1]);
    if (parsed !== null) return parsed;
  }

  const fenceAny = raw.match(/```\s*([\s\S]*?)\s*```/);
  if (fenceAny && fenceAny[1]) {
    const parsed = tryParse<T>(fenceAny[1]);
    if (parsed !== null) return parsed;
  }

  const objectBlock = extractBalanced(raw, '{', '}');
  if (objectBlock) {
    const parsed = tryParse<T>(objectBlock);
    if (parsed !== null) return parsed;
  }

  const arrayBlock = extractBalanced(raw, '[', ']');
  if (arrayBlock) {
    const parsed = tryParse<T>(arrayBlock);
    if (parsed !== null) return parsed;
  }

  return null;
}

function tryParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

/**
 * 最初の open 文字から対応する close まで（ネスト追跡）を取り出す。
 * 文字列リテラル内の括弧は無視。
 */
function extractBalanced(s: string, open: string, close: string): string | null {
  const start = s.indexOf(open);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * SKILL.md から YAML frontmatter を除去。frontmatter がなければそのまま返す。
 */
export function stripFrontmatter(md: string): string {
  return md.replace(/^---[\s\S]*?\n---\n?/, '');
}
