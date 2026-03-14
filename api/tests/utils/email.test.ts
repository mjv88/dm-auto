const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: mockSendMail,
  })),
}));

jest.mock('../../src/config.js', () => ({
  config: {
    APP_URL: 'https://runner.tcx-hub.com',
    SMTP_HOST: 'smtp.sendgrid.net',
    SMTP_PORT: 587,
    SMTP_USER: 'apikey',
    SMTP_PASS: 'test-key',
    SMTP_FROM: 'noreply@tcx-hub.com',
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

describe('email service', () => {
  beforeEach(() => {
    mockSendMail.mockClear();
  });

  describe('sendVerificationEmail', () => {
    it('sends email with correct to, subject, and link', async () => {
      await sendVerificationEmail('user@example.com', 'verify-token-123');
      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const call = mockSendMail.mock.calls[0][0];
      expect(call.to).toBe('user@example.com');
      expect(call.subject).toContain('Verify your email');
      expect(call.html).toContain('verify-token-123');
      expect(call.html).toContain('https://runner.tcx-hub.com/verify-email?token=verify-token-123');
      expect(call.from).toContain('noreply@tcx-hub.com');
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('sends email with correct to, subject, and link', async () => {
      await sendPasswordResetEmail('user@example.com', 'reset-token-456');
      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const call = mockSendMail.mock.calls[0][0];
      expect(call.to).toBe('user@example.com');
      expect(call.subject).toContain('Reset your password');
      expect(call.html).toContain('reset-token-456');
      expect(call.html).toContain('https://runner.tcx-hub.com/reset-password?token=reset-token-456');
    });
  });
});
