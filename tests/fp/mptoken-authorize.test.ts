/**
 * Tests for the functional MPTokenAuthorize factory.
 *
 * Covers:
 *   1. Construction with Account + MPTokenIssuanceID (only required fields).
 *   2. MPTokenIssuanceID format: 48 hex chars, non-zero.
 *   3. Holder validation: optional, valid XRPL address, must differ from Account.
 *   4. Flags passthrough: numeric and FlagsInterface shape both accepted.
 *   5. Frozen-shape contract (frozen, mutation throws,
 *      .with() re-validates, .toJSON() strips).
 *
 * Imports the factory directly (not via the `xrplt/fp` barrel) so this
 * file is safe for parallel-worker fanout — the parent integrates the
 * barrel export after all workers finish.
 */
import { describe, it, expect } from 'vitest';
import { mptokenAuthorize } from '../../src/fp/factories/mptoken-authorize.js';

const HOLDER = 'rWYkbWkCeg8dP6rXALnjgZSjjLyih5NXm';
const ISSUER = 'rajgkBmMxmz161r8bWYH7CQAFZP5bA9oSG';
const VALID_MPT_ISSUANCE_ID = '000004C463C52827307480341125DA0577DEFC38405B0E3E';

function base(overrides: Record<string, unknown> = {}) {
  return mptokenAuthorize({
    Account: HOLDER,
    MPTokenIssuanceID: VALID_MPT_ISSUANCE_ID,
    ...overrides,
  });
}

describe('fp/mptokenAuthorize()', () => {
  describe('construction', () => {
    it('constructs with Account + MPTokenIssuanceID (required fields only)', () => {
      const tx = base();
      expect(tx.TransactionType).toBe('MPTokenAuthorize');
      expect(tx.Account).toBe(HOLDER);
      expect(tx.MPTokenIssuanceID).toBe(VALID_MPT_ISSUANCE_ID);
    });

    it('accepts Holder as a different XRPL address (issuer allow-listing)', () => {
      const tx = base({ Account: ISSUER, Holder: HOLDER });
      expect(tx.Holder).toBe(HOLDER);
      expect(tx.Account).toBe(ISSUER);
    });

    it('accepts numeric Flags (tfMPTUnauthorize)', () => {
      const tx = base({ Flags: 0x00000001 });
      expect(tx.Flags).toBe(0x00000001);
    });

    it('accepts boolean-map FlagsInterface', () => {
      const tx = base({ Flags: { tfMPTUnauthorize: true } });
      expect(tx.Flags).toEqual({ tfMPTUnauthorize: true });
    });

    it('throws when Account is missing', () => {
      expect(() =>
        mptokenAuthorize({
          Account: undefined as never,
          MPTokenIssuanceID: VALID_MPT_ISSUANCE_ID,
        }),
      ).toThrow(/Account is required/);
    });

    it('throws when Account is empty string', () => {
      expect(() =>
        mptokenAuthorize({
          Account: '',
          MPTokenIssuanceID: VALID_MPT_ISSUANCE_ID,
        }),
      ).toThrow(/Account is required/);
    });

    it('throws when MPTokenIssuanceID is missing', () => {
      expect(() =>
        mptokenAuthorize({
          Account: HOLDER,
          MPTokenIssuanceID: undefined as never,
        }),
      ).toThrow(/MPTokenIssuanceID/);
    });
  });

  describe('MPTokenIssuanceID validation', () => {
    it('throws when MPTokenIssuanceID is wrong length (not 48 hex chars)', () => {
      expect(() =>
        base({ MPTokenIssuanceID: 'ABCD' }),
      ).toThrow(/MPTokenIssuanceID/);
    });

    it('throws when MPTokenIssuanceID is 47 chars (one short)', () => {
      const tooShort = VALID_MPT_ISSUANCE_ID.slice(0, 47);
      expect(() => base({ MPTokenIssuanceID: tooShort })).toThrow(
        /MPTokenIssuanceID/,
      );
    });

    it('throws when MPTokenIssuanceID is 49 chars (one long)', () => {
      const tooLong = `${VALID_MPT_ISSUANCE_ID}F`;
      expect(() => base({ MPTokenIssuanceID: tooLong })).toThrow(
        /MPTokenIssuanceID/,
      );
    });

    it('throws when MPTokenIssuanceID contains non-hex characters', () => {
      const bad = `Z${VALID_MPT_ISSUANCE_ID.slice(1)}`;
      expect(() => base({ MPTokenIssuanceID: bad })).toThrow(
        /MPTokenIssuanceID/,
      );
    });

    it('throws when MPTokenIssuanceID is all-zero (48 zeros)', () => {
      const zero = '0'.repeat(48);
      expect(() => base({ MPTokenIssuanceID: zero })).toThrow(
        /MPTokenIssuanceID must not be zero/,
      );
    });

    it('accepts a 48-char uppercase hex string', () => {
      const upper = VALID_MPT_ISSUANCE_ID.toUpperCase();
      const tx = base({ MPTokenIssuanceID: upper });
      expect(tx.MPTokenIssuanceID).toBe(upper);
    });
  });

  describe('Holder validation', () => {
    it('throws when Holder is an invalid XRPL address', () => {
      expect(() => base({ Holder: 'not-a-real-address' })).toThrow(/Holder/);
    });

    it('throws when Holder equals Account (holder opting in for themselves)', () => {
      expect(() => base({ Holder: HOLDER })).toThrow(/Holder/);
    });

    it('accepts Holder when it differs from Account', () => {
      const tx = base({ Holder: ISSUER });
      expect(tx.Holder).toBe(ISSUER);
    });
  });

  describe('frozen-shape contract', () => {
    it('returns a frozen object', () => {
      const tx = base();
      expect(Object.isFrozen(tx)).toBe(true);
    });

    it('mutation throws in strict mode', () => {
      const tx = base();
      expect(() => {
        (tx as unknown as Record<string, unknown>).Account = 'spoof';
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides', () => {
      const tx = base();
      const tx2 = tx.with({ Flags: 0x00000001 });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Flags).toBe(0x00000001);
      expect(tx.Flags).toBeUndefined();
    });

    it('.with() re-validates on overrides (Holder === Account)', () => {
      const tx = base();
      expect(() => tx.with({ Holder: HOLDER })).toThrow(/Holder/);
    });

    it('.with() re-validates MPTokenIssuanceID format on override', () => {
      const tx = base();
      expect(() => tx.with({ MPTokenIssuanceID: '0'.repeat(48) })).toThrow(
        /MPTokenIssuanceID must not be zero/,
      );
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = base({ Flags: 0x00000001, Fee: '10', Sequence: 1 });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'MPTokenAuthorize',
        Account: HOLDER,
        MPTokenIssuanceID: VALID_MPT_ISSUANCE_ID,
        Flags: 0x00000001,
        Fee: '10',
        Sequence: 1,
      });
    });

    it('.toJSON() skips undefined fields', () => {
      const tx = base();
      const json = tx.toJSON();
      expect('Holder' in json).toBe(false);
      expect('Flags' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op (validation already happened at construction)', () => {
      const tx = base();
      expect(() => tx.validate()).not.toThrow();
    });
  });
});
