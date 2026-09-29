/**
 * Tests for the functional CredentialAccept factory.
 *
 * Validates:
 *   1. Construction with required Account + Issuer + CredentialType.
 *   2. Account validation (required, non-empty string).
 *   3. Issuer validation (required, must look like an XRPL address).
 *   4. CredentialType validation (hex, non-empty, even-length, ≤ 64 bytes).
 *   5. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined values).
 *   6. Factory-only rules not enforced by the class API (see Divergences
 *      in the factory header).
 */
import { describe, it, expect } from 'vitest';
import { credentialAccept } from '../../src/fp/factories/credential-accept.js';

const SUBJECT = 'rfmDuhDyLGgx94qiwf3YF8BUV5j6KSvE8';
const ISSUER_A = 'ra5nK24KXen9AHvsdFTKHSANinZseWnPcX';
const ISSUER_B = 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH';
const CRED_TYPE = '6D795F63726564656E7469616C'; // hex("my_credential")
const PASSPORT_HEX = '50617373706F7274'; // hex("Passport")

function make(
  extras: Partial<{
    Account: string;
    Issuer: string;
    CredentialType: string;
    Fee: string;
    Sequence: number;
    Flags: number;
  }> = {},
) {
  return credentialAccept({
    Account: extras.Account ?? SUBJECT,
    Issuer: extras.Issuer ?? ISSUER_A,
    CredentialType: extras.CredentialType ?? CRED_TYPE,
    ...(extras.Fee !== undefined ? { Fee: extras.Fee } : {}),
    ...(extras.Sequence !== undefined ? { Sequence: extras.Sequence } : {}),
    ...(extras.Flags !== undefined ? { Flags: extras.Flags } : {}),
  });
}

describe('fp/credentialAccept()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('CredentialAccept');
      expect(tx.Account).toBe(SUBJECT);
      expect(tx.Issuer).toBe(ISSUER_A);
      expect(tx.CredentialType).toBe(CRED_TYPE);
      expect(tx.Fee).toBeUndefined();
      expect(tx.Sequence).toBeUndefined();
      expect(tx.Flags).toBeUndefined();
    });

    it('accepts every spec field together', () => {
      const tx = credentialAccept({
        Account: SUBJECT,
        Issuer: ISSUER_A,
        CredentialType: PASSPORT_HEX,
        Fee: '12',
        Sequence: 234203,
        Flags: 0,
      });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(234203);
      expect(tx.Flags).toBe(0);
    });

    it('accepts a different issuer for the same credential type', () => {
      const tx = make({ Issuer: ISSUER_B });
      expect(tx.Issuer).toBe(ISSUER_B);
      expect(tx.CredentialType).toBe(CRED_TYPE);
    });
  });

  describe('Account validation', () => {
    // ── Factory-only divergence: class relies on parent validate() ──
    it('throws when Account is missing', () => {
      expect(() =>
        credentialAccept({
          Account: undefined as unknown as string,
          Issuer: ISSUER_A,
          CredentialType: CRED_TYPE,
        }),
      ).toThrow(/Account is required/);
    });

    it('throws when Account is an empty string', () => {
      expect(() =>
        credentialAccept({
          Account: '',
          Issuer: ISSUER_A,
          CredentialType: CRED_TYPE,
        }),
      ).toThrow(/Account is required/);
    });

    it('throws when Account is a non-string', () => {
      expect(() =>
        credentialAccept({
          Account: 123 as unknown as string,
          Issuer: ISSUER_A,
          CredentialType: CRED_TYPE,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('Issuer validation', () => {
    it('throws when Issuer is missing', () => {
      expect(() =>
        credentialAccept({
          Account: SUBJECT,
          Issuer: undefined as unknown as string,
          CredentialType: CRED_TYPE,
        }),
      ).toThrow(/Issuer/);
    });

    it('throws when Issuer is an empty string', () => {
      expect(() =>
        credentialAccept({
          Account: SUBJECT,
          Issuer: '',
          CredentialType: CRED_TYPE,
        }),
      ).toThrow(/Issuer/);
    });

    it('throws when Issuer is not an XRPL address', () => {
      expect(() =>
        credentialAccept({
          Account: SUBJECT,
          Issuer: 'not-an-address',
          CredentialType: CRED_TYPE,
        }),
      ).toThrow(/Issuer/);
    });

    it('throws when Issuer is a non-string', () => {
      expect(() =>
        credentialAccept({
          Account: SUBJECT,
          Issuer: 42 as unknown as string,
          CredentialType: CRED_TYPE,
        }),
      ).toThrow(/Issuer/);
    });
  });

  describe('CredentialType validation', () => {
    it('throws when CredentialType is missing', () => {
      expect(() =>
        credentialAccept({
          Account: SUBJECT,
          Issuer: ISSUER_A,
          CredentialType: undefined as unknown as string,
        }),
      ).toThrow(/CredentialType/);
    });

    it('throws when CredentialType is a non-string', () => {
      expect(() =>
        credentialAccept({
          Account: SUBJECT,
          Issuer: ISSUER_A,
          CredentialType: 123 as unknown as string,
        }),
      ).toThrow(/CredentialType/);
    });

    // ── Factory-only divergence: class accepts empty string ──
    it('throws when CredentialType is empty (XLS-0070 §2.1.3)', () => {
      expect(() =>
        credentialAccept({
          Account: SUBJECT,
          Issuer: ISSUER_A,
          CredentialType: '',
        }),
      ).toThrow(/empty/);
    });

    // ── Factory-only divergence: class accepts non-hex ──
    it('throws when CredentialType is not hex', () => {
      expect(() =>
        credentialAccept({
          Account: SUBJECT,
          Issuer: ISSUER_A,
          CredentialType: 'not-hex!!',
        }),
      ).toThrow(/hex/);
    });

    it('throws when CredentialType has odd length', () => {
      expect(() =>
        credentialAccept({
          Account: SUBJECT,
          Issuer: ISSUER_A,
          CredentialType: 'ABC',
        }),
      ).toThrow(/even/);
    });

    // ── Factory-only divergence: class has no length check ──
    it('throws when CredentialType exceeds 64 bytes (XLS-0070 §2.1.3)', () => {
      const tooLong = 'A'.repeat(130); // 130 hex chars = 65 bytes
      expect(() =>
        credentialAccept({
          Account: SUBJECT,
          Issuer: ISSUER_A,
          CredentialType: tooLong,
        }),
      ).toThrow(/64 bytes/);
    });

    it('accepts CredentialType at exactly 64 bytes', () => {
      const ok = 'A'.repeat(128); // 128 hex chars = 64 bytes
      const tx = credentialAccept({
        Account: SUBJECT,
        Issuer: ISSUER_A,
        CredentialType: ok,
      });
      expect(tx.CredentialType).toBe(ok);
    });

    it('accepts CredentialType at 1 byte (smallest non-empty)', () => {
      const tx = credentialAccept({
        Account: SUBJECT,
        Issuer: ISSUER_A,
        CredentialType: '41',
      });
      expect(tx.CredentialType).toBe('41');
    });
  });

  describe('frozen-shape contract', () => {
    it('returns a frozen object', () => {
      const tx = make();
      expect(Object.isFrozen(tx)).toBe(true);
    });

    it('mutation throws in strict mode', () => {
      const tx = make();
      expect(() => {
        (tx as unknown as Record<string, unknown>).Issuer = 'x';
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides', () => {
      const tx = make();
      const tx2 = tx.with({ Issuer: ISSUER_B });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Issuer).toBe(ISSUER_B);
      expect(tx.Issuer).toBe(ISSUER_A);
    });

    it('.with() preserves non-overridden fields', () => {
      const tx = make({ Fee: '10', Sequence: 7 });
      const tx2 = tx.with({ Issuer: ISSUER_B });
      expect(tx2.Fee).toBe('10');
      expect(tx2.Sequence).toBe(7);
      expect(tx2.CredentialType).toBe(CRED_TYPE);
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() => tx.with({ CredentialType: '' })).toThrow(/empty/);
      expect(() => tx.with({ CredentialType: 'zzzz' })).toThrow(/hex/);
      expect(() => tx.with({ CredentialType: 'A'.repeat(130) })).toThrow(
        /64 bytes/,
      );
      expect(() => tx.with({ Issuer: 'not-an-address' })).toThrow(/Issuer/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = credentialAccept({
        Account: SUBJECT,
        Issuer: ISSUER_A,
        CredentialType: CRED_TYPE,
        Fee: '10',
        Sequence: 5,
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'CredentialAccept',
        Account: SUBJECT,
        Issuer: ISSUER_A,
        CredentialType: CRED_TYPE,
        Fee: '10',
        Sequence: 5,
      });
    });

    it('.toJSON() skips undefined fields', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
      expect('Flags' in json).toBe(false);
    });
  });
});