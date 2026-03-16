// Error codes for the Provisioning Service
export type ErrorCode =
  | 'PBX_NOT_AUTHORIZED'
  | 'PBX_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'TOKEN_EXPIRED'
  | 'XAPI_AUTH_FAILED'
  | 'OFFLINE'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR'
  | 'TENANT_NOT_REGISTERED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN';

export class ProvisioningError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;

  constructor(code: ErrorCode, statusCode: number, message?: string) {
    super(message ?? code);
    this.name = 'ProvisioningError';
    this.code = code;
    this.statusCode = statusCode;
  }
}
