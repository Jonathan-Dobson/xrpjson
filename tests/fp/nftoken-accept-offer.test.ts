/**
 * Tests for the functional NFTokenAcceptOffer factory.
 *
 * Validates:
 *   1. Construction with direct-mode offer (SellOffer only, BuyOffer only)
 *      and brokered-mode (both offers).
 *   2. Account validation (required, must be a valid XRPL account).
 *   3. Offer hash shape: NFTokenSellOffer / NFTokenBuyOffer must be
 *      64-char hex (Hash256 / UInt256).
 *   4. Mode table: missing both SellOffer and BuyOffer is rejected.
 *   5. NFTokenBrokerFee is brokered-mode only, must be strictly > 0,
 *      and must be a well-formed Amount (XRP string / IOU / MPT).
 *   6. NFTokenBrokerFee sub-validation: IOU issuer is a valid account,
 *      value is positive base-10; reserved "XRP" currency code is
 *      rejected.
 *   7. Frozen-shape contract (mutation throws, .with() returns new
 *      frozen tx, .toJSON() strips methods + undefined).
 */
import { describe, it, expect } from 'vitest';
import type { Amount } from '../../src/types/amounts.js';
import { nftokenAcceptOffer } from '../../src/fp/factories/nftoken-accept-offer.js';

const ACCOUNT = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const BROKER = 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B';

// Hash256 / UInt256 — 64-character hex strings.
const NFTOKEN_SELL_OFFER =
  'AED08CC1F50DD5F23A1948AF86153A3F3B7593E5EC77D65A02BB1B29E05AB6AE';
const NFTOKEN_BUY_OFFER =
  'AED08CC1F50DD5F23A1948AF86153A3F3B7593E5EC77D65A02BB1B29E05AB6AF';

function make(extras: Record<string, unknown> = {}) {
  return nftokenAcceptOffer({
    Account: ACCOUNT,
    NFTokenSellOffer: NFTOKEN_SELL_OFFER,
    ...extras,
  });
}

// ─── Construction ────────────────────────────────────────────────────

describe('fp/nftokenAcceptOffer()', () => {
  describe('construction', () => {
    it('constructs with direct-sell mode (NFTokenSellOffer only)', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('NFTokenAcceptOffer');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.NFTokenSellOffer).toBe(NFTOKEN_SELL_OFFER);
      expect(tx.NFTokenBuyOffer).toBeUndefined();
      expect(tx.NFTokenBrokerFee).toBeUndefined();
    });

    it('constructs with direct-buy mode (NFTokenBuyOffer only)', () => {
      const tx = nftokenAcceptOffer({
        Account: ACCOUNT,
        NFTokenBuyOffer: NFTOKEN_BUY_OFFER,
      });
      expect(tx.NFTokenBuyOffer).toBe(NFTOKEN_BUY_OFFER);
      expect(tx.NFTokenSellOffer).toBeUndefined();
    });

    it('constructs with brokered mode (both offers, no BrokerFee)', () => {
      const tx = nftokenAcceptOffer({
        Account: BROKER,
        NFTokenSellOffer: NFTOKEN_SELL_OFFER,
        NFTokenBuyOffer: NFTOKEN_BUY_OFFER,
      });
      expect(tx.NFTokenSellOffer).toBe(NFTOKEN_SELL_OFFER);
      expect(tx.NFTokenBuyOffer).toBe(NFTOKEN_BUY_OFFER);
      expect(tx.NFTokenBrokerFee).toBeUndefined();
    });

    it('constructs brokered mode with NFTokenBrokerFee (XRP drops string)', () => {
      const tx = nftokenAcceptOffer({
        Account: BROKER,
        NFTokenSellOffer: NFTOKEN_SELL_OFFER,
        NFTokenBuyOffer: NFTOKEN_BUY_OFFER,
        NFTokenBrokerFee: '100',
      });
      expect(tx.NFTokenBrokerFee).toBe('100');
    });

    it('accepts Fee and Sequence as base transaction fields', () => {
      const tx = make({ Fee: '12', Sequence: 42 });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(42);
    });
  });

  // ─── Account validation ─────────────────────────────────────────────

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        nftokenAcceptOffer({
          Account: '',
          NFTokenSellOffer: NFTOKEN_SELL_OFFER,
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      expect(() =>
        nftokenAcceptOffer({
          Account: 'not-an-account',
          NFTokenSellOffer: NFTOKEN_SELL_OFFER,
        }),
      ).toThrow(/Account/);
    });
  });

  // ─── Mode table: at least one offer required ────────────────────────

  describe('mode table', () => {
    it('throws when neither SellOffer nor BuyOffer is provided', () => {
      expect(() =>
        nftokenAcceptOffer({ Account: ACCOUNT }),
      ).toThrow(/NFTokenSellOffer or NFTokenBuyOffer/);
    });
  });

  // ─── Offer hash validation ──────────────────────────────────────────

  describe('NFTokenSellOffer / NFTokenBuyOffer validation', () => {
    it('throws on NFTokenSellOffer of wrong length', () => {
      // 63 chars — one short.
      const tooShort = 'A'.repeat(63);
      expect(() =>
        nftokenAcceptOffer({
          Account: ACCOUNT,
          NFTokenSellOffer: tooShort,
        }),
      ).toThrow(/NFTokenSellOffer/);
    });

    it('throws on non-hex NFTokenBuyOffer', () => {
      // 64 chars but contains non-hex 'Z'.
      const badHex = 'Z'.repeat(64);
      expect(() =>
        nftokenAcceptOffer({
          Account: ACCOUNT,
          NFTokenBuyOffer: badHex,
        }),
      ).toThrow(/NFTokenBuyOffer/);
    });

    it('throws on empty-string NFTokenSellOffer', () => {
      // Empty string is not 64 chars, so it fails the Hash256 check.
      expect(() =>
        nftokenAcceptOffer({
          Account: ACCOUNT,
          NFTokenSellOffer: '',
        }),
      ).toThrow(/NFTokenSellOffer/);
    });

    it('accepts an all-uppercase 64-char hex hash', () => {
      const tx = make({ NFTokenSellOffer: 'F'.repeat(64) });
      expect(tx.NFTokenSellOffer).toBe('F'.repeat(64));
    });

    it('accepts a 64-char hex hash with mixed case', () => {
      const mixed = 'aB'.repeat(32);
      const tx = make({ NFTokenBuyOffer: mixed });
      expect(tx.NFTokenBuyOffer).toBe(mixed);
    });
  });

  // ─── NFTokenBrokerFee mode + value validation ──────────────────────

  describe('NFTokenBrokerFee validation', () => {
    const both = {
      Account: BROKER,
      NFTokenSellOffer: NFTOKEN_SELL_OFFER,
      NFTokenBuyOffer: NFTOKEN_BUY_OFFER,
    };

    it('throws when BrokerFee is set without SellOffer (direct-buy mode)', () => {
      expect(() =>
        nftokenAcceptOffer({
          Account: BROKER,
          NFTokenBuyOffer: NFTOKEN_BUY_OFFER,
          NFTokenBrokerFee: '100',
        }),
      ).toThrow(/brokered mode/);
    });

    it('throws when BrokerFee is set without BuyOffer (direct-sell mode)', () => {
      expect(() =>
        nftokenAcceptOffer({
          Account: BROKER,
          NFTokenSellOffer: NFTOKEN_SELL_OFFER,
          NFTokenBrokerFee: '100',
        }),
      ).toThrow(/brokered mode/);
    });

    it('throws on BrokerFee === "0" (xrpl.js value <= 0 rejection)', () => {
      expect(() =>
        nftokenAcceptOffer({ ...both, NFTokenBrokerFee: '0' }),
      ).toThrow(/positive/);
    });

    it('throws on negative BrokerFee (negative XRP drops)', () => {
      expect(() =>
        nftokenAcceptOffer({ ...both, NFTokenBrokerFee: '-1' }),
      ).toThrow(/positive/);
    });

    it('throws on BrokerFee as a number (not an Amount)', () => {
      expect(() =>
        nftokenAcceptOffer({ ...both, NFTokenBrokerFee: 1 as unknown as string }),
      ).toThrow(/Amount/);
    });

    it('accepts BrokerFee as IssuedCurrencyAmount with positive value', () => {
      const brokerFee = { currency: 'USD', issuer: BROKER, value: '100' };
      const tx = nftokenAcceptOffer({ ...both, NFTokenBrokerFee: brokerFee });
      expect(tx.NFTokenBrokerFee).toEqual(brokerFee);
    });

    it('accepts BrokerFee as MPTAmount with positive value', () => {
      const brokerFee = { mpt_issuance_id: '00000001', value: '50' };
      const tx = nftokenAcceptOffer({ ...both, NFTokenBrokerFee: brokerFee });
      expect(tx.NFTokenBrokerFee).toEqual(brokerFee);
    });

    it('throws on IOU BrokerFee with currency code "XRP" (reserved)', () => {
      // xrpl.org temBAD_CURRENCY: NFTokenBrokerFee must not be an
      // issued token using the reserved currency code "XRP".
      expect(() =>
        nftokenAcceptOffer({
          ...both,
          NFTokenBrokerFee: {
            currency: 'XRP',
            issuer: BROKER,
            value: '100',
          } as unknown as Amount,
        }),
      ).toThrow(/reserved currency code/);
    });

    it('throws on IOU BrokerFee with malformed issuer', () => {
      expect(() =>
        nftokenAcceptOffer({
          ...both,
          NFTokenBrokerFee: {
            currency: 'USD',
            issuer: 'not-an-account',
            value: '100',
          } as unknown as Amount,
        }),
      ).toThrow(/issuer/);
    });

    it('throws on IOU BrokerFee with non-positive value', () => {
      expect(() =>
        nftokenAcceptOffer({
          ...both,
          NFTokenBrokerFee: {
            currency: 'USD',
            issuer: BROKER,
            value: '0',
          } as unknown as Amount,
        }),
      ).toThrow(/positive/);
    });

    it('throws on MPT BrokerFee with non-positive value', () => {
      expect(() =>
        nftokenAcceptOffer({
          ...both,
          NFTokenBrokerFee: {
            mpt_issuance_id: '00000001',
            value: '0',
          } as unknown as Amount,
        }),
      ).toThrow(/positive/);
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
        (tx as unknown as { NFTokenSellOffer: string }).NFTokenSellOffer =
          'FF'.repeat(32);
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides', () => {
      const tx = make();
      const tx2 = tx.with({ NFTokenBuyOffer: NFTOKEN_BUY_OFFER });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.NFTokenBuyOffer).toBe(NFTOKEN_BUY_OFFER);
      expect(tx.NFTokenBuyOffer).toBeUndefined();
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      // Setting an invalid BrokerFee in direct-sell mode (missing BuyOffer)
      // must re-run validation.
      expect(() => tx.with({ NFTokenBrokerFee: '100' })).toThrow(/brokered/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = nftokenAcceptOffer({
        Account: BROKER,
        NFTokenSellOffer: NFTOKEN_SELL_OFFER,
        NFTokenBuyOffer: NFTOKEN_BUY_OFFER,
        NFTokenBrokerFee: '100',
        Fee: '12',
        Sequence: 42,
      });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'NFTokenAcceptOffer',
        Account: BROKER,
        NFTokenSellOffer: NFTOKEN_SELL_OFFER,
        NFTokenBuyOffer: NFTOKEN_BUY_OFFER,
        NFTokenBrokerFee: '100',
        Fee: '12',
        Sequence: 42,
      });
    });

    it('.toJSON() skips undefined fields', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('NFTokenBuyOffer' in json).toBe(false);
      expect('NFTokenBrokerFee' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op (already validated at construction)', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });

  // ─── Base transaction fields ─────────────────────────────────────────────
  // `NftokenAcceptOffer`Props accepts the seven shared base fields and the factory now
  // calls `validateBaseTransaction`, so a malformed one is rejected at
  // construction instead of freezing a transaction that would fail at
  // submit. Values below are chosen to be VALID under src/validation/base.ts.
  describe('BaseTransactionFields', () => {
    const base = {
      Account: ACCOUNT,
      NFTokenSellOffer: NFTOKEN_SELL_OFFER,
    };
    const MEMOS = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
    const TXN_ID = 'AB'.repeat(32);
    // A valid classic address distinct from `base.Account`.
    const DELEGATE = BROKER;

    it('accepts Memos', () => {
      const tx = nftokenAcceptOffer({ ...base, Memos: MEMOS });
      expect(tx.toJSON().Memos).toEqual(MEMOS);
    });

    it('accepts SourceTag', () => {
      const tx = nftokenAcceptOffer({ ...base, SourceTag: 99 });
      expect(tx.toJSON().SourceTag).toBe(99);
    });

    it('accepts LastLedgerSequence', () => {
      const tx = nftokenAcceptOffer({ ...base, LastLedgerSequence: 1_000_000 });
      expect(tx.toJSON().LastLedgerSequence).toBe(1_000_000);
    });

    it('accepts AccountTxnID', () => {
      const tx = nftokenAcceptOffer({ ...base, AccountTxnID: TXN_ID });
      expect(tx.toJSON().AccountTxnID).toBe(TXN_ID);
    });

    it('accepts NetworkID', () => {
      const tx = nftokenAcceptOffer({ ...base, NetworkID: 1 });
      expect(tx.toJSON().NetworkID).toBe(1);
    });

    it('accepts a Delegate distinct from Account', () => {
      const tx = nftokenAcceptOffer({ ...base, Delegate: DELEGATE });
      expect(tx.toJSON().Delegate).toBe(DELEGATE);
    });

    it('accepts TicketSequence alongside Sequence: 0', () => {
      const tx = nftokenAcceptOffer({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    // ── Reject side ── the runtime backstop. Before the
    // `validateBaseTransaction` call landed, every case below built a frozen
    // transaction silently. The bad values are cast `as any` on purpose: the
    // point under test is the runtime check, and a type error would make the
    // test uncompilable.
    it('rejects a malformed Memos value', () => {
      expect(() => nftokenAcceptOffer({ ...base, Memos: 'not-an-array' } as any)).toThrow(/invalid Memos/);
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() => nftokenAcceptOffer({ ...base, SourceTag: 'NaN' } as any)).toThrow(
        /SourceTag must be a number/,
      );
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() => nftokenAcceptOffer({ ...base, LastLedgerSequence: 'soon' } as any)).toThrow(
        /LastLedgerSequence must be a number/,
      );
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() => nftokenAcceptOffer({ ...base, AccountTxnID: 99 } as any)).toThrow(
        /AccountTxnID must be a string/,
      );
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() => nftokenAcceptOffer({ ...base, NetworkID: {} } as any)).toThrow(/NetworkID must be a number/);
    });

    it('rejects a Delegate that is not a valid address', () => {
      expect(() => nftokenAcceptOffer({ ...base, Delegate: 'not-an-address' } as any)).toThrow(
        /invalid Delegate/,
      );
    });

    it('rejects a Delegate equal to Account', () => {
      expect(() => nftokenAcceptOffer({ ...base, Delegate: ACCOUNT } as any)).toThrow(/cannot be the same/);
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() => nftokenAcceptOffer({ ...base, TicketSequence: 'nope' } as any)).toThrow(
        /TicketSequence must be a number/,
      );
    });

    it('rejects a non-string Fee', () => {
      expect(() => nftokenAcceptOffer({ ...base, Fee: 12 } as any)).toThrow(/Fee must be a string/);
    });
  });
});
