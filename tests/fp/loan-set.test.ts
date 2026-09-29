/**
 * Tests for the functional LoanSet factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, LoanBrokerID, PrincipalRequested).
 *   2. Optional field validation (Counterparty, Data, rate/fee ranges,
 *      PaymentInterval, GracePeriod, CounterpartySignature).
 *   3. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined values).
 */
import { describe, it, expect } from 'vitest';
import { loanSet } from '../../src/fp/index.js';

const BROKER = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const BORROWER = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';

// 64-char hex ledger entry ID.
const LOAN_BROKER_ID =
  'A730EB18A9D4BB52502C898589558B4CCEB4BE10044500EE5581137A2E80E849';

function make(extras: Record<string, unknown> = {}) {
  return loanSet({
    Account: BROKER,
    LoanBrokerID: LOAN_BROKER_ID,
    PrincipalRequested: '1000000',
    ...extras,
  });
}

describe('fp/loanSet()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('LoanSet');
      expect(tx.Account).toBe(BROKER);
      expect(tx.LoanBrokerID).toBe(LOAN_BROKER_ID);
      expect(tx.PrincipalRequested).toBe('1000000');
    });

    it('accepts every spec field together', () => {
      const tx = loanSet({
        Account: BROKER,
        LoanBrokerID: LOAN_BROKER_ID,
        PrincipalRequested: '5000000',
        Counterparty: BORROWER,
        CounterpartySignature: {
          SigningPubKey: 'ED' + 'A'.repeat(71),
          TxnSignature: 'B'.repeat(100),
        },
        Data: '7B2274797065223A2274657374227D',
        LoanOriginationFee: '100',
        LoanServiceFee: '10',
        LatePaymentFee: '50',
        ClosePaymentFee: '25',
        OverpaymentFee: 100,
        InterestRate: 500,
        LateInterestRate: 750,
        CloseInterestRate: 200,
        OverpaymentInterestRate: 300,
        PaymentTotal: 12,
        PaymentInterval: 3600,
        GracePeriod: 600,
        Flags: 0x00010000, // tfLoanOverpayment
        Fee: '12',
        Sequence: 42,
      });
      expect(tx.InterestRate).toBe(500);
      expect(tx.PaymentInterval).toBe(3600);
      expect(tx.Counterparty).toBe(BORROWER);
      expect(tx.Flags).toBe(0x00010000);
    });

    it('accepts Flags as LoanSetFlagsInterface boolean map', () => {
      const tx = make({ Flags: { tfLoanOverpayment: true } });
      expect((tx.Flags as { tfLoanOverpayment?: boolean }).tfLoanOverpayment)
        .toBe(true);
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        loanSet({
          Account: '',
          LoanBrokerID: LOAN_BROKER_ID,
          PrincipalRequested: '1000',
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      expect(() =>
        loanSet({
          Account: 'not-an-account',
          LoanBrokerID: LOAN_BROKER_ID,
          PrincipalRequested: '1000',
        }),
      ).toThrow(/Account/);
    });
  });

  describe('LoanBrokerID validation', () => {
    it('throws on missing LoanBrokerID', () => {
      expect(() =>
        loanSet({
          Account: BROKER,
          LoanBrokerID: '' as never,
          PrincipalRequested: '1000',
        }),
      ).toThrow(/LoanBrokerID/);
    });

    it('throws on non-hex LoanBrokerID', () => {
      expect(() =>
        loanSet({
          Account: BROKER,
          LoanBrokerID: 'Z'.repeat(64),
          PrincipalRequested: '1000',
        }),
      ).toThrow(/LoanBrokerID/);
    });

    it('throws on wrong-length LoanBrokerID', () => {
      expect(() =>
        loanSet({
          Account: BROKER,
          LoanBrokerID: 'AB',
          PrincipalRequested: '1000',
        }),
      ).toThrow(/LoanBrokerID/);
    });
  });

  describe('PrincipalRequested validation', () => {
    it('throws on missing PrincipalRequested', () => {
      expect(() =>
        loanSet({
          Account: BROKER,
          LoanBrokerID: LOAN_BROKER_ID,
          PrincipalRequested: '' as never,
        }),
      ).toThrow(/PrincipalRequested/);
    });

    it('throws on negative PrincipalRequested', () => {
      expect(() =>
        loanSet({
          Account: BROKER,
          LoanBrokerID: LOAN_BROKER_ID,
          PrincipalRequested: '-1',
        }),
      ).toThrow(/PrincipalRequested/);
    });

    it('throws on non-numeric PrincipalRequested', () => {
      expect(() =>
        loanSet({
          Account: BROKER,
          LoanBrokerID: LOAN_BROKER_ID,
          PrincipalRequested: 'abc',
        }),
      ).toThrow(/PrincipalRequested/);
    });

    it('accepts zero PrincipalRequested', () => {
      const tx = make({ PrincipalRequested: '0' });
      expect(tx.PrincipalRequested).toBe('0');
    });
  });

  describe('Counterparty validation', () => {
    it('throws on invalid Counterparty', () => {
      expect(() => make({ Counterparty: 'garbage' })).toThrow(/Counterparty/);
    });

    it('accepts a valid Counterparty', () => {
      const tx = make({ Counterparty: BORROWER });
      expect(tx.Counterparty).toBe(BORROWER);
    });
  });

  describe('Data validation', () => {
    it('throws on non-hex Data', () => {
      expect(() => make({ Data: 'not-hex!' })).toThrow(/Data/);
    });

    it('throws on empty Data', () => {
      expect(() => make({ Data: '' })).toThrow(/Data/);
    });

    it('throws on Data > 512 characters', () => {
      const huge = 'A'.repeat(514);
      expect(() => make({ Data: huge })).toThrow(/512/);
    });

    it('accepts Data at exactly 512 characters', () => {
      const ok = 'A'.repeat(512);
      const tx = make({ Data: ok });
      expect(tx.Data).toBe(ok);
    });
  });

  describe('rate/fee range validation', () => {
    it('throws on OverpaymentFee > 100000', () => {
      expect(() => make({ OverpaymentFee: 100001 })).toThrow(/OverpaymentFee/);
    });

    it('throws on negative OverpaymentFee', () => {
      expect(() => make({ OverpaymentFee: -1 })).toThrow(/OverpaymentFee/);
    });

    it('throws on non-integer InterestRate', () => {
      expect(() => make({ InterestRate: 1.5 })).toThrow(/InterestRate/);
    });

    it('accepts InterestRate at boundary 100000', () => {
      const tx = make({ InterestRate: 100000 });
      expect(tx.InterestRate).toBe(100000);
    });

    it('throws on LateInterestRate out of range', () => {
      expect(() => make({ LateInterestRate: 100001 })).toThrow(
        /LateInterestRate/,
      );
    });

    it('throws on CloseInterestRate out of range', () => {
      expect(() => make({ CloseInterestRate: -5 })).toThrow(
        /CloseInterestRate/,
      );
    });

    it('throws on OverpaymentInterestRate out of range', () => {
      expect(() => make({ OverpaymentInterestRate: 200000 })).toThrow(
        /OverpaymentInterestRate/,
      );
    });
  });

  describe('PaymentInterval validation', () => {
    it('throws on PaymentInterval < 60', () => {
      expect(() => make({ PaymentInterval: 30 })).toThrow(/PaymentInterval/);
    });

    it('throws on non-integer PaymentInterval', () => {
      expect(() => make({ PaymentInterval: 60.5 })).toThrow(/PaymentInterval/);
    });

    it('accepts PaymentInterval at boundary 60', () => {
      const tx = make({ PaymentInterval: 60 });
      expect(tx.PaymentInterval).toBe(60);
    });

    it('accepts PaymentInterval with no GracePeriod set', () => {
      const tx = make({ PaymentInterval: 86400 });
      expect(tx.PaymentInterval).toBe(86400);
      expect(tx.GracePeriod).toBeUndefined();
    });
  });

  describe('GracePeriod validation', () => {
    it('throws when GracePeriod > PaymentInterval', () => {
      expect(() =>
        make({ PaymentInterval: 60, GracePeriod: 120 }),
      ).toThrow(/GracePeriod/);
    });

    it('accepts GracePeriod equal to PaymentInterval', () => {
      const tx = make({ PaymentInterval: 60, GracePeriod: 60 });
      expect(tx.GracePeriod).toBe(60);
    });

    it('accepts GracePeriod below PaymentInterval', () => {
      const tx = make({ PaymentInterval: 3600, GracePeriod: 600 });
      expect(tx.GracePeriod).toBe(600);
    });
  });

  describe('CounterpartySignature', () => {
    it('accepts an object CounterpartySignature', () => {
      const tx = make({
        CounterpartySignature: {
          SigningPubKey: 'ED' + 'A'.repeat(71),
          TxnSignature: 'B'.repeat(100),
        },
      });
      expect(tx.CounterpartySignature?.SigningPubKey).toBeDefined();
    });

    it('accepts an empty CounterpartySignature', () => {
      const tx = make({ CounterpartySignature: {} });
      expect(tx.CounterpartySignature).toEqual({});
    });
  });

  describe('fee string fields (XRPLNumber, not validated)', () => {
    it('passes through LoanOriginationFee / LoanServiceFee / LatePaymentFee / ClosePaymentFee', () => {
      const tx = make({
        LoanOriginationFee: '100',
        LoanServiceFee: '10',
        LatePaymentFee: '50',
        ClosePaymentFee: '25',
      });
      expect(tx.LoanOriginationFee).toBe('100');
      expect(tx.LoanServiceFee).toBe('10');
      expect(tx.LatePaymentFee).toBe('50');
      expect(tx.ClosePaymentFee).toBe('25');
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
        (tx as unknown as Record<string, unknown>).PrincipalRequested =
          '9999999';
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      const tx = make();
      const tx2 = tx.with({ InterestRate: 500 });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.InterestRate).toBe(500);
      expect(tx.InterestRate).toBeUndefined();
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() => tx.with({ InterestRate: 200000 })).toThrow(/InterestRate/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({ InterestRate: 500, PaymentInterval: 3600 });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'LoanSet',
        Account: BROKER,
        LoanBrokerID: LOAN_BROKER_ID,
        PrincipalRequested: '1000000',
        InterestRate: 500,
        PaymentInterval: 3600,
      });
    });

    it('.toJSON() skips undefined fields and methods', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('Data' in json).toBe(false);
      expect('Counterparty' in json).toBe(false);
      expect('InterestRate' in json).toBe(false);
    });

    it('.validate() is a no-op (no throw after construction)', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });
});