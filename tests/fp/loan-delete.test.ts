/**
 * Tests for the functional LoanDelete factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, LoanID).
 *   2. LoanID validation: 64-char hex + non-zero.
 *   3. Account validation.
 *   4. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined values).
 *   5. Ledger-specific preclaim check the class skips: LoanID must not
 *      be the all-zeros HASH256 value (XLS-66 §3.9.3.1 check 1).
 */
import { describe, it, expect } from 'vitest';
import { loanDelete } from '../../src/fp/index.js';

const ACCOUNT = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

// 64-char hex ledger entry ID, non-zero.
const LOAN_ID =
  '000004D417A9CE049C9A71A62B004659B5F1AAAB1BEA1EFDE4E01EB3497FD999';

const ALL_ZEROS_LOAN_ID =
  '0000000000000000000000000000000000000000000000000000000000000000';

function make(extras: Record<string, unknown> = {}) {
  return loanDelete({
    Account: ACCOUNT,
    LoanID: LOAN_ID,
    ...extras,
  });
}

describe('fp/loanDelete()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('LoanDelete');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.LoanID).toBe(LOAN_ID);
    });

    it('accepts every spec field together', () => {
      const tx = loanDelete({
        Account: ACCOUNT,
        LoanID: LOAN_ID,
        Fee: '12',
        Sequence: 42,
      });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(42);
    });

    it('exposes no Flags field on the tx object', () => {
      // LoanDelete has no per-tx Flags per XLS-66 §3.9.
      const tx = make();
      expect(tx.Flags).toBeUndefined();
      expect('Flags' in tx).toBe(false);
    });

    it('does not include Account in optional-field namespace', () => {
      // Account is required; if missing the factory must throw, not
      // silently set it to undefined.
      expect(() =>
        loanDelete({
          Account: '',
          LoanID: LOAN_ID,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        loanDelete({
          Account: '',
          LoanID: LOAN_ID,
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      expect(() =>
        loanDelete({
          Account: 'not-an-account',
          LoanID: LOAN_ID,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('LoanID validation', () => {
    it('throws on missing LoanID', () => {
      expect(() =>
        loanDelete({
          Account: ACCOUNT,
          LoanID: '' as never,
        }),
      ).toThrow(/LoanID/);
    });

    it('throws on non-hex LoanID', () => {
      expect(() =>
        loanDelete({
          Account: ACCOUNT,
          LoanID: 'Z'.repeat(64),
        }),
      ).toThrow(/LoanID/);
    });

    it('throws on wrong-length LoanID', () => {
      expect(() =>
        loanDelete({
          Account: ACCOUNT,
          LoanID: 'AB',
        }),
      ).toThrow(/LoanID/);
    });

    it('throws on all-zeros LoanID (XLS-66 §3.9.3.1 check 1)', () => {
      // The class API accepts this because isHex('0...0') is true and
      // its length is 64. The factory rejects it per spec.
      expect(() =>
        loanDelete({
          Account: ACCOUNT,
          LoanID: ALL_ZEROS_LOAN_ID,
        }),
      ).toThrow(/all-zeros/);
    });

    it('accepts a 64-char hex LoanID with mixed case', () => {
      const tx = loanDelete({
        Account: ACCOUNT,
        LoanID:
          'aBcDeF1234567890ABCDEF1234567890ABCDEF1234567890abcdef1234567890',
      });
      expect(tx.LoanID.toLowerCase()).toBe(
        'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      );
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
        (tx as unknown as Record<string, unknown>).LoanID = 'B'.repeat(64);
      }).toThrow(TypeError);
    });

    it('mutation throws when overwriting Account too', () => {
      const tx = make();
      expect(() => {
        (tx as unknown as Record<string, unknown>).Account =
          'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
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

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() => tx.with({ LoanID: ALL_ZEROS_LOAN_ID })).toThrow(
        /all-zeros/,
      );
    });

    it('.with() re-validates Account on overrides', () => {
      const tx = make();
      expect(() => tx.with({ Account: 'garbage' })).toThrow(/Account/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = loanDelete({
        Account: ACCOUNT,
        LoanID: LOAN_ID,
        Fee: '15',
        Sequence: 7,
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'LoanDelete',
        Account: ACCOUNT,
        LoanID: LOAN_ID,
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

    it('.validate() is a no-op (no throw after construction)', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });
});
