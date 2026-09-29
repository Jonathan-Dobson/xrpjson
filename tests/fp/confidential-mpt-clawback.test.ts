/**
 * Tests for the functional ConfidentialMptClawback factory.
 *
 * Validates:
 *   1. Construction with all required fields (Account, Holder,
 *      MPTokenIssuanceID, MPTAmount, ZKProof).
 *   2. Account validation (classic address, X-address, missing, malformed).
 *   3. Holder validation (classic address, missing, malformed,
 *      same-as-Account).
 *   4. MPTokenIssuanceID validation: 48-char hex (UInt192), missing,
 *      wrong length, non-hex.
 *   5. MPTAmount validation: integer, non-zero, ≤ MAX_MPT_AMOUNT, decimal
 *      rejection.
 *   6. ZKProof validation: 128-char hex (64 bytes), missing, wrong
 *      length, non-hex.
 *   7. Frozen-shape contract (frozen object, mutation throws, .with()
 *      returns a new frozen object, .toJSON() strips methods and
 *      undefined fields).
 *   8. .with() re-validates on overrides.
 *
 * NOTE: imports the factory file directly (not via `src/fp/index.ts`) per
 * the worker-fanout policy (no shared write target).
 */
import { describe, it, expect } from 'vitest';
import { confidentialMptClawback } from '../../src/fp/factories/confidential-mpt-clawback.js';

// ─── Test fixtures ───────────────────────────────────────────────────

// Issuer / submitter account (classic address).
const ACCOUNT = 'rWYkbWkCeg8dP6rXALnjgZSjjLyih5NXm';

// A different account being clawed back from.
const HOLDER = 'rfkE1aSy9G8Upk4JssnwBxhEv5p4mn2KTy';

// 48-character hex MPT issuance ID (UInt192). Issuer portion (last 40
// hex chars) does not need to decode to ACCOUNT for the factory to accept it
// (that guard is documented as NOT IMPLEMENTED in the factory header).
const MPT_ID = '000004C40596915CFDEEE3A695B3EFD6BDA9AC788A368B7B';

// 64-byte ZKProof, hex-encoded to 128 chars.
const ZK_PROOF = 'AB'.repeat(64);

function make(extras: Record<string, unknown> = {}) {
  return confidentialMptClawback({
    Account: ACCOUNT,
    Holder: HOLDER,
    MPTokenIssuanceID: MPT_ID,
    MPTAmount: '100',
    ZKProof: ZK_PROOF,
    ...extras,
  });
}

describe('fp/confidentialMptClawback()', () => {
  describe('construction', () => {
    it('constructs with all required fields', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('ConfidentialMPTClawback');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.Holder).toBe(HOLDER);
      expect(tx.MPTokenIssuanceID).toBe(MPT_ID);
      expect(tx.MPTAmount).toBe('100');
      expect(tx.ZKProof).toBe(ZK_PROOF);
      expect(tx.Fee).toBeUndefined();
      expect(tx.Sequence).toBeUndefined();
    });

    it('constructs with base-tx fields (Fee, Sequence)', () => {
      const tx = confidentialMptClawback({
        Account: ACCOUNT,
        Holder: HOLDER,
        MPTokenIssuanceID: MPT_ID,
        MPTAmount: '100',
        ZKProof: ZK_PROOF,
        Fee: '100',
        Sequence: 42,
      });
      expect(tx.Fee).toBe('100');
      expect(tx.Sequence).toBe(42);
    });

    it('exposes no Flags field (ConfidentialMPTClawback has no per-tx flags)', () => {
      // XLS-0096 §12.2 defines no `Flags` field for this tx type.
      const tx = make();
      expect(tx.Flags).toBeUndefined();
      expect('Flags' in tx).toBe(false);
    });

    it('accepts lowercase hex MPTokenIssuanceID', () => {
      const tx = confidentialMptClawback({
        Account: ACCOUNT,
        Holder: HOLDER,
        MPTokenIssuanceID: MPT_ID.toLowerCase(),
        MPTAmount: '100',
        ZKProof: ZK_PROOF,
      });
      expect(tx.MPTokenIssuanceID).toBe(MPT_ID.toLowerCase());
    });

    it('accepts mixed-case hex MPTokenIssuanceID and ZKProof', () => {
      const tx = confidentialMptClawback({
        Account: ACCOUNT,
        Holder: HOLDER,
        MPTokenIssuanceID:
          '003CE807d39d78123ffbdd9401BEC038D88BD328AC353b9c',
        MPTAmount: '100',
        ZKProof: ZK_PROOF.toLowerCase(),
      });
      expect(tx.MPTokenIssuanceID.length).toBe(48);
      expect(tx.ZKProof.length).toBe(128);
    });

    it('accepts an X-address Account and Holder', () => {
      const tx = confidentialMptClawback({
        Account: 'X7Acg9t9WtR2Y4HXUsScrU5KhH4PmgBxX3RcL8soFpPJz8X',
        Holder: 'X7Acg9t9WtR2Y4HXUsScrU5KhH4PmgBxX3RcL8soFpPJz8Y',
        MPTokenIssuanceID: MPT_ID,
        MPTAmount: '100',
        ZKProof: ZK_PROOF,
      });
      expect(tx.Account).toBe(
        'X7Acg9t9WtR2Y4HXUsScrU5KhH4PmgBxX3RcL8soFpPJz8X',
      );
      expect(tx.Holder).toBe(
        'X7Acg9t9WtR2Y4HXUsScrU5KhH4PmgBxX3RcL8soFpPJz8Y',
      );
    });
  });

  describe('Account validation', () => {
    it('throws when Account is missing (empty string)', () => {
      expect(() =>
        confidentialMptClawback({
          Account: '',
          Holder: HOLDER,
          MPTokenIssuanceID: MPT_ID,
          MPTAmount: '100',
          ZKProof: ZK_PROOF,
        }),
      ).toThrow(/Account/);
    });

    it('throws when Account is undefined', () => {
      expect(() =>
        confidentialMptClawback({
          Account: undefined as never,
          Holder: HOLDER,
          MPTokenIssuanceID: MPT_ID,
          MPTAmount: '100',
          ZKProof: ZK_PROOF,
        }),
      ).toThrow(/Account/);
    });

    it('throws when Account is malformed', () => {
      expect(() =>
        confidentialMptClawback({
          Account: 'not-an-address',
          Holder: HOLDER,
          MPTokenIssuanceID: MPT_ID,
          MPTAmount: '100',
          ZKProof: ZK_PROOF,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('Holder validation', () => {
    it('throws when Holder is missing (empty string)', () => {
      expect(() =>
        confidentialMptClawback({
          Account: ACCOUNT,
          Holder: '',
          MPTokenIssuanceID: MPT_ID,
          MPTAmount: '100',
          ZKProof: ZK_PROOF,
        }),
      ).toThrow(/Holder/);
    });

    it('throws when Holder is undefined', () => {
      expect(() =>
        confidentialMptClawback({
          Account: ACCOUNT,
          Holder: undefined as never,
          MPTokenIssuanceID: MPT_ID,
          MPTAmount: '100',
          ZKProof: ZK_PROOF,
        }),
      ).toThrow(/Holder/);
    });

    it('throws when Holder is malformed', () => {
      expect(() =>
        confidentialMptClawback({
          Account: ACCOUNT,
          Holder: 'bogus',
          MPTokenIssuanceID: MPT_ID,
          MPTAmount: '100',
          ZKProof: ZK_PROOF,
        }),
      ).toThrow(/Holder/);
    });

    it('throws when Holder equals Account (self-clawback forbidden)', () => {
      expect(() =>
        confidentialMptClawback({
          Account: ACCOUNT,
          Holder: ACCOUNT,
          MPTokenIssuanceID: MPT_ID,
          MPTAmount: '100',
          ZKProof: ZK_PROOF,
        }),
      ).toThrow(/Holder and Account must be different/);
    });
  });

  describe('MPTokenIssuanceID validation', () => {
    it('throws when MPTokenIssuanceID is missing (empty string)', () => {
      expect(() =>
        confidentialMptClawback({
          Account: ACCOUNT,
          Holder: HOLDER,
          MPTokenIssuanceID: '',
          MPTAmount: '100',
          ZKProof: ZK_PROOF,
        }),
      ).toThrow(/MPTokenIssuanceID/);
    });

    it('throws when MPTokenIssuanceID is undefined', () => {
      expect(() =>
        confidentialMptClawback({
          Account: ACCOUNT,
          Holder: HOLDER,
          MPTokenIssuanceID: undefined as never,
          MPTAmount: '100',
          ZKProof: ZK_PROOF,
        }),
      ).toThrow(/MPTokenIssuanceID/);
    });

    it('throws when MPTokenIssuanceID is too short (47 hex chars)', () => {
      expect(() =>
        confidentialMptClawback({
          Account: ACCOUNT,
          Holder: HOLDER,
          MPTokenIssuanceID: 'AB'.repeat(23) + 'A', // 47 chars
          MPTAmount: '100',
          ZKProof: ZK_PROOF,
        }),
      ).toThrow(/48-character hex/);
    });

    it('throws when MPTokenIssuanceID is too long (49 hex chars)', () => {
      expect(() =>
        confidentialMptClawback({
          Account: ACCOUNT,
          Holder: HOLDER,
          MPTokenIssuanceID: 'AB'.repeat(24) + 'A', // 49 chars
          MPTAmount: '100',
          ZKProof: ZK_PROOF,
        }),
      ).toThrow(/48-character hex/);
    });

    it('throws when MPTokenIssuanceID is non-hex', () => {
      expect(() =>
        confidentialMptClawback({
          Account: ACCOUNT,
          Holder: HOLDER,
          MPTokenIssuanceID: 'Z'.repeat(48),
          MPTAmount: '100',
          ZKProof: ZK_PROOF,
        }),
      ).toThrow(/48-character hex/);
    });

    it('throws when MPTokenIssuanceID is a number, not a string', () => {
      expect(() =>
        confidentialMptClawback({
          Account: ACCOUNT,
          Holder: HOLDER,
          MPTokenIssuanceID: 12345 as never,
          MPTAmount: '100',
          ZKProof: ZK_PROOF,
        }),
      ).toThrow(/MPTokenIssuanceID/);
    });
  });

  describe('MPTAmount validation', () => {
    it('throws when MPTAmount is missing (empty string)', () => {
      expect(() =>
        confidentialMptClawback({
          Account: ACCOUNT,
          Holder: HOLDER,
          MPTokenIssuanceID: MPT_ID,
          MPTAmount: '',
          ZKProof: ZK_PROOF,
        }),
      ).toThrow(/MPTAmount/);
    });

    it('throws when MPTAmount is undefined', () => {
      expect(() =>
        confidentialMptClawback({
          Account: ACCOUNT,
          Holder: HOLDER,
          MPTokenIssuanceID: MPT_ID,
          MPTAmount: undefined as never,
          ZKProof: ZK_PROOF,
        }),
      ).toThrow(/MPTAmount/);
    });

    it('throws when MPTAmount is zero (clawback forbids zero)', () => {
      expect(() =>
        confidentialMptClawback({
          Account: ACCOUNT,
          Holder: HOLDER,
          MPTokenIssuanceID: MPT_ID,
          MPTAmount: '0',
          ZKProof: ZK_PROOF,
        }),
      ).toThrow(/non-zero/);
    });

    it('throws when MPTAmount is out of range (MAX+1)', () => {
      expect(() =>
        confidentialMptClawback({
          Account: ACCOUNT,
          Holder: HOLDER,
          MPTokenIssuanceID: MPT_ID,
          // One past the max uint64 MPT amount (9223372036854775807).
          MPTAmount: '9223372036854775808',
          ZKProof: ZK_PROOF,
        }),
      ).toThrow(/out of range/);
    });

    it('accepts MPTAmount at the MAX boundary', () => {
      const tx = confidentialMptClawback({
        Account: ACCOUNT,
        Holder: HOLDER,
        MPTokenIssuanceID: MPT_ID,
        MPTAmount: '9223372036854775807',
        ZKProof: ZK_PROOF,
      });
      expect(tx.MPTAmount).toBe('9223372036854775807');
    });

    it('throws when MPTAmount is non-numeric (decimal)', () => {
      expect(() =>
        confidentialMptClawback({
          Account: ACCOUNT,
          Holder: HOLDER,
          MPTokenIssuanceID: MPT_ID,
          MPTAmount: '1.5',
          ZKProof: ZK_PROOF,
        }),
      ).toThrow(/non-negative base-10 integer/);
    });

    it('throws when MPTAmount is negative', () => {
      expect(() =>
        confidentialMptClawback({
          Account: ACCOUNT,
          Holder: HOLDER,
          MPTokenIssuanceID: MPT_ID,
          MPTAmount: '-100',
          ZKProof: ZK_PROOF,
        }),
      ).toThrow(/non-negative base-10 integer/);
    });

    it('throws when MPTAmount is alphabetic', () => {
      expect(() =>
        confidentialMptClawback({
          Account: ACCOUNT,
          Holder: HOLDER,
          MPTokenIssuanceID: MPT_ID,
          MPTAmount: 'abc',
          ZKProof: ZK_PROOF,
        }),
      ).toThrow(/non-negative base-10 integer/);
    });
  });

  describe('ZKProof validation', () => {
    it('throws when ZKProof is missing (empty string)', () => {
      expect(() =>
        confidentialMptClawback({
          Account: ACCOUNT,
          Holder: HOLDER,
          MPTokenIssuanceID: MPT_ID,
          MPTAmount: '100',
          ZKProof: '',
        }),
      ).toThrow(/ZKProof/);
    });

    it('throws when ZKProof is undefined', () => {
      expect(() =>
        confidentialMptClawback({
          Account: ACCOUNT,
          Holder: HOLDER,
          MPTokenIssuanceID: MPT_ID,
          MPTAmount: '100',
          ZKProof: undefined as never,
        }),
      ).toThrow(/ZKProof/);
    });

    it('throws when ZKProof is too short (127 chars)', () => {
      expect(() =>
        confidentialMptClawback({
          Account: ACCOUNT,
          Holder: HOLDER,
          MPTokenIssuanceID: MPT_ID,
          MPTAmount: '100',
          ZKProof: 'AB'.repeat(63) + 'A', // 127 chars
        }),
      ).toThrow(/128-character hex/);
    });

    it('throws when ZKProof is too long (129 chars)', () => {
      expect(() =>
        confidentialMptClawback({
          Account: ACCOUNT,
          Holder: HOLDER,
          MPTokenIssuanceID: MPT_ID,
          MPTAmount: '100',
          ZKProof: 'AB'.repeat(64) + 'A', // 129 chars
        }),
      ).toThrow(/128-character hex/);
    });

    it('throws when ZKProof is non-hex', () => {
      expect(() =>
        confidentialMptClawback({
          Account: ACCOUNT,
          Holder: HOLDER,
          MPTokenIssuanceID: MPT_ID,
          MPTAmount: '100',
          ZKProof: 'nothex',
        }),
      ).toThrow(/ZKProof/);
    });

    it('throws when ZKProof is non-hex at full length', () => {
      expect(() =>
        confidentialMptClawback({
          Account: ACCOUNT,
          Holder: HOLDER,
          MPTokenIssuanceID: MPT_ID,
          MPTAmount: '100',
          ZKProof: 'Z'.repeat(128),
        }),
      ).toThrow(/128-character hex/);
    });
  });

  describe('frozen-shape contract', () => {
    it('returns a frozen object', () => {
      const tx = make();
      expect(Object.isFrozen(tx)).toBe(true);
    });

    it('mutation throws in strict mode (MPTokenIssuanceID)', () => {
      const tx = make();
      expect(() => {
        (tx as unknown as Record<string, unknown>).MPTokenIssuanceID =
          'CD'.repeat(24);
      }).toThrow(TypeError);
    });

    it('mutation throws in strict mode (MPTAmount)', () => {
      const tx = make();
      expect(() => {
        (tx as unknown as Record<string, unknown>).MPTAmount = '999999';
      }).toThrow(TypeError);
    });

    it('mutation throws in strict mode (TransactionType)', () => {
      const tx = make();
      expect(() => {
        (tx as unknown as Record<string, unknown>).TransactionType = 'Payment';
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

    it('.with() preserves unchanged fields', () => {
      const tx = make({ Fee: '15', Sequence: 7 });
      const tx2 = tx.with({ Fee: '30' });
      expect(tx2.Account).toBe(ACCOUNT);
      expect(tx2.Holder).toBe(HOLDER);
      expect(tx2.MPTokenIssuanceID).toBe(MPT_ID);
      expect(tx2.MPTAmount).toBe('100');
      expect(tx2.ZKProof).toBe(ZK_PROOF);
      expect(tx2.Sequence).toBe(7);
      expect(tx2.Fee).toBe('30');
    });

    it('.with() re-validates on overrides (Holder)', () => {
      const tx = make();
      expect(() => tx.with({ Holder: 'garbage' })).toThrow(/Holder/);
    });

    it('.with() re-validates on overrides (MPTAmount = 0)', () => {
      const tx = make();
      expect(() => tx.with({ MPTAmount: '0' })).toThrow(/non-zero/);
    });

    it('.with() re-validates on overrides (self-clawback)', () => {
      const tx = make();
      expect(() => tx.with({ Holder: ACCOUNT })).toThrow(
        /Holder and Account must be different/,
      );
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = confidentialMptClawback({
        Account: ACCOUNT,
        Holder: HOLDER,
        MPTokenIssuanceID: MPT_ID,
        MPTAmount: '100',
        ZKProof: ZK_PROOF,
        Fee: '15',
        Sequence: 7,
      });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'ConfidentialMPTClawback',
        Account: ACCOUNT,
        Holder: HOLDER,
        MPTokenIssuanceID: MPT_ID,
        MPTAmount: '100',
        ZKProof: ZK_PROOF,
        Fee: '15',
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

    it('.validate() is a no-op after successful construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });

    it('exposes exactly three methods: validate, toJSON, with', () => {
      const tx = make();
      const methodNames = Object.keys(tx).filter(
        (k) => typeof (tx as unknown as Record<string, unknown>)[k] === 'function',
      );
      expect(methodNames.sort()).toEqual(['toJSON', 'validate', 'with']);
    });
  });
});