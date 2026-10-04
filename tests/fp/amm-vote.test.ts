/**
 * Tests for the functional AMMVote factory.
 *
 * Validates:
 *   1. Construction with the three required fields
 *      (Account, Asset, Asset2, TradingFee).
 *   2. Asset / Asset2 form coverage (XRP, IOU, MPT).
 *   3. Spec-mandated guards the class API omits:
 *        a. Asset / Asset2 must each be a Currency, not just any object.
 *        b. Account must be a valid XRPL classic / X-address.
 *        c. TradingFee must be an integer (UINT16).
 *   4. TradingFee range enforcement ([0, 1000] inclusive).
 *   5. Frozen-shape contract (mutation throws, .with() returns a new
 *      frozen object, .toJSON() strips methods and undefined values).
 *   6. .with() re-validates on overrides.
 */
import { describe, it, expect } from 'vitest';
import type { Currency } from '../../src/types/amounts.js';
import { ammVote } from '../../src/fp/factories/amm-vote.js';

// ─── Test fixtures ───────────────────────────────────────────────────

const ACCOUNT = 'rWYkbWkCeg8dP6rXALnjgZSjjLyih5NXm';
const ISSUER = 'rP9jPyP5kyvFRb6ZiRghAGw5u8SGAmU4bd';

const XRP_ASSET = { currency: 'XRP' };
const IOU_ASSET = { currency: 'TST', issuer: ISSUER };
const MPT_ASSET = { mpt_issuance_id: '00000001' };

function make(extras: Record<string, unknown> = {}) {
  return ammVote({
    Account: ACCOUNT,
    Asset: XRP_ASSET,
    Asset2: IOU_ASSET,
    TradingFee: 25,
    ...extras,
  });
}

describe('fp/ammVote()', () => {
  describe('construction', () => {
    it('constructs with the three required fields', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('AMMVote');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.Asset).toEqual(XRP_ASSET);
      expect(tx.Asset2).toEqual(IOU_ASSET);
      expect(tx.TradingFee).toBe(25);
    });

    it('accepts Fee, Sequence, and Flags', () => {
      const tx = make({ Fee: '10', Sequence: 9, Flags: 0 });
      expect(tx.Fee).toBe('10');
      expect(tx.Sequence).toBe(9);
      expect(tx.Flags).toBe(0);
    });

    it('accepts each Currency form pair for Asset / Asset2', () => {
      const variants: ReadonlyArray<{ asset: Currency; asset2: Currency }> = [
        { asset: XRP_ASSET, asset2: IOU_ASSET },
        { asset: IOU_ASSET, asset2: XRP_ASSET },
        { asset: MPT_ASSET, asset2: IOU_ASSET },
        { asset: IOU_ASSET, asset2: MPT_ASSET },
        { asset: XRP_ASSET, asset2: MPT_ASSET },
        { asset: MPT_ASSET, asset2: XRP_ASSET },
      ];
      for (const { asset, asset2 } of variants) {
        const tx = ammVote({
          Account: ACCOUNT,
          Asset: asset,
          Asset2: asset2,
          TradingFee: 100,
        });
        expect(tx.Asset).toEqual(asset);
        expect(tx.Asset2).toEqual(asset2);
      }
    });

    it('matches the canonical AMMVote example from xrpl.org', () => {
      const tx = ammVote({
        Account: 'rJVUeRqDFNs2xqA7ncVE6ZoAhPUoaJJSQm',
        Asset: { currency: 'XRP' },
        Asset2: { currency: 'TST', issuer: 'rP9jPyP5kyvFRb6ZiRghAGw5u8SGAmU4bd' },
        TradingFee: 600,
      });
      expect(tx.TradingFee).toBe(600);
      expect(tx.Asset2).toEqual({
        currency: 'TST',
        issuer: 'rP9jPyP5kyvFRb6ZiRghAGw5u8SGAmU4bd',
      });
    });
  });

  describe('Account validation', () => {
    it('throws when Account is missing', () => {
      expect(() =>
        ammVote({
          Account: undefined as unknown as string,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          TradingFee: 10,
        }),
      ).toThrow(/Account is required/);
    });

    it('throws when Account is not a valid XRPL address', () => {
      expect(() =>
        ammVote({
          Account: 'not-an-address',
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          TradingFee: 10,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('Asset / Asset2 validation', () => {
    it('throws when Asset is missing', () => {
      expect(() =>
        ammVote({
          Account: ACCOUNT,
          Asset: undefined as unknown as Currency,
          Asset2: IOU_ASSET,
          TradingFee: 10,
        }),
      ).toThrow(/Asset/);
    });

    it('throws when Asset is null', () => {
      expect(() =>
        ammVote({
          Account: ACCOUNT,
          Asset: null as unknown as Currency,
          Asset2: IOU_ASSET,
          TradingFee: 10,
        }),
      ).toThrow(/Asset/);
    });

    it('throws when Asset is an empty object (XLS-0030 §3.2.1 ISSUE)', () => {
      // The class accepts {} because isRecord({}) is true. The
      // factory's isCurrency check rejects it.
      expect(() =>
        ammVote({
          Account: ACCOUNT,
          Asset: {} as unknown as Currency,
          Asset2: IOU_ASSET,
          TradingFee: 10,
        }),
      ).toThrow(/Asset/);
    });

    it('throws when Asset is a primitive (e.g. a number)', () => {
      expect(() =>
        ammVote({
          Account: ACCOUNT,
          Asset: 1234 as unknown as Currency,
          Asset2: IOU_ASSET,
          TradingFee: 10,
        }),
      ).toThrow(/Asset/);
    });

    it('throws when Asset is a bare string (XRP must be an object)', () => {
      // XRP amount forms use `{ currency: 'XRP' }`, not the string
      // 'XRP' which is the XRP Amount drops form (not a Currency).
      expect(() =>
        ammVote({
          Account: ACCOUNT,
          Asset: 'XRP' as unknown as Currency,
          Asset2: IOU_ASSET,
          TradingFee: 10,
        }),
      ).toThrow(/Asset/);
    });

    it('throws when Asset2 is missing', () => {
      expect(() =>
        ammVote({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: undefined as unknown as Currency,
          TradingFee: 10,
        }),
      ).toThrow(/Asset2/);
    });

    it('throws when Asset2 is an empty object', () => {
      expect(() =>
        ammVote({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: {} as unknown as Currency,
          TradingFee: 10,
        }),
      ).toThrow(/Asset2/);
    });

    it('throws when Asset2 is a primitive', () => {
      expect(() =>
        ammVote({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: 1234 as unknown as Currency,
          TradingFee: 10,
        }),
      ).toThrow(/Asset2/);
    });
  });

  describe('TradingFee validation', () => {
    it('throws when TradingFee is undefined', () => {
      expect(() =>
        ammVote({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          TradingFee: undefined as unknown as number,
        }),
      ).toThrow(/TradingFee is required/);
    });

    it('throws when TradingFee is null', () => {
      expect(() =>
        ammVote({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          TradingFee: null as unknown as number,
        }),
      ).toThrow(/TradingFee is required/);
    });

    it('throws when TradingFee is not a number (e.g. a string)', () => {
      expect(() =>
        ammVote({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          TradingFee: '25' as unknown as number,
        }),
      ).toThrow(/TradingFee must be a number/);
    });

    it('throws when TradingFee is a non-integer (UINT16 per XLS-0030 §3.2.1)', () => {
      expect(() =>
        ammVote({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          TradingFee: 0.5,
        }),
      ).toThrow(/integer/);
    });

    it('throws when TradingFee is negative', () => {
      expect(() =>
        ammVote({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          TradingFee: -1,
        }),
      ).toThrow(/TradingFee must be between/);
    });

    it('throws when TradingFee is greater than 1000', () => {
      expect(() =>
        ammVote({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          TradingFee: 1001,
        }),
      ).toThrow(/TradingFee must be between/);
    });

    it('accepts TradingFee = 0', () => {
      const tx = make({ TradingFee: 0 });
      expect(tx.TradingFee).toBe(0);
    });

    it('accepts TradingFee = 1000 (the inclusive maximum)', () => {
      const tx = make({ TradingFee: 1000 });
      expect(tx.TradingFee).toBe(1000);
    });

    it('accepts TradingFee = 600 (the xrpl.org example value)', () => {
      const tx = make({ TradingFee: 600 });
      expect(tx.TradingFee).toBe(600);
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
        (tx as unknown as Record<string, unknown>).TradingFee = 999;
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      const tx = make();
      const tx2 = tx.with({ TradingFee: 700 });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.TradingFee).toBe(700);
      expect(tx.TradingFee).toBe(25);
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() => tx.with({ Account: 'bad' })).toThrow(/Account/);
      expect(() =>
        tx.with({ Asset: {} as unknown as Currency }),
      ).toThrow(/Asset/);
      expect(() =>
        tx.with({ Asset2: {} as unknown as Currency }),
      ).toThrow(/Asset2/);
      expect(() => tx.with({ TradingFee: 1001 })).toThrow(/TradingFee/);
      expect(() => tx.with({ TradingFee: 1.5 })).toThrow(/integer/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({ Fee: '10', Sequence: 9 });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'AMMVote',
        Account: ACCOUNT,
        Asset: XRP_ASSET,
        Asset2: IOU_ASSET,
        TradingFee: 25,
        Fee: '10',
        Sequence: 9,
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
      expect('Flags' in json).toBe(false);
    });

    it('.validate() is a no-op after successful construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });

  // ─── Base transaction fields ──────────────────────────────────────────────
  // `AmmVoteProps` now extends `BasePropsFields`, so the seven shared base
  // fields that were previously absent from this factory's prop type — Memos,
  // SourceTag, LastLedgerSequence, AccountTxnID, NetworkID, Delegate and
  // TicketSequence — are part of the type surface and survive onto the frozen
  // transaction.
  //
  // Every value below is chosen to be VALID under `validateBaseTransaction`
  // (src/validation/base.ts), so this block stays green once that call is
  // added. The factory now CALLS that validator as its last check before
  // `buildFrozenTx`, so the reject-side assertions below assert the
  // validator's own messages. Bad values are cast `as any` deliberately — the
  // point is the runtime check, and a type error would make the test
  // uncompilable.
  describe('BaseTransactionFields', () => {
    const base = {
      Account: ACCOUNT,
      Asset: XRP_ASSET,
      Asset2: IOU_ASSET,
      TradingFee: 25,
    };
    const MEMOS = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
    const TXN_ID = 'AB'.repeat(32);

    it('accepts Memos', () => {
      const tx = ammVote({ ...base, Memos: MEMOS });
      expect(tx.Memos).toEqual(MEMOS);
      expect(tx.toJSON().Memos).toEqual(MEMOS);
    });

    it('accepts SourceTag', () => {
      const tx = ammVote({ ...base, SourceTag: 99 });
      expect(tx.SourceTag).toBe(99);
      expect(tx.toJSON().SourceTag).toBe(99);
    });

    it('accepts LastLedgerSequence', () => {
      const tx = ammVote({ ...base, LastLedgerSequence: 1_000_000 });
      expect(tx.LastLedgerSequence).toBe(1_000_000);
      expect(tx.toJSON().LastLedgerSequence).toBe(1_000_000);
    });

    it('accepts AccountTxnID', () => {
      const tx = ammVote({ ...base, AccountTxnID: TXN_ID });
      expect(tx.AccountTxnID).toBe(TXN_ID);
      expect(tx.toJSON().AccountTxnID).toBe(TXN_ID);
    });

    it('accepts NetworkID', () => {
      const tx = ammVote({ ...base, NetworkID: 1 });
      expect(tx.NetworkID).toBe(1);
      expect(tx.toJSON().NetworkID).toBe(1);
    });

    it('accepts a Delegate distinct from Account', () => {
      const tx = ammVote({ ...base, Delegate: ISSUER });
      expect(tx.Delegate).toBe(ISSUER);
      expect(tx.toJSON().Delegate).toBe(ISSUER);
    });

    it('accepts TicketSequence alongside Sequence: 0', () => {
      const tx = ammVote({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.TicketSequence).toBe(42);
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    // ─── Reject side ───

    it('rejects a malformed Memos value', () => {
      expect(() => ammVote({ ...base, Memos: 'not-an-array' } as any)).toThrow(
        /invalid Memos/,
      );
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() => ammVote({ ...base, SourceTag: 'NaN' } as any)).toThrow(
        /SourceTag must be a number/,
      );
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() =>
        ammVote({ ...base, LastLedgerSequence: 'soon' } as any),
      ).toThrow(/LastLedgerSequence must be a number/);
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() => ammVote({ ...base, AccountTxnID: 12345 } as any)).toThrow(
        /AccountTxnID must be a string/,
      );
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() => ammVote({ ...base, NetworkID: {} } as any)).toThrow(
        /NetworkID must be a number/,
      );
    });

    it('rejects a Delegate that is not a valid address', () => {
      expect(() => ammVote({ ...base, Delegate: 'not-an-address' } as any)).toThrow(
        /invalid Delegate/,
      );
    });

    it('rejects a Delegate equal to Account', () => {
      expect(() => ammVote({ ...base, Delegate: base.Account })).toThrow(
        /cannot be the same/,
      );
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() => ammVote({ ...base, TicketSequence: 'nope' } as any)).toThrow(
        /TicketSequence must be a number/,
      );
    });

    it('rejects a non-string Fee', () => {
      expect(() => ammVote({ ...base, Fee: 12 } as any)).toThrow(
        /Fee must be a string/,
      );
    });
  });
});