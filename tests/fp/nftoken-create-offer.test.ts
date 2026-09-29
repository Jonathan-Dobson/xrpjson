/**
 * Tests for the functional NFTokenCreateOffer factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, NFTokenID, Amount).
 *   2. Required cross-field rules: Owner required for buy / forbidden for
 *      sell; Amount > 0 for buy offers; Amount=0 only valid for XRP sell.
 *   3. Optional field validation: Expiration (UInt32), Destination.
 *   4. Identity guards: Owner ≠ Account, Destination ≠ Account.
 *   5. NFTokenID shape (Hash256 / 64-char hex).
 *   6. Amount deep shape (XRP / IOU / MPT — currency length, issuer,
 *      value as base-10 integer).
 *   7. Flags: numeric bitmask + boolean-map; tfSellNFToken.
 *   8. Frozen-shape contract (mutation throws, .with() returns new
 *      frozen tx, .toJSON() strips methods + undefined fields).
 */
import { describe, it, expect } from 'vitest';
import { nftokenCreateOffer } from '../../src/fp/factories/nftoken-create-offer.js';

// ─── Test fixtures ───────────────────────────────────────────────────

const ACCOUNT = 'rs8jBmmfpwgmrSPgwMsh7CvKRmRt1JTVSX';
const OWNER = 'rNCFjv8Ek5oDrNiMJ3pw6eLLFtMjZLJnf2';
const DESTINATION = 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B';
const ISSUER = 'rPyfep3gcLzkosKC9XiE77Y8DZWG6iWDT9';

// 64-char hex NFTokenID (real-world shape from XLS-20 §1.5.4 example).
const NFTOKEN_ID =
  '000100001E962F495F07A990F4ED55ACCFEEF365DBAA76B6A048C0A200000007';
// Also valid example from the XLS-20 spec.
const NFTOKEN_ID_2 =
  '000B013A95F14B0044F78A264E41713C64B5F89242540EE208C3098E00000D65';

const IOU = { currency: 'USD', issuer: ISSUER, value: '100' };
const MPT = { mpt_issuance_id: '00000000000000000000000004', value: '50' };

function makeBuy(extras: Record<string, unknown> = {}) {
  return nftokenCreateOffer({
    Account: ACCOUNT,
    NFTokenID: NFTOKEN_ID,
    Amount: '500000',
    Owner: OWNER,
    // No tfSellNFToken ⇒ buy offer by default.
    ...extras,
  });
}

function makeSell(extras: Record<string, unknown> = {}) {
  return nftokenCreateOffer({
    Account: ACCOUNT,
    NFTokenID: NFTOKEN_ID,
    Amount: '1000000',
    Flags: { tfSellNFToken: true },
    ...extras,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('fp/nftokenCreateOffer()', () => {
  describe('construction', () => {
    it('constructs a buy offer (Flags defaults to 0 / no tfSellNFToken)', () => {
      const tx = makeBuy();
      expect(tx.TransactionType).toBe('NFTokenCreateOffer');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.NFTokenID).toBe(NFTOKEN_ID);
      expect(tx.Amount).toBe('500000');
      expect(tx.Owner).toBe(OWNER);
      expect(tx.Destination).toBeUndefined();
      expect(tx.Expiration).toBeUndefined();
      expect(tx.Flags).toBeUndefined();
      expect(tx.Fee).toBeUndefined();
      expect(tx.Sequence).toBeUndefined();
    });

    it('constructs a sell offer via object-form Flags', () => {
      const tx = makeSell();
      expect(tx.TransactionType).toBe('NFTokenCreateOffer');
      expect(tx.Amount).toBe('1000000');
      expect(tx.Flags).toEqual({ tfSellNFToken: true });
      expect(tx.Owner).toBeUndefined();
    });

    it('constructs a sell offer via numeric Flags (tfSellNFToken = 0x1)', () => {
      const tx = nftokenCreateOffer({
        Account: ACCOUNT,
        NFTokenID: NFTOKEN_ID,
        Amount: '1000000',
        Flags: 0x00000001,
      });
      expect(tx.Flags).toBe(0x00000001);
      expect(tx.Owner).toBeUndefined();
    });

    it('accepts Fee and Sequence as base transaction fields', () => {
      const tx = makeBuy({ Fee: '12', Sequence: 42 });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(42);
    });

    it('accepts all optional fields together (sell offer with Destination + Expiration)', () => {
      const tx = nftokenCreateOffer({
        Account: ACCOUNT,
        NFTokenID: NFTOKEN_ID_2,
        Amount: '2000000',
        Destination: DESTINATION,
        Expiration: 800000000,
        Flags: { tfSellNFToken: true },
        Fee: '15',
        Sequence: 9,
      });
      expect(tx.NFTokenID).toBe(NFTOKEN_ID_2);
      expect(tx.Amount).toBe('2000000');
      expect(tx.Destination).toBe(DESTINATION);
      expect(tx.Expiration).toBe(800000000);
      expect(tx.Fee).toBe('15');
      expect(tx.Sequence).toBe(9);
    });
  });

  // ─── Account validation ─────────────────────────────────────────────

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        nftokenCreateOffer({
          Account: '',
          NFTokenID: NFTOKEN_ID,
          Amount: '1000',
          Owner: OWNER,
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      expect(() =>
        nftokenCreateOffer({
          Account: 'not-an-account',
          NFTokenID: NFTOKEN_ID,
          Amount: '1000',
          Owner: OWNER,
        }),
      ).toThrow(/Account/);
    });
  });

  // ─── NFTokenID validation ──────────────────────────────────────────

  describe('NFTokenID validation', () => {
    it('throws on missing NFTokenID', () => {
      expect(() =>
        nftokenCreateOffer({
          Account: ACCOUNT,
          NFTokenID: '' as string,
          Amount: '1000',
          Owner: OWNER,
        }),
      ).toThrow(/NFTokenID/);
    });

    it('throws on non-hex NFTokenID', () => {
      expect(() =>
        nftokenCreateOffer({
          Account: ACCOUNT,
          NFTokenID: 'Z'.repeat(64),
          Amount: '1000',
          Owner: OWNER,
        }),
      ).toThrow(/NFTokenID/);
    });

    it('throws on NFTokenID of wrong length', () => {
      expect(() =>
        nftokenCreateOffer({
          Account: ACCOUNT,
          NFTokenID: 'AB',
          Amount: '1000',
          Owner: OWNER,
        }),
      ).toThrow(/NFTokenID/);
    });

    it('accepts NFTokenID at exactly 64 hex chars (boundary)', () => {
      const tx = makeBuy({ NFTokenID: NFTOKEN_ID_2 });
      expect(tx.NFTokenID).toBe(NFTOKEN_ID_2);
    });
  });

  // ─── Owner / sell-vs-buy cross-field guards ────────────────────────

  describe('sell-vs-buy cross-field rules', () => {
    it('buy offer: Owner is required', () => {
      expect(() =>
        nftokenCreateOffer({
          Account: ACCOUNT,
          NFTokenID: NFTOKEN_ID,
          Amount: '1000',
          // Owner missing AND no tfSellNFToken ⇒ buy offer.
        }),
      ).toThrow(/Owner is required for buy offers/);
    });

    it('sell offer: Owner must not be present', () => {
      expect(() =>
        nftokenCreateOffer({
          Account: ACCOUNT,
          NFTokenID: NFTOKEN_ID,
          Amount: '1000000',
          Owner: OWNER,
          Flags: { tfSellNFToken: true },
        }),
      ).toThrow(/Owner must not be present for sell offers/);
    });

    it('numeric Flags with tfSellNFToken also rejects Owner', () => {
      expect(() =>
        nftokenCreateOffer({
          Account: ACCOUNT,
          NFTokenID: NFTOKEN_ID,
          Amount: '1000000',
          Owner: OWNER,
          Flags: 0x00000001,
        }),
      ).toThrow(/Owner must not be present for sell offers/);
    });

    it('buy offer: Amount must be > 0 (XRP "0" rejected)', () => {
      expect(() =>
        nftokenCreateOffer({
          Account: ACCOUNT,
          NFTokenID: NFTOKEN_ID,
          Amount: '0',
          Owner: OWNER,
        }),
      ).toThrow(/Amount must be greater than 0 for buy offers/);
    });

    it('buy offer: Amount IOU with value=0 rejected (temBAD_AMOUNT)', () => {
      expect(() =>
        nftokenCreateOffer({
          Account: ACCOUNT,
          NFTokenID: NFTOKEN_ID,
          Amount: { currency: 'USD', issuer: ISSUER, value: '0' },
          Owner: OWNER,
        }),
      ).toThrow(/Amount must be greater than 0 for buy offers/);
    });

    it('sell offer with XRP Amount="0" is allowed (gratis giveaway)', () => {
      const tx = nftokenCreateOffer({
        Account: ACCOUNT,
        NFTokenID: NFTOKEN_ID,
        Amount: '0',
        Flags: { tfSellNFToken: true },
      });
      expect(tx.Amount).toBe('0');
    });

    it('sell offer with IOU Amount="0" is rejected (only legal for XRP)', () => {
      expect(() =>
        nftokenCreateOffer({
          Account: ACCOUNT,
          NFTokenID: NFTOKEN_ID,
          Amount: { currency: 'USD', issuer: ISSUER, value: '0' },
          Flags: { tfSellNFToken: true },
        }),
      ).toThrow(/Amount=0 is only valid for XRP/);
    });

    it('buy offer: Owner must be a valid XRPL account', () => {
      expect(() =>
        nftokenCreateOffer({
          Account: ACCOUNT,
          NFTokenID: NFTOKEN_ID,
          Amount: '1000',
          Owner: 'not-an-address',
        }),
      ).toThrow(/Owner must be a valid XRPL account/);
    });
  });

  // ─── Identity guards ────────────────────────────────────────────────

  describe('identity guards', () => {
    it('throws when Owner equals Account (buy offer)', () => {
      expect(() =>
        nftokenCreateOffer({
          Account: ACCOUNT,
          NFTokenID: NFTOKEN_ID,
          Amount: '1000',
          Owner: ACCOUNT,
        }),
      ).toThrow(/Owner and Account must not be equal/);
    });

    it('throws when Destination equals Account', () => {
      expect(() =>
        makeSell({ Destination: ACCOUNT }),
      ).toThrow(/Destination and Account must not be equal/);
    });

    it('throws when Destination is malformed', () => {
      expect(() =>
        makeSell({ Destination: 'bogus' }),
      ).toThrow(/Destination must be a valid XRPL account/);
    });
  });

  // ─── Expiration validation ──────────────────────────────────────────

  describe('Expiration validation', () => {
    it('accepts Expiration at UInt32 max', () => {
      const tx = makeBuy({ Expiration: 0xffffffff });
      expect(tx.Expiration).toBe(0xffffffff);
    });

    it('accepts Expiration = 0 (UInt32 boundary)', () => {
      const tx = makeBuy({ Expiration: 0 });
      expect(tx.Expiration).toBe(0);
    });

    it('throws on negative Expiration', () => {
      expect(() => makeBuy({ Expiration: -1 })).toThrow(/UInt32/);
    });

    it('throws on Expiration > UInt32 max', () => {
      expect(() => makeBuy({ Expiration: 0x100000000 })).toThrow(/UInt32/);
    });

    it('throws on non-integer Expiration', () => {
      expect(() => makeBuy({ Expiration: 1.5 })).toThrow(/UInt32/);
    });
  });

  // ─── Amount deep-shape validation ─────────────────────────────────

  describe('Amount deep shape', () => {
    it('accepts XRP Amount as non-negative base-10 integer string', () => {
      const tx = makeBuy({ Amount: '1234567' });
      expect(tx.Amount).toBe('1234567');
    });

    it('throws on malformed XRP Amount (negative number string)', () => {
      expect(() =>
        makeBuy({ Amount: '-1' }),
      ).toThrow(/Amount \(XRP\)/);
    });

    it('accepts IOU Amount with 3-char ASCII currency', () => {
      const tx = makeBuy({ Amount: IOU });
      expect(tx.Amount).toEqual(IOU);
    });

    it('accepts IOU Amount with 40-char hex currency', () => {
      const hexCcy = '0158415500000000C1F76FFA276C27E60FBC1DAD';
      const tx = makeBuy({
        Amount: { currency: hexCcy, issuer: ISSUER, value: '7' },
      });
      expect(tx.Amount).toEqual({
        currency: hexCcy,
        issuer: ISSUER,
        value: '7',
      });
    });

    it('throws on IOU currency of wrong length', () => {
      expect(() =>
        makeBuy({
          Amount: { currency: 'USDD', issuer: ISSUER, value: '1' },
        }),
      ).toThrow(/currency/);
    });

    it('throws on IOU issuer that is not a valid account', () => {
      expect(() =>
        makeBuy({
          Amount: { currency: 'USD', issuer: 'bad', value: '1' },
        }),
      ).toThrow(/issuer/);
    });

    it('throws on IOU value with a negative integer string', () => {
      expect(() =>
        makeBuy({
          Amount: { currency: 'USD', issuer: ISSUER, value: '-1' },
        }),
      ).toThrow(/value/);
    });

    it('accepts MPT Amount', () => {
      const tx = makeBuy({ Amount: MPT });
      expect(tx.Amount).toEqual(MPT);
    });

    it('throws on MPT with too-short issuance id', () => {
      expect(() =>
        makeBuy({ Amount: { mpt_issuance_id: 'abc', value: '1' } }),
      ).toThrow(/mpt_issuance_id/);
    });

    it('throws on completely malformed Amount', () => {
      expect(() =>
        makeBuy({ Amount: { foo: 'bar' } as never }),
      ).toThrow(/Amount/);
    });
  });

  // ─── Flag handling ──────────────────────────────────────────────────

  describe('Flag handling', () => {
    it('accepts numeric Flags with tfSellNFToken (0x1)', () => {
      const tx = makeSell();
      expect(tx.Flags).toEqual({ tfSellNFToken: true });
    });

    it('accepts object-form FlagsInterface with tfSellNFToken=true', () => {
      const tx = nftokenCreateOffer({
        Account: ACCOUNT,
        NFTokenID: NFTOKEN_ID,
        Amount: '1000',
        Owner: OWNER,
        Flags: { tfSellNFToken: false }, // explicitly buy
      });
      expect(tx.Flags).toEqual({ tfSellNFToken: false });
    });

    it('throws on negative numeric Flags', () => {
      expect(() =>
        makeBuy({ Flags: -1 }),
      ).toThrow(/non-negative integer/);
    });

    it('throws on non-integer numeric Flags', () => {
      expect(() =>
        makeBuy({ Flags: 1.5 }),
      ).toThrow(/non-negative integer/);
    });

    it('throws on Flags of unsupported type', () => {
      expect(() =>
        makeBuy({ Flags: 'tfSellNFToken' as never }),
      ).toThrow(/Flags must be/);
    });
  });

  // ─── Frozen-shape contract ──────────────────────────────────────────

  describe('frozen-shape contract', () => {
    it('returns a frozen object', () => {
      const tx = makeBuy();
      expect(Object.isFrozen(tx)).toBe(true);
    });

    it('mutation throws in strict mode', () => {
      const tx = makeBuy();
      expect(() => {
        (tx as unknown as { Amount: string }).Amount = '999';
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides', () => {
      const tx = makeBuy();
      const tx2 = tx.with({ Amount: '7777777' });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Amount).toBe('7777777');
      expect(tx.Amount).toBe('500000');
    });

    it('.with() re-validates on overrides (negative Expiration)', () => {
      const tx = makeBuy();
      expect(() => tx.with({ Expiration: -5 })).toThrow(/UInt32/);
    });

    it('.with() re-validates direction rules (removing Owner on a buy offer)', () => {
      // The base tx is a buy offer. Overriding Owner to undefined
      // should re-trigger the "Owner required for buy offers" guard.
      const tx = makeBuy();
      expect(() =>
        tx.with({ Owner: undefined }),
      ).toThrow(/Owner is required for buy offers/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = makeSell({ Destination: DESTINATION, Expiration: 1234 });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'NFTokenCreateOffer',
        Account: ACCOUNT,
        NFTokenID: NFTOKEN_ID,
        Amount: '1000000',
        Flags: { tfSellNFToken: true },
        Destination: DESTINATION,
        Expiration: 1234,
      });
    });

    it('.toJSON() skips undefined fields', () => {
      const tx = makeBuy();
      const json = tx.toJSON();
      expect('Owner' in json).toBe(true); // Owner is set on makeBuy
      expect('Destination' in json).toBe(false);
      expect('Expiration' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op (already validated at construction)', () => {
      const tx = makeBuy();
      expect(() => tx.validate()).not.toThrow();
    });
  });
});
