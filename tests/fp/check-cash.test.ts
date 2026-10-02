/**
 * Tests for the functional CheckCash factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, CheckID, plus either
 *      Amount or DeliverMin) and all three Amount forms (XRP drops,
 *      trust line, MPT).
 *   2. Optional field handling (Fee, Sequence, Flags).
 *   3. XOR invariant: cannot have both Amount and DeliverMin, must have one.
 *   4. Spec-mandated guards the class API omits:
 *        a. CheckID must be a 64-char hex string (UInt256).
 *        b. CheckID must not be the all-zeros HASH256 (fixCleanup3_3_0).
 *        c. Amount / DeliverMin must be a valid Amount shape.
 *        d. Amount / DeliverMin must be strictly positive (temBAD_AMOUNT).
 *   5. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined fields).
 */
import { describe, it, expect } from 'vitest';
import { checkCash } from '../../src/fp/factories/check-cash.js';

const SENDER = 'rfkE1aSy9G8Upk4JssnwBxhEv5p4mn2KTy';
const ISSUER = 'rXJSJiZMxaLuH3kQBUV5DLipnYtrE6iVb';
// 64-char hex CheckID from xrpl.org `checkcash.md` example.
const VALID_CHECK_ID =
  '838766BA2B995C00744175F69A1B11E32C3DBC40E64801A4056FCBD657F57334';

const IOU_AMOUNT = { currency: 'TST', issuer: ISSUER, value: '100' };
const MPT_AMOUNT = { mpt_issuance_id: '00000001', value: '100' };

function make(extras: Record<string, unknown> = {}) {
  return checkCash({
    Account: SENDER,
    CheckID: VALID_CHECK_ID,
    Amount: '100000000',
    ...extras,
  });
}

describe('fp/checkCash()', () => {
  describe('construction', () => {
    it('constructs with Amount as XRP drops', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('CheckCash');
      expect(tx.Account).toBe(SENDER);
      expect(tx.CheckID).toBe(VALID_CHECK_ID);
      expect(tx.Amount).toBe('100000000');
    });

    it('constructs with Amount as an IssuedCurrencyAmount', () => {
      const tx = checkCash({
        Account: SENDER,
        CheckID: VALID_CHECK_ID,
        Amount: IOU_AMOUNT,
      });
      expect(tx.Amount).toEqual(IOU_AMOUNT);
    });

    it('constructs with Amount as an MPTAmount', () => {
      const tx = checkCash({
        Account: SENDER,
        CheckID: VALID_CHECK_ID,
        Amount: MPT_AMOUNT,
      });
      expect(tx.Amount).toEqual(MPT_AMOUNT);
    });

    it('constructs with DeliverMin instead of Amount', () => {
      const tx = checkCash({
        Account: SENDER,
        CheckID: VALID_CHECK_ID,
        DeliverMin: '50000000',
      });
      expect(tx.DeliverMin).toBe('50000000');
      expect(tx.Amount).toBeUndefined();
    });

    it('passes through optional Fee / Sequence / Flags', () => {
      const tx = make({ Flags: 0, Fee: '12', Sequence: 8 });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(8);
      expect(tx.Flags).toBe(0);
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        checkCash({
          Account: '' as never,
          CheckID: VALID_CHECK_ID,
          Amount: '1000',
        }),
      ).toThrow(/Account/);
    });

    it('throws on a malformed Account address', () => {
      expect(() =>
        checkCash({
          Account: 'not-an-address' as never,
          CheckID: VALID_CHECK_ID,
          Amount: '1000',
        }),
      ).toThrow(/Account/);
    });
  });

  describe('CheckID validation (UInt256 hex)', () => {
    it('throws on missing CheckID', () => {
      expect(() =>
        checkCash({
          Account: SENDER,
          CheckID: '' as never,
          Amount: '1000',
        }),
      ).toThrow(/CheckID/);
    });

    it('throws on a non-string CheckID', () => {
      expect(() =>
        checkCash({
          Account: SENDER,
          CheckID: 12345 as never,
          Amount: '1000',
        }),
      ).toThrow(/CheckID/);
    });

    it('throws on a CheckID of wrong length', () => {
      expect(() =>
        checkCash({
          Account: SENDER,
          CheckID: 'DEADBEEF',
          Amount: '1000',
        }),
      ).toThrow(/CheckID/);
    });

    it('throws on a non-hex CheckID', () => {
      expect(() =>
        checkCash({
          Account: SENDER,
          CheckID: 'Z'.repeat(64),
          Amount: '1000',
        }),
      ).toThrow(/CheckID/);
    });

    it('throws on the all-zeros HASH256 CheckID (xrpl.org fixCleanup3_3_0: temMALFORMED)', () => {
      expect(() =>
        checkCash({
          Account: SENDER,
          CheckID: '0'.repeat(64),
          Amount: '1000',
        }),
      ).toThrow(/all-zeros/);
    });

    it('accepts a 64-char hex CheckID', () => {
      const tx = make();
      expect(tx.CheckID).toBe(VALID_CHECK_ID);
    });
  });

  describe('Amount / DeliverMin XOR invariant', () => {
    it('throws when both Amount and DeliverMin are provided', () => {
      expect(() =>
        checkCash({
          Account: SENDER,
          CheckID: VALID_CHECK_ID,
          Amount: '1000',
          DeliverMin: '500',
        }),
      ).toThrow(/cannot have both/);
    });

    it('throws when neither Amount nor DeliverMin is provided', () => {
      expect(() =>
        checkCash({
          Account: SENDER,
          CheckID: VALID_CHECK_ID,
        }),
      ).toThrow(/must have either/);
    });
  });

  describe('Amount validation', () => {
    it('throws on a malformed Amount (not a valid Amount form)', () => {
      expect(() =>
        checkCash({
          Account: SENDER,
          CheckID: VALID_CHECK_ID,
          Amount: 12345 as never,
        }),
      ).toThrow(/Amount/);
    });

    it('throws on a zero XRP drops Amount (xrpl.org temBAD_AMOUNT)', () => {
      expect(() =>
        checkCash({
          Account: SENDER,
          CheckID: VALID_CHECK_ID,
          Amount: '0',
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on a negative XRP drops Amount (xrpl.org temBAD_AMOUNT)', () => {
      expect(() =>
        checkCash({
          Account: SENDER,
          CheckID: VALID_CHECK_ID,
          Amount: '-1',
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on a zero IOU Amount value', () => {
      expect(() =>
        checkCash({
          Account: SENDER,
          CheckID: VALID_CHECK_ID,
          Amount: { currency: 'TST', issuer: ISSUER, value: '0' },
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on a negative IOU Amount value', () => {
      expect(() =>
        checkCash({
          Account: SENDER,
          CheckID: VALID_CHECK_ID,
          Amount: { currency: 'TST', issuer: ISSUER, value: '-100' },
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on a zero MPT Amount value', () => {
      expect(() =>
        checkCash({
          Account: SENDER,
          CheckID: VALID_CHECK_ID,
          Amount: { mpt_issuance_id: '00000001', value: '0' },
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on a negative MPT Amount value', () => {
      expect(() =>
        checkCash({
          Account: SENDER,
          CheckID: VALID_CHECK_ID,
          Amount: { mpt_issuance_id: '00000001', value: '-100' },
        }),
      ).toThrow(/strictly positive/);
    });
  });

  describe('DeliverMin validation', () => {
    it('throws on a malformed DeliverMin (not a valid Amount form)', () => {
      expect(() =>
        checkCash({
          Account: SENDER,
          CheckID: VALID_CHECK_ID,
          DeliverMin: 99999 as never,
        }),
      ).toThrow(/DeliverMin/);
    });

    it('throws on a zero DeliverMin (xrpl.org temBAD_AMOUNT)', () => {
      expect(() =>
        checkCash({
          Account: SENDER,
          CheckID: VALID_CHECK_ID,
          DeliverMin: '0',
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on a negative DeliverMin (xrpl.org temBAD_AMOUNT)', () => {
      expect(() =>
        checkCash({
          Account: SENDER,
          CheckID: VALID_CHECK_ID,
          DeliverMin: '-1',
        }),
      ).toThrow(/strictly positive/);
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
      const tx2 = tx.with({ Amount: '200000000' });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Amount).toBe('200000000');
      expect(tx.Amount).toBe('100000000');
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() => tx.with({ CheckID: '0'.repeat(64) })).toThrow(/all-zeros/);
      expect(() => tx.with({ Amount: '0' })).toThrow(/strictly positive/);
      expect(() => tx.with({ Amount: '-5' })).toThrow(/strictly positive/);
      expect(() => tx.with({ CheckID: 'short' })).toThrow(/CheckID/);
      expect(() =>
        tx.with({ Amount: '100', DeliverMin: '50' }),
      ).toThrow(/cannot have both/);
      // Drop the only Amount without supplying DeliverMin — XOR invariant.
      const baseProps = {
        Account: SENDER,
        CheckID: VALID_CHECK_ID,
        Amount: '1',
      };
      const base = checkCash(baseProps);
      expect(() => base.with({ Amount: undefined as never })).toThrow(
        /must have either/,
      );
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = checkCash({
        Account: SENDER,
        CheckID: VALID_CHECK_ID,
        Amount: '5000000',
        Fee: '12',
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'CheckCash',
        Account: SENDER,
        CheckID: VALID_CHECK_ID,
        Amount: '5000000',
        Fee: '12',
      });
    });

    it('.toJSON() skips undefined fields and methods', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('DeliverMin' in json).toBe(false);
      expect('Flags' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op after construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });

  // ─── BaseTransactionFields ───
  // The props type now extends
  // `Omit<BaseTransactionFields, 'TransactionType' | 'Flags'>`, so the seven
  // fields that were absent from every factory's prop type are accepted here,
  // and `validateBaseTransaction` checks them. Before this, each REJECT case
  // below built a frozen transaction silently.
  //
  // Scope: this asserts the shared base-field contract for this one factory.
  // It is not a claim about the factories that have not been converted.
  describe('BaseTransactionFields', () => {
    const A = make({}).Account;

    it('accepts TicketSequence (the field that made tickets unspendable)', () => {
      const tx = make({ TicketSequence: 42 });
      expect(tx.TicketSequence).toBe(42);
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() => make({ TicketSequence: 'nope' } as any)).toThrow(
        /TicketSequence must be a number/,
      );
    });

    it('accepts a valid Memos array', () => {
      const tx = make({ Memos: [{"Memo":{"MemoType":"74","MemoData":"6869"}}] });
      expect(tx.Memos).toEqual([{"Memo":{"MemoType":"74","MemoData":"6869"}}]);
    });

    it('rejects a malformed Memos value', () => {
      expect(() => make({ Memos: 'not-an-array' } as any)).toThrow(
        /invalid Memos/,
      );
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() => make({ SourceTag: 'NaN' } as any)).toThrow(
        /SourceTag must be a number/,
      );
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() => make({ NetworkID: {} } as any)).toThrow(
        /NetworkID must be a number/,
      );
    });

    it('rejects Delegate equal to Account', () => {
      expect(() => make({ Delegate: A })).toThrow(/cannot be the same/);
    });

    it('rejects a non-string Fee', () => {
      expect(() => make({ Fee: 12 } as any)).toThrow(/Fee must be a string/);
    });

    it('survives .with() with a base field set', () => {
      const tx = make({ SourceTag: 99 });
      const next = tx.with({ SourceTag: 100 } as any);
      expect(next.SourceTag).toBe(100);
    });
  });

});