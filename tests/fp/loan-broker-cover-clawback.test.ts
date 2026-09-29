/**
 * Tests for the functional LoanBrokerCoverClawback factory.
 *
 * Validates:
 *   1. Construction with optional LoanBrokerID and/or Amount (at least one
 *      required; both accepted).
 *   2. Optional Account / Fee / Sequence fields.
 *   3. Ledger-specific preclaim checks the class skips:
 *      - LoanBrokerID must not be all-zeros HASH256 (XLS-66 §3.7.3.1 check 2)
 *      - LoanBrokerID required when Amount is MPT (check 6)
 *      - LoanBrokerID required when Amount IOU issuer == Account (check 7)
 *      - Amount.value must be a well-formed non-negative XRPL Number
 *   4. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined values).
 */
import { describe, it, expect } from 'vitest';
import { loanBrokerCoverClawback } from '../../src/fp/factories/loan-broker-cover-clawback.js';

const ISSUER = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const COUNTERPARTY = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';

// 64-char hex ledger entry ID.
const LOAN_BROKER_ID =
  'A9470DEFB52F18D1A11C2208D366D575EB4DE5A5D202AFED812F09FDA5B8D614';

function make(extras: Record<string, unknown> = {}) {
  return loanBrokerCoverClawback({
    Account: ISSUER,
    LoanBrokerID: LOAN_BROKER_ID,
    Amount: {
      currency: 'USD',
      issuer: COUNTERPARTY,
      value: '100',
    },
    ...extras,
  });
}

describe('fp/loanBrokerCoverClawback()', () => {
  describe('construction', () => {
    it('constructs with LoanBrokerID + IOU Amount (required fields)', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('LoanBrokerCoverClawback');
      expect(tx.Account).toBe(ISSUER);
      expect(tx.LoanBrokerID).toBe(LOAN_BROKER_ID);
      expect(tx.Amount).toEqual({
        currency: 'USD',
        issuer: COUNTERPARTY,
        value: '100',
      });
    });

    it('constructs with LoanBrokerID only (Amount omitted means claw-back-to-min)', () => {
      const tx = loanBrokerCoverClawback({
        Account: ISSUER,
        LoanBrokerID: LOAN_BROKER_ID,
      });
      expect(tx.TransactionType).toBe('LoanBrokerCoverClawback');
      expect(tx.LoanBrokerID).toBe(LOAN_BROKER_ID);
      expect(tx.Amount).toBeUndefined();
    });

    it('constructs with Amount only (IOU, issuer != Account)', () => {
      const tx = loanBrokerCoverClawback({
        Account: ISSUER,
        Amount: {
          currency: 'USD',
          issuer: COUNTERPARTY,
          value: '50',
        },
      });
      expect(tx.TransactionType).toBe('LoanBrokerCoverClawback');
      expect(tx.Amount).toEqual({
        currency: 'USD',
        issuer: COUNTERPARTY,
        value: '50',
      });
      expect(tx.LoanBrokerID).toBeUndefined();
    });

    it('accepts MPT form Amount with LoanBrokerID', () => {
      const tx = loanBrokerCoverClawback({
        Account: ISSUER,
        LoanBrokerID: LOAN_BROKER_ID,
        Amount: {
          mpt_issuance_id: '00000001' + '0'.repeat(20),
          value: '200',
        },
      });
      expect(tx.Amount).toEqual({
        mpt_issuance_id: '00000001' + '0'.repeat(20),
        value: '200',
      });
    });

    it('accepts Fee + Sequence + Flags=0', () => {
      const tx = make({ Fee: '12', Sequence: 42, Flags: 0 });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(42);
      expect(tx.Flags).toBe(0);
    });

    it('accepts Amount expressed in scientific mantissa', () => {
      const tx = make({ Amount: { currency: 'USD', issuer: COUNTERPARTY, value: '1.5e3' } });
      expect(tx.Amount).toEqual({
        currency: 'USD',
        issuer: COUNTERPARTY,
        value: '1.5e3',
      });
    });

    it('accepts Amount.value === "0" (clawback down to minimum cover, §3.7.4)', () => {
      const tx = make({ Amount: { currency: 'USD', issuer: COUNTERPARTY, value: '0' } });
      expect(tx.Amount).toEqual({
        currency: 'USD',
        issuer: COUNTERPARTY,
        value: '0',
      });
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        loanBrokerCoverClawback({
          Account: '',
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: { currency: 'USD', issuer: COUNTERPARTY, value: '10' },
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      expect(() =>
        loanBrokerCoverClawback({
          Account: 'not-an-account',
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: { currency: 'USD', issuer: COUNTERPARTY, value: '10' },
        }),
      ).toThrow(/Account/);
    });
  });

  describe('LoanBrokerID validation', () => {
    it('throws on non-hex LoanBrokerID', () => {
      expect(() =>
        loanBrokerCoverClawback({
          Account: ISSUER,
          LoanBrokerID: 'Z'.repeat(64),
          Amount: { currency: 'USD', issuer: COUNTERPARTY, value: '10' },
        }),
      ).toThrow(/LoanBrokerID/);
    });

    it('throws on wrong-length LoanBrokerID', () => {
      expect(() =>
        loanBrokerCoverClawback({
          Account: ISSUER,
          LoanBrokerID: 'AB',
          Amount: { currency: 'USD', issuer: COUNTERPARTY, value: '10' },
        }),
      ).toThrow(/LoanBrokerID/);
    });

    it('throws on all-zeros LoanBrokerID (XLS-66 §3.7.3.1 check 2)', () => {
      expect(() =>
        loanBrokerCoverClawback({
          Account: ISSUER,
          LoanBrokerID: '0'.repeat(64),
          Amount: { currency: 'USD', issuer: COUNTERPARTY, value: '10' },
        }),
      ).toThrow(/all-zeros/);
    });
  });

  describe('Amount validation', () => {
    it('throws on XRP string Amount (clawback does not support XRP)', () => {
      expect(() =>
        loanBrokerCoverClawback({
          Account: ISSUER,
          LoanBrokerID: LOAN_BROKER_ID,
          // XRP is a drops string — not a ClawbackAmount.
          Amount: '1000000' as never,
        }),
      ).toThrow(/ClawbackAmount/);
    });

    it('throws on negative IOU Amount.value (XLS-66 §3.7.3.1 check 3)', () => {
      expect(() =>
        loanBrokerCoverClawback({
          Account: ISSUER,
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: { currency: 'USD', issuer: COUNTERPARTY, value: '-5' },
        }),
      ).toThrow(/non-negative|>= 0/);
    });

    it('throws on negative MPT Amount.value', () => {
      expect(() =>
        loanBrokerCoverClawback({
          Account: ISSUER,
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: {
            mpt_issuance_id: '00000001' + '0'.repeat(20),
            value: '-100',
          },
        }),
      ).toThrow(/non-negative|>= 0/);
    });

    it('throws on malformed IOU Amount.value (empty string)', () => {
      expect(() =>
        loanBrokerCoverClawback({
          Account: ISSUER,
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: { currency: 'USD', issuer: COUNTERPARTY, value: '' },
        }),
      ).toThrow(/Amount\.value|non-negative/);
    });

    it('throws on IOU Amount with malformed issuer', () => {
      expect(() =>
        loanBrokerCoverClawback({
          Account: ISSUER,
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: { currency: 'USD', issuer: 'not-an-account', value: '10' },
        }),
      ).toThrow(/issuer/);
    });

    it('throws on IOU Amount with malformed currency (4 ASCII chars)', () => {
      expect(() =>
        loanBrokerCoverClawback({
          Account: ISSUER,
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: { currency: 'USDD', issuer: COUNTERPARTY, value: '10' },
        }),
      ).toThrow(/currency/);
    });

    it('throws on MPT Amount with malformed mpt_issuance_id (too short)', () => {
      expect(() =>
        loanBrokerCoverClawback({
          Account: ISSUER,
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: { mpt_issuance_id: 'ABCD', value: '10' },
        }),
      ).toThrow(/mpt_issuance_id/);
    });
  });

  describe('cross-field validation', () => {
    it('throws when neither LoanBrokerID nor Amount is provided (§3.7.3.1 check 1)', () => {
      expect(() =>
        loanBrokerCoverClawback({
          Account: ISSUER,
        }),
      ).toThrow(/Either LoanBrokerID or Amount/);
    });

    it('throws when LoanBrokerID is missing and Amount is MPT (§3.7.3.1 check 6)', () => {
      expect(() =>
        loanBrokerCoverClawback({
          Account: ISSUER,
          Amount: {
            mpt_issuance_id: '00000001' + '0'.repeat(20),
            value: '100',
          },
        }),
      ).toThrow(/LoanBrokerID is required.*MPT|MPT/);
    });

    it('throws when LoanBrokerID is missing and IOU issuer == Account (§3.7.3.1 check 7)', () => {
      expect(() =>
        loanBrokerCoverClawback({
          Account: ISSUER,
          Amount: {
            currency: 'USD',
            issuer: ISSUER,
            value: '100',
          },
        }),
      ).toThrow(/LoanBrokerID is required.*IOU|IOU/);
    });

    it('accepts IOU Amount with issuer != Account and no LoanBrokerID (§3.7.3.1 check 7 negative case)', () => {
      const tx = loanBrokerCoverClawback({
        Account: ISSUER,
        Amount: {
          currency: 'USD',
          issuer: COUNTERPARTY,
          value: '100',
        },
      });
      expect(tx.LoanBrokerID).toBeUndefined();
      expect(tx.Amount).toEqual({
        currency: 'USD',
        issuer: COUNTERPARTY,
        value: '100',
      });
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
        (tx as unknown as Record<string, unknown>).LoanBrokerID = '0'.repeat(64);
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      const tx = make();
      const tx2 = tx.with({
        Amount: { currency: 'USD', issuer: COUNTERPARTY, value: '500' },
      });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Amount).toEqual({
        currency: 'USD',
        issuer: COUNTERPARTY,
        value: '500',
      });
      expect(tx.Amount).toEqual({
        currency: 'USD',
        issuer: COUNTERPARTY,
        value: '100',
      });
    });

    it('.with() re-validates on override (all-zeros LoanBrokerID)', () => {
      const tx = make();
      expect(() => tx.with({ LoanBrokerID: '0'.repeat(64) })).toThrow(
        /all-zeros/,
      );
    });

    it('.with() re-validates on override (negative Amount)', () => {
      const tx = make();
      expect(() =>
        tx.with({
          Amount: { currency: 'USD', issuer: COUNTERPARTY, value: '-1' },
        }),
      ).toThrow(/non-negative|>= 0/);
    });

    it('.with() re-validates cross-field rule on override', () => {
      const tx = make();
      // Drop LoanBrokerID; Amount is IOU with issuer=COUNTERPARTY (not Account),
      // so cross-field check is satisfied. Then override issuer to Account —
      // the factory must reject because LoanBrokerID is now undefined.
      expect(() =>
        tx.with({
          LoanBrokerID: undefined as never,
          Amount: { currency: 'USD', issuer: ISSUER, value: '100' },
        }),
      ).toThrow(/LoanBrokerID is required|IOU/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({ Fee: '12', Sequence: 7 });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'LoanBrokerCoverClawback',
        Account: ISSUER,
        LoanBrokerID: LOAN_BROKER_ID,
        Amount: { currency: 'USD', issuer: COUNTERPARTY, value: '100' },
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
