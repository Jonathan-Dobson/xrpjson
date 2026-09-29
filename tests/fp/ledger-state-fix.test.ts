/**
 * Tests for the functional LedgerStateFix factory.
 *
 * Validates:
 *   1. Construction with the only currently-defined `LedgerFixType` (1).
 *   2. Required `Owner` when `LedgerFixType === 1`; optional otherwise.
 *   3. `LedgerFixType` is a UInt16 (rejects out-of-range / non-integer).
 *   4. Special Transaction Cost: `Fee` must be ≥ 2,000,000 drops.
 *   5. `Account` and `Owner` must be valid XRPL addresses.
 *   6. Frozen-shape contract (mutation throws, .with() returns a new
 *      frozen object, .toJSON() strips methods and undefined values).
 */
import { describe, it, expect } from 'vitest';
import { ledgerStateFix } from '../../src/fp/factories/ledger-state-fix.js';

const SENDER = 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn';
const NFTOKEN_OWNER = 'ra5nK24KXen9AHvsdFTKHSANinZseWnPcX';
const OTHER_ACCOUNT = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

const MIN_FEE = '2000000';

function make(extras: Record<string, unknown> = {}) {
  return ledgerStateFix({
    Account: SENDER,
    LedgerFixType: 1,
    Owner: NFTOKEN_OWNER,
    Fee: MIN_FEE,
    Sequence: 2,
    ...extras,
  });
}

describe('fp/ledgerStateFix()', () => {
  describe('construction', () => {
    it('constructs with the only documented LedgerFixType (1)', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('LedgerStateFix');
      expect(tx.Account).toBe(SENDER);
      expect(tx.LedgerFixType).toBe(1);
      expect(tx.Owner).toBe(NFTOKEN_OWNER);
      expect(tx.Fee).toBe(MIN_FEE);
      expect(tx.Sequence).toBe(2);
      expect(Object.isFrozen(tx)).toBe(true);
    });

    it('constructs without Fee / Sequence (signing layer fills them)', () => {
      const tx = ledgerStateFix({
        Account: SENDER,
        LedgerFixType: 1,
        Owner: NFTOKEN_OWNER,
      });
      expect(tx.Fee).toBeUndefined();
      expect(tx.Sequence).toBeUndefined();
    });

    it('accepts Owner that differs from Account (spec allows it)', () => {
      const tx = ledgerStateFix({
        Account: SENDER,
        LedgerFixType: 1,
        Owner: OTHER_ACCOUNT,
      });
      expect(tx.Owner).toBe(OTHER_ACCOUNT);
      expect(tx.Account).toBe(SENDER);
    });
  });

  describe('Account validation', () => {
    it('throws when Account is missing', () => {
      expect(() =>
        ledgerStateFix({
          Account: undefined as unknown as string,
          LedgerFixType: 1,
          Owner: NFTOKEN_OWNER,
        }),
      ).toThrow(/Account is required/);
    });

    it('throws when Account is not a valid XRPL address', () => {
      expect(() =>
        ledgerStateFix({
          Account: 'not-an-address',
          LedgerFixType: 1,
          Owner: NFTOKEN_OWNER,
        }),
      ).toThrow(/classic or X-address/);
    });
  });

  describe('LedgerFixType validation', () => {
    it('throws when LedgerFixType is missing', () => {
      expect(() =>
        ledgerStateFix({
          Account: SENDER,
          LedgerFixType: undefined as unknown as number,
          Owner: NFTOKEN_OWNER,
        }),
      ).toThrow(/LedgerFixType/);
    });

    it('throws when LedgerFixType is negative', () => {
      expect(() =>
        ledgerStateFix({
          Account: SENDER,
          LedgerFixType: -1,
          Owner: NFTOKEN_OWNER,
        }),
      ).toThrow(/UInt16/);
    });

    it('throws when LedgerFixType exceeds UInt16 max (65536)', () => {
      expect(() =>
        ledgerStateFix({
          Account: SENDER,
          LedgerFixType: 65536,
          Owner: NFTOKEN_OWNER,
        }),
      ).toThrow(/UInt16/);
    });

    it('accepts LedgerFixType = 65535 (UInt16 max)', () => {
      const tx = ledgerStateFix({
        Account: SENDER,
        LedgerFixType: 0xffff,
      });
      expect(tx.LedgerFixType).toBe(0xffff);
    });

    it('throws when LedgerFixType is not an integer (1.5)', () => {
      expect(() =>
        ledgerStateFix({
          Account: SENDER,
          LedgerFixType: 1.5,
          Owner: NFTOKEN_OWNER,
        }),
      ).toThrow(/integer/);
    });
  });

  describe('Owner validation', () => {
    it('throws when Owner is missing and LedgerFixType === 1', () => {
      expect(() =>
        ledgerStateFix({
          Account: SENDER,
          LedgerFixType: 1,
        }),
      ).toThrow(/Owner is required/);
    });

    it('accepts Owner being omitted for non-1 LedgerFixType', () => {
      // Future fix types may not require Owner. The factory must not
      // enforce an Owner requirement unconditionally.
      const tx = ledgerStateFix({
        Account: SENDER,
        LedgerFixType: 2,
      });
      expect(tx.Owner).toBeUndefined();
    });

    it('throws when Owner is not a valid XRPL address', () => {
      expect(() =>
        ledgerStateFix({
          Account: SENDER,
          LedgerFixType: 1,
          Owner: 'nope',
        }),
      ).toThrow(/classic or X-address/);
    });
  });

  describe('Fee validation (Special Transaction Cost)', () => {
    it('accepts Fee at exactly the owner reserve (2000000)', () => {
      const tx = make({ Fee: '2000000' });
      expect(tx.Fee).toBe('2000000');
    });

    it('accepts Fee above the owner reserve', () => {
      const tx = make({ Fee: '5000000' });
      expect(tx.Fee).toBe('5000000');
    });

    it('throws when Fee is below the owner reserve (1999999)', () => {
      expect(() => make({ Fee: '1999999' })).toThrow(/Special Transaction Cost/);
    });

    it('throws when Fee is a non-numeric string', () => {
      expect(() => make({ Fee: 'abc' })).toThrow(/Fee/);
    });

    it('throws when Fee is not a string', () => {
      expect(() => make({ Fee: 123 as unknown as string })).toThrow(/Fee/);
    });
  });

  describe('Sequence validation', () => {
    it('accepts a zero Sequence (Ticket case)', () => {
      const tx = make({ Sequence: 0 });
      expect(tx.Sequence).toBe(0);
    });

    it('throws when Sequence is negative', () => {
      expect(() => make({ Sequence: -1 })).toThrow(/Sequence/);
    });

    it('throws when Sequence is a non-integer', () => {
      expect(() => make({ Sequence: 1.5 })).toThrow(/Sequence/);
    });
  });

  describe('frozen-shape contract', () => {
    it('returns a frozen object', () => {
      expect(Object.isFrozen(make())).toBe(true);
    });

    it('mutation throws in strict mode', () => {
      const tx = make();
      expect(() => {
        (tx as unknown as Record<string, unknown>).LedgerFixType = 2;
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides', () => {
      const tx = make();
      const tx2 = tx.with({ Owner: OTHER_ACCOUNT });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Owner).toBe(OTHER_ACCOUNT);
      expect(tx.Owner).toBe(NFTOKEN_OWNER);
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      // Owner missing now invalid because LedgerFixType is still 1.
      expect(() => tx.with({ Owner: undefined })).toThrow(/Owner is required/);
      expect(() => tx.with({ Fee: '1' })).toThrow(/Special Transaction Cost/);
      expect(() => tx.with({ LedgerFixType: 70000 })).toThrow(/UInt16/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const json = make().toJSON();
      expect(json).toEqual({
        TransactionType: 'LedgerStateFix',
        Account: SENDER,
        LedgerFixType: 1,
        Owner: NFTOKEN_OWNER,
        Fee: MIN_FEE,
        Sequence: 2,
      });
    });

    it('.toJSON() skips undefined fields', () => {
      const tx = ledgerStateFix({
        Account: SENDER,
        LedgerFixType: 1,
        Owner: NFTOKEN_OWNER,
      });
      const json = tx.toJSON();
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op after successful construction', () => {
      expect(() => make().validate()).not.toThrow();
    });
  });
});