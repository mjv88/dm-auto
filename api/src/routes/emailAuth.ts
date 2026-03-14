/**
 * src/routes/emailAuth.ts
 *
 * Email/password authentication routes:
 *   POST /auth/register          — create account, send verification email
 *   POST /auth/login             — validate credentials, issue session token
 *   POST /auth/forgot-password   — send password-reset email (always 200)
 *   POST /auth/reset-password    — consume reset token, set new password
 *   POST /auth/verify-email      — consume verify token
 *   POST /auth/resend-verification — (authenticated) resend verify email
 *   PATCH /auth/change-password  — (authenticated) change password
 */

import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { users, tenants, runners } from '../db/schema.js';
import { config } from '../config.js';
import { createSessionToken } from '../middleware/session.js';
import { authenticate } from '../middleware/authenticate.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  changePasswordSchema,
} from '../utils/validate.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/email.js';

// Pre-computed dummy hash so timing is consistent for non-existent users
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

const LOCKOUT_THRESHOLD = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function emailAuthRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /auth/register ─────────────────────────────────────────────────────
  fastify.post('/auth/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Invalid input',
      });
    }
    const { email, password, company } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    const db = getDb();

    // Check if user already exists
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existing.length > 0) {
      // Run dummy hash to match timing of a real registration
      await bcrypt.hash(password, config.BCRYPT_ROUNDS);
      return reply.send({ message: 'Account created. Check your email to verify.' });
    }

    const passwordHash = await bcrypt.hash(password, config.BCRYPT_ROUNDS);
    const verifyToken = generateToken();
    const verifyTokenExpiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);

    // If company (tenantId) provided, look up and verify it's active
    let tenantId: string | undefined;
    if (company) {
      const tenantRows = await db
        .select({ id: tenants.id, isActive: tenants.isActive })
        .from(tenants)
        .where(eq(tenants.id, company))
        .limit(1);
      const tenant = tenantRows[0];
      if (tenant?.isActive) {
        tenantId = tenant.id;
      }
    }

    const inserted = await db.insert(users).values({
      email: normalizedEmail,
      passwordHash,
      verifyToken,
      verifyTokenExpiresAt,
      ...(tenantId ? { tenantId } : {}),
    }).returning({ id: users.id });

    // Auto-link runners with matching email + tenant
    if (tenantId && inserted[0]) {
      const userId = inserted[0].id;
      await db
        .update(runners)
        .set({ userId })
        .where(
          and(
            eq(runners.entraEmail, normalizedEmail),
            eq(runners.tenantId, tenantId),
          ),
        );
    }

    // Fire-and-forget email send
    void sendVerificationEmail(normalizedEmail, verifyToken);

    return reply.send({ message: 'Account created. Check your email to verify.' });
  });

  // ── POST /auth/login ───────────────────────────────────────────────────────
  fastify.post(
    '/auth/login',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: 60_000, // 5 per minute
        },
      },
    },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message ?? 'Invalid input',
        });
      }
      const { email, password } = parsed.data;
      const normalizedEmail = email.toLowerCase().trim();

      const db = getDb();
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      const user = rows[0] ?? null;

      // Check lockout BEFORE evaluating password
      if (user?.lockedUntil && user.lockedUntil > new Date()) {
        // Still run bcrypt.compare to keep timing consistent
        await bcrypt.compare(password, DUMMY_HASH);
        return reply.code(423).send({
          error: 'ACCOUNT_LOCKED',
          message: 'Account is temporarily locked. Try again later.',
        });
      }

      // Always run bcrypt.compare — use dummy hash for missing users
      const passwordValid = await bcrypt.compare(
        password,
        user?.passwordHash ?? DUMMY_HASH,
      );

      if (!user || !passwordValid) {
        // Increment failed attempts if user exists
        if (user) {
          const newAttempts = user.failedLoginAttempts + 1;
          const lockedUntil =
            newAttempts >= LOCKOUT_THRESHOLD
              ? new Date(Date.now() + LOCKOUT_DURATION_MS)
              : null;

          await db
            .update(users)
            .set({
              failedLoginAttempts: newAttempts,
              ...(lockedUntil ? { lockedUntil } : {}),
            })
            .where(eq(users.id, user.id));
        }

        return reply.code(401).send({
          error: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password.',
        });
      }

      // Reset failed attempts on success
      if (user.failedLoginAttempts > 0 || user.lockedUntil) {
        await db
          .update(users)
          .set({ failedLoginAttempts: 0, lockedUntil: null })
          .where(eq(users.id, user.id));
      }

      const sessionToken = createSessionToken({
        type: 'session',
        userId: user.id,
        email: user.email,
        role: 'runner',
        tenantId: user.tenantId ?? null,
        runnerId: null,
        emailVerified: user.emailVerified,
        pbxFqdn: null,
        extensionNumber: null,
        entraEmail: null,
        tid: null,
        oid: null,
      });

      return reply.send({
        sessionToken,
        user: {
          id: user.id,
          email: user.email,
          emailVerified: user.emailVerified,
        },
      });
    },
  );

  // ── POST /auth/forgot-password ─────────────────────────────────────────────
  fastify.post(
    '/auth/forgot-password',
    {
      config: {
        rateLimit: {
          max: 3,
          timeWindow: 3_600_000, // 3 per hour
        },
      },
    },
    async (request, reply) => {
      const parsed = forgotPasswordSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message ?? 'Invalid input',
        });
      }
      const { email } = parsed.data;
      const normalizedEmail = email.toLowerCase().trim();

      const db = getDb();
      const rows = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (rows.length > 0) {
        const resetToken = generateToken();
        const resetTokenExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

        await db
          .update(users)
          .set({ resetToken, resetTokenExpiresAt })
          .where(eq(users.id, rows[0].id));

        void sendPasswordResetEmail(normalizedEmail, resetToken);
      }

      // Always return 200 to prevent user enumeration
      return reply.send({ message: 'If that email is registered, a reset link has been sent.' });
    },
  );

  // ── POST /auth/reset-password ──────────────────────────────────────────────
  fastify.post('/auth/reset-password', async (request, reply) => {
    const parsed = resetPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Invalid input',
      });
    }
    const { token, password } = parsed.data;

    const db = getDb();
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.resetToken, token))
      .limit(1);

    const user = rows[0] ?? null;

    if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
      return reply.code(400).send({
        error: 'INVALID_TOKEN',
        message: 'Reset token is invalid or expired.',
      });
    }

    const passwordHash = await bcrypt.hash(password, config.BCRYPT_ROUNDS);

    await db
      .update(users)
      .set({
        passwordHash,
        resetToken: null,
        resetTokenExpiresAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      })
      .where(eq(users.id, user.id));

    return reply.send({ message: 'Password has been reset.' });
  });

  // ── POST /auth/verify-email ────────────────────────────────────────────────
  fastify.post('/auth/verify-email', async (request, reply) => {
    const parsed = verifyEmailSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Invalid input',
      });
    }
    const { token } = parsed.data;

    const db = getDb();
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.verifyToken, token))
      .limit(1);

    const user = rows[0] ?? null;

    if (!user || !user.verifyTokenExpiresAt || user.verifyTokenExpiresAt < new Date()) {
      return reply.code(400).send({
        error: 'INVALID_TOKEN',
        message: 'Verification token is invalid or expired.',
      });
    }

    await db
      .update(users)
      .set({
        emailVerified: true,
        verifyToken: null,
        verifyTokenExpiresAt: null,
      })
      .where(eq(users.id, user.id));

    return reply.send({ message: 'Email verified.' });
  });

  // ── POST /auth/resend-verification ─────────────────────────────────────────
  fastify.post(
    '/auth/resend-verification',
    {
      preHandler: [authenticate],
      config: {
        rateLimit: {
          max: 3,
          timeWindow: 3_600_000, // 3 per hour
        },
      },
    },
    async (request, reply) => {
      const session = request.runnerContext!;

      if (session.emailVerified) {
        return reply.code(400).send({
          error: 'ALREADY_VERIFIED',
          message: 'Email is already verified.',
        });
      }

      const db = getDb();
      const verifyToken = generateToken();
      const verifyTokenExpiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);

      await db
        .update(users)
        .set({ verifyToken, verifyTokenExpiresAt })
        .where(eq(users.email, session.email));

      void sendVerificationEmail(session.email, verifyToken);

      return reply.send({ message: 'Verification email sent.' });
    },
  );

  // ── PATCH /auth/change-password ────────────────────────────────────────────
  fastify.patch(
    '/auth/change-password',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const parsed = changePasswordSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message ?? 'Invalid input',
        });
      }
      const { oldPassword, newPassword } = parsed.data;
      const session = request.runnerContext!;

      const db = getDb();
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.email, session.email))
        .limit(1);

      const user = rows[0] ?? null;
      if (!user) {
        return reply.code(404).send({
          error: 'USER_NOT_FOUND',
          message: 'User not found.',
        });
      }

      const oldPasswordValid = await bcrypt.compare(oldPassword, user.passwordHash);
      if (!oldPasswordValid) {
        return reply.code(401).send({
          error: 'INVALID_CREDENTIALS',
          message: 'Current password is incorrect.',
        });
      }

      const passwordHash = await bcrypt.hash(newPassword, config.BCRYPT_ROUNDS);

      await db
        .update(users)
        .set({ passwordHash })
        .where(eq(users.id, user.id));

      return reply.send({ message: 'Password changed.' });
    },
  );
}
