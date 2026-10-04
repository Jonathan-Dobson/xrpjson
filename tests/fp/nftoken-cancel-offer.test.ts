/**
 * Tests for the functional NFTokenCancelOffer factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, NFTokenOffers).
 *   2. NFTokenOffers shape: non-empty array of 64-char hex IDs.
 *   3. Per-entry checks: 64-char hex, no all-zero IDs.
 *   4. Duplicate detection.
 *   5. Maximum of 500 entries.
 *   6. Account validation.
 *   7. Frozen-shape contract (mutation throws, .with() returns new
 *      frozen tx, .toJSON() strips methods + undefined).
 *
 * Imports directly from the factory path; the parent integrates the
 * barrel (`src/fp/index.ts`) after all factories are written.
 */
import { describe, it, expect } from 'vitest';
import { nftokenCancelOffer } from '../../src/fp/factories/nftoken-cancel-offer.js';

const ACCOUNT = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

const OFFER_1 = '9C92E061381C1EF37A8CDE0E8FC35188BFC30B1883825042A64309AC09F4C36D';
const OFFER_2 = 'AED08CC1F50DD5F23A1948AF86153A3F3B7593E5EC77D65A02BB1B29E05AB6AF';
const OFFER_3 = '12B1F8C8D29C7E6F8E1F8C8D29C7E6F8E1F8C8D29C7E6F8E1F8C8D29C7E6F810';

function make(extras: Record<string, unknown> = {}) {
  return nftokenCancelOffer({
    Account: ACCOUNT,
    NFTokenOffers: [OFFER_1],
    ...extras,
  });
}

// ─── Construction ────────────────────────────────────────────────────

describe('fp/nftokenCancelOffer()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('NFTokenCancelOffer');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.NFTokenOffers).toEqual([OFFER_1]);
    });

    it('accepts multiple offer IDs', () => {
      const tx = make({ NFTokenOffers: [OFFER_1, OFFER_2, OFFER_3] });
      expect(tx.NFTokenOffers).toEqual([OFFER_1, OFFER_2, OFFER_3]);
    });

    it('accepts Fee and Sequence as base transaction fields', () => {
      const tx = make({ Fee: '12', Sequence: 42 });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(42);
    });

    it('preserves the offer ID order in the resulting tx', () => {
      const ids = [OFFER_3, OFFER_1, OFFER_2];
      const tx = make({ NFTokenOffers: ids });
      expect(tx.NFTokenOffers).toEqual(ids);
    });
  });

  // ─── Account validation ─────────────────────────────────────────────

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        nftokenCancelOffer({
          Account: '',
          NFTokenOffers: [OFFER_1],
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      expect(() =>
        nftokenCancelOffer({
          Account: 'not-an-account',
          NFTokenOffers: [OFFER_1],
        }),
      ).toThrow(/Account/);
    });
  });

  // ─── NFTokenOffers shape ────────────────────────────────────────────

  describe('NFTokenOffers shape', () => {
    it('throws when NFTokenOffers is missing', () => {
      expect(() =>
        nftokenCancelOffer({
          Account: ACCOUNT,
          NFTokenOffers: undefined as unknown as string[],
        }),
      ).toThrow(/NFTokenOffers/);
    });

    it('throws when NFTokenOffers is not an array', () => {
      expect(() =>
        nftokenCancelOffer({
          Account: ACCOUNT,
          NFTokenOffers: 'not-an-array' as unknown as string[],
        }),
      ).toThrow(/NFTokenOffers/);
    });

    it('throws when NFTokenOffers is empty', () => {
      expect(() =>
        nftokenCancelOffer({
          Account: ACCOUNT,
          NFTokenOffers: [],
        }),
      ).toThrow(/NFTokenOffers/);
    });

    it('throws when an entry is not a string', () => {
      expect(() =>
        nftokenCancelOffer({
          Account: ACCOUNT,
          NFTokenOffers: [123 as unknown as string],
        }),
      ).toThrow(/NFTokenOffers\[0\]/);
    });

    it('throws when an entry is the wrong length (not 64 chars)', () => {
      expect(() =>
        nftokenCancelOffer({
          Account: ACCOUNT,
          NFTokenOffers: ['ABCD'],
        }),
      ).toThrow(/NFTokenOffers\[0\]/);
    });

    it('throws when an entry contains non-hex characters', () => {
      expect(() =>
        nftokenCancelOffer({
          Account: ACCOUNT,
          NFTokenOffers: ['Z'.repeat(64)],
        }),
      ).toThrow(/NFTokenOffers\[0\]/);
    });

    it('error index points at the failing entry', () => {
      expect(() =>
        nftokenCancelOffer({
          Account: ACCOUNT,
          NFTokenOffers: [OFFER_1, 'too-short', OFFER_3],
        }),
      ).toThrow(/NFTokenOffers\[1\]/);
    });
  });

  // ─── All-zero offer ID ──────────────────────────────────────────────

  describe('all-zero offer ID (fixCleanup3_2_0)', () => {
    it('throws when an entry is all zeros', () => {
      expect(() =>
        nftokenCancelOffer({
          Account: ACCOUNT,
          NFTokenOffers: ['0'.repeat(64)],
        }),
      ).toThrow(/zero/);
    });

    it('throws even when only one of many entries is all-zero', () => {
      expect(() =>
        nftokenCancelOffer({
          Account: ACCOUNT,
          NFTokenOffers: [OFFER_1, '0'.repeat(64), OFFER_2],
        }),
      ).toThrow(/zero/);
    });
  });

  // ─── Duplicate detection ────────────────────────────────────────────

  describe('duplicate detection', () => {
    it('throws when the array contains a duplicate entry', () => {
      expect(() =>
        nftokenCancelOffer({
          Account: ACCOUNT,
          NFTokenOffers: [OFFER_1, OFFER_1],
        }),
      ).toThrow(/duplicate/);
    });

    it('throws on a duplicate at a non-zero index', () => {
      expect(() =>
        nftokenCancelOffer({
          Account: ACCOUNT,
          NFTokenOffers: [OFFER_1, OFFER_2, OFFER_1],
        }),
      ).toThrow(/duplicate/);
    });
  });

  // ─── Maximum of 500 entries ─────────────────────────────────────────

  describe('maximum of 500 entries (kMaxTokenOfferCancelCount)', () => {
    it('accepts exactly 500 entries', () => {
      // Generate 500 distinct 64-char hex IDs.
      const ids = Array.from(
        { length: 500 },
        (_, i) => i.toString(16).padStart(4, '0').padEnd(64, 'a'),
      );
      const tx = nftokenCancelOffer({
        Account: ACCOUNT,
        NFTokenOffers: ids,
      });
      expect(tx.NFTokenOffers.length).toBe(500);
    });

    it('throws when there are more than 500 entries', () => {
      const ids = Array.from(
        { length: 501 },
        (_, i) => i.toString(16).padStart(4, '0').padEnd(64, 'a'),
      );
      expect(() =>
        nftokenCancelOffer({
          Account: ACCOUNT,
          NFTokenOffers: ids,
        }),
      ).toThrow(/at most 500/);
    });
  });

  // ─── Frozen-shape contract ──────────────────────────────────────────

  describe('frozen-shape contract', () => {
    it('returns a frozen object', () => {
      const tx = make();
      expect(Object.isFrozen(tx)).toBe(true);
    });

    it('mutation throws in strict mode', () => {
      const tx = make();
      expect(() => {
        (tx as unknown as { NFTokenOffers: string[] }).NFTokenOffers = [];
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides', () => {
      const tx = make();
      const tx2 = tx.with({ NFTokenOffers: [OFFER_2] });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.NFTokenOffers).toEqual([OFFER_2]);
      expect(tx.NFTokenOffers).toEqual([OFFER_1]);
    });

    it('.with() re-validates on overrides (empty array)', () => {
      const tx = make();
      expect(() => tx.with({ NFTokenOffers: [] })).toThrow(/NFTokenOffers/);
    });

    it('.with() re-validates when adding a duplicate', () => {
      const tx = make({ NFTokenOffers: [OFFER_1, OFFER_2] });
      expect(() => tx.with({ NFTokenOffers: [OFFER_1, OFFER_1] })).toThrow(
        /duplicate/,
      );
    });

    it('.with() re-validates when adding an all-zero ID', () => {
      const tx = make();
      expect(() => tx.with({ NFTokenOffers: [OFFER_1, '0'.repeat(64)] })).toThrow(
        /zero/,
      );
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({ Fee: '12', Sequence: 42 });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'NFTokenCancelOffer',
        Account: ACCOUNT,
        NFTokenOffers: [OFFER_1],
        Fee: '12',
        Sequence: 42,
      });
    });

    it('.toJSON() skips undefined fields', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op (already validated at construction)', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });
  // ─── Base transaction fields ──────────────────────────────────────────────
  // `NftokenCancelOfferProps` extends `BasePropsFields`, so the seven shared base
  // transaction fields are part of this factory's prop type and are checked
  // by `validateBaseTransaction` at construction.
  describe('BaseTransactionFields', () => {
    // A third valid address, distinct from `Account`, for the Delegate cases.
    const DELEGATE = 'ra5nK24KXen9AHvsdFTKHSANinZseWnPcX';

    const base = {
      Account: ACCOUNT,
      NFTokenOffers: [OFFER_1],
    };

    it('accepts a valid Memos array', () => {
      const memos = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
      const tx = nftokenCancelOffer({ ...base, Memos: memos });
      expect(tx.Memos).toEqual(memos);
    });

    it('rejects a malformed Memos value', () => {
      expect(() => nftokenCancelOffer({ ...base, Memos: 'not-an-array' } as any)).toThrow(
        /invalid Memos/,
      );
    });

    it('accepts SourceTag', () => {
      const tx = nftokenCancelOffer({ ...base, SourceTag: 99 });
      expect(tx.SourceTag).toBe(99);
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() => nftokenCancelOffer({ ...base, SourceTag: 'NaN' } as any)).toThrow(
        /SourceTag must be a number/,
      );
    });

    it('accepts LastLedgerSequence', () => {
      const tx = nftokenCancelOffer({ ...base, LastLedgerSequence: 900000 });
      expect(tx.LastLedgerSequence).toBe(900000);
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() =>
        nftokenCancelOffer({ ...base, LastLedgerSequence: 'soon' } as any),
      ).toThrow(/LastLedgerSequence must be a number/);
    });

    it('accepts AccountTxnID', () => {
      const tx = nftokenCancelOffer({ ...base, AccountTxnID: 'ABC123' });
      expect(tx.AccountTxnID).toBe('ABC123');
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() => nftokenCancelOffer({ ...base, AccountTxnID: 42 } as any)).toThrow(
        /AccountTxnID must be a string/,
      );
    });

    it('accepts NetworkID', () => {
      const tx = nftokenCancelOffer({ ...base, NetworkID: 1 });
      expect(tx.NetworkID).toBe(1);
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() => nftokenCancelOffer({ ...base, NetworkID: {} } as any)).toThrow(
        /NetworkID must be a number/,
      );
    });

    it('accepts a distinct Delegate', () => {
      const tx = nftokenCancelOffer({ ...base, Delegate: DELEGATE });
      expect(tx.Delegate).toBe(DELEGATE);
    });

    it('rejects a Delegate that is not a valid account address', () => {
      expect(() =>
        nftokenCancelOffer({ ...base, Delegate: 'not-an-address' } as any),
      ).toThrow(/invalid Delegate/);
    });

    it('rejects Delegate equal to Account', () => {
      expect(() => nftokenCancelOffer({ ...base, Delegate: base.Account })).toThrow(
        /cannot be the same/,
      );
    });

    it('accepts TicketSequence (the field that made tickets unspendable)', () => {
      const tx = nftokenCancelOffer({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.TicketSequence).toBe(42);
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() => nftokenCancelOffer({ ...base, TicketSequence: 'nope' } as any)).toThrow(
        /TicketSequence must be a number/,
      );
    });
  });
});
