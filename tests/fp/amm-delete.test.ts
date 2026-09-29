/**
 * Tests for the functional AMMDelete factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, Asset, Asset2).
 *   2. Asset / Asset2 form coverage (XRP, IOU, MPT).
 *   3. Asset / Asset2 strict validation (factory-only guards the class
 *      API skips):
 *        a. Asset / Asset2 must be a Currency, not just any object.
 *        b. Account must be a valid XRPL classic / X-address.
 *   4. Frozen-shape contract (mutation throws, .with() returns new
 *      frozen object, .toJSON() strips methods and undefined values).
 *   5. .with() re-validates on overrides.
 */
import { describe, it, expect } from 'vitest';
import type { Currency } from '../../src/types/amounts.js';
import { ammDelete } from '../../src/fp/factories/amm-delete.js';

// ─── Test fixtures ───────────────────────────────────────────────────

const ACCOUNT = 'rWYkbWkCeg8dP6rXALnjgZSjjLyih5NXm';
const ISSUER = 'rP9jPyP5kyvFRb6ZiRghAGw5u8SGAmU4bd';

const XRP_ASSET = { currency: 'XRP' };
const IOU_ASSET = { currency: 'TST', issuer: ISSUER };
const MPT_ASSET = {
  mpt_issuance_id: '00000000000000000000000001',
};

function make(extras: Record<string, unknown> = {}) {
  return ammDelete({
    Account: ACCOUNT,
    Asset: XRP_ASSET,
    Asset2: IOU_ASSET,
    ...extras,
  });
}

describe('fp/ammDelete()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('AMMDelete');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.Asset).toEqual(XRP_ASSET);
      expect(tx.Asset2).toEqual(IOU_ASSET);
      expect(tx.Fee).toBeUndefined();
      expect(tx.Sequence).toBeUndefined();
    });

    it('accepts Fee and Sequence', () => {
      const tx = make({ Fee: '10', Sequence: 9 });
      expect(tx.Fee).toBe('10');
      expect(tx.Sequence).toBe(9);
    });

    it('accepts an MPT / IOU asset pair', () => {
      const tx = ammDelete({
        Account: ACCOUNT,
        Asset: MPT_ASSET,
        Asset2: IOU_ASSET,
      });
      expect(tx.Asset).toEqual(MPT_ASSET);
      expect(tx.Asset2).toEqual(IOU_ASSET);
    });

    it('accepts an XRP / MPT asset pair', () => {
      const tx = ammDelete({
        Account: ACCOUNT,
        Asset: XRP_ASSET,
        Asset2: MPT_ASSET,
      });
      expect(tx.Asset).toEqual(XRP_ASSET);
      expect(tx.Asset2).toEqual(MPT_ASSET);
    });
  });

  describe('Account validation', () => {
    it('throws when Account is missing', () => {
      expect(() =>
        ammDelete({
          Account: undefined as unknown as string,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
        }),
      ).toThrow(/Account is required/);
    });

    it('throws when Account is not a valid XRPL address', () => {
      expect(() =>
        ammDelete({
          Account: 'not-an-address',
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('Asset / Asset2 validation', () => {
    it('throws when Asset is missing', () => {
      expect(() =>
        ammDelete({
          Account: ACCOUNT,
          Asset: undefined as unknown as Currency,
          Asset2: IOU_ASSET,
        }),
      ).toThrow(/Asset/);
    });

    it('throws when Asset is null', () => {
      expect(() =>
        ammDelete({
          Account: ACCOUNT,
          Asset: null as unknown as Currency,
          Asset2: IOU_ASSET,
        }),
      ).toThrow(/Asset/);
    });

    it('throws when Asset is an empty object', () => {
      // The class accepts {} because isRecord({}) is true. The
      // factory's isCurrency check rejects it.
      expect(() =>
        ammDelete({
          Account: ACCOUNT,
          Asset: {} as unknown as Currency,
          Asset2: IOU_ASSET,
        }),
      ).toThrow(/Asset/);
    });

    it('throws when Asset is a primitive (e.g. a number)', () => {
      expect(() =>
        ammDelete({
          Account: ACCOUNT,
          Asset: 1234 as unknown as Currency,
          Asset2: IOU_ASSET,
        }),
      ).toThrow(/Asset/);
    });

    it('throws when Asset is a string', () => {
      expect(() =>
        ammDelete({
          Account: ACCOUNT,
          Asset: 'XRP' as unknown as Currency,
          Asset2: IOU_ASSET,
        }),
      ).toThrow(/Asset/);
    });

    it('throws when Asset2 is missing', () => {
      expect(() =>
        ammDelete({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: undefined as unknown as Currency,
        }),
      ).toThrow(/Asset2/);
    });

    it('throws when Asset2 is an empty object', () => {
      expect(() =>
        ammDelete({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: {} as unknown as Currency,
        }),
      ).toThrow(/Asset2/);
    });

    it('throws when Asset2 is a primitive', () => {
      expect(() =>
        ammDelete({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: 1234 as unknown as Currency,
        }),
      ).toThrow(/Asset2/);
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
        (tx as unknown as Record<string, unknown>).Asset = { currency: 'USD' };
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides', () => {
      const tx = make();
      const tx2 = tx.with({ Fee: '10' });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Fee).toBe('10');
      expect(tx.Fee).toBeUndefined();
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
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({ Fee: '10', Sequence: 9 });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'AMMDelete',
        Account: ACCOUNT,
        Asset: XRP_ASSET,
        Asset2: IOU_ASSET,
        Fee: '10',
        Sequence: 9,
      });
    });

    it('.toJSON() skips undefined fields', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op after successful construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });
});
