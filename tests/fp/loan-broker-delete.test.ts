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

  // ─── Base transaction fields ──────────────────────────────────────────────
  // `LoanBrokerDeleteProps` extends `BasePropsFields`, so the seven shared base
  // fields are part of this props type: Memos, SourceTag, LastLedgerSequence,
  // AccountTxnID, NetworkID, Delegate and TicketSequence.
  //
  // The factory now CALLS `validateBaseTransaction` as its last check before
  // `buildFrozenTx`, so both directions below are real runtime behaviour: the
  // accept cases must survive the validator, and the reject cases assert the
  // validator's own messages from src/validation/base.ts. Bad values are cast
  // `as any` deliberately — the point is the runtime check, and a type error
  // would make the tests uncompilable.
  describe('BaseTransactionFields', () => {
    const base = { Account: OWNER, LoanBrokerID: LOAN_BROKER_ID };
    const MEMOS = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
    const TXN_ID = 'AB'.repeat(32);
    const DELEGATE = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';

    it('accepts Memos', () => {
      const tx = loanBrokerDelete({ ...base, Memos: MEMOS });
      expect(tx.Memos).toEqual(MEMOS);
      expect(tx.toJSON().Memos).toEqual(MEMOS);
    });

    it('accepts SourceTag', () => {
      const tx = loanBrokerDelete({ ...base, SourceTag: 99 });
      expect(tx.SourceTag).toBe(99);
    });

    it('accepts LastLedgerSequence', () => {
      const tx = loanBrokerDelete({ ...base, LastLedgerSequence: 1_000_000 });
      expect(tx.LastLedgerSequence).toBe(1_000_000);
    });

    it('accepts AccountTxnID', () => {
      const tx = loanBrokerDelete({ ...base, AccountTxnID: TXN_ID });
      expect(tx.AccountTxnID).toBe(TXN_ID);
    });

    it('accepts NetworkID', () => {
      const tx = loanBrokerDelete({ ...base, NetworkID: 1 });
      expect(tx.NetworkID).toBe(1);
    });

    it('accepts a Delegate distinct from Account', () => {
      const tx = loanBrokerDelete({ ...base, Delegate: DELEGATE });
      expect(tx.Delegate).toBe(DELEGATE);
    });

    it('accepts TicketSequence alongside Sequence: 0', () => {
      const tx = loanBrokerDelete({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.TicketSequence).toBe(42);
    });

    // ─── Reject side ───

    it('rejects a malformed Memos value', () => {
      expect(() =>
        loanBrokerDelete({ ...base, Memos: 'not-an-array' } as any),
      ).toThrow(/invalid Memos/);
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() => loanBrokerDelete({ ...base, SourceTag: 'NaN' } as any)).toThrow(
        /SourceTag must be a number/,
      );
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() =>
        loanBrokerDelete({ ...base, LastLedgerSequence: 'soon' } as any),
      ).toThrow(/LastLedgerSequence must be a number/);
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() => loanBrokerDelete({ ...base, AccountTxnID: 12345 } as any)).toThrow(
        /AccountTxnID must be a string/,
      );
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() => loanBrokerDelete({ ...base, NetworkID: {} } as any)).toThrow(
        /NetworkID must be a number/,
      );
    });

    it('rejects a Delegate that is not a valid address', () => {
      expect(() =>
        loanBrokerDelete({ ...base, Delegate: 'not-an-address' } as any),
      ).toThrow(/invalid Delegate/);
    });

    it('rejects a Delegate equal to Account', () => {
      expect(() => loanBrokerDelete({ ...base, Delegate: base.Account })).toThrow(
        /cannot be the same/,
      );
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() =>
        loanBrokerDelete({ ...base, TicketSequence: 'nope' } as any),
      ).toThrow(/TicketSequence must be a number/);
    });

    it('rejects a non-string Fee', () => {
      expect(() => loanBrokerDelete({ ...base, Fee: 12 } as any)).toThrow(
        /Fee must be a string/,
      );
    });

    it('still checks LoanBrokerID before the shared base fields', () => {
      // Ordering check: a factory-specific mistake still produces the
      // factory's own message, not the base validator's backstop message.
      expect(() =>
        loanBrokerDelete({
          ...base,
          LoanBrokerID: LOAN_BROKER_ID_ZERO,
          SourceTag: 'NaN',
        } as any),
      ).toThrow(/all-zeros/);
    });

    it('survives .with() with a base field set', () => {
      const tx = loanBrokerDelete({ ...base, SourceTag: 7 });
      const next = tx.with({ Fee: '20' });
      expect(next.SourceTag).toBe(7);
    });
  });
});