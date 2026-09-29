/**
 * Tests for the functional LoanPay factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, LoanID, Amount).
 *   2. Optional field validation (Flags exclusivity in numeric + object form).
 *   3. Ledger-specific preclaim checks the class skips:
 *      - LoanID must not be all-zeros HASH256 (XLS-66 §3.11.4.1 check 1)
 *      - Amount must be strictly positive (XLS-66 §3.11.4.1 check 2)
 *   4. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined values).
 */
import { describe, it, expect } from 'vitest';
import { loanPay } from '../../src/fp/index.js';

const BORROWER = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

// 64-char hex ledger entry ID.
const LOAN_ID =
  '000004D417A9CE049C9A71A62B004659B5F1AAAB1BEA1EFDE4E01EB3497FD999';

const ISSUER = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';

function make(extras: Record<string, unknown> = {}) {
  return loanPay({
    Account: BORROWER,
    LoanID: LOAN_ID,
    Amount: '1000000',
    ...extras,
  });
}

describe('fp/loanPay()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('LoanPay');
      expect(tx.Account).toBe(BORROWER);
      expect(tx.LoanID).toBe(LOAN_ID);
      expect(tx.Amount).toBe('1000000');
    });

    it('accepts every spec field together', () => {
      const tx = loanPay({
        Account: BORROWER,
        LoanID: LOAN_ID,
        Amount: {
          currency: 'USD',
          issuer: ISSUER,
          value: '500',
        },
        Flags: 0x00010000, // tfLoanOverpayment
        Fee: '12',
        Sequence: 42,
      });
      expect(tx.Account).toBe(BORROWER);
      expect(tx.Flags).toBe(0x00010000);
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(42);
    });

    it('accepts Flags as LoanPayFlagsInterface boolean map', () => {
      const tx = make({ Flags: { tfLoanOverpayment: true } });
      expect((tx.Flags as { tfLoanOverpayment?: boolean }).tfLoanOverpayment)
        .toBe(true);
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

    it('accepts each of the three payment-type flags independently (numeric)', () => {
      const txOver = make({ Flags: 0x00010000 });
      const txFull = make({ Flags: 0x00020000 });
      const txLate = make({ Flags: 0x00040000 });
      expect(txOver.Flags).toBe(0x00010000);
      expect(txFull.Flags).toBe(0x00020000);
      expect(txLate.Flags).toBe(0x00040000);
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        loanPay({
          Account: '',
          LoanID: LOAN_ID,
          Amount: '1000',
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      expect(() =>
        loanPay({
          Account: 'not-an-account',
          LoanID: LOAN_ID,
          Amount: '1000',
        }),
      ).toThrow(/Account/);
    });
  });

  describe('LoanID validation', () => {
    it('throws on missing LoanID', () => {
      expect(() =>
        loanPay({
          Account: BORROWER,
          LoanID: '' as never,
          Amount: '1000',
        }),
      ).toThrow(/LoanID/);
    });

    it('throws on non-hex LoanID', () => {
      expect(() =>
        loanPay({
          Account: BORROWER,
          LoanID: 'Z'.repeat(64),
          Amount: '1000',
        }),
      ).toThrow(/LoanID/);
    });

    it('throws on wrong-length LoanID', () => {
      expect(() =>
        loanPay({
          Account: BORROWER,
          LoanID: 'AB',
          Amount: '1000',
        }),
      ).toThrow(/LoanID/);
    });

    it('throws on all-zeros LoanID (XLS-66 §3.11.4.1 check 1)', () => {
      expect(() =>
        loanPay({
          Account: BORROWER,
          LoanID: '0'.repeat(64),
          Amount: '1000',
        }),
      ).toThrow(/all-zeros/);
    });
  });

  describe('Amount validation', () => {
    it('throws on missing Amount', () => {
      expect(() =>
        loanPay({
          Account: BORROWER,
          LoanID: LOAN_ID,
          Amount: undefined as never,
        }),
      ).toThrow(/Amount/);
    });

    it('throws on malformed Amount (number)', () => {
      expect(() =>
        loanPay({
          Account: BORROWER,
          LoanID: LOAN_ID,
          Amount: 12345 as never,
        }),
      ).toThrow(/Amount/);
    });

    it('throws on zero Amount (XRP string)', () => {
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

  describe('Flags exclusivity (numeric)', () => {
    it('throws when tfLoanOverpayment and tfLoanFullPayment are both set', () => {
      expect(() =>
        make({ Flags: 0x00010000 | 0x00020000 }),
      ).toThrow(/tfLoanOverpayment, tfLoanFullPayment|tfLoanOverpayment|tfLoanFullPayment/);
    });

    it('throws when all three payment-type flags are set', () => {
      expect(() =>
        make({ Flags: 0x00010000 | 0x00020000 | 0x00040000 }),
      ).toThrow(/Only one of/);
    });

    it('accepts Flags = 0 (no payment-type flag)', () => {
      const tx = make({ Flags: 0 });
      expect(tx.Flags).toBe(0);
    });
  });

  describe('Flags exclusivity (object form)', () => {
    it('throws when tfLoanFullPayment + tfLoanOverpayment object flags both true', () => {
      expect(() =>
        make({ Flags: { tfLoanFullPayment: true, tfLoanOverpayment: true } }),
      ).toThrow(/Only one of/);
    });

    it('throws when all three object flags are true', () => {
      expect(() =>
        make({
          Flags: {
            tfLoanOverpayment: true,
            tfLoanFullPayment: true,
            tfLoanLatePayment: true,
          },
        }),
      ).toThrow(/Only one of/);
    });

    it('accepts a single object flag', () => {
      const tx = make({ Flags: { tfLoanLatePayment: true } });
      expect((tx.Flags as { tfLoanLatePayment?: boolean }).tfLoanLatePayment)
        .toBe(true);
    });

    it('accepts empty object Flags (no payment-type flag set)', () => {
      const tx = make({ Flags: {} });
      expect(tx.Flags).toEqual({});
    });
  });

  describe('Flags type validation', () => {
    it('throws on non-number / non-object Flags', () => {
      expect(() => make({ Flags: 'foo' as never })).toThrow(/Flags/);
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

    it('.with() re-validates all-zeros LoanID override', () => {
      const tx = make();
      expect(() => tx.with({ LoanID: '0'.repeat(64) })).toThrow(/all-zeros/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({ Flags: 0x00010000, Fee: '12', Sequence: 7 });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'LoanPay',
        Account: BORROWER,
        LoanID: LOAN_ID,
        Amount: '1000000',
        Flags: 0x00010000,
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
      expect('Flags' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op (no throw after construction)', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });
});