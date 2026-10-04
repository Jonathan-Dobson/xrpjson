/**
 * Tests for the functional AMMCreate factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, Amount, Amount2, TradingFee).
 *   2. Amount form coverage (XRP string, IOU object, MPT object).
 *   3. Amount sub-field validation (currency length, hex, issuer, value,
 *      mpt_issuance_id length/hex, positive value).
 *   4. TradingFee validation (must be an integer, in [0, 1000]).
 *   5. Cross-field invariant: at most one of Amount / Amount2 may be XRP.
 *   6. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined values).
 *   7. .with() re-validates on overrides.
 */
import { describe, it, expect } from 'vitest';
import { ammCreate } from '../../src/fp/factories/amm-create.js';

// ─── Test fixtures ───────────────────────────────────────────────────

const ACCOUNT = 'rWYkbWkCeg8dP6rXALnjgZSjjLyih5NXm';
const ISSUER = 'rPyfep3gcLzkosKC9XiE77Y8DZWG6iWDT9';

const XRP_AMOUNT = '1000000';
const IOU_AMOUNT = {
  currency: 'USD',
  issuer: ISSUER,
  value: '1000',
};
const MPT_AMOUNT = {
  mpt_issuance_id: '00000000000000000000000001',
  value: '500',
};

function make(extras: Record<string, unknown> = {}) {
  return ammCreate({
    Account: ACCOUNT,
    Amount: XRP_AMOUNT,
    Amount2: IOU_AMOUNT,
    TradingFee: 12,
    ...extras,
  });
}

describe('fp/ammCreate()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('AMMCreate');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.Amount).toBe(XRP_AMOUNT);
      expect(tx.Amount2).toEqual(IOU_AMOUNT);
      expect(tx.TradingFee).toBe(12);
      expect(tx.Flags).toBeUndefined();
      expect(tx.Fee).toBeUndefined();
      expect(tx.Sequence).toBeUndefined();
    });

    it('constructs with all base tx fields', () => {
      const tx = ammCreate({
        Account: ACCOUNT,
        Amount: IOU_AMOUNT,
        Amount2: MPT_AMOUNT,
        TradingFee: 250,
        Flags: 0,
        Fee: '200000',
        Sequence: 94041760,
      });
      expect(tx.TradingFee).toBe(250);
      expect(tx.Flags).toBe(0);
      expect(tx.Fee).toBe('200000');
      expect(tx.Sequence).toBe(94041760);
      expect(tx.Amount).toEqual(IOU_AMOUNT);
      expect(tx.Amount2).toEqual(MPT_AMOUNT);
    });

    it('accepts boundary TradingFee values (0 and 1000)', () => {
      const lo = ammCreate({
        Account: ACCOUNT,
        Amount: XRP_AMOUNT,
        Amount2: IOU_AMOUNT,
        TradingFee: 0,
      });
      const hi = ammCreate({
        Account: ACCOUNT,
        Amount: XRP_AMOUNT,
        Amount2: IOU_AMOUNT,
        TradingFee: 1000,
      });
      expect(lo.TradingFee).toBe(0);
      expect(hi.TradingFee).toBe(1000);
    });

    it('accepts an MPT / XRP asset pair', () => {
      const tx = ammCreate({
        Account: ACCOUNT,
        Amount: MPT_AMOUNT,
        Amount2: XRP_AMOUNT,
        TradingFee: 1,
      });
      expect(tx.Amount).toEqual(MPT_AMOUNT);
      expect(tx.Amount2).toBe(XRP_AMOUNT);
    });
  });

  describe('Account validation', () => {
    it('throws when Account is missing', () => {
      expect(() =>
        ammCreate({
          Account: undefined as never,
          Amount: XRP_AMOUNT,
          Amount2: IOU_AMOUNT,
          TradingFee: 12,
        }),
      ).toThrow(/Account/);
    });

    it('throws when Account is not a valid XRPL address', () => {
      expect(() =>
        ammCreate({
          Account: 'not-an-address',
          Amount: XRP_AMOUNT,
          Amount2: IOU_AMOUNT,
          TradingFee: 12,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('Amount / Amount2 validation', () => {
    it('throws when Amount is missing', () => {
      expect(() =>
        ammCreate({
          Account: ACCOUNT,
          Amount: undefined as never,
          Amount2: IOU_AMOUNT,
          TradingFee: 12,
        }),
      ).toThrow(/Amount/);
    });

    it('throws when Amount is not a valid Amount (e.g. plain number)', () => {
      expect(() =>
        ammCreate({
          Account: ACCOUNT,
          Amount: 1000 as never,
          Amount2: IOU_AMOUNT,
          TradingFee: 12,
        }),
      ).toThrow(/Amount/);
    });

    it('throws when Amount2 is missing', () => {
      expect(() =>
        ammCreate({
          Account: ACCOUNT,
          Amount: XRP_AMOUNT,
          Amount2: undefined as never,
          TradingFee: 12,
        }),
      ).toThrow(/Amount2/);
    });

    it('throws when Amount2 is not a valid Amount', () => {
      expect(() =>
        ammCreate({
          Account: ACCOUNT,
          Amount: XRP_AMOUNT,
          Amount2: 1000 as never,
          TradingFee: 12,
        }),
      ).toThrow(/Amount2/);
    });

    it('throws when IOU Amount has a bad currency length', () => {
      expect(() =>
        ammCreate({
          Account: ACCOUNT,
          Amount: { currency: 'USDD', issuer: ISSUER, value: '1' },
          Amount2: IOU_AMOUNT,
          TradingFee: 12,
        }),
      ).toThrow(/currency/);
    });

    it('throws when 40-char currency is not hex', () => {
      expect(() =>
        ammCreate({
          Account: ACCOUNT,
          Amount: {
            currency: 'Z'.repeat(40),
            issuer: ISSUER,
            value: '1',
          },
          Amount2: IOU_AMOUNT,
          TradingFee: 12,
        }),
      ).toThrow(/hex/);
    });

    it('accepts a 40-char hex currency', () => {
      const hexCcy = '0158415500000000C1F76FFA276C27E60FBC1DAD';
      const tx = ammCreate({
        Account: ACCOUNT,
        Amount: { currency: hexCcy, issuer: ISSUER, value: '1' },
        Amount2: IOU_AMOUNT,
        TradingFee: 12,
      });
      expect(tx.Amount).toEqual({
        currency: hexCcy,
        issuer: ISSUER,
        value: '1',
      });
    });

    it('throws when IOU issuer is not a valid account', () => {
      expect(() =>
        ammCreate({
          Account: ACCOUNT,
          Amount: { currency: 'USD', issuer: 'bogus', value: '1' },
          Amount2: IOU_AMOUNT,
          TradingFee: 12,
        }),
      ).toThrow(/issuer/);
    });

    it('throws when IOU value is negative', () => {
      expect(() =>
        ammCreate({
          Account: ACCOUNT,
          Amount: { currency: 'USD', issuer: ISSUER, value: '-1' },
          Amount2: IOU_AMOUNT,
          TradingFee: 12,
        }),
      ).toThrow(/value/);
    });

    it('throws when IOU value is non-numeric', () => {
      expect(() =>
        ammCreate({
          Account: ACCOUNT,
          Amount: { currency: 'USD', issuer: ISSUER, value: 'abc' },
          Amount2: IOU_AMOUNT,
          TradingFee: 12,
        }),
      ).toThrow(/value/);
    });

    it('throws when IOU value is zero (must be positive)', () => {
      expect(() =>
        ammCreate({
          Account: ACCOUNT,
          Amount: { currency: 'USD', issuer: ISSUER, value: '0' },
          Amount2: IOU_AMOUNT,
          TradingFee: 12,
        }),
      ).toThrow(/positive/);
    });

    it('throws when XRP amount is zero (must be positive)', () => {
      expect(() =>
        ammCreate({
          Account: ACCOUNT,
          Amount: '0',
          Amount2: IOU_AMOUNT,
          TradingFee: 12,
        }),
      ).toThrow(/positive/);
    });

    it('throws when XRP amount is not a number string', () => {
      expect(() =>
        ammCreate({
          Account: ACCOUNT,
          Amount: '1000x',
          Amount2: IOU_AMOUNT,
          TradingFee: 12,
        }),
      ).toThrow(/base-10/);
    });

    it('throws when MPTAmount has a short mpt_issuance_id', () => {
      expect(() =>
        ammCreate({
          Account: ACCOUNT,
          Amount: XRP_AMOUNT,
          Amount2: { mpt_issuance_id: 'abc', value: '1' },
          TradingFee: 12,
        }),
      ).toThrow(/mpt_issuance_id/);
    });

    it('throws when MPTAmount has a non-hex mpt_issuance_id', () => {
      expect(() =>
        ammCreate({
          Account: ACCOUNT,
          Amount: XRP_AMOUNT,
          Amount2: {
            mpt_issuance_id: 'Z'.repeat(24),
            value: '1',
          },
          TradingFee: 12,
        }),
      ).toThrow(/mpt_issuance_id/);
    });

    it('throws when MPTAmount value is zero', () => {
      expect(() =>
        ammCreate({
          Account: ACCOUNT,
          Amount: XRP_AMOUNT,
          Amount2: {
            mpt_issuance_id: '00000000000000000000000001',
            value: '0',
          },
          TradingFee: 12,
        }),
      ).toThrow(/positive/);
    });
  });

  describe('TradingFee validation', () => {
    it('throws when TradingFee is missing', () => {
      expect(() =>
        ammCreate({
          Account: ACCOUNT,
          Amount: XRP_AMOUNT,
          Amount2: IOU_AMOUNT,
          TradingFee: undefined as never,
        }),
      ).toThrow(/TradingFee/);
    });

    it('throws when TradingFee is a string', () => {
      expect(() =>
        ammCreate({
          Account: ACCOUNT,
          Amount: XRP_AMOUNT,
          Amount2: IOU_AMOUNT,
          TradingFee: '12' as never,
        }),
      ).toThrow(/TradingFee/);
    });

    it('throws when TradingFee is greater than 1000', () => {
      expect(() =>
        ammCreate({
          Account: ACCOUNT,
          Amount: XRP_AMOUNT,
          Amount2: IOU_AMOUNT,
          TradingFee: 1001,
        }),
      ).toThrow(/TradingFee/);
    });

    it('throws when TradingFee is negative', () => {
      expect(() =>
        ammCreate({
          Account: ACCOUNT,
          Amount: XRP_AMOUNT,
          Amount2: IOU_AMOUNT,
          TradingFee: -1,
        }),
      ).toThrow(/TradingFee/);
    });

    it('throws when TradingFee is a non-integer (e.g. 1.5)', () => {
      expect(() =>
        ammCreate({
          Account: ACCOUNT,
          Amount: XRP_AMOUNT,
          Amount2: IOU_AMOUNT,
          TradingFee: 1.5,
        }),
      ).toThrow(/integer/);
    });
  });

  describe('cross-field invariant: at most one of Amount / Amount2 may be XRP', () => {
    it('throws when both Amount and Amount2 are XRP strings', () => {
      expect(() =>
        ammCreate({
          Account: ACCOUNT,
          Amount: '1000',
          Amount2: '2000',
          TradingFee: 12,
        }),
      ).toThrow(/at most one/);
    });

    it('accepts one XRP and one IOU', () => {
      const tx = ammCreate({
        Account: ACCOUNT,
        Amount: '1000',
        Amount2: IOU_AMOUNT,
        TradingFee: 12,
      });
      expect(tx.Amount).toBe('1000');
      expect(tx.Amount2).toEqual(IOU_AMOUNT);
    });

    it('accepts one IOU and one MPT (no XRP)', () => {
      const tx = ammCreate({
        Account: ACCOUNT,
        Amount: IOU_AMOUNT,
        Amount2: MPT_AMOUNT,
        TradingFee: 12,
      });
      expect(tx.Amount).toEqual(IOU_AMOUNT);
      expect(tx.Amount2).toEqual(MPT_AMOUNT);
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
        (tx as { TradingFee: number }).TradingFee = 999;
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides', () => {
      const tx = make();
      const tx2 = tx.with({ TradingFee: 250 });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.TradingFee).toBe(250);
      expect(tx.TradingFee).toBe(12);
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() => tx.with({ TradingFee: 9999 })).toThrow(/TradingFee/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({ Fee: '200000', Sequence: 7 });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'AMMCreate',
        Account: ACCOUNT,
        Amount: XRP_AMOUNT,
        Amount2: IOU_AMOUNT,
        TradingFee: 12,
        Fee: '200000',
        Sequence: 7,
      });
    });

    it('.toJSON() skips undefined fields', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('Fee' in json).toBe(false);
      expect('Flags' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op after successful construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });

  // ─── Base transaction fields ──────────────────────────────────────────────
  // `AmmCreateProps` now extends `BasePropsFields`, so the seven shared base
  // fields that were previously absent from this factory's prop type — Memos,
  // SourceTag, LastLedgerSequence, AccountTxnID, NetworkID, Delegate and
  // TicketSequence — are part of the type surface and survive onto the frozen
  // transaction.
  //
  // Every accept value below is chosen to be VALID under
  // `validateBaseTransaction` (src/validation/base.ts). The factory now CALLS
  // that validator as its final check, immediately before `buildFrozenTx` and
  // after every AMMCreate-specific check, so the reject cases below reach the
  // shared validator's messages — and a more specific mistake still produces
  // the AMMCreate-specific message.
  describe('BaseTransactionFields', () => {
    const base = {
      Account: ACCOUNT,
      Amount: XRP_AMOUNT,
      Amount2: IOU_AMOUNT,
      TradingFee: 12,
    };
    const MEMOS = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
    const TXN_ID = 'AB'.repeat(32);

    it('accepts Memos', () => {
      const tx = ammCreate({ ...base, Memos: MEMOS });
      expect(tx.Memos).toEqual(MEMOS);
      expect(tx.toJSON().Memos).toEqual(MEMOS);
    });

    it('accepts SourceTag', () => {
      const tx = ammCreate({ ...base, SourceTag: 99 });
      expect(tx.SourceTag).toBe(99);
      expect(tx.toJSON().SourceTag).toBe(99);
    });

    it('accepts LastLedgerSequence', () => {
      const tx = ammCreate({ ...base, LastLedgerSequence: 1_000_000 });
      expect(tx.LastLedgerSequence).toBe(1_000_000);
      expect(tx.toJSON().LastLedgerSequence).toBe(1_000_000);
    });

    it('accepts AccountTxnID', () => {
      const tx = ammCreate({ ...base, AccountTxnID: TXN_ID });
      expect(tx.AccountTxnID).toBe(TXN_ID);
      expect(tx.toJSON().AccountTxnID).toBe(TXN_ID);
    });

    it('accepts NetworkID', () => {
      const tx = ammCreate({ ...base, NetworkID: 1 });
      expect(tx.NetworkID).toBe(1);
      expect(tx.toJSON().NetworkID).toBe(1);
    });

    it('accepts a Delegate distinct from Account', () => {
      const tx = ammCreate({ ...base, Delegate: ISSUER });
      expect(tx.Delegate).toBe(ISSUER);
      expect(tx.toJSON().Delegate).toBe(ISSUER);
    });

    it('accepts TicketSequence alongside Sequence: 0', () => {
      const tx = ammCreate({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.TicketSequence).toBe(42);
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    it('rejects a malformed Memos value', () => {
      expect(() => ammCreate({ ...base, Memos: 'not-an-array' } as any)).toThrow(
        /invalid Memos/,
      );
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() => ammCreate({ ...base, SourceTag: 'NaN' } as any)).toThrow(
        /SourceTag must be a number/,
      );
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() =>
        ammCreate({ ...base, LastLedgerSequence: 'soon' } as any),
      ).toThrow(/LastLedgerSequence must be a number/);
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() => ammCreate({ ...base, AccountTxnID: 12345 } as any)).toThrow(
        /AccountTxnID must be a string/,
      );
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() => ammCreate({ ...base, NetworkID: {} } as any)).toThrow(
        /NetworkID must be a number/,
      );
    });

    it('rejects Delegate equal to Account', () => {
      expect(() => ammCreate({ ...base, Delegate: ACCOUNT })).toThrow(
        /cannot be the same/,
      );
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() => ammCreate({ ...base, TicketSequence: 'nope' } as any)).toThrow(
        /TicketSequence must be a number/,
      );
    });
  });
});