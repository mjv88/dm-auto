import fs from 'fs';
import path from 'path';

const MANIFEST_PATH = path.join(process.cwd(), 'public', 'manifest.json');
const ICONS_DIR = path.join(process.cwd(), 'public', 'icons');

describe('PWA manifest.json — Intune compliance', () => {
  let manifest: Record<string, unknown>;

  beforeAll(() => {
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf-8');
    manifest = JSON.parse(raw);
  });

  it('has required name field', () => {
    expect(manifest.name).toBe('Runner Hub');
  });

  it('has required short_name field', () => {
    expect(manifest.short_name).toBe('Runner');
  });

  it('has display: standalone (required for Intune PWA install)', () => {
    expect(manifest.display).toBe('standalone');
  });

  it('has start_url set (required for Intune)', () => {
    expect(typeof manifest.start_url).toBe('string');
    expect((manifest.start_url as string).length).toBeGreaterThan(0);
  });

  it('has theme_color set', () => {
    expect(manifest.theme_color).toBeDefined();
  });

  it('has background_color set', () => {
    expect(manifest.background_color).toBeDefined();
  });

  it('has scope set', () => {
    expect(manifest.scope).toBeDefined();
  });

  it('has lang set to de (DACH market)', () => {
    expect(manifest.lang).toBe('de');
  });

  it('has icons array with at least three entries', () => {
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect((manifest.icons as unknown[]).length).toBeGreaterThanOrEqual(3);
  });

  it('has a 192×192 icon entry', () => {
    const icons = manifest.icons as Array<{ sizes: string; src: string }>;
    const icon192 = icons.find((i) => i.sizes === '192x192');
    expect(icon192).toBeDefined();
  });

  it('has a 512×512 icon entry', () => {
    const icons = manifest.icons as Array<{ sizes: string; src: string }>;
    const icon512 = icons.find((i) => i.sizes === '512x512' && !('purpose' in i && i.purpose === 'maskable'));
    expect(icon512).toBeDefined();
  });

  it('has a maskable 512×512 icon entry', () => {
    const icons = manifest.icons as Array<{ sizes: string; src: string; purpose?: string }>;
    const maskable = icons.find((i) => i.purpose === 'maskable');
    expect(maskable).toBeDefined();
    expect(maskable?.sizes).toBe('512x512');
  });
});

describe('PWA icon files exist on disk', () => {
  const expectedIcons = ['icon-192.png', 'icon-512.png', 'icon-512-maskable.png'];

  it.each(expectedIcons)('%s is present in public/icons/', (iconName) => {
    const iconPath = path.join(ICONS_DIR, iconName);
    expect(fs.existsSync(iconPath)).toBe(true);
  });

  it.each(expectedIcons)('%s is a valid non-empty file', (iconName) => {
    const iconPath = path.join(ICONS_DIR, iconName);
    const stat = fs.statSync(iconPath);
    expect(stat.size).toBeGreaterThan(0);
  });

  it.each(expectedIcons)('%s starts with PNG signature bytes', (iconName) => {
    const iconPath = path.join(ICONS_DIR, iconName);
    const buf = Buffer.alloc(8);
    const fd = fs.openSync(iconPath, 'r');
    fs.readSync(fd, buf, 0, 8, 0);
    fs.closeSync(fd);
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50); // P
    expect(buf[2]).toBe(0x4e); // N
    expect(buf[3]).toBe(0x47); // G
  });
});
