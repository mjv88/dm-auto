import { encryptField, decryptField } from '../../src/db/encrypt';

const VALID_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes

beforeEach(() => {
  process.env.ENCRYPTION_KEY = VALID_KEY;
});

afterEach(() => {
  delete process.env.ENCRYPTION_KEY;
});

describe('encryptField / decryptField', () => {
  it('roundtrips a simple ASCII string', () => {
    const plaintext = 'hello world';
    const ciphertext = encryptField(plaintext);
    expect(decryptField(ciphertext)).toBe(plaintext);
  });

  it('roundtrips an empty string', () => {
    const plaintext = '';
    expect(decryptField(encryptField(plaintext))).toBe(plaintext);
  });

  it('roundtrips a unicode / special-character string', () => {
    const plaintext = 'Kundé GmbH — §4 «schema»\n\t日本語';
    expect(decryptField(encryptField(plaintext))).toBe(plaintext);
  });

  it('roundtrips a long credential-like string', () => {
    const plaintext = 'xapi_' + 'x'.repeat(512);
    expect(decryptField(encryptField(plaintext))).toBe(plaintext);
  });

  it('produces different ciphertext each call (random IV)', () => {
    const plaintext = 'same plaintext';
    const ct1 = encryptField(plaintext);
    const ct2 = encryptField(plaintext);
    expect(ct1).not.toBe(ct2);
    // But both decrypt correctly
    expect(decryptField(ct1)).toBe(plaintext);
    expect(decryptField(ct2)).toBe(plaintext);
  });

  it('ciphertext contains three colon-separated base64 parts', () => {
    const ct = encryptField('test');
    const parts = ct.split(':');
    expect(parts).toHaveLength(3);
    parts.forEach((p) => expect(p.length).toBeGreaterThan(0));
  });

  it('throws when ENCRYPTION_KEY is missing', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encryptField('test')).toThrow('ENCRYPTION_KEY');
  });

  it('throws when ENCRYPTION_KEY has wrong length', () => {
    process.env.ENCRYPTION_KEY = 'tooshort';
    expect(() => encryptField('test')).toThrow('64-character hex string');
  });

  it('throws when decrypting a tampered ciphertext', () => {
    const ct = encryptField('tamper test');
    // Corrupt the ciphertext portion (third segment)
    const parts = ct.split(':');
    parts[2] = Buffer.from('bad data').toString('base64');
    expect(() => decryptField(parts.join(':'))).toThrow();
  });

  it('throws on malformed ciphertext format', () => {
    expect(() => decryptField('notvalid')).toThrow('Invalid encrypted field format');
  });
});
