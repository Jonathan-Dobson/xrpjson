/**
 * Tests for the functional OracleDelete factory.
 *
 * Validates:
 *   1. Construction with required Account + OracleDocumentID.
 *   2. Account validation (classic/X-address format).
 *   3. OracleDocumentID UInt32 validation (integer in [0, 0xFFFFFFFF]).
 *   4. Frozen-shape contract (mutation throws, .with() returns a new
 *      frozen object, .toJSON() strips methods and undefined values).
 *   5. Factory-only rules not enforced by the class API:
 *      - integer/range check on OracleDocumentID (class allows NaN,
 *        floats, negatives, and > 2^32 − 1).
 */
import { describe, it, expect } from 'vitest';
import { oracleDelete } from '../../src/fp/factories/oracle-delete.js';

const OWNER = 'rsA2LpzuawewSBQXkiju3YQTMzW13pAAdW';
const MAX_UINT32 = 0xffffffff;

function make(extras: Record<string, unknown> = {}) {
  return oracleDelete({
    Account: OWNER,
    OracleDocumentID: 34,
    ...extras,
  });
}

describe('fp/oracleDelete()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('OracleDelete');
      expect(tx.Account).toBe(OWNER);
      expect(tx.OracleDocumentID).toBe(34);
      expect(tx.Fee).toBeUndefined();
      expect(tx.Sequence).toBeUndefined();
    });

    it('accepts Fee and Sequence', () => {
      const tx = make({ Fee: '12', Sequence: 7 });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(7);
    });

    it('accepts OracleDocumentID = 0 (UInt32 minimum)', () => {
      const tx = oracleDelete({ Account: OWNER, OracleDocumentID: 0 });
      expect(tx.OracleDocumentID).toBe(0);
    });

    it('accepts OracleDocumentID at the UInt32 maximum', () => {
      const tx = oracleDelete({
        Account: OWNER,
        OracleDocumentID: MAX_UINT32,
      });
      expect(tx.OracleDocumentID).toBe(MAX_UINT32);
    });

    it('uses the XLS-0047 example values', () => {
      const tx = oracleDelete({
        Account: 'rsA2LpzuawewSBQXkiju3YQTMzW13pAAdW',
        OracleDocumentID: 34,
      });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'OracleDelete',
        Account: 'rsA2LpzuawewSBQXkiju3YQTMzW13pAAdW',
        OracleDocumentID: 34,
      });
    });
  });

  describe('Account validation', () => {
    it('throws when Account is missing', () => {
      expect(() =>
        oracleDelete({
          Account: undefined as unknown as string,
          OracleDocumentID: 34,
        }),
      ).toThrow(/Account is required/);
    });

    it('throws when Account is an empty string', () => {
      expect(() =>
        oracleDelete({
          Account: '' as never,
          OracleDocumentID: 34,
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      expect(() =>
        oracleDelete({
          Account: 'not-an-account',
          OracleDocumentID: 34,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('OracleDocumentID validation (UInt32)', () => {
    it('throws when OracleDocumentID is missing', () => {
      expect(() =>
        oracleDelete({
          Account: OWNER,
          OracleDocumentID: undefined as unknown as number,
        }),
      ).toThrow(/OracleDocumentID/);
    });

    it('throws when OracleDocumentID is a string', () => {
      expect(() =>
        oracleDelete({
          Account: OWNER,
          OracleDocumentID: '34' as unknown as number,
        }),
      ).toThrow(/OracleDocumentID/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws on negative OracleDocumentID (XLS-0047, UInt32)', () => {
      expect(() =>
        oracleDelete({ Account: OWNER, OracleDocumentID: -1 }),
      ).toThrow(/UInt32/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws on OracleDocumentID > 2^32 − 1 (XLS-0047, UInt32)', () => {
      expect(() =>
        oracleDelete({ Account: OWNER, OracleDocumentID: MAX_UINT32 + 1 }),
      ).toThrow(/UInt32/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws on fractional OracleDocumentID (XLS-0047, UInt32)', () => {
      expect(() =>
        oracleDelete({ Account: OWNER, OracleDocumentID: 3.14 }),
      ).toThrow(/integer/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws on NaN OracleDocumentID (XLS-0047, UInt32)', () => {
      expect(() =>
        oracleDelete({ Account: OWNER, OracleDocumentID: NaN }),
      ).toThrow(/OracleDocumentID/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws on Infinity OracleDocumentID (XLS-0047, UInt32)', () => {
      expect(() =>
        oracleDelete({ Account: OWNER, OracleDocumentID: Infinity }),
      ).toThrow(/OracleDocumentID/);
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
        (tx as unknown as Record<string, unknown>).OracleDocumentID = 999;
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides', () => {
      const tx = make();
      const tx2 = tx.with({ Fee: '20', Sequence: 11 });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Fee).toBe('20');
      expect(tx2.Sequence).toBe(11);
      expect(tx.Fee).toBeUndefined();
      expect(tx.Sequence).toBeUndefined();
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() => tx.with({ OracleDocumentID: -5 })).toThrow(/UInt32/);
      expect(() => tx.with({ OracleDocumentID: MAX_UINT32 + 1 })).toThrow(
        /UInt32/,
      );
      expect(() => tx.with({ OracleDocumentID: 3.14 })).toThrow(/integer/);
      expect(() => tx.with({ Account: 'bogus' })).toThrow(/Account/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({ Fee: '12' });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'OracleDelete',
        Account: OWNER,
        OracleDocumentID: 34,
        Fee: '12',
      });
    });

    it('.toJSON() skips undefined fields', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op (validation already ran at construction)', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });

    it('serializes the canonical xrpl.org example', () => {
      const tx = oracleDelete({
        Account: 'rsA2LpzuawewSBQXkiju3YQTMzW13pAAdW',
        OracleDocumentID: 34,
      });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'OracleDelete',
        Account: 'rsA2LpzuawewSBQXkiju3YQTMzW13pAAdW',
        OracleDocumentID: 34,
      });
    });
  });

  // ─── Base transaction fields ──────────────────────────────────────────────
  // `OracleDeleteProps` extends `BasePropsFields`, so the seven shared base
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
    const base = { Account: OWNER, OracleDocumentID: 34 };
    const MEMOS = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
    const TXN_ID = 'AB'.repeat(32);
    const DELEGATE = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';

    it('accepts Memos', () => {
      const tx = oracleDelete({ ...base, Memos: MEMOS });
      expect(tx.Memos).toEqual(MEMOS);
      expect(tx.toJSON().Memos).toEqual(MEMOS);
    });

    it('accepts SourceTag', () => {
      const tx = oracleDelete({ ...base, SourceTag: 99 });
      expect(tx.SourceTag).toBe(99);
    });

    it('accepts LastLedgerSequence', () => {
      const tx = oracleDelete({ ...base, LastLedgerSequence: 1_000_000 });
      expect(tx.LastLedgerSequence).toBe(1_000_000);
    });

    it('accepts AccountTxnID', () => {
      const tx = oracleDelete({ ...base, AccountTxnID: TXN_ID });
      expect(tx.AccountTxnID).toBe(TXN_ID);
    });

    it('accepts NetworkID', () => {
      const tx = oracleDelete({ ...base, NetworkID: 1 });
      expect(tx.NetworkID).toBe(1);
    });

    it('accepts a Delegate distinct from Account', () => {
      const tx = oracleDelete({ ...base, Delegate: DELEGATE });
      expect(tx.Delegate).toBe(DELEGATE);
    });

    it('accepts TicketSequence alongside Sequence: 0', () => {
      const tx = oracleDelete({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.TicketSequence).toBe(42);
    });

    // ─── Reject side ───

    it('rejects a malformed Memos value', () => {
      expect(() => oracleDelete({ ...base, Memos: 'not-an-array' } as any)).toThrow(
        /invalid Memos/,
      );
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() => oracleDelete({ ...base, SourceTag: 'NaN' } as any)).toThrow(
        /SourceTag must be a number/,
      );
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() =>
        oracleDelete({ ...base, LastLedgerSequence: 'soon' } as any),
      ).toThrow(/LastLedgerSequence must be a number/);
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() => oracleDelete({ ...base, AccountTxnID: 12345 } as any)).toThrow(
        /AccountTxnID must be a string/,
      );
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() => oracleDelete({ ...base, NetworkID: {} } as any)).toThrow(
        /NetworkID must be a number/,
      );
    });

    it('rejects a Delegate that is not a valid address', () => {
      expect(() =>
        oracleDelete({ ...base, Delegate: 'not-an-address' } as any),
      ).toThrow(/invalid Delegate/);
    });

    it('rejects a Delegate equal to Account', () => {
      expect(() => oracleDelete({ ...base, Delegate: base.Account })).toThrow(
        /cannot be the same/,
      );
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() => oracleDelete({ ...base, TicketSequence: 'nope' } as any)).toThrow(
        /TicketSequence must be a number/,
      );
    });

    it('rejects a non-string Fee', () => {
      expect(() => oracleDelete({ ...base, Fee: 12 } as any)).toThrow(
        /Fee must be a string/,
      );
    });

    it('still checks OracleDocumentID before the shared base fields', () => {
      // Ordering check: a factory-specific mistake still produces the
      // factory's own message, not the base validator's backstop message.
      expect(() =>
        oracleDelete({
          ...base,
          OracleDocumentID: -1,
          SourceTag: 'NaN',
        } as any),
      ).toThrow(/OracleDocumentID/);
    });

    it('survives .with() with a base field set', () => {
      const tx = oracleDelete({ ...base, SourceTag: 7 });
      const next = tx.with({ Fee: '20' });
      expect(next.SourceTag).toBe(7);
    });
  });
});