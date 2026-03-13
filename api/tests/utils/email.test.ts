jest.mock('../../src/config.js', () => ({
  config: {
    EMAIL_WORKER_URL: 'https://email.tcx-hub.com',
    EMAIL_WORKER_SECRET: 'test-secret',
    APP_URL: 'https://runner.tcx-hub.com',
  },
}));

jest.mock('../../src/utils/logger.js', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

import { sendVerificationEmail, sendPasswordResetEmail } from '../../src/utils/email.js';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('email service', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true });
  });

  describe('sendVerificationEmail', () => {
    it('sends POST to email worker with correct payload', async () => {
      await sendVerificationEmail('user@example.com', 'verify-token-123');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://email.tcx-hub.com/');
      expect(options.method).toBe('POST');
      expect(options.headers.Authorization).toBe('Bearer test-secret');
      const body = JSON.parse(options.body);
      expect(body.to).toBe('user@example.com');
      expect(body.type).toBe('verification');
      expect(body.html).toContain('verify-token-123');
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('sends POST to email worker with correct payload', async () => {
      await sendPasswordResetEmail('user@example.com', 'reset-token-456');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.to).toBe('user@example.com');
      expect(body.type).toBe('password-reset');
      expect(body.html).toContain('reset-token-456');
    });
  });
});
