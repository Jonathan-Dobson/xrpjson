/**
 * Tests for the functional DIDDelete factory.
 *
 * Validates:
 *   1. Construction with required Account (XLS-40 §5.3).
 *   2. Account validation (classic/X-address format).
 *   3. Flags integer + global-flag-mask validation.
 *   4. Frozen-shape contract (mutation throws, .with() returns a new
 *      frozen object, .toJSON() strips methods and undefined values).
 *   5. Factory-only rules not enforced by the class API:
 *      - Account format check (class delegates to base Transaction).
 *      - Flags integer + bitmask check (class omits Flags entirely;
 *        xrpl.js's validateDIDDelete doesn't validate Flags at all).
 */
import { describe, it, expect } from 'vitest';
import { didDelete } from '../../src/fp/factories/did-delete.js';

const ACCOUNT = 'rp4pqYgrTAtdPHuZd1ZQWxrzx45jxYcZex';

const TF_FULLY_CANONICAL_SIG = 0x80000000;
const TF_INNER_BATCH_TXN = 0x40000000;

function make(extras: Record<string, unknown> = {}) {
  return didDelete({
    Account: ACCOUNT,
    ...extras,
  });
}

describe('fp/didDelete()', () => {
  describe('construction', () => {
    it('constructs with required Account only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('DIDDelete');
      expect(tx.Account).toBe(ACCOUNT);
    });

    it('accepts the spec common fields (Fee, Sequence)', () => {
      const tx = didDelete({
        Account: ACCOUNT,
        Fee: '12',
        Sequence: 391,
      });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(391);
    });

    it('accepts tfFullyCanonicalSig as a valid global flag', () => {
      // xrpl.js's model test uses this exact value to mark the tx as
      // fully-canonical. It is the only flag bit supported by DIDDelete
      // when the tx is not a Batch inner.
      const tx = make({ Flags: TF_FULLY_CANONICAL_SIG });
      expect(tx.Flags).toBe(TF_FULLY_CANONICAL_SIG);
    });

    it('accepts tfInnerBatchTxn as a valid global flag', () => {
      const tx = make({ Flags: TF_INNER_BATCH_TXN });
      expect(tx.Flags).toBe(TF_INNER_BATCH_TXN);
    });

    it('accepts both global flags combined', () => {
      // NB: JS bitwise OR on values >= 0x80000000 wraps to a signed
      // 32-bit int (negative). Use addition since the bits are disjoint.
      const combined = TF_FULLY_CANONICAL_SIG + TF_INNER_BATCH_TXN;
      const tx = make({ Flags: combined });
      expect(tx.Flags).toBe(combined);
    });

    it('accepts Flags = 0 (explicit zero)', () => {
      const tx = make({ Flags: 0 });
      expect(tx.Flags).toBe(0);
    });

    it('does not expose any per-tx fields (XLS-40 §5.3.2 declares none)', () => {
      // XLS-40 §5.3.2's field table lists ONLY TransactionType + Account.
      // DIDDelete has no URI / Data / DIDDocument / Destination, etc.
      const tx = make();
      expect('Data' in tx).toBe(false);
      expect('URI' in tx).toBe(false);
      expect('DIDDocument' in tx).toBe(false);
      expect('Destination' in tx).toBe(false);
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account (empty string)', () => {
      expect(() => didDelete({ Account: '' })).toThrow(/Account/);
    });

    it('throws on undefined Account', () => {
      expect(() =>
        didDelete({ Account: undefined as unknown as string }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account (not a base58 address)', () => {
      expect(() => didDelete({ Account: 'not-an-account' })).toThrow(/Account/);
    });

    it('throws on Account missing the leading r', () => {
      expect(() =>
        didDelete({ Account: 'p4pqYgrTAtdPHuZd1ZQWxrzx45jxYcZex' }),
      ).toThrow(/Account/);
    });

    it('throws on Account too short', () => {
      expect(() => didDelete({ Account: 'rShort' })).toThrow(/Account/);
    });

    it('accepts an X-address as Account', () => {
      // X-address (X...) format is supported per isAccount regex.
      // isAccount is format-only (no base58 checksum), so a string that
      // matches /X[base58]{46}/ is sufficient.
      // X + 46 base58 chars (no 0/O/I/l).
      const xAddr = 'X' + 'abcdefghjkmnpqrstvwxyzABCDEFGHJKLMNPQRSTVWXYZ1'.slice(0, 46);
      expect(xAddr.length).toBe(47);
      const tx = didDelete({ Account: xAddr });
      expect(tx.Account.startsWith('X')).toBe(true);
    });
  });

  describe('Flags validation', () => {
    it('throws on negative Flags', () => {
      expect(() => make({ Flags: -1 })).toThrow(/Flags/);
    });

    it('throws on fractional Flags', () => {
      expect(() => make({ Flags: 0.5 })).toThrow(/Flags/);
    });

    it('throws on NaN Flags', () => {
      expect(() => make({ Flags: Number.NaN })).toThrow(/Flags/);
    });

    it('throws on Infinity Flags', () => {
      expect(() => make({ Flags: Number.POSITIVE_INFINITY })).toThrow(/Flags/);
    });

    it('throws on Flags with invalid bit (e.g. 0x00000001)', () => {
      // 0x00000001 is the lower 32-bit region but is NOT a defined flag
      // bit for DIDDelete (no per-tx flags exist).
      expect(() => make({ Flags: 0x00000001 })).toThrow(/invalid bits/);
    });

    it('throws on Flags mixing valid + invalid bits', () => {
      // Use addition to keep the value in signed-int range; JS bitwise
      // OR on >= 0x80000000 wraps to negative.
      expect(() =>
        make({ Flags: TF_INNER_BATCH_TXN + 0x00000001 }),
      ).toThrow(/invalid bits/);
    });

    it('throws on Flags equal to 0x7FFFFFFF (all lower bits set, none valid)', () => {
      expect(() => make({ Flags: 0x7fffffff })).toThrow(/invalid bits/);
    });

    it('omits Flags from the tx when not provided', () => {
      const tx = make();
      expect(tx.Flags).toBeUndefined();
      expect('Flags' in tx).toBe(false);
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
        (tx as unknown as Record<string, unknown>).Account =
          'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
      }).toThrow(TypeError);
    });

    it('mutation of Flags throws', () => {
      const tx = make({ Flags: TF_FULLY_CANONICAL_SIG });
      expect(() => {
        (tx as unknown as Record<string, unknown>).Flags = 0;
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      const tx = make();
      const tx2 = tx.with({ Fee: '20' });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Fee).toBe('20');
      expect(tx.Fee).toBeUndefined();
    });

    it('.with() re-validates Account on overrides', () => {
      const tx = make();
      expect(() => tx.with({ Account: 'garbage' })).toThrow(/Account/);
    });

    it('.with() re-validates Flags on overrides', () => {
      const tx = make({ Flags: TF_FULLY_CANONICAL_SIG });
      expect(() => tx.with({ Flags: -1 })).toThrow(/Flags/);
    });

    it('.with() re-validates Flags bits on overrides', () => {
      const tx = make();
      expect(() => tx.with({ Flags: 0x00000001 })).toThrow(/invalid bits/);
    });

    it('.toJSON() produces TransactionType + Account + provided fields', () => {
      const tx = didDelete({
        Account: ACCOUNT,
        Flags: TF_FULLY_CANONICAL_SIG,
        Fee: '12',
        Sequence: 7,
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'DIDDelete',
        Account: ACCOUNT,
        Flags: TF_FULLY_CANONICAL_SIG,
        Fee: '12',
        Sequence: 7,
      });
    });

    it('.toJSON() skips undefined fields and methods', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('Flags' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op (no throw after construction)', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });
});