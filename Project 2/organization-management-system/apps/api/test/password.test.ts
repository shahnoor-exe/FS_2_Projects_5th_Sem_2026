import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../src/utils/password.js';
import { passwordSchema, registerSchema } from '@orgsphere/shared';

describe('Argon2id Password Security & Validation', () => {
  it('hashes and verifies passwords using pure Argon2id', async () => {
    const passphrase = 'correct-horse-battery-staple-passphrase';
    const hash = await hashPassword(passphrase);

    expect(hash).toContain('$argon2id$');
    expect(hash).toContain('m=65536,p=4,t=3');

    const isValid = await verifyPassword(hash, passphrase);
    expect(isValid).toBe(true);

    const isInvalid = await verifyPassword(hash, 'wrong-password-attempt');
    expect(isInvalid).toBe(false);
  });

  it('permits long passphrases, Unicode, and spaces (OWASP length-based policy)', () => {
    const validPassphrases = [
      'correct horse battery staple',
      'Secure Passphrase With Spaces 2026!',
      'München café über strasse passphrase',
      'japanese-日本語-passphrase-secure-1234',
    ];

    for (const phrase of validPassphrases) {
      const result = passwordSchema.safeParse(phrase);
      expect(result.success).toBe(true);
    }
  });

  it('rejects passwords under 12 characters', () => {
    const shortPasswords = ['short', '12345678', 'only11chars'];
    for (const short of shortPasswords) {
      const result = passwordSchema.safeParse(short);
      expect(result.success).toBe(false);
    }
  });

  it('rejects passwords present on the common breached blocklist', () => {
    const commonPasswords = [
      'password1234',
      'password12345',
      'password123456',
      '123456789012',
      'welcome123456',
    ];

    for (const common of commonPasswords) {
      const result = passwordSchema.safeParse(common);
      expect(result.success).toBe(false);
    }
  });

  it('strictly rejects registration payloads attempting to inject platformRole', () => {
    const maliciousPayload = {
      email: 'attacker@test.com',
      password: 'valid-secure-passphrase-123',
      firstName: 'Attacker',
      lastName: 'User',
      organizationName: 'Malicious Org',
      platformRole: 'SUPER_ADMIN', // Attempted privilege escalation
    };

    const result = registerSchema.safeParse(maliciousPayload);
    expect(result.success).toBe(false); // Schema is .strict(), rejects unknown keys
  });
});
