/**
 * src/middleware/security.ts
 *
 * Registers security headers on every response:
 *   - CORS: only the NEXT_PUBLIC_APP_URL origin is allowed (provision.tcx-hub.com)
 *   - HSTS: max-age=31536000; includeSubDomains
 *   - CSP: default-src 'self'
 *   - X-Frame-Options: DENY
 *   - X-Content-Type-Options: nosniff
 */

import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

export async function registerSecurity(fastify: FastifyInstance): Promise<void> {
  const allowedOrigin = config.NEXT_PUBLIC_APP_URL;

  // ── CORS preflight ────────────────────────────────────────────────────────
  fastify.addHook('onRequest', async (request, reply) => {
    if (request.method !== 'OPTIONS') return;

    const origin = request.headers.origin;
    if (origin === allowedOrigin) {
      reply
        .header('Access-Control-Allow-Origin', allowedOrigin)
        .header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        .header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-request-id')
        .header('Access-Control-Max-Age', '86400')
        .header('Vary', 'Origin');
    }
    return reply.code(204).send();
  });

  // ── Security headers on every response ────────────────────────────────────
  fastify.addHook('onSend', async (request, reply) => {
    const origin = request.headers.origin;

    if (origin === allowedOrigin) {
      reply
        .header('Access-Control-Allow-Origin', allowedOrigin)
        .header('Vary', 'Origin');
    }

    reply
      .header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
      .header('Content-Security-Policy', "default-src 'self'")
      .header('X-Frame-Options', 'DENY')
      .header('X-Content-Type-Options', 'nosniff');
  });
}
