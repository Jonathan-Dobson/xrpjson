/**
 * Tests for the functional LoanBrokerCoverDeposit factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, LoanBrokerID, Amount).
 *   2. Ledger-specific preclaim checks the class skips:
 *      - LoanBrokerID must not be all-zeros HASH256 (XLS-66 §3.5.3.1 check 1)
 *      - Amount must be strictly positive (XLS-66 §3.5.3.1 check 2)
 *   3. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined values).
 */
import { describe, it, expect } from 'vitest';
import { loanBrokerCoverDeposit } from '../../src/fp/index.js';

const BROKER_OWNER = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const ISSUER = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';

// 64-char hex ledger entry ID.
const LOAN_BROKER_ID =
  'A9470DEFB52F18D1A11C2208D366D575EB4DE5A5D202AFED812F09FDA5B8D614';

function make(extras: Record<string, unknown> = {}) {
  return loanBrokerCoverDeposit({
    Account: BROKER_OWNER,
    LoanBrokerID: LOAN_BROKER_ID,
    Amount: '1000000',
    ...extras,
  });
}

describe('fp/loanBrokerCoverDeposit()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('LoanBrokerCoverDeposit');
      expect(tx.Account).toBe(BROKER_OWNER);
      expect(tx.LoanBrokerID).toBe(LOAN_BROKER_ID);
      expect(tx.Amount).toBe('1000000');
    });

    it('accepts Fee + Sequence + IOU amount', () => {
      const tx = loanBrokerCoverDeposit({
        Account: BROKER_OWNER,
        LoanBrokerID: LOAN_BROKER_ID,
        Amount: {
          currency: 'USD',
          issuer: ISSUER,
          value: '500',
        },
        Fee: '12',
        Sequence: 42,
      });
      expect(tx.TransactionType).toBe('LoanBrokerCoverDeposit');
      expect(tx.Amount).toEqual({
        currency: 'USD',
        issuer: ISSUER,
        value: '500',
      });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(42);
    });

    it('accepts XRP drops form Amount', () => {
      const tx = make({ Amount: '2500000' });
      expect(tx.Amount).toBe('2500000');
    });

    it('accepts IssuedCurrency form Amount', () => {
      const tx = make({
        Amount: { currency: 'USD', issuer: ISSUER, value: '100' },
      });
      expect(tx.Amount).toEqual({
        currency: 'USD',
        issuer: ISSUER,
        value: '100',
      });
    });

    it('accepts MPT form Amount', () => {
      const tx = make({
        Amount: { mpt_issuance_id: '00000001', value: '100' },
      });
      expect(tx.Amount).toEqual({
        mpt_issuance_id: '00000001',
        value: '100',
      });
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        loanBrokerCoverDeposit({
          Account: '',
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: '1000',
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      expect(() =>
        loanBrokerCoverDeposit({
          Account: 'not-an-account',
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: '1000',
        }),
      ).toThrow(/Account/);
    });
  });

  describe('LoanBrokerID validation', () => {
    it('throws on missing LoanBrokerID', () => {
      expect(() =>
        loanBrokerCoverDeposit({
          Account: BROKER_OWNER,
          LoanBrokerID: '' as never,
          Amount: '1000',
        }),
      ).toThrow(/LoanBrokerID/);
    });

    it('throws on non-hex LoanBrokerID', () => {
      expect(() =>
        loanBrokerCoverDeposit({
          Account: BROKER_OWNER,
          LoanBrokerID: 'Z'.repeat(64),
          Amount: '1000',
        }),
      ).toThrow(/LoanBrokerID/);
    });

    it('throws on wrong-length LoanBrokerID', () => {
      expect(() =>
        loanBrokerCoverDeposit({
          Account: BROKER_OWNER,
          LoanBrokerID: 'AB',
          Amount: '1000',
        }),
      ).toThrow(/LoanBrokerID/);
    });

    it('throws on all-zeros LoanBrokerID (XLS-66 §3.5.3.1 check 1)', () => {
      expect(() =>
        loanBrokerCoverDeposit({
          Account: BROKER_OWNER,
          LoanBrokerID: '0'.repeat(64),
          Amount: '1000',
        }),
      ).toThrow(/all-zeros/);
    });
  });

  describe('Amount validation', () => {
    it('throws on missing Amount', () => {
      expect(() =>
        loanBrokerCoverDeposit({
          Account: BROKER_OWNER,
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: undefined as never,
        }),
      ).toThrow(/Amount/);
    });

    it('throws on malformed Amount (number)', () => {
      expect(() =>
        loanBrokerCoverDeposit({
          Account: BROKER_OWNER,
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: 12345 as never,
        }),
      ).toThrow(/Amount/);
    });

    it('throws on zero Amount (XRP string) — XLS-66 §3.5.3.1 check 2', () => {
      expect(() => make({ Amount: '0' })).toThrow(/strictly positive/);
    });

    it('throws on negative Amount (XRP string)', () => {
      expect(() => make({ Amount: '-1' })).toThrow(/strictly positive/);
    });

    it('throws on zero Amount (IssuedCurrency value)', () => {
      expect(() =>
        make({ Amount: { currency: 'USD', issuer: ISSUER, value: '0' } }),
      ).toThrow(/strictly positive/);
    });

    it('throws on negative Amount (MPT value)', () => {
      expect(() =>
        make({ Amount: { mpt_issuance_id: '00000001', value: '-5' } }),
      ).toThrow(/strictly positive/);
    });

    it('accepts Amount expressed in scientific mantissa', () => {
      const tx = make({ Amount: '1.5e3' });
      expect(tx.Amount).toBe('1.5e3');
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
        (tx as unknown as Record<string, unknown>).Amount = '9999999';
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      const tx = make();
      const tx2 = tx.with({ Amount: '5000000' });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Amount).toBe('5000000');
      expect(tx.Amount).toBe('1000000');
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() => tx.with({ Amount: '0' })).toThrow(/strictly positive/);
    });

    it('.with() re-validates all-zeros LoanBrokerID override', () => {
      const tx = make();
      expect(() => tx.with({ LoanBrokerID: '0'.repeat(64) })).toThrow(
        /all-zeros/,
      );
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({ Fee: '12', Sequence: 7 });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'LoanBrokerCoverDeposit',
        Account: BROKER_OWNER,
        LoanBrokerID: LOAN_BROKER_ID,
        Amount: '1000000',
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
    });

    it('.validate() is a no-op (no throw after construction)', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });

  // ─── Base transaction fields ──────────────────────────────────────────────
  // `loanBrokerCoverDeposit` now calls `validateBaseTransaction` as a
  // backstop, placed after its own LoanBrokerCoverDeposit-specific checks
  // (payment.ts:123 is the reference). Before that call, every REJECT case
  // below built a frozen transaction silently.
  //
  // `LoanBrokerCoverDepositProps` does not yet extend `BasePropsFields`, so the
  // seven shared fields are not on this props type yet — which is why the
  // `as any` casts appear on the ACCEPT cases too, not only the reject ones.
  // That is the type half of the same bug; without the casts these would not
  // compile.
  describe('BaseTransactionFields', () => {
    const base = {
      Account: BROKER_OWNER,
      LoanBrokerID: LOAN_BROKER_ID,
      Amount: '1000000',
    };
    // A valid classic address distinct from BROKER_OWNER.
    const DELEGATE = ISSUER;
    const MEMOS = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
    const TXN_ID = 'AB'.repeat(32);

    it('accepts Memos', () => {
      const tx = loanBrokerCoverDeposit({ ...base, Memos: MEMOS } as any);
      expect(tx.toJSON().Memos).toEqual(MEMOS);
    });

    it('rejects a malformed Memos value', () => {
      expect(() =>
        loanBrokerCoverDeposit({ ...base, Memos: 'not-an-array' } as any),
      ).toThrow(/invalid Memos/);
    });

    it('accepts SourceTag', () => {
      const tx = loanBrokerCoverDeposit({ ...base, SourceTag: 99 } as any);
      expect(tx.toJSON().SourceTag).toBe(99);
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() =>
        loanBrokerCoverDeposit({ ...base, SourceTag: 'NaN' } as any),
      ).toThrow(/SourceTag must be a number/);
    });

    it('accepts LastLedgerSequence', () => {
      const tx = loanBrokerCoverDeposit({
        ...base,
        LastLedgerSequence: 1_000_000,
      } as any);
      expect(tx.toJSON().LastLedgerSequence).toBe(1_000_000);
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() =>
        loanBrokerCoverDeposit({ ...base, LastLedgerSequence: 'soon' } as any),
      ).toThrow(/LastLedgerSequence must be a number/);
    });

    it('accepts AccountTxnID', () => {
      const tx = loanBrokerCoverDeposit({ ...base, AccountTxnID: TXN_ID } as any);
      expect(tx.toJSON().AccountTxnID).toBe(TXN_ID);
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() =>
        loanBrokerCoverDeposit({ ...base, AccountTxnID: 99 } as any),
      ).toThrow(/AccountTxnID must be a string/);
    });

    it('accepts NetworkID', () => {
      const tx = loanBrokerCoverDeposit({ ...base, NetworkID: 1 } as any);
      expect(tx.toJSON().NetworkID).toBe(1);
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() =>
        loanBrokerCoverDeposit({ ...base, NetworkID: {} } as any),
      ).toThrow(/NetworkID must be a number/);
    });

    it('accepts a Delegate distinct from Account', () => {
      const tx = loanBrokerCoverDeposit({ ...base, Delegate: DELEGATE } as any);
      expect(tx.toJSON().Delegate).toBe(DELEGATE);
    });

    it('rejects a Delegate that is not a valid address', () => {
      expect(() =>
        loanBrokerCoverDeposit({ ...base, Delegate: 'not-an-address' } as any),
      ).toThrow(/invalid Delegate/);
    });

    it('rejects Delegate equal to Account', () => {
      expect(() =>
        loanBrokerCoverDeposit({ ...base, Delegate: BROKER_OWNER } as any),
      ).toThrow(/cannot be the same/);
    });

    it('accepts TicketSequence alongside Sequence: 0', () => {
      const tx = loanBrokerCoverDeposit({
        ...base,
        Sequence: 0,
        TicketSequence: 42,
      } as any);
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() =>
        loanBrokerCoverDeposit({ ...base, TicketSequence: 'nope' } as any),
      ).toThrow(/TicketSequence must be a number/);
    });
  });
});