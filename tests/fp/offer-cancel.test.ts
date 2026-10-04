/**
 * Tests for the functional OfferCancel factory.
 *
 * Validates:
 *   1. Construction with required OfferSequence.
 *   2. OfferSequence is UInt32 (not just any number).
 *   3. Cross-field invariant: OfferSequence != Sequence.
 *   4. Account format check.
 *   5. Frozen-shape contract (mutation throws, .with() returns new
 *      frozen object, .toJSON() strips methods and undefined values).
 *   6. Factory-only rules not enforced by the class API:
 *      - non-integer / negative / > UInt32 OfferSequence rejected
 *      - OfferSequence == Sequence rejected (temBAD_SEQUENCE)
 *      - non-account-shaped Account rejected
 */
import { describe, it, expect } from 'vitest';
import { offerCancel } from '../../src/fp/factories/offer-cancel.js';

const OWNER = 'rfmDuhDyLGgx94qiwf3YF8BUV5j6KSvE8';
const SEQUENCE = 7;

function make(extras: Record<string, unknown> = {}) {
  return offerCancel({
    Account: OWNER,
    OfferSequence: SEQUENCE,
    ...extras,
  });
}

describe('fp/offerCancel()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('OfferCancel');
      expect(tx.Account).toBe(OWNER);
      expect(tx.OfferSequence).toBe(SEQUENCE);
      expect(tx.Fee).toBeUndefined();
      expect(tx.Sequence).toBeUndefined();
    });

    it('accepts every spec field together', () => {
      const tx = offerCancel({
        Account: OWNER,
        OfferSequence: 6,
        Fee: '12',
        Sequence: 8,
      });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(8);
      expect(tx.OfferSequence).toBe(6);
      expect(tx.TransactionType).toBe('OfferCancel');
    });

    it('accepts OfferSequence = 0 (UInt32 minimum)', () => {
      const tx = make({ OfferSequence: 0 });
      expect(tx.OfferSequence).toBe(0);
    });

    it('accepts OfferSequence at UInt32 maximum', () => {
      const tx = make({ OfferSequence: 0xffffffff });
      expect(tx.OfferSequence).toBe(0xffffffff);
    });
  });

  describe('Account validation', () => {
    it('throws when Account is missing', () => {
      expect(() =>
        offerCancel({
          Account: undefined as unknown as string,
          OfferSequence: SEQUENCE,
        }),
      ).toThrow(/Account is required/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws when Account is not account-shaped', () => {
      expect(() =>
        offerCancel({
          Account: 'r…',
          OfferSequence: SEQUENCE,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('OfferSequence validation', () => {
    it('throws when OfferSequence is missing', () => {
      expect(() =>
        offerCancel({
          Account: OWNER,
          OfferSequence: undefined as unknown as number,
        }),
      ).toThrow(/OfferSequence/);
    });

    it('throws when OfferSequence is a non-number', () => {
      expect(() =>
        offerCancel({
          Account: OWNER,
          OfferSequence: 'six' as unknown as number,
        }),
      ).toThrow(/OfferSequence/);
    });

    it('throws when OfferSequence is NaN', () => {
      expect(() =>
        offerCancel({
          Account: OWNER,
          OfferSequence: Number.NaN,
        }),
      ).toThrow(/OfferSequence/);
    });

    it('throws when OfferSequence is Infinity', () => {
      expect(() =>
        offerCancel({
          Account: OWNER,
          OfferSequence: Number.POSITIVE_INFINITY,
        }),
      ).toThrow(/OfferSequence/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws when OfferSequence is negative', () => {
      expect(() => make({ OfferSequence: -1 })).toThrow(/UInt32/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws when OfferSequence is not an integer', () => {
      expect(() => make({ OfferSequence: 6.5 })).toThrow(/UInt32/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws when OfferSequence exceeds UInt32', () => {
      expect(() => make({ OfferSequence: 0x100000000 })).toThrow(/UInt32/);
    });
  });

  describe('cross-field validation', () => {
    // ── Factory-only divergence from the class API ──
    it('throws when OfferSequence equals Sequence (temBAD_SEQUENCE)', () => {
      expect(() =>
        offerCancel({
          Account: OWNER,
          OfferSequence: 7,
          Sequence: 7,
        }),
      ).toThrow(/temBAD_SEQUENCE/);
    });

    it('allows OfferSequence < Sequence', () => {
      const tx = offerCancel({
        Account: OWNER,
        OfferSequence: 5,
        Sequence: 7,
      });
      expect(tx.OfferSequence).toBe(5);
      expect(tx.Sequence).toBe(7);
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
        (tx as unknown as Record<string, unknown>).OfferSequence = 999;
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides', () => {
      const tx = make();
      const tx2 = tx.with({ OfferSequence: 10 });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.OfferSequence).toBe(10);
      expect(tx.OfferSequence).toBe(SEQUENCE);
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() => tx.with({ OfferSequence: -1 })).toThrow(/UInt32/);
      expect(() =>
        tx.with({ OfferSequence: 7, Sequence: 7 }),
      ).toThrow(/temBAD_SEQUENCE/);
      expect(() =>
        tx.with({ Account: 'not-an-account' }),
      ).toThrow(/Account/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = offerCancel({
        Account: OWNER,
        OfferSequence: 6,
        Fee: '12',
        Sequence: 8,
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'OfferCancel',
        Account: OWNER,
        OfferSequence: 6,
        Fee: '12',
        Sequence: 8,
      });
    });

    it('.toJSON() skips undefined fields', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.toJSON() does not contain method names', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
    });
  });
  // ─── Base transaction fields ──────────────────────────────────────────────
  // `OfferCancelProps` extends `BasePropsFields`, so the seven shared base
  // transaction fields are part of this factory's prop type and are checked
  // by `validateBaseTransaction` at construction.
  describe('BaseTransactionFields', () => {
    // A third valid address, distinct from `Account`, for the Delegate cases.
    const DELEGATE = 'ra5nK24KXen9AHvsdFTKHSANinZseWnPcX';

    const base = {
      Account: OWNER,
      OfferSequence: SEQUENCE,
    };

    it('accepts a valid Memos array', () => {
      const memos = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
      const tx = offerCancel({ ...base, Memos: memos });
      expect(tx.Memos).toEqual(memos);
    });

    it('rejects a malformed Memos value', () => {
      expect(() => offerCancel({ ...base, Memos: 'not-an-array' } as any)).toThrow(
        /invalid Memos/,
      );
    });

    it('accepts SourceTag', () => {
      const tx = offerCancel({ ...base, SourceTag: 99 });
      expect(tx.SourceTag).toBe(99);
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() => offerCancel({ ...base, SourceTag: 'NaN' } as any)).toThrow(
        /SourceTag must be a number/,
      );
    });

    it('accepts LastLedgerSequence', () => {
      const tx = offerCancel({ ...base, LastLedgerSequence: 900000 });
      expect(tx.LastLedgerSequence).toBe(900000);
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() =>
        offerCancel({ ...base, LastLedgerSequence: 'soon' } as any),
      ).toThrow(/LastLedgerSequence must be a number/);
    });

    it('accepts AccountTxnID', () => {
      const tx = offerCancel({ ...base, AccountTxnID: 'ABC123' });
      expect(tx.AccountTxnID).toBe('ABC123');
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() => offerCancel({ ...base, AccountTxnID: 42 } as any)).toThrow(
        /AccountTxnID must be a string/,
      );
    });

    it('accepts NetworkID', () => {
      const tx = offerCancel({ ...base, NetworkID: 1 });
      expect(tx.NetworkID).toBe(1);
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() => offerCancel({ ...base, NetworkID: {} } as any)).toThrow(
        /NetworkID must be a number/,
      );
    });

    it('accepts a distinct Delegate', () => {
      const tx = offerCancel({ ...base, Delegate: DELEGATE });
      expect(tx.Delegate).toBe(DELEGATE);
    });

    it('rejects a Delegate that is not a valid account address', () => {
      expect(() =>
        offerCancel({ ...base, Delegate: 'not-an-address' } as any),
      ).toThrow(/invalid Delegate/);
    });

    it('rejects Delegate equal to Account', () => {
      expect(() => offerCancel({ ...base, Delegate: base.Account })).toThrow(
        /cannot be the same/,
      );
    });

    it('accepts TicketSequence (the field that made tickets unspendable)', () => {
      const tx = offerCancel({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.TicketSequence).toBe(42);
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() => offerCancel({ ...base, TicketSequence: 'nope' } as any)).toThrow(
        /TicketSequence must be a number/,
      );
    });
  });
});
