/**
 * Tests for the functional OfferCreate factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, TakerGets, TakerPays).
 *   2. Optional field handling (Expiration, OfferSequence, DomainID).
 *   3. Amount sub-field validation across all three forms (XRP, IOU, MPT).
 *   4. Cross-field invariant: TakerGets and TakerPays must not be the
 *      same currency.
 *   5. Flag validation (tfHybrid requires DomainID, tfImmediateOrCancel
 *      and tfFillOrKill mutually exclusive).
 *   6. Expiration and OfferSequence UInt32 checks.
 *   7. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined values).
 *   8. .with() re-validates on overrides.
 */
import { describe, it, expect } from 'vitest';
import { offerCreate } from '../../src/fp/factories/offer-create.js';

// ─── Test fixtures ───────────────────────────────────────────────────

const ACCOUNT = 'ra5nK24KXen9AHvsdFTKHSANinZseWnPcX';
const ISSUER = 'rPyfep3gcLzkosKC9XiE77Y8DZWG6iWDT9';

const XRP_GETS = '6000000';
const IOU_PAYS = {
  currency: 'GKO',
  issuer: 'ruazs5h1qEsqpke88pcqnaseXdm6od2xc',
  value: '2',
};
const MPT_GETS = {
  mpt_issuance_id: '00000000000000000000000001',
  value: '500',
};

const DOMAIN_ID =
  '5D0177045A8750FC5892032A3BA15885B38A88BE315B7DF6A44BB24D67141180';

function make(extras: Record<string, unknown> = {}) {
  return offerCreate({
    Account: ACCOUNT,
    TakerGets: XRP_GETS,
    TakerPays: IOU_PAYS,
    ...extras,
  });
}

describe('fp/offerCreate()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('OfferCreate');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.TakerGets).toBe(XRP_GETS);
      expect(tx.TakerPays).toEqual(IOU_PAYS);
      expect(tx.Expiration).toBeUndefined();
      expect(tx.OfferSequence).toBeUndefined();
      expect(tx.DomainID).toBeUndefined();
      expect(tx.Flags).toBeUndefined();
      expect(tx.Fee).toBeUndefined();
      expect(tx.Sequence).toBeUndefined();
    });

    it('constructs with all optional fields', () => {
      const tx = offerCreate({
        Account: ACCOUNT,
        TakerGets: MPT_GETS,
        TakerPays: XRP_GETS,
        Expiration: 770000000,
        OfferSequence: 7,
        DomainID: DOMAIN_ID,
        Flags: 0,
        Fee: '12',
        Sequence: 8,
      });
      expect(tx.Expiration).toBe(770000000);
      expect(tx.OfferSequence).toBe(7);
      expect(tx.DomainID).toBe(DOMAIN_ID);
      expect(tx.Flags).toBe(0);
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(8);
      expect(tx.TakerGets).toEqual(MPT_GETS);
      expect(tx.TakerPays).toBe(XRP_GETS);
    });

    it('accepts a FlagsInterface object', () => {
      const tx = offerCreate({
        Account: ACCOUNT,
        TakerGets: XRP_GETS,
        TakerPays: IOU_PAYS,
        Flags: { tfPassive: true },
      });
      expect(tx.Flags).toEqual({ tfPassive: true });
    });
  });

  describe('Account validation', () => {
    it('throws when Account is missing', () => {
      expect(() =>
        offerCreate({
          Account: undefined as never,
          TakerGets: XRP_GETS,
          TakerPays: IOU_PAYS,
        }),
      ).toThrow(/Account/);
    });

    it('throws when Account is invalid', () => {
      expect(() =>
        offerCreate({
          Account: 'not-an-address',
          TakerGets: XRP_GETS,
          TakerPays: IOU_PAYS,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('TakerGets / TakerPays validation', () => {
    it('throws when TakerGets is missing', () => {
      expect(() =>
        offerCreate({
          Account: ACCOUNT,
          TakerGets: undefined as never,
          TakerPays: IOU_PAYS,
        }),
      ).toThrow(/TakerGets/);
    });

    it('throws when TakerPays is missing', () => {
      expect(() =>
        offerCreate({
          Account: ACCOUNT,
          TakerGets: XRP_GETS,
          TakerPays: undefined as never,
        }),
      ).toThrow(/TakerPays/);
    });

    it('throws when TakerGets is the wrong type (number)', () => {
      expect(() =>
        offerCreate({
          Account: ACCOUNT,
          TakerGets: 10 as never,
          TakerPays: IOU_PAYS,
        }),
      ).toThrow(/TakerGets/);
    });

    it('throws when TakerGets is the XRP string "0"', () => {
      expect(() =>
        offerCreate({
          Account: ACCOUNT,
          TakerGets: '0',
          TakerPays: IOU_PAYS,
        }),
      ).toThrow(/positive/);
    });

    it('throws when TakerPays has an IOU currency of wrong length', () => {
      expect(() =>
        offerCreate({
          Account: ACCOUNT,
          TakerGets: XRP_GETS,
          TakerPays: {
            currency: 'USDD',
            issuer: ISSUER,
            value: '10',
          },
        }),
      ).toThrow(/currency/);
    });

    it('throws when TakerPays has an IOU issuer that is not a valid XRPL address', () => {
      expect(() =>
        offerCreate({
          Account: ACCOUNT,
          TakerGets: XRP_GETS,
          TakerPays: { currency: 'USD', issuer: 'bogus', value: '10' },
        }),
      ).toThrow(/issuer/);
    });

    it('throws when TakerPays has an IOU value of 0', () => {
      expect(() =>
        offerCreate({
          Account: ACCOUNT,
          TakerGets: XRP_GETS,
          TakerPays: { currency: 'USD', issuer: ISSUER, value: '0' },
        }),
      ).toThrow(/positive/);
    });

    it('throws when TakerGets is an MPT with too-short issuance id', () => {
      expect(() =>
        offerCreate({
          Account: ACCOUNT,
          TakerGets: { mpt_issuance_id: 'abc', value: '1' },
          TakerPays: IOU_PAYS,
        }),
      ).toThrow(/mpt_issuance_id/);
    });

    it('accepts 40-char hex currency form', () => {
      const hexCcy = '0158415500000000C1F76FFA276C27E60FBC1DAD';
      const tx = offerCreate({
        Account: ACCOUNT,
        TakerGets: { currency: hexCcy, issuer: ISSUER, value: '10' },
        TakerPays: XRP_GETS,
      });
      expect(tx.TakerGets).toEqual({
        currency: hexCcy,
        issuer: ISSUER,
        value: '10',
      });
    });
  });

  describe('cross-field: TakerGets and TakerPays must not be the same currency', () => {
    it('throws when both TakerGets and TakerPays are XRP', () => {
      expect(() =>
        offerCreate({
          Account: ACCOUNT,
          TakerGets: '1000000',
          TakerPays: '2000000',
        }),
      ).toThrow(/same currency/);
    });

    it('throws when both sides are the same IOU (same currency + issuer)', () => {
      expect(() =>
        offerCreate({
          Account: ACCOUNT,
          TakerGets: { currency: 'USD', issuer: ISSUER, value: '10' },
          TakerPays: { currency: 'USD', issuer: ISSUER, value: '20' },
        }),
      ).toThrow(/same currency/);
    });

    it('accepts two IOUs from different issuers of the same currency code', () => {
      const tx = offerCreate({
        Account: ACCOUNT,
        TakerGets: { currency: 'USD', issuer: ISSUER, value: '10' },
        TakerPays: { currency: 'USD', issuer: 'rWYkbWkCeg8dP6rXALnjgZSjjLyih5NXm', value: '20' },
      });
      expect(tx.TakerGets).toEqual({
        currency: 'USD',
        issuer: ISSUER,
        value: '10',
      });
    });

    it('accepts XRP-for-IOU and IOU-for-XRP', () => {
      const a = offerCreate({
        Account: ACCOUNT,
        TakerGets: XRP_GETS,
        TakerPays: IOU_PAYS,
      });
      const b = offerCreate({
        Account: ACCOUNT,
        TakerGets: IOU_PAYS,
        TakerPays: XRP_GETS,
      });
      expect(a.TakerGets).toBe(XRP_GETS);
      expect(b.TakerPays).toBe(XRP_GETS);
    });

    it('accepts XRP-for-MPT', () => {
      const tx = offerCreate({
        Account: ACCOUNT,
        TakerGets: XRP_GETS,
        TakerPays: MPT_GETS,
      });
      expect(tx.TakerPays).toEqual(MPT_GETS);
    });
  });

  describe('Expiration validation', () => {
    it('accepts Expiration = 0', () => {
      const tx = make({ Expiration: 0 });
      expect(tx.Expiration).toBe(0);
    });

    it('accepts Expiration at UInt32 max', () => {
      const tx = make({ Expiration: 0xffffffff });
      expect(tx.Expiration).toBe(0xffffffff);
    });

    it('throws when Expiration is negative', () => {
      expect(() => make({ Expiration: -1 })).toThrow(/UInt32/);
    });

    it('throws when Expiration exceeds UInt32 max', () => {
      expect(() => make({ Expiration: 0x100000000 })).toThrow(/UInt32/);
    });

    it('throws when Expiration is a non-integer', () => {
      expect(() => make({ Expiration: 1.5 })).toThrow(/UInt32/);
    });

    it('throws when Expiration is a string', () => {
      expect(() => make({ Expiration: '770000000' as never })).toThrow(/UInt32/);
    });
  });

  describe('OfferSequence validation', () => {
    it('accepts OfferSequence = 0', () => {
      const tx = make({ OfferSequence: 0 });
      expect(tx.OfferSequence).toBe(0);
    });

    it('throws when OfferSequence is negative', () => {
      expect(() => make({ OfferSequence: -1 })).toThrow(/UInt32/);
    });

    it('throws when OfferSequence exceeds UInt32 max', () => {
      expect(() => make({ OfferSequence: 0x100000000 })).toThrow(/UInt32/);
    });

    it('throws when OfferSequence > Sequence (temBAD_SEQUENCE)', () => {
      expect(() => make({ OfferSequence: 9, Sequence: 8 })).toThrow(
        /OfferSequence must not be greater/,
      );
    });

    it('accepts OfferSequence == Sequence', () => {
      const tx = make({ OfferSequence: 8, Sequence: 8 });
      expect(tx.OfferSequence).toBe(8);
      expect(tx.Sequence).toBe(8);
    });

    it('skips the OfferSequence > Sequence check when Sequence is omitted', () => {
      const tx = make({ OfferSequence: 9 });
      expect(tx.OfferSequence).toBe(9);
    });
  });

  describe('DomainID validation', () => {
    it('accepts a 64-char hex DomainID', () => {
      const tx = make({ DomainID: DOMAIN_ID });
      expect(tx.DomainID).toBe(DOMAIN_ID);
    });

    it('throws when DomainID is shorter than 64 chars', () => {
      expect(() => make({ DomainID: 'a'.repeat(63) })).toThrow(/DomainID/);
    });

    it('throws when DomainID is longer than 64 chars', () => {
      expect(() => make({ DomainID: 'a'.repeat(65) })).toThrow(/DomainID/);
    });

    it('throws when DomainID is non-hex', () => {
      expect(() =>
        make({ DomainID: 'Z'.repeat(64) }),
      ).toThrow(/DomainID/);
    });

    it('throws when DomainID is not a string', () => {
      expect(() =>
        make({ DomainID: { wrong: 'shape' } as never }),
      ).toThrow(/DomainID/);
    });
  });

  describe('Flags validation', () => {
    it('accepts Flags = 0', () => {
      const tx = make({ Flags: 0 });
      expect(tx.Flags).toBe(0);
    });

    it('accepts tfPassive alone (numeric)', () => {
      const tx = make({ Flags: 0x00010000 });
      expect(tx.Flags).toBe(0x00010000);
    });

    it('accepts tfPassive alone (interface)', () => {
      const tx = make({ Flags: { tfPassive: true } });
      expect(tx.Flags).toEqual({ tfPassive: true });
    });

    it('accepts tfSell alone (interface)', () => {
      const tx = make({ Flags: { tfSell: true } });
      expect(tx.Flags).toEqual({ tfSell: true });
    });

    it('throws when Flags is a non-integer number', () => {
      expect(() => make({ Flags: 1.5 })).toThrow(/integer/);
    });

    it('throws when Flags is negative', () => {
      expect(() => make({ Flags: -1 })).toThrow(/non-negative/);
    });

    it('throws when Flags is a string', () => {
      expect(() => make({ Flags: '0' as never })).toThrow(/Flags must be/);
    });
  });

  describe('Flag cross-field invariants', () => {
    it('throws when tfHybrid is set (numeric) but DomainID is missing', () => {
      expect(() => make({ Flags: 0x00100000 })).toThrow(/tfHybrid requires DomainID/);
    });

    it('throws when tfHybrid is set (interface) but DomainID is missing', () => {
      expect(() =>
        make({ Flags: { tfHybrid: true } }),
      ).toThrow(/tfHybrid requires DomainID/);
    });

    it('accepts tfHybrid together with DomainID', () => {
      const tx = make({
        Flags: 0x00100000,
        DomainID: DOMAIN_ID,
      });
      expect(tx.Flags).toBe(0x00100000);
      expect(tx.DomainID).toBe(DOMAIN_ID);
    });

    it('accepts tfHybrid via interface together with DomainID', () => {
      const tx = make({
        Flags: { tfHybrid: true },
        DomainID: DOMAIN_ID,
      });
      expect(tx.Flags).toEqual({ tfHybrid: true });
      expect(tx.DomainID).toBe(DOMAIN_ID);
    });

    it('throws when both tfImmediateOrCancel and tfFillOrKill are set (numeric)', () => {
      expect(() =>
        make({ Flags: 0x00060000 }),
      ).toThrow(/tfImmediateOrCancel and tfFillOrKill/);
    });

    it('throws when both tfImmediateOrCancel and tfFillOrKill are set (interface)', () => {
      expect(() =>
        make({ Flags: { tfImmediateOrCancel: true, tfFillOrKill: true } }),
      ).toThrow(/tfImmediateOrCancel and tfFillOrKill/);
    });

    it('accepts tfImmediateOrCancel alone', () => {
      const tx = make({ Flags: { tfImmediateOrCancel: true } });
      expect(tx.Flags).toEqual({ tfImmediateOrCancel: true });
    });

    it('accepts tfFillOrKill alone', () => {
      const tx = make({ Flags: { tfFillOrKill: true } });
      expect(tx.Flags).toEqual({ tfFillOrKill: true });
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
        (tx as { TakerGets: string }).TakerGets = '9999999';
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides', () => {
      const tx = make();
      const tx2 = tx.with({ Expiration: 770000000 });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Expiration).toBe(770000000);
      expect(tx.Expiration).toBeUndefined();
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() =>
        tx.with({ TakerGets: '0' as unknown as string }),
      ).toThrow(/positive/);
    });

    it('.with() re-validates a same-currency override', () => {
      const tx = make();
      expect(() =>
        tx.with({ TakerPays: XRP_GETS }),
      ).toThrow(/same currency/);
    });

    it('.with() re-validates a tfHybrid-without-DomainID override', () => {
      const tx = make();
      expect(() => tx.with({ Flags: 0x00100000 })).toThrow(/tfHybrid/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({ Expiration: 770000000, Fee: '12', Sequence: 8 });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'OfferCreate',
        Account: ACCOUNT,
        TakerGets: XRP_GETS,
        TakerPays: IOU_PAYS,
        Expiration: 770000000,
        Fee: '12',
        Sequence: 8,
      });
    });

    it('.toJSON() skips undefined fields', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('Expiration' in json).toBe(false);
      expect('OfferSequence' in json).toBe(false);
      expect('DomainID' in json).toBe(false);
      expect('Flags' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op after successful construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });
});