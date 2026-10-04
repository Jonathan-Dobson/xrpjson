/**
 * Tests for the functional LoanManage factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, LoanID).
 *   2. Action-flag handling: each of tfLoanDefault / tfLoanImpair /
 *      tfLoanUnimpair works alone; all pairwise (and 3-way) combinations
 *      are rejected — the divergence from the class source.
 *   3. Numeric vs object-form Flags round-trip.
 *   4. LoanID hex + length validation.
 *   5. Frozen-shape contract (mutation throws, .with() re-validates,
 *      .toJSON() strips methods and undefined fields).
 */
import { describe, it, expect } from 'vitest';
import { loanManage } from '../../src/fp/index.js';

const BROKER_OWNER = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

// 64-char hex ledger entry ID.
const LOAN_ID =
  'E9A08C918E26407493CC4ADD381BA979CFEB7E440D0863B01FB31C231D167E42';

const TF_LOAN_DEFAULT = 0x00010000;
const TF_LOAN_IMPAIR = 0x00020000;
const TF_LOAN_UNIMPAIR = 0x00040000;

function make(extras: Record<string, unknown> = {}) {
  return loanManage({
    Account: BROKER_OWNER,
    LoanID: LOAN_ID,
    ...extras,
  });
}

describe('fp/loanManage()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('LoanManage');
      expect(tx.Account).toBe(BROKER_OWNER);
      expect(tx.LoanID).toBe(LOAN_ID);
      expect(tx.Flags).toBeUndefined();
    });

    it('accepts Fee and Sequence as base transaction fields', () => {
      const tx = make({ Fee: '12', Sequence: 42 });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(42);
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        loanManage({
          Account: '',
          LoanID: LOAN_ID,
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      expect(() =>
        loanManage({
          Account: 'not-an-account',
          LoanID: LOAN_ID,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('LoanID validation', () => {
    it('throws on missing LoanID', () => {
      expect(() =>
        loanManage({
          Account: BROKER_OWNER,
          LoanID: '' as never,
        }),
      ).toThrow(/LoanID/);
    });

    it('throws on non-hex LoanID', () => {
      expect(() =>
        loanManage({
          Account: BROKER_OWNER,
          LoanID: 'Z'.repeat(64),
        }),
      ).toThrow(/LoanID/);
    });

    it('throws on wrong-length LoanID', () => {
      expect(() =>
        loanManage({
          Account: BROKER_OWNER,
          LoanID: 'AB',
        }),
      ).toThrow(/LoanID/);
    });

    it('accepts a valid 64-char hex LoanID', () => {
      const tx = make();
      expect(tx.LoanID).toBe(LOAN_ID);
    });
  });

  describe('flag mutual exclusivity (XLS-66 §3.10.4.1)', () => {
    it('accepts tfLoanDefault alone', () => {
      const tx = make({ Flags: TF_LOAN_DEFAULT });
      expect(tx.Flags).toBe(TF_LOAN_DEFAULT);
    });

    it('accepts tfLoanImpair alone', () => {
      const tx = make({ Flags: TF_LOAN_IMPAIR });
      expect(tx.Flags).toBe(TF_LOAN_IMPAIR);
    });

    it('accepts tfLoanUnimpair alone', () => {
      const tx = make({ Flags: TF_LOAN_UNIMPAIR });
      expect(tx.Flags).toBe(TF_LOAN_UNIMPAIR);
    });

    it('throws on tfLoanImpair + tfLoanUnimpair (class parity)', () => {
      expect(() =>
        make({ Flags: TF_LOAN_IMPAIR | TF_LOAN_UNIMPAIR }),
      ).toThrow(/mutually exclusive/);
    });

    it('throws on tfLoanDefault + tfLoanImpair (divergence from class)', () => {
      expect(() =>
        make({ Flags: TF_LOAN_DEFAULT | TF_LOAN_IMPAIR }),
      ).toThrow(/mutually exclusive/);
    });

    it('throws on tfLoanDefault + tfLoanUnimpair (divergence from class)', () => {
      expect(() =>
        make({ Flags: TF_LOAN_DEFAULT | TF_LOAN_UNIMPAIR }),
      ).toThrow(/mutually exclusive/);
    });

    it('throws on all three flags (divergence from class)', () => {
      expect(() =>
        make({
          Flags: TF_LOAN_DEFAULT | TF_LOAN_IMPAIR | TF_LOAN_UNIMPAIR,
        }),
      ).toThrow(/mutually exclusive/);
    });

    it('accepts numeric Flags=0 (no action)', () => {
      const tx = make({ Flags: 0 });
      expect(tx.Flags).toBe(0);
    });

    it('accepts object-form Flags with one action set', () => {
      const tx = make({ Flags: { tfLoanImpair: true } });
      expect(tx.Flags).toEqual({ tfLoanImpair: true });
    });

    it('throws when object-form Flags has two actions set', () => {
      expect(() =>
        make({
          Flags: { tfLoanDefault: true, tfLoanImpair: true },
        }),
      ).toThrow(/mutually exclusive/);
    });

    it('throws when object-form Flags has all three actions set', () => {
      expect(() =>
        make({
          Flags: {
            tfLoanDefault: true,
            tfLoanImpair: true,
            tfLoanUnimpair: true,
          },
        }),
      ).toThrow(/mutually exclusive/);
    });

    it('ignores unknown boolean-map keys (forward-compat)', () => {
      // tifLoanUnimpair is a typo / unknown — must not throw, factory
      // only acts on the three known LoanManage actions.
      const tx = make({
        Flags: {
          tfLoanImpair: true,
          tfLoanUnknownFutureFlag: true,
        },
      });
      expect(tx.Flags).toEqual({
        tfLoanImpair: true,
        tfLoanUnknownFutureFlag: true,
      });
    });
  });

  describe('frozen-shape contract', () => {
    it('returns a frozen object', () => {
      const tx = make();
      expect(Object.isFrozen(tx)).toBe(true);
    });

    it('mutation throws in strict mode', () => {
      'use strict';
      const tx = make();
      expect(() => {
        (tx as unknown as Record<string, unknown>).LoanID =
          'F'.repeat(64);
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      const tx = make();
      const tx2 = tx.with({ Flags: TF_LOAN_IMPAIR });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Flags).toBe(TF_LOAN_IMPAIR);
      expect(tx.Flags).toBeUndefined();
    });

    it('.with() re-validates LoanID', () => {
      const tx = make();
      expect(() => tx.with({ LoanID: 'AB' })).toThrow(/LoanID/);
    });

    it('.with() re-validates flag mutual exclusivity', () => {
      const tx = make();
      expect(() =>
        tx.with({ Flags: TF_LOAN_DEFAULT | TF_LOAN_IMPAIR }),
      ).toThrow(/mutually exclusive/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({ Flags: TF_LOAN_DEFAULT, Fee: '12', Sequence: 8 });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'LoanManage',
        Account: BROKER_OWNER,
        LoanID: LOAN_ID,
        Flags: TF_LOAN_DEFAULT,
        Fee: '12',
        Sequence: 8,
      });
    });

    it('.toJSON() skips undefined fields and methods', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('Flags' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op (no throw after construction)', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });

  // ─── Base transaction fields ──────────────────────────────────────────────
  // `loanManage` now calls `validateBaseTransaction` as a backstop, placed
  // after its own LoanManage-specific checks (payment.ts:123 is the
  // reference). Before that call, every REJECT case below built a frozen
  // transaction silently.
  //
  // `LoanManageProps` does not yet extend `BasePropsFields`, so the seven
  // shared fields are not on this props type yet — which is why the `as any`
  // casts appear on the ACCEPT cases too, not only the reject ones. That is the
  // type half of the same bug; without the casts these would not compile.
  describe('BaseTransactionFields', () => {
    const base = {
      Account: BROKER_OWNER,
      LoanID: LOAN_ID,
    };
    // A valid classic address distinct from BROKER_OWNER.
    const DELEGATE = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
    const MEMOS = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
    const TXN_ID = 'AB'.repeat(32);

    it('accepts Memos', () => {
      const tx = loanManage({ ...base, Memos: MEMOS } as any);
      expect(tx.toJSON().Memos).toEqual(MEMOS);
    });

    it('rejects a malformed Memos value', () => {
      expect(() => loanManage({ ...base, Memos: 'not-an-array' } as any)).toThrow(
        /invalid Memos/,
      );
    });

    it('accepts SourceTag', () => {
      const tx = loanManage({ ...base, SourceTag: 99 } as any);
      expect(tx.toJSON().SourceTag).toBe(99);
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() => loanManage({ ...base, SourceTag: 'NaN' } as any)).toThrow(
        /SourceTag must be a number/,
      );
    });

    it('accepts LastLedgerSequence', () => {
      const tx = loanManage({ ...base, LastLedgerSequence: 1_000_000 } as any);
      expect(tx.toJSON().LastLedgerSequence).toBe(1_000_000);
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() =>
        loanManage({ ...base, LastLedgerSequence: 'soon' } as any),
      ).toThrow(/LastLedgerSequence must be a number/);
    });

    it('accepts AccountTxnID', () => {
      const tx = loanManage({ ...base, AccountTxnID: TXN_ID } as any);
      expect(tx.toJSON().AccountTxnID).toBe(TXN_ID);
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() => loanManage({ ...base, AccountTxnID: 99 } as any)).toThrow(
        /AccountTxnID must be a string/,
      );
    });

    it('accepts NetworkID', () => {
      const tx = loanManage({ ...base, NetworkID: 1 } as any);
      expect(tx.toJSON().NetworkID).toBe(1);
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() => loanManage({ ...base, NetworkID: {} } as any)).toThrow(
        /NetworkID must be a number/,
      );
    });

    it('accepts a Delegate distinct from Account', () => {
      const tx = loanManage({ ...base, Delegate: DELEGATE } as any);
      expect(tx.toJSON().Delegate).toBe(DELEGATE);
    });

    it('rejects a Delegate that is not a valid address', () => {
      expect(() =>
        loanManage({ ...base, Delegate: 'not-an-address' } as any),
      ).toThrow(/invalid Delegate/);
    });

    it('rejects Delegate equal to Account', () => {
      expect(() =>
        loanManage({ ...base, Delegate: BROKER_OWNER } as any),
      ).toThrow(/cannot be the same/);
    });

    it('accepts TicketSequence alongside Sequence: 0', () => {
      const tx = loanManage({
        ...base,
        Sequence: 0,
        TicketSequence: 42,
      } as any);
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() => loanManage({ ...base, TicketSequence: 'nope' } as any)).toThrow(
        /TicketSequence must be a number/,
      );
    });
  });
});
