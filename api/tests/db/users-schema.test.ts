import { users } from '../../src/db/schema.js';

describe('users schema', () => {
  it('should export users table with required columns', () => {
    expect(users).toBeDefined();
    const columns = Object.keys(users);
    expect(columns).toContain('id');
    expect(columns).toContain('email');
    expect(columns).toContain('passwordHash');
    expect(columns).toContain('emailVerified');
    expect(columns).toContain('verifyToken');
    expect(columns).toContain('verifyTokenExpiresAt');
    expect(columns).toContain('resetToken');
    expect(columns).toContain('resetTokenExpiresAt');
    expect(columns).toContain('failedLoginAttempts');
    expect(columns).toContain('lockedUntil');
    expect(columns).toContain('createdAt');
    expect(columns).toContain('updatedAt');
  });
});
