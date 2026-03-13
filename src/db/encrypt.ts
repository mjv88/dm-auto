import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // 96-bit IV recommended for GCM
const TAG_LENGTH = 16;  // 128-bit auth tag

/**
 * Returns a 32-byte Buffer derived from the ENCRYPTION_KEY env var.
 * The env var must be a 64-character hex string (256 bits).
 */
function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }
  if (hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (256 bits)');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypts plaintext with AES-256-GCM.
 * Output format (colon-delimited, base64 components):
 *   <iv_b64>:<authTag_b64>:<ciphertext_b64>
 */
export function encryptField(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

/**
 * Decrypts a ciphertext produced by encryptField.
 */
export function decryptField(ciphertext: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted field format');
  }
  const [ivB64, authTagB64, encryptedB64] = parts;
  const key = getKey();
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');
  if (iv.length !== IV_LENGTH) {
    throw new Error('Invalid IV length in encrypted field');
  }
  if (authTag.length !== TAG_LENGTH) {
    throw new Error('Invalid auth tag length in encrypted field');
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
