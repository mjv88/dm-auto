// Error codes aligned with §13 Error States Catalogue
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
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR'
  // Auth / multi-tenant codes
  | 'TENANT_NOT_REGISTERED'
  | 'NOT_IN_RUNNERS_GROUP'
  | 'RUNNER_NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN';

export class RunnerError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;

  constructor(code: ErrorCode, statusCode: number, message?: string) {
    super(message ?? code);
    this.name = 'RunnerError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

// TODO: Add error serialiser for Fastify error handler
