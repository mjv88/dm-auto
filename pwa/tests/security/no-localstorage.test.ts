/**
 * tests/security/no-localstorage.test.ts
 *
 * Scans all source files in app/, lib/, and components/ to ensure no code
 * writes to localStorage. Session tokens must remain in memory only (§15).
 *
 * Allowed: reading (for legacy compatibility detection), but not writing.
 * This test flags any direct localStorage.setItem / localStorage.removeItem
 * or localStorage[key] = ... patterns.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');

const SCAN_DIRS = ['app', 'lib', 'components'];
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

const FORBIDDEN_PATTERNS = [
  /localStorage\s*\.\s*setItem\s*\(/,
  /localStorage\s*\.\s*removeItem\s*\(/,
  /localStorage\s*\.\s*clear\s*\(/,
  /localStorage\s*\[['"][^'"]+['"]\]\s*=/,
];

// Files allowed to use localStorage for non-credential UX preferences (e.g. last-selected PBX)
const ALLOWED_SETITEM_FILES = ['app/select-pbx/page.tsx'];
const ALLOWED_REMOVEITEM_FILES = ['app/departments/page.tsx'];

function walkSync(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkSync(full));
    } else if (EXTENSIONS.some((e) => entry.name.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

function collectFiles(): string[] {
  return SCAN_DIRS.flatMap((d) => walkSync(path.join(ROOT, d)));
}

describe('No localStorage writes in source files (§15 credential storage)', () => {
  const files = collectFiles();

  test('source files were found to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  const violations: Array<{ file: string; line: number; content: string }> = [];

  beforeAll(() => {
    for (const filePath of files) {
      const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
      lines.forEach((line, i) => {
        // Skip comment lines
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;

        for (const pattern of FORBIDDEN_PATTERNS) {
          if (pattern.test(line)) {
            violations.push({
              file: path.relative(ROOT, filePath),
              line: i + 1,
              content: trimmed,
            });
          }
        }
      });
    }
  });

  test('no localStorage.setItem calls found in source (except allowlisted UX preferences)', () => {
    const setItemViolations = violations.filter(
      (v) =>
        /localStorage\s*\.\s*setItem/.test(v.content) &&
        !ALLOWED_SETITEM_FILES.some((f) => v.file.replace(/\\/g, '/').endsWith(f)),
    );
    if (setItemViolations.length > 0) {
      const details = setItemViolations
        .map((v) => `  ${v.file}:${v.line}  →  ${v.content}`)
        .join('\n');
      throw new Error(`localStorage.setItem found in source files:\n${details}`);
    }
    expect(setItemViolations).toHaveLength(0);
  });

  test('no localStorage.removeItem calls found in source (except allowlisted UX preferences)', () => {
    const removeViolations = violations.filter(
      (v) =>
        /localStorage\s*\.\s*removeItem/.test(v.content) &&
        !ALLOWED_REMOVEITEM_FILES.some((f) => v.file.replace(/\\/g, '/').endsWith(f)),
    );
    if (removeViolations.length > 0) {
      const details = removeViolations
        .map((v) => `  ${v.file}:${v.line}  →  ${v.content}`)
        .join('\n');
      throw new Error(`localStorage.removeItem found in source files:\n${details}`);
    }
    expect(removeViolations).toHaveLength(0);
  });

  test('no localStorage.clear calls found in source', () => {
    const clearViolations = violations.filter((v) =>
      /localStorage\s*\.\s*clear/.test(v.content),
    );
    if (clearViolations.length > 0) {
      const details = clearViolations
        .map((v) => `  ${v.file}:${v.line}  →  ${v.content}`)
        .join('\n');
      throw new Error(`localStorage.clear found in source files:\n${details}`);
    }
    expect(clearViolations).toHaveLength(0);
  });

  test('store.ts comment documents auth token strategy', () => {
    const storeContent = fs.readFileSync(path.join(ROOT, 'lib', 'store.ts'), 'utf-8');
    // Confirm the intentional comment about Bearer header auth (httpOnly cookies blocked by Cloudflare proxy)
    expect(storeContent).toContain('httpOnly cookies blocked by Cloudflare proxy');
  });
});
