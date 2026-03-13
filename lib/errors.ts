/** All error codes defined in §13 of the Runner App Spec. */
export type ErrorCode =
  | 'NOT_A_RUNNER'
  | 'RUNNER_NOT_CONFIGURED'
  | 'PBX_NOT_AUTHORIZED'
  | 'PBX_UNAVAILABLE'
  | 'DEPT_NOT_ALLOWED'
  | 'SAME_DEPT'
  | 'RATE_LIMITED'
  | 'TOKEN_EXPIRED'
  | 'XAPI_AUTH_FAILED'
  | 'OFFLINE'
  | 'UNKNOWN';

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  NOT_A_RUNNER: "Your account isn't set up as a Runner. Contact IT.",
  RUNNER_NOT_CONFIGURED: 'Your account needs setup. Contact your administrator.',
  PBX_NOT_AUTHORIZED: "This link doesn't match your account.",
  PBX_UNAVAILABLE: "Can't reach your phone system right now. Try again.",
  DEPT_NOT_ALLOWED: 'Department not allowed.',
  SAME_DEPT: "You're already in this department.",
  RATE_LIMITED: 'Too many switches. Try again in an hour.',
  TOKEN_EXPIRED: 'Session expired. Refreshing\u2026',
  XAPI_AUTH_FAILED: 'Authentication error. Contact admin.',
  OFFLINE: 'No internet connection.',
  UNKNOWN: 'An unexpected error occurred.',
};

/** Error codes that make sense to retry (transient failures). */
const RETRYABLE_CODES = new Set<ErrorCode>([
  'PBX_UNAVAILABLE',
  'RATE_LIMITED',
  'OFFLINE',
]);

export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message?: string) {
    super(message ?? ERROR_MESSAGES[code]);
    this.code = code;
    this.name = 'AppError';
  }

  /** Build an AppError from a raw API error code string. */
  static fromCode(rawCode: string): AppError {
    const code = (rawCode in ERROR_MESSAGES ? rawCode : 'UNKNOWN') as ErrorCode;
    return new AppError(code);
  }

  isRetryable(): boolean {
    return RETRYABLE_CODES.has(this.code);
  }
}

/** Standalone helper — useful when you only have the code string. */
export function isRetryable(code: string): boolean {
  return RETRYABLE_CODES.has(code as ErrorCode);
}
