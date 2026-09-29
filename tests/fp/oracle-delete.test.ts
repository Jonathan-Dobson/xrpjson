/**
 * Tests for the functional OracleDelete factory.
 *
 * Validates:
 *   1. Construction with required Account + OracleDocumentID.
 *   2. Account validation (classic/X-address format).
 *   3. OracleDocumentID UInt32 validation (integer in [0, 0xFFFFFFFF]).
 *   4. Frozen-shape contract (mutation throws, .with() returns a new
 *      frozen object, .toJSON() strips methods and undefined values).
 *   5. Factory-only rules not enforced by the class API:
 *      - integer/range check on OracleDocumentID (class allows NaN,
 *        floats, negatives, and > 2^32 − 1).
 */
import { describe, it, expect } from 'vitest';
import { oracleDelete } from '../../src/fp/factories/oracle-delete.js';

const OWNER = 'rsA2LpzuawewSBQXkiju3YQTMzW13pAAdW';
const MAX_UINT32 = 0xffffffff;

function make(extras: Record<string, unknown> = {}) {
  return oracleDelete({
    Account: OWNER,
    OracleDocumentID: 34,
    ...extras,
  });
}

describe('fp/oracleDelete()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('OracleDelete');
      expect(tx.Account).toBe(OWNER);
      expect(tx.OracleDocumentID).toBe(34);
      expect(tx.Fee).toBeUndefined();
      expect(tx.Sequence).toBeUndefined();
    });

    it('accepts Fee and Sequence', () => {
      const tx = make({ Fee: '12', Sequence: 7 });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(7);
    });

    it('accepts OracleDocumentID = 0 (UInt32 minimum)', () => {
      const tx = oracleDelete({ Account: OWNER, OracleDocumentID: 0 });
      expect(tx.OracleDocumentID).toBe(0);
    });

    it('accepts OracleDocumentID at the UInt32 maximum', () => {
      const tx = oracleDelete({
        Account: OWNER,
        OracleDocumentID: MAX_UINT32,
      });
      expect(tx.OracleDocumentID).toBe(MAX_UINT32);
    });

    it('uses the XLS-0047 example values', () => {
      const tx = oracleDelete({
        Account: 'rsA2LpzuawewSBQXkiju3YQTMzW13pAAdW',
        OracleDocumentID: 34,
      });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'OracleDelete',
        Account: 'rsA2LpzuawewSBQXkiju3YQTMzW13pAAdW',
        OracleDocumentID: 34,
      });
    });
  });

  describe('Account validation', () => {
    it('throws when Account is missing', () => {
      expect(() =>
        oracleDelete({
          Account: undefined as unknown as string,
          OracleDocumentID: 34,
        }),
      ).toThrow(/Account is required/);
    });

    it('throws when Account is an empty string', () => {
      expect(() =>
        oracleDelete({
          Account: '' as never,
          OracleDocumentID: 34,
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      expect(() =>
        oracleDelete({
          Account: 'not-an-account',
          OracleDocumentID: 34,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('OracleDocumentID validation (UInt32)', () => {
    it('throws when OracleDocumentID is missing', () => {
      expect(() =>
        oracleDelete({
          Account: OWNER,
          OracleDocumentID: undefined as unknown as number,
        }),
      ).toThrow(/OracleDocumentID/);
    });

    it('throws when OracleDocumentID is a string', () => {
      expect(() =>
        oracleDelete({
          Account: OWNER,
          OracleDocumentID: '34' as unknown as number,
        }),
      ).toThrow(/OracleDocumentID/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws on negative OracleDocumentID (XLS-0047, UInt32)', () => {
      expect(() =>
        oracleDelete({ Account: OWNER, OracleDocumentID: -1 }),
      ).toThrow(/UInt32/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws on OracleDocumentID > 2^32 − 1 (XLS-0047, UInt32)', () => {
      expect(() =>
        oracleDelete({ Account: OWNER, OracleDocumentID: MAX_UINT32 + 1 }),
      ).toThrow(/UInt32/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws on fractional OracleDocumentID (XLS-0047, UInt32)', () => {
      expect(() =>
        oracleDelete({ Account: OWNER, OracleDocumentID: 3.14 }),
      ).toThrow(/integer/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws on NaN OracleDocumentID (XLS-0047, UInt32)', () => {
      expect(() =>
        oracleDelete({ Account: OWNER, OracleDocumentID: NaN }),
      ).toThrow(/OracleDocumentID/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws on Infinity OracleDocumentID (XLS-0047, UInt32)', () => {
      expect(() =>
        oracleDelete({ Account: OWNER, OracleDocumentID: Infinity }),
      ).toThrow(/OracleDocumentID/);
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
        (tx as unknown as Record<string, unknown>).OracleDocumentID = 999;
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides', () => {
      const tx = make();
      const tx2 = tx.with({ Fee: '20', Sequence: 11 });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Fee).toBe('20');
      expect(tx2.Sequence).toBe(11);
      expect(tx.Fee).toBeUndefined();
      expect(tx.Sequence).toBeUndefined();
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() => tx.with({ OracleDocumentID: -5 })).toThrow(/UInt32/);
      expect(() => tx.with({ OracleDocumentID: MAX_UINT32 + 1 })).toThrow(
        /UInt32/,
      );
      expect(() => tx.with({ OracleDocumentID: 3.14 })).toThrow(/integer/);
      expect(() => tx.with({ Account: 'bogus' })).toThrow(/Account/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({ Fee: '12' });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'OracleDelete',
        Account: OWNER,
        OracleDocumentID: 34,
        Fee: '12',
      });
    });

    it('.toJSON() skips undefined fields', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op (validation already ran at construction)', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });

    it('serializes the canonical xrpl.org example', () => {
      const tx = oracleDelete({
        Account: 'rsA2LpzuawewSBQXkiju3YQTMzW13pAAdW',
        OracleDocumentID: 34,
      });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'OracleDelete',
        Account: 'rsA2LpzuawewSBQXkiju3YQTMzW13pAAdW',
        OracleDocumentID: 34,
      });
    });
  });
});