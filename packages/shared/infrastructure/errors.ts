export type ErrorCode =
  | 'LICENSE_INVALID'
  | 'LICENSE_EXPIRED'
  | 'ACCOUNT_LIMIT'
  | 'TOKEN_EXPIRED'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR';

export interface AppError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}
