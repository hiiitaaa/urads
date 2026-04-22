export type AiErrorCode =
  | 'CLI_NOT_FOUND'
  | 'SKILL_NOT_FOUND'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'INVALID_OUTPUT'
  | 'EXEC_ERROR';

export interface AiError {
  code: AiErrorCode;
  message: string;
  retryable: boolean;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCost?: number;
}

export interface AiResult<T> {
  ok: boolean;
  data?: T;
  error?: AiError;
  usage?: AiUsage;
}

export interface RunSkillOptions {
  timeout?: number; // ms, default 90000
  signal?: AbortSignal;
}

export interface AiExecutor {
  runSkill<T = unknown>(
    skillName: string,
    input: unknown,
    options?: RunSkillOptions,
  ): Promise<AiResult<T>>;
}

export const AI_ERROR_RETRYABLE: Record<AiErrorCode, boolean> = {
  CLI_NOT_FOUND: false,
  SKILL_NOT_FOUND: false,
  TIMEOUT: true,
  CANCELLED: false,
  INVALID_OUTPUT: true,
  EXEC_ERROR: true,
};

export const DEFAULT_RUN_SKILL_TIMEOUT_MS = 90_000;
