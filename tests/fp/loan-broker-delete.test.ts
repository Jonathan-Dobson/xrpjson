/**
 * Tests for the functional LoanBrokerDelete factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, LoanBrokerID).
 *   2. LoanBrokerID shape (64-char hex, non-zero per XLS-66 §3.4.3.1).
 *   3. Account validation.
 *   4. Optional fields (Fee, Sequence, Flags) pass through.
 *   5. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined values).
 */
import { describe, it, expect } from 'vitest';
import { loanBrokerDelete } from '../../src/fp/index.js';

const OWNER = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

// 64-char hex ledger entry ID (non-zero).
const LOAN_BROKER_ID =
  'E9A08C918E26407493CC4ADD381BA979CFEB7E440D0863B01FB31C231D167E42';

// All-zeros HASH256 — must be rejected per XLS-66 §3.4.3.1.
const LOAN_BROKER_ID_ZERO =
  '0000000000000000000000000000000000000000000000000000000000000000';

function make(extras: Record<string, unknown> = {}) {
  return loanBrokerDelete({
    Account: OWNER,
    LoanBrokerID: LOAN_BROKER_ID,
    ...extras,
  });
}

describe('fp/loanBrokerDelete()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('LoanBrokerDelete');
      expect(tx.Account).toBe(OWNER);
      expect(tx.LoanBrokerID).toBe(LOAN_BROKER_ID);
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
        loanBrokerDelete({
          Account: '' as never,
          LoanBrokerID: LOAN_BROKER_ID,
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      expect(() =>
        loanBrokerDelete({
          Account: 'not-an-account',
          LoanBrokerID: LOAN_BROKER_ID,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('LoanBrokerID validation', () => {
    it('throws on missing LoanBrokerID', () => {
      expect(() =>
        loanBrokerDelete({
          Account: OWNER,
          LoanBrokerID: '' as never,
        }),
      ).toThrow(/LoanBrokerID/);
    });

    it('throws on non-hex LoanBrokerID', () => {
      expect(() =>
        loanBrokerDelete({
          Account: OWNER,
          LoanBrokerID: 'Z'.repeat(64),
        }),
      ).toThrow(/LoanBrokerID/);
    });

    it('throws on wrong-length LoanBrokerID (too short)', () => {
      expect(() =>
        loanBrokerDelete({
          Account: OWNER,
          LoanBrokerID: 'AB',
        }),
      ).toThrow(/LoanBrokerID/);
    });

    it('throws on wrong-length LoanBrokerID (too long)', () => {
      expect(() =>
        loanBrokerDelete({
          Account: OWNER,
          LoanBrokerID: 'A'.repeat(66),
        }),
      ).toThrow(/LoanBrokerID/);
    });

    it('throws on all-zeros LoanBrokerID (XLS-66 §3.4.3.1 check 1)', () => {
      expect(() =>
        loanBrokerDelete({
          Account: OWNER,
          LoanBrokerID: LOAN_BROKER_ID_ZERO,
        }),
      ).toThrow(/LoanBrokerID.*zero/i);
    });

    it('accepts a non-zero 64-char hex LoanBrokerID', () => {
      const tx = make();
      expect(tx.LoanBrokerID).toBe(LOAN_BROKER_ID);
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
        (tx as unknown as Record<string, unknown>).LoanBrokerID = 'B'.repeat(64);
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

    it('.with() re-validates on overrides (zero ID rejected)', () => {
      const tx = make();
      expect(() =>
        tx.with({ LoanBrokerID: LOAN_BROKER_ID_ZERO }),
      ).toThrow(/zero/i);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({ Fee: '12', Sequence: 7 });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'LoanBrokerDelete',
        Account: OWNER,
        LoanBrokerID: LOAN_BROKER_ID,
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