/**
 * Tests for the functional SponsorshipSet factory.
 *
 * Validates:
 *   1. Construction with the canonical create / modify / delete shapes.
 *   2. Sponsee / CounterpartySponsor mutual exclusion and identity-vs-Account
 *      rules.
 *   3. Flag pair conflicts and `tfDeleteObject` constraints
 *      (no data deltas, no modify flags).
 *   4. Numeric guards for FeeAmountDelta, MaxFee, RemainingOwnerCountDelta
 *      (sign, integer canonicalization, zero, INT32 range).
 *   5. At-least-one-mutable-field rule when not deleting.
 *   6. Frozen-shape contract (mutation throws, .with() returns a new frozen
 *      tx, .toJSON() strips methods and undefined fields).
 *
 * The factory mirrors and extends `validateSponsorshipSet` from xrpl.js
 * (`~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/
 * sponsorshipSet.ts`).
 */
import { describe, it, expect } from 'vitest';
import { sponsorshipSet } from '../../src/fp/factories/sponsorship-set.js';
import { SponsorshipSetFlags } from '../../src/types/flags.js';

const SPONSOR = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const SPONSEE = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';

function makeCreate(extras: Record<string, unknown> = {}) {
  return sponsorshipSet({
    Account: SPONSOR,
    Sponsee: SPONSEE,
    RemainingOwnerCountDelta: 1,
    FeeAmountDelta: '1000000',
    ...extras,
  });
}

describe('fp/sponsorshipSet()', () => {
  describe('construction', () => {
    it('constructs a canonical create-shape tx', () => {
      const tx = makeCreate();
      expect(tx.TransactionType).toBe('SponsorshipSet');
      expect(tx.Account).toBe(SPONSOR);
      expect(tx.Sponsee).toBe(SPONSEE);
      expect(tx.RemainingOwnerCountDelta).toBe(1);
      expect(tx.FeeAmountDelta).toBe('1000000');
      expect(tx.CounterpartySponsor).toBeUndefined();
    });

    it('constructs a delete-shape tx (sponsee via CounterpartySponsor + tfDeleteObject)', () => {
      const tx = sponsorshipSet({
        Account: SPONSEE,
        CounterpartySponsor: SPONSOR,
        Flags: SponsorshipSetFlags.tfDeleteObject,
      });
      expect(tx.TransactionType).toBe('SponsorshipSet');
      expect(tx.Account).toBe(SPONSEE);
      expect(tx.CounterpartySponsor).toBe(SPONSOR);
      expect(tx.Flags).toBe(SponsorshipSetFlags.tfDeleteObject);
    });

    it('constructs a sponsor-deletes tx (Account is sponsor, Sponsee present, tfDeleteObject)', () => {
      const tx = sponsorshipSet({
        Account: SPONSOR,
        Sponsee: SPONSEE,
        Flags: SponsorshipSetFlags.tfDeleteObject,
      });
      expect(tx.Sponsee).toBe(SPONSEE);
      expect(tx.Flags).toBe(SponsorshipSetFlags.tfDeleteObject);
    });

    it('passes through optional Fee / Sequence', () => {
      const tx = sponsorshipSet({
        Account: SPONSOR,
        Sponsee: SPONSEE,
        FeeAmountDelta: '1000000',
        Fee: '12',
        Sequence: 8,
      });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(8);
    });

    it('accepts MaxFee alone as the single mutable field (not deleting)', () => {
      const tx = sponsorshipSet({
        Account: SPONSOR,
        Sponsee: SPONSEE,
        MaxFee: '1000',
      });
      expect(tx.MaxFee).toBe('1000');
    });

    it('accepts a positive FeeAmountDelta alone', () => {
      const tx = sponsorshipSet({
        Account: SPONSOR,
        Sponsee: SPONSEE,
        FeeAmountDelta: '1000000',
      });
      expect(tx.FeeAmountDelta).toBe('1000000');
    });

    it('accepts a negative FeeAmountDelta (drawdown)', () => {
      const tx = sponsorshipSet({
        Account: SPONSOR,
        Sponsee: SPONSEE,
        FeeAmountDelta: '-1000000',
      });
      expect(tx.FeeAmountDelta).toBe('-1000000');
    });

    it('accepts a negative RemainingOwnerCountDelta', () => {
      const tx = sponsorshipSet({
        Account: SPONSOR,
        Sponsee: SPONSEE,
        RemainingOwnerCountDelta: -1,
      });
      expect(tx.RemainingOwnerCountDelta).toBe(-1);
    });

    it('accepts a boolean-map Flags form', () => {
      const tx = sponsorshipSet({
        Account: SPONSEE,
        CounterpartySponsor: SPONSOR,
        Flags: { tfDeleteObject: true },
      });
      // toJSON preserves the boolean map as the user provided it.
      const j = tx.toJSON();
      expect(j.Flags).toEqual({ tfDeleteObject: true });
    });

    it('accepts MaxFee = "0" (special "no per-tx limit" form)', () => {
      const tx = sponsorshipSet({
        Account: SPONSOR,
        Sponsee: SPONSEE,
        MaxFee: '0',
      });
      expect(tx.MaxFee).toBe('0');
    });

    it('accepts X-addresses (Account, Sponsee, or CounterpartySponsor)', () => {
      const xAddress = 'XVLhHMPHU98es4dbozjVtdWzVrDjtV18pX8yuPT7y4xaEHi';
      const tx = sponsorshipSet({
        Account: xAddress,
        Sponsee: SPONSEE,
        FeeAmountDelta: '100',
      });
      expect(tx.Account).toBe(xAddress);
      expect(tx.Sponsee).toBe(SPONSEE);
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        sponsorshipSet({
          Account: '' as never,
          Sponsee: SPONSEE,
          FeeAmountDelta: '100',
        }),
      ).toThrow(/Account/);
    });

    it('throws on non-account Account', () => {
      expect(() =>
        sponsorshipSet({
          Account: 'not-an-address',
          Sponsee: SPONSEE,
          FeeAmountDelta: '100',
        }),
      ).toThrow(/account|Account/);
    });
  });

  describe('Sponsee / CounterpartySponsor rules', () => {
    it('throws when neither Sponsee nor CounterpartySponsor is supplied', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          FeeAmountDelta: '100',
        }),
      ).toThrow(/either Sponsee or CounterpartySponsor/);
    });

    it('throws when both Sponsee and CounterpartySponsor are supplied', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: SPONSEE,
          CounterpartySponsor: 'rJb5KsHsDHF1WV5b189GqEkD2S1YByXXJW',
          FeeAmountDelta: '100',
        }),
      ).toThrow(/cannot specify both/);
    });

    it('throws when Sponsee is not a string', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: 123 as never,
          FeeAmountDelta: '100',
        }),
      ).toThrow(/Sponsee must be a string/);
    });

    it('throws when Sponsee is not a valid account address', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: 'invalid_address',
          FeeAmountDelta: '100',
        }),
      ).toThrow(/valid account address/);
    });

    it('throws when Account === Sponsee', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: SPONSOR,
          FeeAmountDelta: '100',
        }),
      ).toThrow(/cannot be the same/);
    });

    it('throws when CounterpartySponsor is not a string', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSEE,
          CounterpartySponsor: 123 as never,
          Flags: SponsorshipSetFlags.tfDeleteObject,
        }),
      ).toThrow(/CounterpartySponsor must be a string/);
    });

    it('throws when CounterpartySponsor is not a valid account address', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSEE,
          CounterpartySponsor: 'invalid_address',
          Flags: SponsorshipSetFlags.tfDeleteObject,
        }),
      ).toThrow(/valid account address/);
    });

    it('throws when Account === CounterpartySponsor', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          CounterpartySponsor: SPONSOR,
          Flags: SponsorshipSetFlags.tfDeleteObject,
        }),
      ).toThrow(/cannot be the same/);
    });

    it('throws when CounterpartySponsor is used without tfDeleteObject', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSEE,
          CounterpartySponsor: SPONSOR,
          FeeAmountDelta: '100',
        }),
      ).toThrow(/only be used with tfDeleteObject/);
    });

    it('throws when CounterpartySponsor is used with a modify flag but not tfDeleteObject', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSEE,
          CounterpartySponsor: SPONSOR,
          Flags: SponsorshipSetFlags.tfSponsorshipSetRequireSignForFee,
        }),
      ).toThrow(/only be used with tfDeleteObject/);
    });
  });

  describe('flag conflicts', () => {
    it('throws when both tfSponsorshipSetRequireSignForFee and tfSponsorshipClearRequireSignForFee are set', () => {
      const flags =
        SponsorshipSetFlags.tfSponsorshipSetRequireSignForFee |
        SponsorshipSetFlags.tfSponsorshipClearRequireSignForFee;
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: SPONSEE,
          Flags: flags,
        }),
      ).toThrow(/RequireSignForFee/);
    });

    it('throws when both tfSponsorshipSetRequireSignForReserve and tfSponsorshipClearRequireSignForReserve are set', () => {
      const flags =
        SponsorshipSetFlags.tfSponsorshipSetRequireSignForReserve |
        SponsorshipSetFlags.tfSponsorshipClearRequireSignForReserve;
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: SPONSEE,
          Flags: flags,
        }),
      ).toThrow(/RequireSignForReserve/);
    });

    it('throws when the same conflict is expressed via boolean-map Flags', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: SPONSEE,
          Flags: {
            tfSponsorshipSetRequireSignForFee: true,
            tfSponsorshipClearRequireSignForFee: true,
          },
        }),
      ).toThrow(/RequireSignForFee/);
    });

    it('accepts a single RequireSignFor flag without any data delta', () => {
      const tx = sponsorshipSet({
        Account: SPONSOR,
        Sponsee: SPONSEE,
        Flags: SponsorshipSetFlags.tfSponsorshipSetRequireSignForFee,
      });
      expect(tx.Flags).toBe(SponsorshipSetFlags.tfSponsorshipSetRequireSignForFee);
    });
  });

  describe('tfDeleteObject constraints', () => {
    it('throws when tfDeleteObject is combined with a RequireSignFor flag', () => {
      const flags =
        SponsorshipSetFlags.tfDeleteObject |
        SponsorshipSetFlags.tfSponsorshipSetRequireSignForFee;
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: SPONSEE,
          Flags: flags,
        }),
      ).toThrow(/together with tfDeleteObject/);
    });

    it('throws when tfDeleteObject is combined with FeeAmountDelta', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: SPONSEE,
          FeeAmountDelta: '100',
          Flags: SponsorshipSetFlags.tfDeleteObject,
        }),
      ).toThrow(/together with tfDeleteObject/);
    });

    it('throws when tfDeleteObject is combined with MaxFee', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: SPONSEE,
          MaxFee: '1000',
          Flags: SponsorshipSetFlags.tfDeleteObject,
        }),
      ).toThrow(/together with tfDeleteObject/);
    });

    it('throws when tfDeleteObject is combined with RemainingOwnerCountDelta', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: SPONSEE,
          RemainingOwnerCountDelta: 1,
          Flags: SponsorshipSetFlags.tfDeleteObject,
        }),
      ).toThrow(/together with tfDeleteObject/);
    });

    it('accepts tfDeleteObject alone (sponsee deleting via CounterpartySponsor)', () => {
      const tx = sponsorshipSet({
        Account: SPONSEE,
        CounterpartySponsor: SPONSOR,
        Flags: SponsorshipSetFlags.tfDeleteObject,
      });
      expect(tx.Flags).toBe(SponsorshipSetFlags.tfDeleteObject);
    });
  });

  describe('FeeAmountDelta validation', () => {
    it('throws on non-string FeeAmountDelta', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: SPONSEE,
          FeeAmountDelta: 1000000 as never,
        }),
      ).toThrow(/FeeAmountDelta must be a string/);
    });

    it('throws on non-numeric FeeAmountDelta', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: SPONSEE,
          FeeAmountDelta: 'not_a_number',
        }),
      ).toThrow(/must be a numeric string/);
    });

    it('throws on FeeAmountDelta = "0"', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: SPONSEE,
          FeeAmountDelta: '0',
        }),
      ).toThrow(/must not be zero/);
    });

    it('throws on FeeAmountDelta = "-0" (negative zero)', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: SPONSEE,
          FeeAmountDelta: '-0',
        }),
      ).toThrow(/must not be zero/);
    });

    it('throws on FeeAmountDelta with leading zero', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: SPONSEE,
          FeeAmountDelta: '007',
        }),
      ).toThrow(/must be a numeric string/);
    });

    it('throws on negative FeeAmountDelta with leading zero', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: SPONSEE,
          FeeAmountDelta: '-007',
        }),
      ).toThrow(/must be a numeric string/);
    });

    it('throws on decimal FeeAmountDelta', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: SPONSEE,
          FeeAmountDelta: '1.5',
        }),
      ).toThrow(/must be a numeric string/);
    });

    it('throws on scientific-notation FeeAmountDelta', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: SPONSEE,
          FeeAmountDelta: '1e3',
        }),
      ).toThrow(/must be a numeric string/);
    });

    it('throws on whitespace-padded FeeAmountDelta', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: SPONSEE,
          FeeAmountDelta: ' 100',
        }),
      ).toThrow(/must be a numeric string/);
    });
  });

  describe('MaxFee validation', () => {
    it('throws on non-string MaxFee', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: SPONSEE,
          MaxFee: 1000 as never,
        }),
      ).toThrow(/MaxFee must be a string/);
    });

    it('throws on negative MaxFee', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: SPONSEE,
          MaxFee: '-100',
        }),
      ).toThrow(/non-negative numeric string/);
    });

    it('throws on non-numeric MaxFee', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: SPONSEE,
          MaxFee: 'not_a_number',
        }),
      ).toThrow(/non-negative numeric string/);
    });

    it('throws on MaxFee with leading zero', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: SPONSEE,
          MaxFee: '007',
        }),
      ).toThrow(/non-negative numeric string/);
    });

    it('accepts MaxFee = "0"', () => {
      const tx = sponsorshipSet({
        Account: SPONSOR,
        Sponsee: SPONSEE,
        MaxFee: '0',
      });
      expect(tx.MaxFee).toBe('0');
    });

    it('accepts a large MaxFee', () => {
      const tx = sponsorshipSet({
        Account: SPONSOR,
        Sponsee: SPONSEE,
        MaxFee: '100000000000',
      });
      expect(tx.MaxFee).toBe('100000000000');
    });
  });

  describe('RemainingOwnerCountDelta validation', () => {
    it('throws when RemainingOwnerCountDelta is a string', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: SPONSEE,
          RemainingOwnerCountDelta: '1' as never,
        }),
      ).toThrow(/must be a number/);
    });

    it('throws on RemainingOwnerCountDelta = 0', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: SPONSEE,
          RemainingOwnerCountDelta: 0,
        }),
      ).toThrow(/must not be zero/);
    });

    it('throws on fractional RemainingOwnerCountDelta', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: SPONSEE,
          RemainingOwnerCountDelta: 1.5,
        }),
      ).toThrow(/must be an integer/);
    });

    it('throws on RemainingOwnerCountDelta > INT32_MAX', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: SPONSEE,
          RemainingOwnerCountDelta: 2_147_483_648,
        }),
      ).toThrow(/between/);
    });

    it('throws on RemainingOwnerCountDelta < INT32_MIN', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: SPONSEE,
          RemainingOwnerCountDelta: -2_147_483_649,
        }),
      ).toThrow(/between/);
    });

    it('accepts RemainingOwnerCountDelta at INT32_MIN', () => {
      const tx = sponsorshipSet({
        Account: SPONSOR,
        Sponsee: SPONSEE,
        RemainingOwnerCountDelta: -2_147_483_648,
      });
      expect(tx.RemainingOwnerCountDelta).toBe(-2_147_483_648);
    });

    it('accepts RemainingOwnerCountDelta at INT32_MAX', () => {
      const tx = sponsorshipSet({
        Account: SPONSOR,
        Sponsee: SPONSEE,
        RemainingOwnerCountDelta: 2_147_483_647,
      });
      expect(tx.RemainingOwnerCountDelta).toBe(2_147_483_647);
    });
  });

  describe('at-least-one-mutable-field rule', () => {
    it('throws when not deleting and no mutable field or flag is supplied', () => {
      expect(() =>
        sponsorshipSet({
          Account: SPONSOR,
          Sponsee: SPONSEE,
        }),
      ).toThrow(/at least one of/);
    });

    it('accepts a tx that supplies only FeeAmountDelta', () => {
      const tx = sponsorshipSet({
        Account: SPONSOR,
        Sponsee: SPONSEE,
        FeeAmountDelta: '1000000',
      });
      expect(tx.FeeAmountDelta).toBe('1000000');
    });

    it('accepts a tx that supplies only RemainingOwnerCountDelta', () => {
      const tx = sponsorshipSet({
        Account: SPONSOR,
        Sponsee: SPONSEE,
        RemainingOwnerCountDelta: 5,
      });
      expect(tx.RemainingOwnerCountDelta).toBe(5);
    });

    it('does not require a mutable field when tfDeleteObject is set', () => {
      const tx = sponsorshipSet({
        Account: SPONSOR,
        Sponsee: SPONSEE,
        Flags: SponsorshipSetFlags.tfDeleteObject,
      });
      expect(tx.Flags).toBe(SponsorshipSetFlags.tfDeleteObject);
    });
  });

  describe('frozen-shape contract', () => {
    it('returns a frozen object', () => {
      const tx = makeCreate();
      expect(Object.isFrozen(tx)).toBe(true);
    });

    it('mutation throws in strict mode', () => {
      const tx = makeCreate();
      expect(() => {
        (tx as unknown as Record<string, unknown>).Sponsee = 'deadbeef';
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      const tx = makeCreate();
      const tx2 = tx.with({ MaxFee: '1000' });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.MaxFee).toBe('1000');
      expect(tx.MaxFee).toBeUndefined();
    });

    it('.with() re-validates on overrides', () => {
      const tx = makeCreate();
      // Sponsee → invalid account on override should fail re-valid.
      expect(() => tx.with({ Sponsee: 'invalid_address' })).toThrow(
        /valid account address/,
      );
      // Stripping FeeAmountDelta+RemainingOwnerCountDelta → triggers
      // at-least-one rule on re-valid.
      expect(() =>
        tx.with({ FeeAmountDelta: undefined, RemainingOwnerCountDelta: undefined }),
      ).toThrow(/at least one of/);
      // Trying to set Account === Sponsee on override.
      expect(() => tx.with({ Sponsee: SPONSOR })).toThrow(/cannot be the same/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = sponsorshipSet({
        Account: SPONSOR,
        Sponsee: SPONSEE,
        FeeAmountDelta: '1000000',
        MaxFee: '1000',
        Fee: '12',
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'SponsorshipSet',
        Account: SPONSOR,
        Sponsee: SPONSEE,
        FeeAmountDelta: '1000000',
        MaxFee: '1000',
        Fee: '12',
      });
    });

    it('.toJSON() skips undefined fields and methods', () => {
      const tx = makeCreate();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('CounterpartySponsor' in json).toBe(false);
      expect('MaxFee' in json).toBe(false);
      expect('Flags' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op after construction', () => {
      const tx = makeCreate();
      expect(() => tx.validate()).not.toThrow();
    });
  });
});