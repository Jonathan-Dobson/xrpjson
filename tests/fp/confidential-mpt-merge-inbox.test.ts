/**
 * Tests for the functional ConfidentialMptMergeInbox factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, MPTokenIssuanceID).
 *   2. Account validation (classic address, X-address, missing, malformed).
 *   3. MPTokenIssuanceID validation: 48-char hex (UInt192), missing,
 *      wrong length, non-hex.
 *   4. Frozen-shape contract (frozen object, mutation throws,
 *      .with() returns a new frozen object, .toJSON() strips methods
 *      and undefined fields).
 *   5. .with() re-validates on overrides.
 */
import { describe, it, expect } from 'vitest';
import { confidentialMptMergeInbox } from '../../src/fp/factories/confidential-mpt-merge-inbox.js';

// ─── Test fixtures ───────────────────────────────────────────────────

const ACCOUNT = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

// 48-character hex MPT issuance ID (UInt192).
// Same fixture xrpl.js uses in `tests/confidential/mergeInbox.test.ts`.
const MPT_ID = 'AB'.repeat(24);

// An obviously-not-issuer MPTokenIssuanceID for the lender / holder
// account above — first 8 hex chars are the sequence number, last 40
// are the issuer AccountID hex form. We do not decode it; the factory
// only checks structural well-formedness.
const MPT_ID_ALT =
  '003CE807D39D78123FFBDD9401BEC038D88BD328AC353B9C'; // 48 chars

function make(extras: Record<string, unknown> = {}) {
  return confidentialMptMergeInbox({
    Account: ACCOUNT,
    MPTokenIssuanceID: MPT_ID,
    ...extras,
  });
}

describe('fp/confidentialMptMergeInbox()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('ConfidentialMPTMergeInbox');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.MPTokenIssuanceID).toBe(MPT_ID);
      expect(tx.Fee).toBeUndefined();
      expect(tx.Sequence).toBeUndefined();
    });

    it('constructs with base-tx fields (Fee, Sequence)', () => {
      const tx = confidentialMptMergeInbox({
        Account: ACCOUNT,
        MPTokenIssuanceID: MPT_ID,
        Fee: '100',
        Sequence: 42,
      });
      expect(tx.Fee).toBe('100');
      expect(tx.Sequence).toBe(42);
    });

    it('exposes no Flags field (ConfidentialMPTMergeInbox has no per-tx flags)', () => {
      // XLS-0096 §10.2 defines no `Flags` field for this tx type.
      const tx = make();
      expect(tx.Flags).toBeUndefined();
      expect('Flags' in tx).toBe(false);
    });

    it('accepts lowercase hex MPTokenIssuanceID', () => {
      const tx = confidentialMptMergeInbox({
        Account: ACCOUNT,
        MPTokenIssuanceID: MPT_ID.toLowerCase(),
      });
      expect(tx.MPTokenIssuanceID).toBe(MPT_ID.toLowerCase());
    });

    it('accepts mixed-case hex MPTokenIssuanceID', () => {
      const tx = confidentialMptMergeInbox({
        Account: ACCOUNT,
        MPTokenIssuanceID:
          '003CE807d39d78123ffbdd9401BEC038D88BD328AC353b9c',
      });
      expect(tx.MPTokenIssuanceID.length).toBe(48);
    });

    it('accepts an X-address Account', () => {
      const tx = confidentialMptMergeInbox({
        Account:
          'X7Acg9t9WtR2Y4HXUsScrU5KhH4PmgBxX3RcL8soFpPJz8X',
        MPTokenIssuanceID: MPT_ID,
      });
      expect(tx.Account).toBe(
        'X7Acg9t9WtR2Y4HXUsScrU5KhH4PmgBxX3RcL8soFpPJz8X',
      );
    });
  });

  describe('Account validation', () => {
    it('throws when Account is missing (empty string)', () => {
      expect(() =>
        confidentialMptMergeInbox({
          Account: '',
          MPTokenIssuanceID: MPT_ID,
        }),
      ).toThrow(/Account/);
    });

    it('throws when Account is undefined', () => {
      expect(() =>
        confidentialMptMergeInbox({
          Account: undefined as never,
          MPTokenIssuanceID: MPT_ID,
        }),
      ).toThrow(/Account/);
    });

    it('throws when Account is malformed', () => {
      expect(() =>
        confidentialMptMergeInbox({
          Account: 'not-an-address',
          MPTokenIssuanceID: MPT_ID,
        }),
      ).toThrow(/Account/);
    });

    it('throws when Account is the wrong shape (hex string, not classic address)', () => {
      expect(() =>
        confidentialMptMergeInbox({
          Account: 'a'.repeat(40), // looks like an AccountID but not a classic address
          MPTokenIssuanceID: MPT_ID,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('MPTokenIssuanceID validation', () => {
    it('throws when MPTokenIssuanceID is missing (empty string)', () => {
      expect(() =>
        confidentialMptMergeInbox({
          Account: ACCOUNT,
          MPTokenIssuanceID: '',
        }),
      ).toThrow(/MPTokenIssuanceID/);
    });

    it('throws when MPTokenIssuanceID is undefined', () => {
      expect(() =>
        confidentialMptMergeInbox({
          Account: ACCOUNT,
          MPTokenIssuanceID: undefined as never,
        }),
      ).toThrow(/MPTokenIssuanceID/);
    });

    it('throws when MPTokenIssuanceID is too short (47 hex chars)', () => {
      expect(() =>
        confidentialMptMergeInbox({
          Account: ACCOUNT,
          MPTokenIssuanceID: 'AB'.repeat(23) + 'A', // 47 chars
        }),
      ).toThrow(/48-character hex/);
    });

    it('throws when MPTokenIssuanceID is too long (49 hex chars)', () => {
      expect(() =>
        confidentialMptMergeInbox({
          Account: ACCOUNT,
          MPTokenIssuanceID: 'AB'.repeat(24) + 'A', // 49 chars
        }),
      ).toThrow(/48-character hex/);
    });

    it('throws when MPTokenIssuanceID is non-hex', () => {
      expect(() =>
        confidentialMptMergeInbox({
          Account: ACCOUNT,
          MPTokenIssuanceID: 'Z'.repeat(48),
        }),
      ).toThrow(/48-character hex/);
    });

    it('throws when MPTokenIssuanceID is the wrong length and non-hex (combined failure)', () => {
      expect(() =>
        confidentialMptMergeInbox({
          Account: ACCOUNT,
          MPTokenIssuanceID: 'not-hex-at-all',
        }),
      ).toThrow(/48-character hex/);
    });

    it('throws when MPTokenIssuanceID is a number, not a string', () => {
      expect(() =>
        confidentialMptMergeInbox({
          Account: ACCOUNT,
          MPTokenIssuanceID: 12345 as never,
        }),
      ).toThrow(/MPTokenIssuanceID/);
    });

    it('accepts a 48-char hex MPTokenIssuanceID matching the spec example', () => {
      const tx = confidentialMptMergeInbox({
        Account: ACCOUNT,
        MPTokenIssuanceID: MPT_ID_ALT,
      });
      expect(tx.MPTokenIssuanceID).toBe(MPT_ID_ALT);
      expect(tx.MPTokenIssuanceID.length).toBe(48);
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
          'CD'.repeat(24);
      }).toThrow(TypeError);
    });

    it('mutation throws when overwriting Account too', () => {
      const tx = make();
      expect(() => {
        (tx as unknown as Record<string, unknown>).Account =
          'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
      }).toThrow(TypeError);
    });

    it('mutation throws when attempting to assign to TransactionType', () => {
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
      expect(tx2.MPTokenIssuanceID).toBe(MPT_ID);
      expect(tx2.Sequence).toBe(7);
      expect(tx2.Fee).toBe('30');
    });

    it('.with() re-validates on overrides (Account)', () => {
      const tx = make();
      expect(() => tx.with({ Account: 'garbage' })).toThrow(/Account/);
    });

    it('.with() re-validates on overrides (MPTokenIssuanceID)', () => {
      const tx = make();
      expect(() => tx.with({ MPTokenIssuanceID: 'too-short' })).toThrow(
        /48-character hex/,
      );
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = confidentialMptMergeInbox({
        Account: ACCOUNT,
        MPTokenIssuanceID: MPT_ID,
        Fee: '15',
        Sequence: 7,
      });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'ConfidentialMPTMergeInbox',
        Account: ACCOUNT,
        MPTokenIssuanceID: MPT_ID,
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