/**
 * Tests for the functional MPTokenIssuanceDestroy factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, MPTokenIssuanceID).
 *   2. MPTokenIssuanceID shape (48-char hex / UINT192, non-zero).
 *   3. Account validation (classic or X-address).
 *   4. Optional fields (Fee, Sequence, Flags) pass through.
 *   5. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined values).
 *
 * Per XLS-0033 §3.2.1, MPTokenIssuanceID is the only transaction-specific
 * field (UINT192 — 24 bytes / 48 hex chars). TransactionType is 55.
 */
import { describe, it, expect } from 'vitest';
import { mptokenIssuanceDestroy } from '../../src/fp/factories/mptoken-issuance-destroy.js';

const ISSUER = 'rNFta7UKwcoiCpxEYbhH2v92numE3cceB6';

// 48-char hex UINT192 (4-byte sequence + 20-byte issuer AccountID).
// Example id from XLS-0033 §3.2.2 and the xrpl.org docs.
const VALID_MP_TOKEN_ISSUANCE_ID =
  '000004C463C52827307480341125DA0577DEFC38405B0E3E';

// All-zeros UINT192 — must be rejected.
const ZERO_MP_TOKEN_ISSUANCE_ID = '0'.repeat(48);

function make(extras: Record<string, unknown> = {}) {
  return mptokenIssuanceDestroy({
    Account: ISSUER,
    MPTokenIssuanceID: VALID_MP_TOKEN_ISSUANCE_ID,
    ...extras,
  });
}

describe('fp/mptokenIssuanceDestroy()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('MPTokenIssuanceDestroy');
      expect(tx.Account).toBe(ISSUER);
      expect(tx.MPTokenIssuanceID).toBe(VALID_MP_TOKEN_ISSUANCE_ID);
    });

    it('accepts Fee and Sequence', () => {
      const tx = make({ Fee: '12', Sequence: 7 });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(7);
    });

    it('accepts numeric Flags (spec defines none)', () => {
      const tx = make({ Flags: 0 });
      expect(tx.Flags).toBe(0);
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        mptokenIssuanceDestroy({
          Account: '' as never,
          MPTokenIssuanceID: VALID_MP_TOKEN_ISSUANCE_ID,
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      expect(() =>
        mptokenIssuanceDestroy({
          Account: 'not-an-account',
          MPTokenIssuanceID: VALID_MP_TOKEN_ISSUANCE_ID,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('MPTokenIssuanceID validation', () => {
    it('throws on missing MPTokenIssuanceID', () => {
      expect(() =>
        mptokenIssuanceDestroy({
          Account: ISSUER,
          MPTokenIssuanceID: '' as never,
        }),
      ).toThrow(/MPTokenIssuanceID/);
    });

    it('throws on non-string MPTokenIssuanceID', () => {
      expect(() =>
        mptokenIssuanceDestroy({
          Account: ISSUER,
          MPTokenIssuanceID: 123 as never,
        }),
      ).toThrow(/MPTokenIssuanceID/);
    });

    it('throws on non-hex MPTokenIssuanceID', () => {
      expect(() =>
        mptokenIssuanceDestroy({
          Account: ISSUER,
          MPTokenIssuanceID: 'Z'.repeat(48),
        }),
      ).toThrow(/MPTokenIssuanceID/);
    });

    it('throws on wrong-length MPTokenIssuanceID (too short)', () => {
      expect(() =>
        mptokenIssuanceDestroy({
          Account: ISSUER,
          MPTokenIssuanceID: 'AB',
        }),
      ).toThrow(/MPTokenIssuanceID/);
    });

    it('throws on wrong-length MPTokenIssuanceID (too long)', () => {
      expect(() =>
        mptokenIssuanceDestroy({
          Account: ISSUER,
          MPTokenIssuanceID: 'A'.repeat(50),
        }),
      ).toThrow(/MPTokenIssuanceID/);
    });

    it('throws on all-zeros MPTokenIssuanceID', () => {
      expect(() =>
        mptokenIssuanceDestroy({
          Account: ISSUER,
          MPTokenIssuanceID: ZERO_MP_TOKEN_ISSUANCE_ID,
        }),
      ).toThrow(/MPTokenIssuanceID.*zero/i);
    });

    it('accepts a non-zero 48-char hex MPTokenIssuanceID', () => {
      const tx = make();
      expect(tx.MPTokenIssuanceID).toBe(VALID_MP_TOKEN_ISSUANCE_ID);
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
        (tx as unknown as Record<string, unknown>).MPTokenIssuanceID =
          'B'.repeat(48);
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      const tx = make();
      const tx2 = tx.with({ Fee: '20' });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Fee).toBe('20');
      expect(tx.Fee).toBeUndefined();
    });

    it('.with() re-validates on overrides (zero id rejected)', () => {
      const tx = make();
      expect(() =>
        tx.with({ MPTokenIssuanceID: ZERO_MP_TOKEN_ISSUANCE_ID }),
      ).toThrow(/zero/i);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({ Fee: '12', Sequence: 7 });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'MPTokenIssuanceDestroy',
        Account: ISSUER,
        MPTokenIssuanceID: VALID_MP_TOKEN_ISSUANCE_ID,
        Fee: '12',
        Sequence: 7,
      });
    });

    it('.toJSON() skips undefined fields and methods', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
      expect('Flags' in json).toBe(false);
    });

    it('.validate() is a no-op (no throw after construction)', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });
});
