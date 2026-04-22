import { unstable_v2_prompt } from '@anthropic-ai/claude-agent-sdk';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  type AiExecutor,
  type AiResult,
  type AiErrorCode,
  type RunSkillOptions,
  AI_ERROR_RETRYABLE,
  DEFAULT_RUN_SKILL_TIMEOUT_MS,
  composeSkillPrompt,
  extractJson,
  stripFrontmatter,
} from '@urads/shared';
import { findClaudeExecutable } from './claude-path';
import { getApiBase } from '../config/api-base';
import { createLogger } from '../../unified-logger';

const log = createLogger('ai');

function getSkillsDir(): string {
  const devPath = join(__dirname, '../../resources/skills');
  if (existsSync(devPath)) return devPath;
  return join(process.resourcesPath || '', 'skills');
}

function err(code: AiErrorCode, message: string): AiResult<never> {
  return {
    ok: false,
    error: { code, message, retryable: AI_ERROR_RETRYABLE[code] },
  };
}

export class LocalClaudeCodeExecutor implements AiExecutor {
  private skillCache = new Map<string, string>();

  private loadSkillBody(skillName: string): string | null {
    const cached = this.skillCache.get(skillName);
    if (cached !== undefined) return cached;

    const file = join(getSkillsDir(), skillName, 'SKILL.md');
    if (!existsSync(file)) return null;

    // frontmatter 除去 + 環境依存書き換え（apiBase 置換は executor の責務）
    const raw = readFileSync(file, 'utf-8');
    const body = stripFrontmatter(raw).replace(/http:\/\/localhost:8787/g, getApiBase());
    this.skillCache.set(skillName, body);
    return body;
  }

  async runSkill<T = unknown>(
    skillName: string,
    input: unknown,
    options?: RunSkillOptions,
  ): Promise<AiResult<T>> {
    const timeout = options?.timeout ?? DEFAULT_RUN_SKILL_TIMEOUT_MS;
    const signal = options?.signal;

    if (signal?.aborted) return err('CANCELLED', 'abort signal already aborted');

    const claudePath = findClaudeExecutable();
    if (!claudePath) {
      return err('CLI_NOT_FOUND', 'Claude Code CLI が見つかりません。インストールを確認してください');
    }

    const body = this.loadSkillBody(skillName);
    if (!body) {
      return err('SKILL_NOT_FOUND', `SKILL.md が見つかりません: ${skillName}`);
    }

    const prompt = composeSkillPrompt(skillName, body, input);

    log.info(`runSkill 開始: ${skillName} (timeout=${timeout}ms)`);
    const startedAt = Date.now();

    // Promise.race で timeout + abort を扱う。SDK 側は subprocess を完全停止できない可能性あり（結果は破棄）
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let abortHandler: (() => void) | null = null;

    try {
      const result = await Promise.race<{ kind: 'done' | 'timeout' | 'abort'; raw?: string; error?: unknown }>([
        unstable_v2_prompt(prompt, {
          model: 'claude-sonnet-4-6',
          pathToClaudeCodeExecutable: claudePath,
        }).then((r) => {
          if (r.subtype === 'success' && typeof r.result === 'string') {
            return { kind: 'done' as const, raw: r.result };
          }
          return { kind: 'done' as const, error: r };
        }, (e) => ({ kind: 'done' as const, error: e })),
        new Promise<{ kind: 'timeout' }>((resolve) => {
          timeoutHandle = setTimeout(() => resolve({ kind: 'timeout' }), timeout);
        }),
        new Promise<{ kind: 'abort' }>((resolve) => {
          if (!signal) return;
          abortHandler = () => resolve({ kind: 'abort' });
          signal.addEventListener('abort', abortHandler, { once: true });
        }),
      ]);

      if (result.kind === 'timeout') {
        log.warn(`runSkill timeout: ${skillName} after ${timeout}ms`);
        return err('TIMEOUT', `タイムアウト（${timeout}ms）`);
      }
      if (result.kind === 'abort') {
        log.info(`runSkill abort: ${skillName}`);
        return err('CANCELLED', 'ユーザー中断');
      }
      if (result.error) {
        const message = result.error instanceof Error ? result.error.message : JSON.stringify(result.error);
        log.error(`runSkill EXEC_ERROR: ${message}`);
        return err('EXEC_ERROR', message);
      }
      if (!result.raw) {
        return err('EXEC_ERROR', '空の出力');
      }

      const json = extractJson<T>(result.raw);
      if (json === null) {
        log.warn(`runSkill INVALID_OUTPUT: JSON not found in output (head=${result.raw.slice(0, 200)})`);
        return err('INVALID_OUTPUT', '出力から JSON を抽出できませんでした');
      }

      log.info(`runSkill 成功: ${skillName} (${Date.now() - startedAt}ms)`);
      return { ok: true, data: json };
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (abortHandler && signal) signal.removeEventListener('abort', abortHandler);
    }
  }
}
