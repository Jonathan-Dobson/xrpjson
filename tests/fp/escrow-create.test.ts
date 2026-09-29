/**
 * Tests for the functional EscrowCreate factory.
 *
 * Validates:
 *   1. Construction with required Account + Amount + Destination + at
 *      least one of CancelAfter / FinishAfter + at least one of
 *      FinishAfter / Condition.
 *   2. Optional field handling (CancelAfter, FinishAfter, Condition,
 *      DestinationTag, Fee, Sequence, Flags).
 *   3. Spec-mandated guards the class API omits:
 *        a. Amount must be strictly positive (xrpl.js escrowCreate.ts).
 *        b. FinishAfter must precede CancelAfter (xrpl.org fields table).
 *        c. Condition must be a 80-char hex string (xrpl.org fields table).
 *        d. Either FinishAfter or Condition must be specified
 *           (xrpl.js validateEscrowCreate).
 *        e. Destination must differ from Account (rippled preclaim).
 *        f. CancelAfter / FinishAfter / DestinationTag must be UInt32.
 *   4. Frozen-shape contract (mutation throws, .with() returns new
 *      frozen object, .toJSON() strips methods and undefined fields).
 */
import { describe, it, expect } from 'vitest';
import { escrowCreate } from '../../src/fp/factories/escrow-create.js';

const ACCOUNT_A = 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn';
const ACCOUNT_B = 'rsA2LpzuawewSBQXkiju3YQTMzW13pAAdW';

// 80-hex PREIMAGE-SHA-256 crypto-condition (the same example used in the
// xrpl.org docs and the xrpl.js unit test for EscrowCreate).
const CONDITION_OK =
  'A0258020E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855810100';

// Seconds since Ripple Epoch. Ripple Epoch = 2000-01-01 = 946684800.
const FinishAfter = 946684800 + 3600; // 1h after epoch start
const CancelAfter = FinishAfter + 3600; // 2h after epoch start

function make(extras: Record<string, unknown> = {}) {
  return escrowCreate({
    Account: ACCOUNT_A,
    Amount: '10000',
    Destination: ACCOUNT_B,
    FinishAfter,
    ...extras,
  });
}

describe('fp/escrowCreate()', () => {
  describe('construction', () => {
    it('constructs with Account + Amount + Destination + FinishAfter', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('EscrowCreate');
      expect(tx.Account).toBe(ACCOUNT_A);
      expect(tx.Amount).toBe('10000');
      expect(tx.Destination).toBe(ACCOUNT_B);
      expect(tx.FinishAfter).toBe(FinishAfter);
    });

    it('constructs with FinishAfter + CancelAfter (time-based-with-expiration)', () => {
      const tx = escrowCreate({
        Account: ACCOUNT_A,
        Amount: '10000',
        Destination: ACCOUNT_B,
        FinishAfter,
        CancelAfter,
      });
      expect(tx.CancelAfter).toBe(CancelAfter);
      expect(tx.FinishAfter).toBe(FinishAfter);
    });

    it('constructs with FinishAfter + Condition (timed-conditional)', () => {
      const tx = escrowCreate({
        Account: ACCOUNT_A,
        Amount: '10000',
        Destination: ACCOUNT_B,
        FinishAfter,
        Condition: CONDITION_OK,
      });
      expect(tx.FinishAfter).toBe(FinishAfter);
      expect(tx.Condition).toBe(CONDITION_OK);
    });

    it('constructs with Condition + CancelAfter (conditional-with-expiration)', () => {
      const tx = escrowCreate({
        Account: ACCOUNT_A,
        Amount: '10000',
        Destination: ACCOUNT_B,
        CancelAfter,
        Condition: CONDITION_OK,
      });
      expect(tx.CancelAfter).toBe(CancelAfter);
      expect(tx.Condition).toBe(CONDITION_OK);
    });

    it('passes through optional Fee/Sequence/Flags/DestinationTag', () => {
      const tx = escrowCreate({
        Account: ACCOUNT_A,
        Amount: '10000',
        Destination: ACCOUNT_B,
        CancelAfter,
        FinishAfter,
        Condition: CONDITION_OK,
        DestinationTag: 23480,
        Flags: 0,
        Fee: '12',
        Sequence: 8,
      });
      expect(tx.DestinationTag).toBe(23480);
      expect(tx.Flags).toBe(0);
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(8);
    });
  });

  describe('Account / Destination validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        escrowCreate({
          Account: '' as never,
          Amount: '10000',
          Destination: ACCOUNT_B,
          FinishAfter,
        }),
      ).toThrow(/Account/);
    });

    it('throws on missing Destination', () => {
      expect(() =>
        escrowCreate({
          Account: ACCOUNT_A,
          Amount: '10000',
          Destination: '' as never,
          FinishAfter,
        }),
      ).toThrow(/Destination/);
    });

    it('throws on invalid Destination format', () => {
      expect(() =>
        escrowCreate({
          Account: ACCOUNT_A,
          Amount: '10000',
          Destination: 'not-an-address',
          FinishAfter,
        }),
      ).toThrow(/Destination/);
    });

    it('throws when Destination equals Account (rippled preclaim temMALFORMED)', () => {
      expect(() =>
        escrowCreate({
          Account: ACCOUNT_A,
          Amount: '10000',
          Destination: ACCOUNT_A,
          FinishAfter,
        }),
      ).toThrow(/yourself/);
    });
  });

  describe('Amount validation', () => {
    it('throws when Amount is the literal string "0"', () => {
      expect(() =>
        escrowCreate({
          Account: ACCOUNT_A,
          Amount: '0',
          Destination: ACCOUNT_B,
          FinishAfter,
        }),
      ).toThrow(/positive/);
    });

    it('throws when Amount is a negative string', () => {
      expect(() =>
        escrowCreate({
          Account: ACCOUNT_A,
          Amount: '-1',
          Destination: ACCOUNT_B,
          FinishAfter,
        }),
      ).toThrow(/positive/);
    });

    it('throws when Amount is missing', () => {
      expect(() =>
        escrowCreate({
          Account: ACCOUNT_A,
          Amount: undefined as never,
          Destination: ACCOUNT_B,
          FinishAfter,
        }),
      ).toThrow(/Amount/);
    });

    it('throws when Amount is not a valid Amount shape', () => {
      expect(() =>
        escrowCreate({
          Account: ACCOUNT_A,
          Amount: 1000 as never, // number, not string or object
          Destination: ACCOUNT_B,
          FinishAfter,
        }),
      ).toThrow(/Amount/);
    });

    it('accepts a positive IOU issued-currency amount', () => {
      const tx = escrowCreate({
        Account: ACCOUNT_A,
        Amount: {
          currency: 'USD',
          issuer: ACCOUNT_B,
          value: '12.5',
        },
        Destination: ACCOUNT_B,
        FinishAfter,
      });
      expect(tx.Amount).toEqual({
        currency: 'USD',
        issuer: ACCOUNT_B,
        value: '12.5',
      });
    });

    it('rejects a zero-value IOU amount', () => {
      expect(() =>
        escrowCreate({
          Account: ACCOUNT_A,
          Amount: {
            currency: 'USD',
            issuer: ACCOUNT_B,
            value: '0',
          },
          Destination: ACCOUNT_B,
          FinishAfter,
        }),
      ).toThrow(/positive/);
    });
  });

  describe('CancelAfter / FinishAfter validation', () => {
    it('throws when neither CancelAfter nor FinishAfter is specified', () => {
      expect(() =>
        escrowCreate({
          Account: ACCOUNT_A,
          Amount: '10000',
          Destination: ACCOUNT_B,
          Condition: CONDITION_OK,
        }),
      ).toThrow(/CancelAfter or FinishAfter/);
    });

    it('throws when FinishAfter is negative', () => {
      expect(() =>
        escrowCreate({
          Account: ACCOUNT_A,
          Amount: '10000',
          Destination: ACCOUNT_B,
          FinishAfter: -1,
        }),
      ).toThrow(/UInt32/);
    });

    it('throws when FinishAfter is not an integer', () => {
      expect(() =>
        escrowCreate({
          Account: ACCOUNT_A,
          Amount: '10000',
          Destination: ACCOUNT_B,
          FinishAfter: 1.5,
        }),
      ).toThrow(/UInt32/);
    });

    it('throws when FinishAfter is a string', () => {
      expect(() =>
        escrowCreate({
          Account: ACCOUNT_A,
          Amount: '10000',
          Destination: ACCOUNT_B,
          FinishAfter: '533171558' as never,
        }),
      ).toThrow(/UInt32/);
    });

    it('throws when FinishAfter precedes the Ripple Epoch', () => {
      expect(() =>
        escrowCreate({
          Account: ACCOUNT_A,
          Amount: '10000',
          Destination: ACCOUNT_B,
          FinishAfter: 1000, // 1970-01-01-ish
        }),
      ).toThrow(/Ripple Epoch/);
    });

    it('throws when FinishAfter >= CancelAfter', () => {
      expect(() =>
        escrowCreate({
          Account: ACCOUNT_A,
          Amount: '10000',
          Destination: ACCOUNT_B,
          FinishAfter: CancelAfter,
          CancelAfter,
        }),
      ).toThrow(/less than/);
    });
  });

  describe('Condition validation', () => {
    it('throws when Condition is not a string', () => {
      expect(() =>
        escrowCreate({
          Account: ACCOUNT_A,
          Amount: '10000',
          Destination: ACCOUNT_B,
          FinishAfter,
          Condition: 0x141243 as never,
        }),
      ).toThrow(/Condition/);
    });

    it('throws when Condition is non-hex', () => {
      expect(() =>
        escrowCreate({
          Account: ACCOUNT_A,
          Amount: '10000',
          Destination: ACCOUNT_B,
          FinishAfter,
          Condition: 'Z'.repeat(80),
        }),
      ).toThrow(/Condition/);
    });

    it('accepts a hex Condition (any length is valid — length is not locally checked)', () => {
      const tx = escrowCreate({
        Account: ACCOUNT_A,
        Amount: '10000',
        Destination: ACCOUNT_B,
        FinishAfter,
        Condition: CONDITION_OK,
      });
      expect(tx.Condition).toBe(CONDITION_OK);
    });

    it('throws when both FinishAfter and Condition are missing (xrpl.js check)', () => {
      expect(() =>
        escrowCreate({
          Account: ACCOUNT_A,
          Amount: '10000',
          Destination: ACCOUNT_B,
          CancelAfter,
        }),
      ).toThrow(/FinishAfter or Condition/);
    });
  });

  describe('DestinationTag validation', () => {
    it('accepts a UInt32 DestinationTag', () => {
      const tx = escrowCreate({
        Account: ACCOUNT_A,
        Amount: '10000',
        Destination: ACCOUNT_B,
        FinishAfter,
        DestinationTag: 23480,
      });
      expect(tx.DestinationTag).toBe(23480);
    });

    it('throws on negative DestinationTag', () => {
      expect(() =>
        escrowCreate({
          Account: ACCOUNT_A,
          Amount: '10000',
          Destination: ACCOUNT_B,
          FinishAfter,
          DestinationTag: -1,
        }),
      ).toThrow(/UInt32/);
    });

    it('throws on string DestinationTag', () => {
      expect(() =>
        escrowCreate({
          Account: ACCOUNT_A,
          Amount: '10000',
          Destination: ACCOUNT_B,
          FinishAfter,
          DestinationTag: '23480' as never,
        }),
      ).toThrow(/UInt32/);
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
        (tx as unknown as Record<string, unknown>).Amount = '999';
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      const tx = make();
      const tx2 = tx.with({ Amount: '50000' });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Amount).toBe('50000');
      expect(tx.Amount).toBe('10000');
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() => tx.with({ Amount: '0' })).toThrow(/positive/);
      expect(() => tx.with({ Destination: tx.Account })).toThrow(/yourself/);
      expect(() =>
        tx.with({ FinishAfter: undefined, Condition: undefined }),
      ).toThrow();
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = escrowCreate({
        Account: ACCOUNT_A,
        Amount: '10000',
        Destination: ACCOUNT_B,
        CancelAfter,
        FinishAfter,
        Condition: CONDITION_OK,
        DestinationTag: 23480,
        Fee: '12',
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'EscrowCreate',
        Account: ACCOUNT_A,
        Amount: '10000',
        Destination: ACCOUNT_B,
        CancelAfter,
        FinishAfter,
        Condition: CONDITION_OK,
        DestinationTag: 23480,
        Fee: '12',
      });
    });

    it('.toJSON() skips undefined fields and methods', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('CancelAfter' in json).toBe(false);
      expect('Condition' in json).toBe(false);
      expect('DestinationTag' in json).toBe(false);
      expect('Flags' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op after construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });
});