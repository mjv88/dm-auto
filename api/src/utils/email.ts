import { config } from '../config.js';
import { logger } from './logger.js';

const APP_URL = config.APP_URL ?? 'https://runner.tcx-hub.com';
const WORKER_URL = config.EMAIL_WORKER_URL ?? 'https://email.tcx-hub.com';
const WORKER_SECRET = config.EMAIL_WORKER_SECRET;

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  type: 'verification' | 'password-reset',
): Promise<void> {
  if (!WORKER_SECRET) {
    logger.warn({ to, type }, 'EMAIL_WORKER_SECRET not set — skipping email');
    return;
  }
  try {
    const resp = await fetch(`${WORKER_URL}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${WORKER_SECRET}`,
      },
      body: JSON.stringify({ to, subject, html, type }),
    });
    if (!resp.ok) {
      logger.error({ to, type, status: resp.status }, 'Email worker returned error');
    }
  } catch (err) {
    logger.error({ to, type, err }, 'Failed to send email');
  }
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = `${APP_URL}/verify-email?token=${token}`;
  const html = `
    <h2>Verify your email</h2>
    <p>Click the link below to verify your email address:</p>
    <p><a href="${link}">${link}</a></p>
    <p>This link expires in 24 hours.</p>
  `;
  await sendEmail(to, 'Verify your email — Runner Hub', html, 'verification');
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = `${APP_URL}/reset-password?token=${token}`;
  const html = `
    <h2>Reset your password</h2>
    <p>Click the link below to reset your password:</p>
    <p><a href="${link}">${link}</a></p>
    <p>This link expires in 30 minutes.</p>
  `;
  await sendEmail(to, 'Reset your password — Runner Hub', html, 'password-reset');
}
