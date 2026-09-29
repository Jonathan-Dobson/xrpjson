/**
 * Tests for the functional AMMBid factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, Asset, Asset2) and
 *      the full set of optional fields (BidMin, BidMax, AuthAccounts,
 *      Fee, Sequence, Flags).
 *   2. Spec-mandated guards the class API omits:
 *        a. Asset / Asset2 must be a Currency (XRP / IOU / MPT), not
 *           just a record (xrpl.js validateAMMBid lines 66–80).
 *        b. BidMin / BidMax, when present, must be an
 *           IssuedCurrencyAmount (LP tokens are always an issued
 *           currency, never XRP and never MPT) — tighter than xrpl.js
 *           `isAmount` check (lines 82–88).
 *        c. AuthAccounts must be an array (xrpl.js lines 90–95).
 *        d. AuthAccounts length must not exceed 4 (xrpl.js lines
 *           96–100; xrpl.org ammbid.md — "up to 4").
 *        e. AuthAccounts inner shape `{ AuthAccount: { Account } }`
 *           (xrpl.js validateAuthAccounts lines 105–129).
 *        f. AuthAccounts must not include the sender's address
 *           (xrpl.js validateAuthAccounts lines 122–126; xrpl.org
 *           ammbid.md — "This cannot include the address of the
 *           transaction sender.").
 *   3. Frozen-shape contract (mutation throws, .with() returns a new
 *      frozen object, .toJSON() strips methods and undefined fields).
 */
import { describe, it, expect } from 'vitest';
import type { Currency } from '../../src/types/amounts.js';
import {
  ammBid,
  type AmmBid,
} from '../../src/fp/factories/amm-bid.js';

// ─── Test fixtures ───────────────────────────────────────────────────

const BIDDER = 'rJVUeRqDFNs2xqA7ncVE6ZoAhPUoaJJSQm';
const FRIEND_A = 'rMKXGCbJ5d8LbrqthdG46q3f969MVK2Qeg';
const FRIEND_B = 'rBepJuTLFJt3WmtLXYAxSjtBWAeQxVbncv';
const FRIEND_C = 'rGFBE8WA2ZKfqGGB7CFkLusVt7hsVT4r8H';
const FRIEND_D = 'rE54zDvgnghAoPopCgvtiqWNq3dU5y836S';
const LP_TOKEN_ISSUER = 'rE54zDvgnghAoPopCgvtiqWNq3dU5y836S';
const LP_TOKEN_CURRENCY = '039C99CD9AB0B70B32ECDA51EAAE471625608EA2';

const XRP_ASSET = { currency: 'XRP' };
const IOU_ASSET = { currency: 'TST', issuer: 'rP9jPyP5kyvFRb6ZiRghAGw5u8SGAmU4bd' };
const MPT_ASSET = { mpt_issuance_id: '00000001' };

const LP_TOKEN = {
  currency: LP_TOKEN_CURRENCY,
  issuer: LP_TOKEN_ISSUER,
  value: '100',
};

function make(extras: Record<string, unknown> = {}) {
  return ammBid({
    Account: BIDDER,
    Asset: XRP_ASSET,
    Asset2: IOU_ASSET,
    ...extras,
  });
}

describe('fp/ammBid()', () => {
  describe('construction', () => {
    it('constructs with required fields only (Account, Asset, Asset2)', () => {
      const tx = ammBid({
        Account: BIDDER,
        Asset: XRP_ASSET,
        Asset2: IOU_ASSET,
      });
      expect(tx.TransactionType).toBe('AMMBid');
      expect(tx.Account).toBe(BIDDER);
      expect(tx.Asset).toEqual(XRP_ASSET);
      expect(tx.Asset2).toEqual(IOU_ASSET);
      expect(tx.BidMin).toBeUndefined();
      expect(tx.BidMax).toBeUndefined();
      expect(tx.AuthAccounts).toBeUndefined();
    });

    it('accepts each Currency form for Asset and Asset2 (XRP / IOU / MPT)', () => {
      const variants: ReadonlyArray<{ asset: Currency; asset2: Currency }> = [
        { asset: XRP_ASSET, asset2: IOU_ASSET },
        { asset: IOU_ASSET, asset2: XRP_ASSET },
        { asset: MPT_ASSET, asset2: IOU_ASSET },
        { asset: IOU_ASSET, asset2: MPT_ASSET },
        { asset: XRP_ASSET, asset2: MPT_ASSET },
        { asset: MPT_ASSET, asset2: XRP_ASSET },
      ];
      for (const { asset, asset2 } of variants) {
        const tx = ammBid({
          Account: BIDDER,
          Asset: asset,
          Asset2: asset2,
        });
        expect(tx.Asset).toEqual(asset);
        expect(tx.Asset2).toEqual(asset2);
      }
    });

    it('accepts BidMin alone', () => {
      const tx = ammBid({
        Account: BIDDER,
        Asset: XRP_ASSET,
        Asset2: IOU_ASSET,
        BidMin: LP_TOKEN,
      });
      expect(tx.BidMin).toEqual(LP_TOKEN);
      expect(tx.BidMax).toBeUndefined();
    });

    it('accepts BidMax alone', () => {
      const tx = ammBid({
        Account: BIDDER,
        Asset: XRP_ASSET,
        Asset2: IOU_ASSET,
        BidMax: LP_TOKEN,
      });
      expect(tx.BidMax).toEqual(LP_TOKEN);
    });

    it('accepts BidMin and BidMax together', () => {
      const bidMin = { ...LP_TOKEN, value: '50' };
      const tx = ammBid({
        Account: BIDDER,
        Asset: XRP_ASSET,
        Asset2: IOU_ASSET,
        BidMin: bidMin,
        BidMax: LP_TOKEN,
      });
      expect(tx.BidMin).toEqual(bidMin);
      expect(tx.BidMax).toEqual(LP_TOKEN);
    });

    it('accepts AuthAccounts with up to 4 entries', () => {
      const tx = ammBid({
        Account: BIDDER,
        Asset: XRP_ASSET,
        Asset2: IOU_ASSET,
        AuthAccounts: [
          { AuthAccount: { Account: FRIEND_A } },
          { AuthAccount: { Account: FRIEND_B } },
          { AuthAccount: { Account: FRIEND_C } },
          { AuthAccount: { Account: FRIEND_D } },
        ],
      });
      expect(tx.AuthAccounts).toHaveLength(4);
      expect(tx.AuthAccounts?.[0]?.AuthAccount.Account).toBe(FRIEND_A);
      expect(tx.AuthAccounts?.[3]?.AuthAccount.Account).toBe(FRIEND_D);
    });

    it('passes through Fee / Sequence / Flags', () => {
      const tx = ammBid({
        Account: BIDDER,
        Asset: XRP_ASSET,
        Asset2: IOU_ASSET,
        Fee: '12',
        Sequence: 9,
        Flags: 0,
      });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(9);
      expect(tx.Flags).toBe(0);
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        ammBid({
          Account: undefined as never,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      expect(() =>
        ammBid({
          Account: 'not-an-address',
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('Asset / Asset2 validation', () => {
    it('throws on missing Asset (divergence #1)', () => {
      expect(() =>
        ammBid({
          Account: BIDDER,
          Asset: undefined as never,
          Asset2: IOU_ASSET,
        }),
      ).toThrow(/missing field Asset/);
    });

    it('throws when Asset is a non-Currency value (number)', () => {
      expect(() =>
        ammBid({
          Account: BIDDER,
          Asset: 1234 as never,
          Asset2: IOU_ASSET,
        }),
      ).toThrow(/Asset must be a Currency/);
    });

    it('throws when Asset is a bare object with no currency / mpt_issuance_id', () => {
      expect(() =>
        ammBid({
          Account: BIDDER,
          Asset: { foo: 'bar' } as never,
          Asset2: IOU_ASSET,
        }),
      ).toThrow(/Asset must be a Currency/);
    });

    it('throws when Asset is an IOU missing the issuer', () => {
      expect(() =>
        ammBid({
          Account: BIDDER,
          Asset: { currency: 'TST' } as never,
          Asset2: IOU_ASSET,
        }),
      ).toThrow(/Asset must be a Currency/);
    });

    it('throws on missing Asset2 (divergence #2)', () => {
      expect(() =>
        ammBid({
          Account: BIDDER,
          Asset: XRP_ASSET,
          Asset2: undefined as never,
        }),
      ).toThrow(/missing field Asset2/);
    });

    it('throws when Asset2 is a non-Currency value (number)', () => {
      expect(() =>
        ammBid({
          Account: BIDDER,
          Asset: XRP_ASSET,
          Asset2: 1234 as never,
        }),
      ).toThrow(/Asset2 must be a Currency/);
    });

    it('throws when Asset2 is a bare object with no currency / mpt_issuance_id', () => {
      expect(() =>
        ammBid({
          Account: BIDDER,
          Asset: XRP_ASSET,
          Asset2: { foo: 'bar' } as never,
        }),
      ).toThrow(/Asset2 must be a Currency/);
    });
  });

  describe('BidMin / BidMax validation', () => {
    it('throws when BidMin is not an IssuedCurrencyAmount (divergence #3)', () => {
      // A bare XRP drops string is not an IssuedCurrencyAmount.
      expect(() =>
        ammBid({
          Account: BIDDER,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          BidMin: '100' as never,
        }),
      ).toThrow(/BidMin must be an IssuedCurrencyAmount/);
    });

    it('throws when BidMin is an MPTAmount (LP tokens are never MPT)', () => {
      expect(() =>
        ammBid({
          Account: BIDDER,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          BidMin: { mpt_issuance_id: '00000001', value: '100' } as never,
        }),
      ).toThrow(/BidMin must be an IssuedCurrencyAmount/);
    });

    it('throws when BidMin is an IOU missing the issuer', () => {
      expect(() =>
        ammBid({
          Account: BIDDER,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          BidMin: { currency: LP_TOKEN_CURRENCY, value: '100' } as never,
        }),
      ).toThrow(/BidMin must be an IssuedCurrencyAmount/);
    });

    it('throws when BidMax is not an IssuedCurrencyAmount (divergence #4)', () => {
      expect(() =>
        ammBid({
          Account: BIDDER,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          BidMax: '100' as never,
        }),
      ).toThrow(/BidMax must be an IssuedCurrencyAmount/);
    });

    it('throws when BidMax is an MPTAmount (LP tokens are never MPT)', () => {
      expect(() =>
        ammBid({
          Account: BIDDER,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          BidMax: { mpt_issuance_id: '00000001', value: '100' } as never,
        }),
      ).toThrow(/BidMax must be an IssuedCurrencyAmount/);
    });
  });

  describe('AuthAccounts validation', () => {
    it('throws when AuthAccounts is not an array (divergence #5)', () => {
      expect(() =>
        ammBid({
          Account: BIDDER,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          AuthAccounts: 1234 as never,
        }),
      ).toThrow(/AuthAccounts must be an AuthAccount array/);
    });

    it('throws when AuthAccounts has more than 4 entries (divergence #6)', () => {
      expect(() =>
        ammBid({
          Account: BIDDER,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          AuthAccounts: [
            { AuthAccount: { Account: FRIEND_A } },
            { AuthAccount: { Account: FRIEND_B } },
            { AuthAccount: { Account: FRIEND_C } },
            { AuthAccount: { Account: FRIEND_D } },
            { AuthAccount: { Account: 'rAnotherAddress123456789ABCDEFGH' } },
          ],
        }),
      ).toThrow(/AuthAccounts length must not be greater than 4/);
    });

    it('throws when an AuthAccount entry is missing the inner AuthAccount key (divergence #7)', () => {
      expect(() =>
        ammBid({
          Account: BIDDER,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          AuthAccounts: [{ Account: FRIEND_A } as never],
        }),
      ).toThrow(/invalid AuthAccounts/);
    });

    it('throws when AuthAccount.Account is not a string (divergence #7)', () => {
      expect(() =>
        ammBid({
          Account: BIDDER,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          AuthAccounts: [{ AuthAccount: { Account: 1234 } } as never],
        }),
      ).toThrow(/invalid AuthAccounts/);
    });

    it('throws when AuthAccounts includes the sender (divergence #8)', () => {
      expect(() =>
        ammBid({
          Account: BIDDER,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          AuthAccounts: [
            { AuthAccount: { Account: FRIEND_A } },
            { AuthAccount: { Account: BIDDER } },
          ],
        }),
      ).toThrow(/AuthAccounts must not include sender's address/);
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
        (tx as unknown as Record<string, unknown>).Asset = IOU_ASSET;
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      const tx = make();
      const tx2 = tx.with({ BidMax: LP_TOKEN });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.BidMax).toEqual(LP_TOKEN);
      expect(tx.BidMax).toBeUndefined();
    });

    it('.with() re-validates on overrides (invalid Asset)', () => {
      const tx = make();
      expect(() => tx.with({ Asset: 1234 as never })).toThrow(
        /Asset must be a Currency/,
      );
    });

    it('.with() re-validates on overrides (AuthAccounts over limit)', () => {
      const tx = make();
      expect(() =>
        tx.with({
          AuthAccounts: [
            { AuthAccount: { Account: FRIEND_A } },
            { AuthAccount: { Account: FRIEND_B } },
            { AuthAccount: { Account: FRIEND_C } },
            { AuthAccount: { Account: FRIEND_D } },
            { AuthAccount: { Account: 'rAnotherAddress123456789ABCDEFGH' } },
          ],
        }),
      ).toThrow(/AuthAccounts length must not be greater than 4/);
    });

    it('.with() re-validates on overrides (AuthAccounts includes sender)', () => {
      const tx = make({
        AuthAccounts: [{ AuthAccount: { Account: FRIEND_A } }],
      });
      expect(() =>
        tx.with({
          AuthAccounts: [{ AuthAccount: { Account: BIDDER } }],
        }),
      ).toThrow(/AuthAccounts must not include sender's address/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = ammBid({
        Account: BIDDER,
        Asset: XRP_ASSET,
        Asset2: IOU_ASSET,
        BidMax: LP_TOKEN,
        AuthAccounts: [{ AuthAccount: { Account: FRIEND_A } }],
        Fee: '12',
        Sequence: 9,
        Flags: 0,
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'AMMBid',
        Account: BIDDER,
        Asset: XRP_ASSET,
        Asset2: IOU_ASSET,
        BidMax: LP_TOKEN,
        AuthAccounts: [{ AuthAccount: { Account: FRIEND_A } }],
        Flags: 0,
        Fee: '12',
        Sequence: 9,
      });
    });

    it('.toJSON() skips undefined fields and methods', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('BidMin' in json).toBe(false);
      expect('BidMax' in json).toBe(false);
      expect('AuthAccounts' in json).toBe(false);
      expect('Flags' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op after construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });

    it('AmmBid type narrows the TransactionType literal', () => {
      const tx: AmmBid = make();
      expect(tx.TransactionType).toBe('AMMBid');
    });
  });
});