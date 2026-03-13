import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  changePasswordSchema,
} from '../../src/utils/validate.js';

describe('auth validation schemas', () => {
  describe('registerSchema', () => {
    it('accepts valid email and password', () => {
      const result = registerSchema.safeParse({ email: 'user@example.com', password: 'Password1' });
      expect(result.success).toBe(true);
    });
    it('rejects password without uppercase', () => {
      const result = registerSchema.safeParse({ email: 'user@example.com', password: 'password1' });
      expect(result.success).toBe(false);
    });
    it('rejects password without number', () => {
      const result = registerSchema.safeParse({ email: 'user@example.com', password: 'Password' });
      expect(result.success).toBe(false);
    });
    it('rejects password under 8 chars', () => {
      const result = registerSchema.safeParse({ email: 'user@example.com', password: 'Pass1' });
      expect(result.success).toBe(false);
    });
    it('rejects invalid email', () => {
      const result = registerSchema.safeParse({ email: 'not-an-email', password: 'Password1' });
      expect(result.success).toBe(false);
    });
  });
  describe('loginSchema', () => {
    it('accepts valid credentials', () => {
      expect(loginSchema.safeParse({ email: 'user@example.com', password: 'anything' }).success).toBe(true);
    });
  });
  describe('forgotPasswordSchema', () => {
    it('accepts valid email', () => {
      expect(forgotPasswordSchema.safeParse({ email: 'user@example.com' }).success).toBe(true);
    });
  });
  describe('resetPasswordSchema', () => {
    it('accepts valid token and password', () => {
      expect(resetPasswordSchema.safeParse({ token: 'abc123', password: 'NewPassword1' }).success).toBe(true);
    });
  });
  describe('verifyEmailSchema', () => {
    it('accepts valid token', () => {
      expect(verifyEmailSchema.safeParse({ token: 'abc123' }).success).toBe(true);
    });
  });
  describe('changePasswordSchema', () => {
    it('accepts valid old and new password', () => {
      expect(changePasswordSchema.safeParse({ oldPassword: 'OldPassword1', newPassword: 'NewPassword2' }).success).toBe(true);
    });
  });
});
