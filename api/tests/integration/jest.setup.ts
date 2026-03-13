/**
 * tests/integration/jest.setup.ts
 *
 * Runs before any integration test module is loaded (jest setupFiles).
 * Sets all required environment variables so that config.ts does not
 * call process.exit(1) when it parses the environment on import.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://tcxtest:tcxtest@localhost:5433/tcxtest';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-chars-pad';
process.env.ENTRA_CLIENT_ID = 'test-entra-client-id';
process.env.ENTRA_CLIENT_SECRET = 'test-entra-client-secret';
process.env.JWT_SECRET = 'a'.repeat(64);
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.RATE_LIMIT_MAX = '100';
process.env.RATE_LIMIT_WINDOW = '3600000';
process.env.PORT = '0';
