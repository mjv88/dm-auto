/**
 * tests/security/input-sanitization.test.ts
 *
 * Verifies that user-input fields in the application are handled safely:
 * - No dangerouslySetInnerHTML usage with user-controlled data
 * - URL parameters are encoded before use in navigation
 * - Error codes passed through URL params are encoded
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

function walkSync(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkSync(full));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      results.push(full);
    }
  }
  return results;
}

function collectTsxFiles(dir: string): string[] {
  return walkSync(path.join(ROOT, dir));
}

// ---------------------------------------------------------------------------
// dangerouslySetInnerHTML audit
// ---------------------------------------------------------------------------

describe('No dangerouslySetInnerHTML with user data', () => {
  const files = collectTsxFiles('app').concat(collectTsxFiles('components'));

  test('source files were collected', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const filePath of files) {
    const rel = path.relative(ROOT, filePath);
    test(`${rel} — no dangerouslySetInnerHTML`, () => {
      const src = fs.readFileSync(filePath, 'utf-8');
      // dangerouslySetInnerHTML is acceptable ONLY if the value is a static
      // string literal, never a variable or user input.
      const dangerous = src.match(/dangerouslySetInnerHTML\s*=\s*\{[^}]*\}/g);
      if (!dangerous) return; // no usage at all — fine

      for (const match of dangerous) {
        // Reject any usage where the innerHTML value is not a literal string
        expect(match).not.toMatch(/dangerouslySetInnerHTML\s*=\s*\{[^}]*[a-zA-Z_$][a-zA-Z0-9_$]*/);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// URL parameter encoding in navigation calls
// ---------------------------------------------------------------------------

describe('Error codes are URL-encoded before navigation', () => {
  test('departments/page.tsx encodes error code in router.push', () => {
    const src = readSource('app/departments/page.tsx');
    // Any router.push with a code param must use encodeURIComponent
    const routerPushWithCode = src.match(/router\.push\([^)]*code[^)]*\)/g);
    if (routerPushWithCode) {
      for (const call of routerPushWithCode) {
        expect(call).toContain('encodeURIComponent');
      }
    }
  });

  test('lib/api.ts encodes error code in navigate calls', () => {
    const src = readSource('lib/api.ts');
    const navigateCalls = src.match(/navigate\([^)]*code[^)]*\)/g);
    if (navigateCalls) {
      for (const call of navigateCalls) {
        expect(call).toContain('encodeURIComponent');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// MSAL sessionStorage — confirm cacheLocation is sessionStorage (not localStorage)
// ---------------------------------------------------------------------------

describe('MSAL cache is sessionStorage, not localStorage', () => {
  test('lib/auth.ts sets cacheLocation to sessionStorage', () => {
    const src = readSource('lib/auth.ts');
    expect(src).toContain("cacheLocation: 'sessionStorage'");
    expect(src).not.toContain("cacheLocation: 'localStorage'");
  });

  test('lib/auth.ts does not enable storeAuthStateInCookie', () => {
    const src = readSource('lib/auth.ts');
    // MSAL v5 removed storeAuthStateInCookie; verify it is not re-enabled as true
    expect(src).not.toContain('storeAuthStateInCookie: true');
  });
});

// ---------------------------------------------------------------------------
// API request timeout — AbortController present in lib/api.ts
// ---------------------------------------------------------------------------

describe('API requests have timeout protection', () => {
  test('lib/api.ts uses AbortController for request timeout', () => {
    const src = readSource('lib/api.ts');
    expect(src).toContain('AbortController');
    expect(src).toContain('REQUEST_TIMEOUT_MS');
  });

  test('lib/api.ts has retry logic for network failures', () => {
    const src = readSource('lib/api.ts');
    expect(src).toContain('RETRY_COUNT');
    expect(src).toContain('fetchWithRetry');
  });

  test('lib/api.ts adds x-request-id correlation header', () => {
    const src = readSource('lib/api.ts');
    expect(src).toContain('x-request-id');
    expect(src).toContain('generateRequestId');
  });
});
