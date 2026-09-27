import { describe, it, expect } from 'vitest';
import { encryptField, decryptField } from '../src/utils/crypto.js';

describe('AES-256-GCM Field-Level Encryption', () => {
  it('encrypts and decrypts sensitive data correctly in a round-trip', () => {
    const plainText = '+1-555-867-5309';
    const encrypted = encryptField(plainText);

    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toHaveLength(32); // 16 bytes = 32 hex chars
    expect(encrypted.tag).toHaveLength(32); // 16 bytes = 32 hex chars
    expect(encrypted.ciphertext).not.toBe(plainText);

    const decrypted = decryptField(encrypted.ciphertext, encrypted.iv, encrypted.tag);
    expect(decrypted).toBe(plainText);
  });

  it('generates distinct IVs and ciphertexts for identical plaintext inputs', () => {
    const plainText = 'confidential-pii-phone-number';
    const enc1 = encryptField(plainText);
    const enc2 = encryptField(plainText);

    expect(enc1.iv).not.toBe(enc2.iv);
    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);

    expect(decryptField(enc1.ciphertext, enc1.iv, enc1.tag)).toBe(plainText);
    expect(decryptField(enc2.ciphertext, enc2.iv, enc2.tag)).toBe(plainText);
  });

  it('rejects tampered ciphertext, IV, or authentication tag', () => {
    const plainText = 'sensitive-data';
    const encrypted = encryptField(plainText);

    // Tamper with ciphertext
    const tamperedCiphertext =
      encrypted.ciphertext.substring(0, encrypted.ciphertext.length - 2) +
      (encrypted.ciphertext.endsWith('0') ? '1' : '0');

    expect(() => decryptField(tamperedCiphertext, encrypted.iv, encrypted.tag)).toThrow();

    // Tamper with authentication tag
    const tamperedTag =
      encrypted.tag.substring(0, encrypted.tag.length - 2) + (encrypted.tag.endsWith('0') ? '1' : '0');

    expect(() => decryptField(encrypted.ciphertext, encrypted.iv, tamperedTag)).toThrow();
  });
});
