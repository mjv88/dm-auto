/**
 * src/middleware/security.ts
 *
 * Registers security headers on every response:
 *   - CORS: only the NEXT_PUBLIC_APP_URL origin is allowed
 *   - HSTS: max-age=31536000; includeSubDomains
 *   - CSP: default-src 'none'; frame-ancestors 'none'
 *   - X-Frame-Options: DENY
 *   - X-Content-Type-Options: nosniff
 *   - Referrer-Policy: strict-origin-when-cross-origin
 *   - Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
 *
 * Also handles CORS preflight (OPTIONS) requests.
 */

import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

export async function registerSecurity(fastify: FastifyInstance): Promise<void> {
  const allowedOrigin = config.NEXT_PUBLIC_APP_URL;

  // ── Content-Type validation — mitigates GHSA-jx2c-rxcm-jvmq (Fastify body validation bypass)
  fastify.addHook('onRequest', async (request, reply) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      const ct = request.headers['content-type'];
      if (ct && /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(ct)) {
        return reply.code(415).send({ error: 'INVALID_CONTENT_TYPE' });
      }
    }
  });

  // ── CORS preflight ────────────────────────────────────────────────────────
  // Intercept OPTIONS before route handlers so we always return CORS headers
  // for valid origins without hitting protected route logic.
  fastify.addHook('onRequest', async (request, reply) => {
    if (request.method !== 'OPTIONS') return;

    const origin = request.headers.origin;
    if (origin === allowedOrigin) {
      reply
        .header('Access-Control-Allow-Origin', allowedOrigin)
        .header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        .header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-request-id')
        .header('Access-Control-Allow-Credentials', 'true')
        .header('Access-Control-Max-Age', '86400')
        .header('Vary', 'Origin');
    }
    return reply.code(204).send();
  });

  // ── Security headers on every response ────────────────────────────────────
  fastify.addHook('onSend', async (request, reply) => {
    const origin = request.headers.origin;

    // CORS: echo the allowed origin back only when it matches
    if (origin === allowedOrigin) {
      reply
        .header('Access-Control-Allow-Origin', allowedOrigin)
        .header('Access-Control-Allow-Credentials', 'true')
        .header('Vary', 'Origin');
    }

    reply
      .header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
      .header(
        'Content-Security-Policy',
        "default-src 'none'; frame-ancestors 'none'",
      )
      .header('X-Frame-Options', 'DENY')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'strict-origin-when-cross-origin')
      .header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  });
}
