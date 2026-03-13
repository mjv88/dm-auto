/**
 * tests/security/headers.test.ts
 *
 * Verifies that the Next.js config source defines the required security headers
 * on all routes (§15 Security Requirements).
 *
 * We parse next.config.js as text rather than require()ing it to avoid the
 * next-pwa CJS wrapper dependency in the test environment.
 */

import path from 'path';
import fs from 'fs';

// ---------------------------------------------------------------------------
// Load the next.config.js source and extract the inline headers definition
// ---------------------------------------------------------------------------

const configPath = path.resolve(__dirname, '../../next.config.js');
const configSource = fs.readFileSync(configPath, 'utf-8');

// Inline header definitions parsed directly from source — keyed by header name
function extractHeaderValue(key: string): string | undefined {
  // Match: { key: 'X-Frame-Options', value: 'DENY' }
  const re = new RegExp(
    `key:\\s*['"]${key.replace(/[-]/g, '[-]')}['"][^}]*value:\\s*['"]([^'"]+)['"]`,
    's',
  );
  const m = configSource.match(re);
  return m?.[1];
}

// For multi-line values built with array.join, extract the join call source
function extractJoinedHeaderSource(key: string): string | undefined {
  const re = new RegExp(
    `key:\\s*['"]${key.replace(/[-]/g, '[-]')}['"][^}]*value:\\s*\\[([\\s\\S]*?)\\]\\.join`,
    's',
  );
  const m = configSource.match(re);
  if (!m) return undefined;
  // Collapse array items into a single string for pattern matching
  return m[1].replace(/["`]/g, '').replace(/,/g, ' ').replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Security headers — next.config.js', () => {
  test('config defines a headers() async function', () => {
    expect(configSource).toMatch(/async headers\s*\(\s*\)/);
  });

  test('catch-all source pattern /(.*) is defined', () => {
    expect(configSource).toContain("source: '/(.*)'");
  });

  test('Content-Security-Policy header is defined', () => {
    expect(configSource).toContain("'Content-Security-Policy'");
  });

  test('CSP contains default-src self directive', () => {
    const cspSource = extractJoinedHeaderSource('Content-Security-Policy');
    expect(cspSource).toContain("default-src 'self'");
  });

  test("CSP contains script-src 'self' 'unsafe-inline'", () => {
    const cspSource = extractJoinedHeaderSource('Content-Security-Policy');
    expect(cspSource).toContain("script-src 'self' 'unsafe-inline'");
  });

  test('CSP connect-src includes Microsoft login endpoint', () => {
    const cspSource = extractJoinedHeaderSource('Content-Security-Policy');
    expect(cspSource).toContain('login.microsoftonline.com');
  });

  test('CSP connect-src includes Microsoft Graph endpoint', () => {
    const cspSource = extractJoinedHeaderSource('Content-Security-Policy');
    expect(cspSource).toContain('graph.microsoft.com');
  });

  test("CSP img-src contains 'self' and data:", () => {
    const cspSource = extractJoinedHeaderSource('Content-Security-Policy');
    expect(cspSource).toContain("img-src 'self' data:");
  });

  test('X-Frame-Options is set to DENY', () => {
    const val = extractHeaderValue('X-Frame-Options');
    expect(val).toBe('DENY');
  });

  test('X-Content-Type-Options is set to nosniff', () => {
    const val = extractHeaderValue('X-Content-Type-Options');
    expect(val).toBe('nosniff');
  });

  test('Referrer-Policy is set to strict-origin-when-cross-origin', () => {
    const val = extractHeaderValue('Referrer-Policy');
    expect(val).toBe('strict-origin-when-cross-origin');
  });

  test('Permissions-Policy disables geolocation', () => {
    const val = extractHeaderValue('Permissions-Policy');
    expect(val).toContain('geolocation=()');
  });

  test('Permissions-Policy disables microphone', () => {
    const val = extractHeaderValue('Permissions-Policy');
    expect(val).toContain('microphone=()');
  });

  test('Permissions-Policy disables camera', () => {
    const val = extractHeaderValue('Permissions-Policy');
    expect(val).toContain('camera=()');
  });

  test('Strict-Transport-Security has max-age and includeSubDomains', () => {
    const val = extractHeaderValue('Strict-Transport-Security');
    expect(val).toContain('max-age=31536000');
    expect(val).toContain('includeSubDomains');
  });
});
