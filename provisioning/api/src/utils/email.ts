import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { logger } from './logger.js';

const APP_URL = config.APP_URL ?? 'https://provision.tcx-hub.com';
const SMTP_HOST = config.SMTP_HOST ?? 'smtp.sendgrid.net';
const SMTP_PORT = config.SMTP_PORT ?? 587;
const SMTP_USER = config.SMTP_USER;
const SMTP_PASS = config.SMTP_PASS;
const SMTP_FROM = config.SMTP_FROM ?? 'noreply@tcx-hub.com';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  if (!SMTP_USER || !SMTP_PASS) {
    logger.warn('SMTP credentials not set — emails will be skipped');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false, // STARTTLS on port 587
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  return transporter;
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  type: 'verification' | 'password-reset',
): Promise<void> {
  const transport = getTransporter();
  if (!transport) {
    logger.warn({ to, type }, 'SMTP not configured — skipping email');
    return;
  }

  try {
    await transport.sendMail({
      from: `"Provisioning Hub" <${SMTP_FROM}>`,
      to,
      subject,
      html,
    });
    logger.info({ to, type }, 'Email sent successfully');
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
  await sendEmail(to, 'Verify your email — Provisioning Hub', html, 'verification');
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = `${APP_URL}/reset-password?token=${token}`;
  const html = `
    <h2>Reset your password</h2>
    <p>Click the link below to reset your password:</p>
    <p><a href="${link}">${link}</a></p>
    <p>This link expires in 30 minutes.</p>
  `;
  await sendEmail(to, 'Reset your password — Provisioning Hub', html, 'password-reset');
}
