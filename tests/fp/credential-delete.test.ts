/**
 * Tests for the functional CredentialDelete factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, CredentialType, +at
 *      least one of Subject/Issuer).
 *   2. CredentialType shape (hex, non-empty, ≤ 128 hex chars).
 *   3. Subject/Issuer optionality + at-least-one rule.
 *   4. Account validation (XRPL classic/X-address).
 *   5. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined values).
 *   6. Factory-only rules not enforced by the class API:
 *      - CredentialType hex + non-empty + ≤ 128 chars
 *      - Subject + Issuer both optional (at-least-one)
 */
import { describe, it, expect } from 'vitest';
import { credentialDelete } from '../../src/fp/factories/credential-delete.js';

const ACCOUNT = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const SUBJECT = 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn';
const ISSUER = 'ra5nK24KXen9AHvsdFTKHSANinZseWnPcX';
const CRED_TYPE = '6D795F63726564656E7469616F'; // hex("my_credentiao") -- 9 bytes

function make(extras: Record<string, unknown> = {}) {
  return credentialDelete({
    Account: ACCOUNT,
    Subject: SUBJECT,
    CredentialType: CRED_TYPE,
    ...extras,
  });
}

describe('fp/credentialDelete()', () => {
  describe('construction', () => {
    it('constructs with required fields (Account + CredentialType + Subject)', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('CredentialDelete');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.Subject).toBe(SUBJECT);
      expect(tx.CredentialType).toBe(CRED_TYPE);
    });

    it('constructs with only Account + Issuer (Subject omitted)', () => {
      const tx = credentialDelete({
        Account: ACCOUNT,
        Issuer: ISSUER,
        CredentialType: CRED_TYPE,
      });
      expect(tx.TransactionType).toBe('CredentialDelete');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.Issuer).toBe(ISSUER);
      expect(tx.Subject).toBeUndefined();
    });

    it('constructs with both Subject and Issuer', () => {
      const tx = make({ Issuer: ISSUER });
      expect(tx.Subject).toBe(SUBJECT);
      expect(tx.Issuer).toBe(ISSUER);
    });

    it('accepts Fee and Sequence', () => {
      const tx = make({ Fee: '12', Sequence: 7 });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(7);
    });

    it('accepts every spec field together', () => {
      const tx = credentialDelete({
        Account: ACCOUNT,
        Subject: SUBJECT,
        Issuer: ISSUER,
        CredentialType: CRED_TYPE,
        Fee: '15',
        Sequence: 234203,
      });
      expect(tx.TransactionType).toBe('CredentialDelete');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.Subject).toBe(SUBJECT);
      expect(tx.Issuer).toBe(ISSUER);
      expect(tx.CredentialType).toBe(CRED_TYPE);
      expect(tx.Fee).toBe('15');
      expect(tx.Sequence).toBe(234203);
    });
  });

  describe('Account validation', () => {
    it('throws when Account is missing', () => {
      expect(() =>
        credentialDelete({
          Account: undefined as unknown as string,
          Subject: SUBJECT,
          CredentialType: CRED_TYPE,
        }),
      ).toThrow(/Account is required/);
    });

    it('throws when Account is not a valid XRPL address', () => {
      expect(() =>
        make({ Account: 'not-an-address' }),
      ).toThrow(/Account/);
    });
  });

  describe('Subject / Issuer validation', () => {
    // ── Factory-only divergence from the class API ──
    it('throws when BOTH Subject and Issuer are omitted (XLS-0070 §5.1)', () => {
      expect(() =>
        credentialDelete({
          Account: ACCOUNT,
          CredentialType: CRED_TYPE,
        }),
      ).toThrow(/Subject or Issuer/);
    });

    it('throws when Subject is provided but malformed', () => {
      expect(() => make({ Subject: 'not-an-address' })).toThrow(/Subject/);
    });

    it('throws when Issuer is provided but malformed', () => {
      expect(() =>
        credentialDelete({
          Account: ACCOUNT,
          Issuer: 'not-an-address',
          CredentialType: CRED_TYPE,
        }),
      ).toThrow(/Issuer/);
    });

    it('accepts Subject === Account (self-issued, deleting own subject)', () => {
      const tx = credentialDelete({
        Account: ACCOUNT,
        Subject: ACCOUNT,
        CredentialType: CRED_TYPE,
      });
      expect(tx.Subject).toBe(ACCOUNT);
    });

    it('accepts Issuer === Account (self-issued, deleting own issuer)', () => {
      const tx = credentialDelete({
        Account: ACCOUNT,
        Issuer: ACCOUNT,
        CredentialType: CRED_TYPE,
      });
      expect(tx.Issuer).toBe(ACCOUNT);
    });
  });

  describe('CredentialType validation', () => {
    it('throws when CredentialType is missing', () => {
      expect(() =>
        credentialDelete({
          Account: ACCOUNT,
          Subject: SUBJECT,
          CredentialType: undefined as unknown as string,
        }),
      ).toThrow(/CredentialType/);
    });

    it('throws when CredentialType is a non-string', () => {
      expect(() =>
        make({ CredentialType: 12345 as unknown as string }),
      ).toThrow(/CredentialType/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws on empty CredentialType (XLS-0070 §2.1.3)', () => {
      expect(() => make({ CredentialType: '' })).toThrow(/non-empty/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws on non-hex CredentialType', () => {
      expect(() => make({ CredentialType: 'zznothex' })).toThrow(/hex/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws on CredentialType > 64 bytes (128 hex chars)', () => {
      const tooLong = 'A'.repeat(130); // 130 hex chars = 65 bytes
      expect(() => make({ CredentialType: tooLong })).toThrow(/exceeds/);
    });

    it('accepts CredentialType at exactly 64 bytes (128 hex chars)', () => {
      const ok = 'A'.repeat(128); // 128 hex chars = 64 bytes
      const tx = make({ CredentialType: ok });
      expect(tx.CredentialType).toBe(ok);
    });

    it('accepts CredentialType at 1 byte (smallest non-empty)', () => {
      const ok = '41'; // 'A' = 0x41, 1 byte
      const tx = make({ CredentialType: ok });
      expect(tx.CredentialType).toBe(ok);
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
        (tx as unknown as Record<string, unknown>).CredentialType = 'x';
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides', () => {
      const tx = make();
      const tx2 = tx.with({ Fee: '99' });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Fee).toBe('99');
      expect(tx.Fee).toBeUndefined();
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      // At-least-one rule: removing both Subject and Issuer must fail.
      expect(() =>
        tx.with({ Subject: undefined, Issuer: undefined }),
      ).toThrow(/Subject or Issuer/);
      // Empty CredentialType must fail.
      expect(() => tx.with({ CredentialType: '' })).toThrow(/non-empty/);
      // Non-hex CredentialType must fail.
      expect(() => tx.with({ CredentialType: 'zz' })).toThrow(/hex/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = credentialDelete({
        Account: ACCOUNT,
        Subject: SUBJECT,
        Issuer: ISSUER,
        CredentialType: CRED_TYPE,
        Fee: '15',
        Sequence: 234203,
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'CredentialDelete',
        Account: ACCOUNT,
        Subject: SUBJECT,
        Issuer: ISSUER,
        CredentialType: CRED_TYPE,
        Fee: '15',
        Sequence: 234203,
      });
    });

    it('.toJSON() omits omitted Subject or Issuer', () => {
      const tx = credentialDelete({
        Account: ACCOUNT,
        Issuer: ISSUER,
        CredentialType: CRED_TYPE,
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'CredentialDelete',
        Account: ACCOUNT,
        Issuer: ISSUER,
        CredentialType: CRED_TYPE,
      });
      expect('Subject' in json).toBe(false);
    });

    it('.toJSON() skips undefined optional fields (Fee, Sequence)', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });
  });
});