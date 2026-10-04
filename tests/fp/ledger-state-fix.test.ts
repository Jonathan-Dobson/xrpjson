/**
 * Tests for the functional LedgerStateFix factory.
 *
 * Validates:
 *   1. Construction with the only currently-defined `LedgerFixType` (1).
 *   2. Required `Owner` when `LedgerFixType === 1`; optional otherwise.
 *   3. `LedgerFixType` is a UInt16 (rejects out-of-range / non-integer).
 *   4. Special Transaction Cost: `Fee` must be ≥ 2,000,000 drops.
 *   5. `Account` and `Owner` must be valid XRPL addresses.
 *   6. Frozen-shape contract (mutation throws, .with() returns a new
 *      frozen object, .toJSON() strips methods and undefined values).
 */
import { describe, it, expect } from 'vitest';
import { ledgerStateFix } from '../../src/fp/factories/ledger-state-fix.js';

const SENDER = 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn';
const NFTOKEN_OWNER = 'ra5nK24KXen9AHvsdFTKHSANinZseWnPcX';
const OTHER_ACCOUNT = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

const MIN_FEE = '2000000';

function make(extras: Record<string, unknown> = {}) {
  return ledgerStateFix({
    Account: SENDER,
    LedgerFixType: 1,
    Owner: NFTOKEN_OWNER,
    Fee: MIN_FEE,
    Sequence: 2,
    ...extras,
  });
}

describe('fp/ledgerStateFix()', () => {
  describe('construction', () => {
    it('constructs with the only documented LedgerFixType (1)', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('LedgerStateFix');
      expect(tx.Account).toBe(SENDER);
      expect(tx.LedgerFixType).toBe(1);
      expect(tx.Owner).toBe(NFTOKEN_OWNER);
      expect(tx.Fee).toBe(MIN_FEE);
      expect(tx.Sequence).toBe(2);
      expect(Object.isFrozen(tx)).toBe(true);
    });

    it('constructs without Fee / Sequence (signing layer fills them)', () => {
      const tx = ledgerStateFix({
        Account: SENDER,
        LedgerFixType: 1,
        Owner: NFTOKEN_OWNER,
      });
      expect(tx.Fee).toBeUndefined();
      expect(tx.Sequence).toBeUndefined();
    });

    it('accepts Owner that differs from Account (spec allows it)', () => {
      const tx = ledgerStateFix({
        Account: SENDER,
        LedgerFixType: 1,
        Owner: OTHER_ACCOUNT,
      });
      expect(tx.Owner).toBe(OTHER_ACCOUNT);
      expect(tx.Account).toBe(SENDER);
    });
  });

  describe('Account validation', () => {
    it('throws when Account is missing', () => {
      expect(() =>
        ledgerStateFix({
          Account: undefined as unknown as string,
          LedgerFixType: 1,
          Owner: NFTOKEN_OWNER,
        }),
      ).toThrow(/Account is required/);
    });

    it('throws when Account is not a valid XRPL address', () => {
      expect(() =>
        ledgerStateFix({
          Account: 'not-an-address',
          LedgerFixType: 1,
          Owner: NFTOKEN_OWNER,
        }),
      ).toThrow(/classic or X-address/);
    });
  });

  describe('LedgerFixType validation', () => {
    it('throws when LedgerFixType is missing', () => {
      expect(() =>
        ledgerStateFix({
          Account: SENDER,
          LedgerFixType: undefined as unknown as number,
          Owner: NFTOKEN_OWNER,
        }),
      ).toThrow(/LedgerFixType/);
    });

    it('throws when LedgerFixType is negative', () => {
      expect(() =>
        ledgerStateFix({
          Account: SENDER,
          LedgerFixType: -1,
          Owner: NFTOKEN_OWNER,
        }),
      ).toThrow(/UInt16/);
    });

    it('throws when LedgerFixType exceeds UInt16 max (65536)', () => {
      expect(() =>
        ledgerStateFix({
          Account: SENDER,
          LedgerFixType: 65536,
          Owner: NFTOKEN_OWNER,
        }),
      ).toThrow(/UInt16/);
    });

    it('accepts LedgerFixType = 65535 (UInt16 max)', () => {
      const tx = ledgerStateFix({
        Account: SENDER,
        LedgerFixType: 0xffff,
      });
      expect(tx.LedgerFixType).toBe(0xffff);
    });

    it('throws when LedgerFixType is not an integer (1.5)', () => {
      expect(() =>
        ledgerStateFix({
          Account: SENDER,
          LedgerFixType: 1.5,
          Owner: NFTOKEN_OWNER,
        }),
      ).toThrow(/integer/);
    });
  });

  describe('Owner validation', () => {
    it('throws when Owner is missing and LedgerFixType === 1', () => {
      expect(() =>
        ledgerStateFix({
          Account: SENDER,
          LedgerFixType: 1,
        }),
      ).toThrow(/Owner is required/);
    });

    it('accepts Owner being omitted for non-1 LedgerFixType', () => {
      // Future fix types may not require Owner. The factory must not
      // enforce an Owner requirement unconditionally.
      const tx = ledgerStateFix({
        Account: SENDER,
        LedgerFixType: 2,
      });
      expect(tx.Owner).toBeUndefined();
    });

    it('throws when Owner is not a valid XRPL address', () => {
      expect(() =>
        ledgerStateFix({
          Account: SENDER,
          LedgerFixType: 1,
          Owner: 'nope',
        }),
      ).toThrow(/classic or X-address/);
    });
  });

  describe('Fee validation (Special Transaction Cost)', () => {
    it('accepts Fee at exactly the owner reserve (2000000)', () => {
      const tx = make({ Fee: '2000000' });
      expect(tx.Fee).toBe('2000000');
    });

    it('accepts Fee above the owner reserve', () => {
      const tx = make({ Fee: '5000000' });
      expect(tx.Fee).toBe('5000000');
    });

    it('throws when Fee is below the owner reserve (1999999)', () => {
      expect(() => make({ Fee: '1999999' })).toThrow(/Special Transaction Cost/);
    });

    it('throws when Fee is a non-numeric string', () => {
      expect(() => make({ Fee: 'abc' })).toThrow(/Fee/);
    });

    it('throws when Fee is not a string', () => {
      expect(() => make({ Fee: 123 as unknown as string })).toThrow(/Fee/);
    });
  });

  describe('Sequence validation', () => {
    it('accepts a zero Sequence (Ticket case)', () => {
      const tx = make({ Sequence: 0 });
      expect(tx.Sequence).toBe(0);
    });

    it('throws when Sequence is negative', () => {
      expect(() => make({ Sequence: -1 })).toThrow(/Sequence/);
    });

    it('throws when Sequence is a non-integer', () => {
      expect(() => make({ Sequence: 1.5 })).toThrow(/Sequence/);
    });
  });

  describe('frozen-shape contract', () => {
    it('returns a frozen object', () => {
      expect(Object.isFrozen(make())).toBe(true);
    });

    it('mutation throws in strict mode', () => {
      const tx = make();
      expect(() => {
        (tx as unknown as Record<string, unknown>).LedgerFixType = 2;
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides', () => {
      const tx = make();
      const tx2 = tx.with({ Owner: OTHER_ACCOUNT });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Owner).toBe(OTHER_ACCOUNT);
      expect(tx.Owner).toBe(NFTOKEN_OWNER);
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      // Owner missing now invalid because LedgerFixType is still 1.
      expect(() => tx.with({ Owner: undefined })).toThrow(/Owner is required/);
      expect(() => tx.with({ Fee: '1' })).toThrow(/Special Transaction Cost/);
      expect(() => tx.with({ LedgerFixType: 70000 })).toThrow(/UInt16/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const json = make().toJSON();
      expect(json).toEqual({
        TransactionType: 'LedgerStateFix',
        Account: SENDER,
        LedgerFixType: 1,
        Owner: NFTOKEN_OWNER,
        Fee: MIN_FEE,
        Sequence: 2,
      });
    });

    it('.toJSON() skips undefined fields', () => {
      const tx = ledgerStateFix({
        Account: SENDER,
        LedgerFixType: 1,
        Owner: NFTOKEN_OWNER,
      });
      const json = tx.toJSON();
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op after successful construction', () => {
      expect(() => make().validate()).not.toThrow();
    });
  });

  // ─── Base transaction fields ──────────────────────────────────────────────
  // `LedgerStateFixProps` extends `BasePropsFields`, so the seven shared base
  // fields are part of this props type: Memos, SourceTag, LastLedgerSequence,
  // AccountTxnID, NetworkID, Delegate and TicketSequence.
  //
  // The factory now CALLS `validateBaseTransaction` as its last check before
  // `buildFrozenTx`, so both directions below are real runtime behaviour: the
  // accept cases must survive the validator, and the reject cases assert the
  // validator's own messages from src/validation/base.ts. Bad values are cast
  // `as any` deliberately — the point is the runtime check, and a type error
  // would make the tests uncompilable.
  //
  // Note: there is deliberately NO "rejects a non-string Fee" case here. This
  // factory enforces the XLS special-transaction-cost floor (Fee ≥ 2,000,000
  // drops) with its own, more specific check that runs first, so a malformed
  // Fee never reaches the base validator's `/Fee must be a string/`.
  describe('BaseTransactionFields', () => {
    const base = {
      Account: SENDER,
      LedgerFixType: 1,
      Owner: NFTOKEN_OWNER,
      Fee: MIN_FEE,
    };
    const MEMOS = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
    const TXN_ID = 'AB'.repeat(32);

    it('accepts Memos', () => {
      const tx = ledgerStateFix({ ...base, Memos: MEMOS });
      expect(tx.Memos).toEqual(MEMOS);
      expect(tx.toJSON().Memos).toEqual(MEMOS);
    });

    it('accepts SourceTag', () => {
      const tx = ledgerStateFix({ ...base, SourceTag: 99 });
      expect(tx.SourceTag).toBe(99);
    });

    it('accepts LastLedgerSequence', () => {
      const tx = ledgerStateFix({ ...base, LastLedgerSequence: 1_000_000 });
      expect(tx.LastLedgerSequence).toBe(1_000_000);
    });

    it('accepts AccountTxnID', () => {
      const tx = ledgerStateFix({ ...base, AccountTxnID: TXN_ID });
      expect(tx.AccountTxnID).toBe(TXN_ID);
    });

    it('accepts NetworkID', () => {
      const tx = ledgerStateFix({ ...base, NetworkID: 1 });
      expect(tx.NetworkID).toBe(1);
    });

    it('accepts a Delegate distinct from Account', () => {
      const tx = ledgerStateFix({ ...base, Delegate: OTHER_ACCOUNT });
      expect(tx.Delegate).toBe(OTHER_ACCOUNT);
    });

    it('accepts TicketSequence alongside Sequence: 0', () => {
      const tx = ledgerStateFix({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.TicketSequence).toBe(42);
    });

    // ─── Reject side ───

    it('rejects a malformed Memos value', () => {
      expect(() =>
        ledgerStateFix({ ...base, Memos: 'not-an-array' } as any),
      ).toThrow(/invalid Memos/);
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() => ledgerStateFix({ ...base, SourceTag: 'NaN' } as any)).toThrow(
        /SourceTag must be a number/,
      );
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() =>
        ledgerStateFix({ ...base, LastLedgerSequence: 'soon' } as any),
      ).toThrow(/LastLedgerSequence must be a number/);
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() => ledgerStateFix({ ...base, AccountTxnID: 12345 } as any)).toThrow(
        /AccountTxnID must be a string/,
      );
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() => ledgerStateFix({ ...base, NetworkID: {} } as any)).toThrow(
        /NetworkID must be a number/,
      );
    });

    it('rejects a Delegate that is not a valid address', () => {
      expect(() =>
        ledgerStateFix({ ...base, Delegate: 'not-an-address' } as any),
      ).toThrow(/invalid Delegate/);
    });

    it('rejects a Delegate equal to Account', () => {
      expect(() => ledgerStateFix({ ...base, Delegate: base.Account })).toThrow(
        /cannot be the same/,
      );
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() =>
        ledgerStateFix({ ...base, TicketSequence: 'nope' } as any),
      ).toThrow(/TicketSequence must be a number/);
    });

    it('still checks the special transaction cost before the shared fields', () => {
      // Ordering check: the factory's own Fee floor wins over the base
      // validator's backstop, and wins over a malformed SourceTag too.
      expect(() =>
        ledgerStateFix({
          ...base,
          Fee: '12',
          SourceTag: 'NaN',
        } as any),
      ).toThrow(/Fee/);
    });

    it('survives .with() with a base field set', () => {
      const tx = ledgerStateFix({ ...base, SourceTag: 7 });
      const next = tx.with({ Sequence: 3 });
      expect(next.SourceTag).toBe(7);
    });
  });
});