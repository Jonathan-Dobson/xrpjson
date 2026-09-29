/**
 * Tests for the functional AMMClawback factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, Holder, Asset, Asset2)
 *      and optional Amount (IOU form only).
 *   2. Spec-mandated guards the class API omits:
 *        a. Asset / Asset2 must be a valid Currency (Asset rejects XRP).
 *           xrpl.js `validateAMMClawback` lines 84, 100.
 *        b. Holder ≠ Asset.issuer.   xrpl.js lines 86–92.
 *        c. Account === Asset.issuer.   xrpl.js lines 94–98.
 *        d. Amount must be IssuedCurrencyAmount (NOT XRP, NOT MPT).
 *           xrpl.js line 102.
 *        e. Amount.currency === Asset.currency.   xrpl.js lines 104–108.
 *        f. Amount.issuer === Asset.issuer.   xrpl.js lines 110–114.
 *        g. Amount.value is a positive base-10 integer string.
 *           Docs: temBAD_AMOUNT row.
 *        h. Flags is restricted to 0 or tfClawTwoAssets.
 *           Docs: temINVALID_FLAG row.
 *   3. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined fields).
 *   4. .with() re-validates on overrides.
 */
import { describe, it, expect } from 'vitest';
import { ammClawback } from '../../src/fp/factories/amm-clawback.js';
import { ClawbackFlags } from '../../src/types/flags.js';

// ─── Test fixtures ───────────────────────────────────────────────────

const ACCOUNT = 'rWYkbWkCeg8dP6rXALnjgZSjjLyih5NXm'; // also the asset issuer.
const HOLDER = 'rPyfep3gcLzkosKC9XiE77Y8DZWG6iWDT9';
const OTHER_ISSUER = 'rHtptZx1yHf6Yv43s1RWffM3Xx4jL';

function make(extras: Record<string, unknown> = {}) {
  return ammClawback({
    Account: ACCOUNT,
    Holder: HOLDER,
    Asset: { currency: 'USD', issuer: ACCOUNT },
    Asset2: { currency: 'XRP' },
    ...extras,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('fp/ammClawback()', () => {
  describe('construction', () => {
    it('constructs with required fields only (Amount omitted)', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('AMMClawback');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.Holder).toBe(HOLDER);
      expect(tx.Asset).toEqual({ currency: 'USD', issuer: ACCOUNT });
      expect(tx.Asset2).toEqual({ currency: 'XRP' });
      expect(tx.Amount).toBeUndefined();
    });

    it('constructs with an IOU Asset2 (XRP/IOU pool)', () => {
      const tx = ammClawback({
        Account: ACCOUNT,
        Holder: HOLDER,
        Asset: { currency: 'USD', issuer: ACCOUNT },
        Asset2: { currency: 'EUR', issuer: OTHER_ISSUER },
      });
      expect(tx.Asset2).toEqual({ currency: 'EUR', issuer: OTHER_ISSUER });
    });

    it('constructs with an MPT Asset2', () => {
      const tx = ammClawback({
        Account: ACCOUNT,
        Holder: HOLDER,
        Asset: { currency: 'USD', issuer: ACCOUNT },
        Asset2: { mpt_issuance_id: '00000000000000000000000001' },
      });
      expect(tx.Asset2).toEqual({
        mpt_issuance_id: '00000000000000000000000001',
      });
    });

    it('constructs with Amount + all base tx fields + tfClawTwoAssets', () => {
      const tx = ammClawback({
        Account: ACCOUNT,
        Holder: HOLDER,
        Asset: { currency: 'USD', issuer: ACCOUNT },
        Asset2: { currency: 'XRP' },
        Amount: { currency: 'USD', issuer: ACCOUNT, value: '1000' },
        Flags: ClawbackFlags.tfClawTwoAssets,
        Fee: '12',
        Sequence: 8,
      });
      expect(tx.Flags).toBe(ClawbackFlags.tfClawTwoAssets);
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(8);
      expect(tx.Amount).toEqual({
        currency: 'USD',
        issuer: ACCOUNT,
        value: '1000',
      });
    });
  });

  describe('Account validation', () => {
    it('throws when Account is missing', () => {
      expect(() =>
        ammClawback({
          Account: undefined as never,
          Holder: HOLDER,
          Asset: { currency: 'USD', issuer: ACCOUNT },
          Asset2: { currency: 'XRP' },
        }),
      ).toThrow(/Account/);
    });

    it('throws when Account is invalid', () => {
      expect(() =>
        ammClawback({
          Account: 'not-an-address',
          Holder: HOLDER,
          Asset: { currency: 'USD', issuer: ACCOUNT },
          Asset2: { currency: 'XRP' },
        }),
      ).toThrow(/Account/);
    });
  });

  describe('Holder validation', () => {
    it('throws when Holder is missing', () => {
      expect(() =>
        ammClawback({
          Account: ACCOUNT,
          Holder: undefined as never,
          Asset: { currency: 'USD', issuer: ACCOUNT },
          Asset2: { currency: 'XRP' },
        }),
      ).toThrow(/Holder/);
    });

    it('throws when Holder is invalid', () => {
      expect(() =>
        ammClawback({
          Account: ACCOUNT,
          Holder: 'bogus',
          Asset: { currency: 'USD', issuer: ACCOUNT },
          Asset2: { currency: 'XRP' },
        }),
      ).toThrow(/Holder/);
    });

    it('throws when Holder equals Asset.issuer (xrpl.js line 88)', () => {
      expect(() =>
        ammClawback({
          Account: ACCOUNT,
          Holder: ACCOUNT, // == Asset.issuer
          Asset: { currency: 'USD', issuer: ACCOUNT },
          Asset2: { currency: 'XRP' },
        }),
      ).toThrow(/distinct/);
    });
  });

  describe('Asset validation', () => {
    it('throws when Asset is missing', () => {
      expect(() =>
        ammClawback({
          Account: ACCOUNT,
          Holder: HOLDER,
          Asset: undefined as never,
          Asset2: { currency: 'XRP' },
        }),
      ).toThrow(/Asset/);
    });

    it('throws when Asset is the XRP form (docs: temMALFORMED)', () => {
      expect(() =>
        ammClawback({
          Account: ACCOUNT,
          Holder: HOLDER,
          // Asset must NOT be XRP — only IOU is clawable.
          Asset: { currency: 'XRP' } as never,
          Asset2: { currency: 'USD', issuer: OTHER_ISSUER },
        }),
      ).toThrow(/Asset/);
    });

    it('throws when Asset is the MPT form (docs: Asset is IOU only)', () => {
      expect(() =>
        ammClawback({
          Account: ACCOUNT,
          Holder: HOLDER,
          // MPT Asset is rejected per docs / XLS-0073.
          Asset: { mpt_issuance_id: '00000000000000000000000001' } as never,
          Asset2: { currency: 'USD', issuer: OTHER_ISSUER },
        }),
      ).toThrow(/Asset/);
    });

    it('throws when Asset.issuer does not match Account (xrpl.js line 94)', () => {
      expect(() =>
        ammClawback({
          Account: ACCOUNT,
          Holder: HOLDER,
          // Account ≠ Asset.issuer
          Asset: { currency: 'USD', issuer: OTHER_ISSUER },
          Asset2: { currency: 'XRP' },
        }),
      ).toThrow(/Account must be the same as Asset.issuer/);
    });

    it('throws when Asset.issuer is not a valid XRPL account', () => {
      expect(() =>
        ammClawback({
          Account: ACCOUNT,
          Holder: HOLDER,
          Asset: { currency: 'USD', issuer: 'bogus' },
          Asset2: { currency: 'XRP' },
        }),
      ).toThrow(/Asset.issuer/);
    });

    it('throws on bad Asset.currency length', () => {
      expect(() =>
        ammClawback({
          Account: ACCOUNT,
          Holder: HOLDER,
          Asset: { currency: 'USDD', issuer: ACCOUNT },
          Asset2: { currency: 'XRP' },
        }),
      ).toThrow(/Asset.currency/);
    });

    it('throws on 40-char Asset.currency that is not hex', () => {
      expect(() =>
        ammClawback({
          Account: ACCOUNT,
          Holder: HOLDER,
          Asset: { currency: 'Z'.repeat(40), issuer: ACCOUNT },
          Asset2: { currency: 'XRP' },
        }),
      ).toThrow(/hex/);
    });
  });

  describe('Asset2 validation', () => {
    it('throws when Asset2 is missing', () => {
      expect(() =>
        ammClawback({
          Account: ACCOUNT,
          Holder: HOLDER,
          Asset: { currency: 'USD', issuer: ACCOUNT },
          Asset2: undefined as never,
        }),
      ).toThrow(/Asset2/);
    });

    it('throws when Asset2 is not a valid Currency object', () => {
      expect(() =>
        ammClawback({
          Account: ACCOUNT,
          Holder: HOLDER,
          Asset: { currency: 'USD', issuer: ACCOUNT },
          Asset2: 'not-a-currency' as never,
        }),
      ).toThrow(/Asset2/);
    });
  });

  describe('Amount validation', () => {
    it('accepts omitted Amount', () => {
      const tx = make();
      expect(tx.Amount).toBeUndefined();
    });

    it('accepts a valid IssuedCurrencyAmount', () => {
      const tx = make({
        Amount: { currency: 'USD', issuer: ACCOUNT, value: '1000' },
      });
      expect(tx.Amount).toEqual({
        currency: 'USD',
        issuer: ACCOUNT,
        value: '1000',
      });
    });

    it('throws when Amount is an XRP drops string (xrpl.js line 102: IOU only)', () => {
      expect(() => make({ Amount: '1000000' as never })).toThrow(
        /IssuedCurrencyAmount/,
      );
    });

    it('throws when Amount is an MPTAmount (xrpl.js line 102: IOU only)', () => {
      expect(() =>
        make({
          Amount: {
            mpt_issuance_id: '00000000000000000000000001',
            value: '100',
          } as never,
        }),
      ).toThrow(/IssuedCurrencyAmount/);
    });

    it('throws when Amount.currency does not match Asset.currency (xrpl.js line 105)', () => {
      expect(() =>
        make({
          Amount: { currency: 'EUR', issuer: ACCOUNT, value: '100' },
        }),
      ).toThrow(/Amount.currency must match Asset.currency/);
    });

    it('throws when Amount.issuer does not match Asset.issuer (xrpl.js line 111)', () => {
      expect(() =>
        make({
          Amount: { currency: 'USD', issuer: OTHER_ISSUER, value: '100' },
        }),
      ).toThrow(/Amount.issuer must match Asset.issuer/);
    });

    it('throws on Amount.value of zero (docs: temBAD_AMOUNT)', () => {
      expect(() =>
        make({
          Amount: { currency: 'USD', issuer: ACCOUNT, value: '0' },
        }),
      ).toThrow(/positive amount/);
    });

    it('throws on negative Amount.value', () => {
      expect(() =>
        make({
          Amount: { currency: 'USD', issuer: ACCOUNT, value: '-1' },
        }),
      ).toThrow(/Amount.value/);
    });

    it('throws on non-numeric Amount.value', () => {
      expect(() =>
        make({
          Amount: { currency: 'USD', issuer: ACCOUNT, value: 'abc' },
        }),
      ).toThrow(/Amount.value/);
    });
  });

  describe('Flags validation', () => {
    it('accepts omitted Flags', () => {
      const tx = make();
      expect(tx.Flags).toBeUndefined();
    });

    it('accepts tfClawTwoAssets (0x00000001)', () => {
      const tx = make({ Flags: ClawbackFlags.tfClawTwoAssets });
      expect(tx.Flags).toBe(ClawbackFlags.tfClawTwoAssets);
    });

    it('accepts tfClawTwoAssets as a boolean map (ClawbackFlagsInterface)', () => {
      const tx = make({ Flags: { tfClawTwoAssets: true } });
      expect(tx.Flags).toEqual({ tfClawTwoAssets: true });
    });

    it('throws on an unknown flag bit (docs: temINVALID_FLAG)', () => {
      expect(() =>
        make({ Flags: 0x00000002 as ClawbackFlags }),
      ).toThrow(/unknown bit/);
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
        (tx as { Holder?: string }).Holder = 'changed';
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides', () => {
      const tx = make();
      const tx2 = tx.with({
        Holder: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Holder).toBe('rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe');
      expect(tx.Holder).toBe(HOLDER);
    });

    it('.with() re-validates on overrides (Amount must match Asset)', () => {
      const tx = make();
      expect(() =>
        tx.with({
          Amount: { currency: 'EUR', issuer: ACCOUNT, value: '100' },
        }),
      ).toThrow(/Amount.currency must match Asset.currency/);
    });

    it('.with() re-validates on overrides (Holder ≠ Asset.issuer)', () => {
      const tx = make();
      // Switch Holder to Asset.issuer → must throw.
      expect(() => tx.with({ Holder: ACCOUNT })).toThrow(/distinct/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({
        Amount: { currency: 'USD', issuer: ACCOUNT, value: '1000' },
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'AMMClawback',
        Account: ACCOUNT,
        Holder: HOLDER,
        Asset: { currency: 'USD', issuer: ACCOUNT },
        Asset2: { currency: 'XRP' },
        Amount: { currency: 'USD', issuer: ACCOUNT, value: '1000' },
      });
    });

    it('.toJSON() skips undefined fields', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('Amount' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Flags' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op after successful construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });
});