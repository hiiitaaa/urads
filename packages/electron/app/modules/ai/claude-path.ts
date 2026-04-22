import { existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

/**
 * Claude Code CLI のフルパスを検出。見つからなければ undefined。
 *
 * 優先順位:
 *   1. 環境変数 CLAUDE_CODE_PATH
 *   2. ~/.local/bin/claude, ~/.claude/bin/claude, /usr/local/bin/claude, /usr/bin/claude
 *   3. which claude（最終手段）
 */
export function findClaudeExecutable(): string | undefined {
  if (process.env.CLAUDE_CODE_PATH && existsSync(process.env.CLAUDE_CODE_PATH)) {
    return process.env.CLAUDE_CODE_PATH;
  }

  const home = process.env.HOME || '';
  const candidates = [
    join(home, '.local', 'bin', 'claude'),
    join(home, '.claude', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/usr/bin/claude',
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  try {
    const result = execSync('which claude', { encoding: 'utf-8', timeout: 3000 }).trim();
    if (result && existsSync(result)) return result;
  } catch { /* not found */ }

  return undefined;
}
