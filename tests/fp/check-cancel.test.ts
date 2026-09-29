/**
 * Tests for the functional CheckCancel factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, CheckID) and
 *      optional Fee / Sequence / Flags.
 *   2. Spec-mandated guards the class API omits:
 *        a. CheckID must be a 64-char hex string (UInt256).
 *        b. CheckID must not be the all-zeros HASH256 (fixCleanup3_3_0).
 *   3. Frozen-shape contract (mutation throws, .with() returns a new
 *      frozen object, .toJSON() strips methods and undefined fields).
 *   4. .with() re-validates the merged shape.
 *
 * Spec sources verified against:
 *   - xrpl.js:  ~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/CheckCancel.ts
 *   - xrpl.org: ~/.mavis/docs.local/xrpl-dev-portal/repo/docs/references/protocol/transactions/types/checkcancel.md
 */
import { describe, it, expect } from 'vitest';
import { checkCancel } from '../../src/fp/factories/check-cancel.js';

// SENDER — the canceller (source, destination, or any address if the
// Check is expired).
const SENDER = 'rUn84CUYbNjRoTQ6mSW7BVJPSVJNLb1QLo';
// 64-char hex CheckID taken from xrpl.org `checkcancel.md` line 23
// (the example JSON).
const VALID_CHECK_ID =
  '49647F0D748DC3FE26BDACBC57F251AADEFFF391403EC9BF87C97F67E9977FB0';
const CHECK_ID_ZERO = '0'.repeat(64);

function make(extras: Record<string, unknown> = {}) {
  return checkCancel({
    Account: SENDER,
    CheckID: VALID_CHECK_ID,
    ...extras,
  });
}

// ─── Construction ────────────────────────────────────────────────────

describe('fp/checkCancel()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('CheckCancel');
      expect(tx.Account).toBe(SENDER);
      expect(tx.CheckID).toBe(VALID_CHECK_ID);
    });

    it('passes through optional Fee and Sequence', () => {
      const tx = make({ Fee: '12', Sequence: 7 });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(7);
    });

    it('accepts a numeric Flags bitmask', () => {
      // CheckCancel itself defines no tx-specific flags; only
      // tfFullyCanonicalSig (global) is meaningful. The factory accepts
      // a numeric mask for parity with the base tx shape.
      const tx = make({ Flags: 0 });
      expect(tx.Flags).toBe(0);
    });

    it('accepts a Flags bitmask with tfFullyCanonicalSig set', () => {
      // tfFullyCanonicalSig = 0x80000000 (global flag).
      const tx = make({ Flags: 0x80000000 });
      expect(tx.Flags).toBe(0x80000000);
    });

    it('matches the xrpl.org example JSON shape', () => {
      // xrpl.org checkcancel.md line 19-26.
      const tx = checkCancel({
        Account: SENDER,
        CheckID: VALID_CHECK_ID,
        Fee: '12',
      });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'CheckCancel',
        Account: SENDER,
        CheckID: VALID_CHECK_ID,
        Fee: '12',
      });
    });
  });

  // ─── Account validation ─────────────────────────────────────────────

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        checkCancel({
          Account: '' as never,
          CheckID: VALID_CHECK_ID,
        }),
      ).toThrow(/Account/);
    });

    it('throws on a malformed Account address', () => {
      expect(() =>
        checkCancel({
          Account: 'not-an-address' as never,
          CheckID: VALID_CHECK_ID,
        }),
      ).toThrow(/Account/);
    });

    it('accepts an X-address as Account', () => {
      // X-addresses are 47 chars: 'X' + 46 base58 chars. Full base58
      // checksum is not enforced by isAccount; only the format is.
      const xAddr = 'Xwgz5ms2XFgQQmJW3AoZQXZzeJpWUH3iYyBoCePbf1812DC';
      const tx = checkCancel({
        Account: xAddr,
        CheckID: VALID_CHECK_ID,
      });
      expect(tx.Account).toBe(xAddr);
    });
  });

  // ─── CheckID validation ────────────────────────────────────────────

  describe('CheckID validation (UInt256 hex)', () => {
    it('throws on missing CheckID', () => {
      expect(() =>
        checkCancel({
          Account: SENDER,
          CheckID: undefined as unknown as string,
        }),
      ).toThrow(/CheckID/);
    });

    it('throws on a non-string CheckID', () => {
      expect(() =>
        checkCancel({
          Account: SENDER,
          CheckID: 12345 as never,
        }),
      ).toThrow(/CheckID/);
    });

    it('throws on an empty CheckID', () => {
      expect(() =>
        checkCancel({
          Account: SENDER,
          CheckID: '' as never,
        }),
      ).toThrow(/CheckID/);
    });

    it('throws on a CheckID of wrong length (too short)', () => {
      expect(() =>
        checkCancel({
          Account: SENDER,
          CheckID: 'DEADBEEF',
        }),
      ).toThrow(/64 hex characters/);
    });

    it('throws on a CheckID of wrong length (too long)', () => {
      expect(() =>
        checkCancel({
          Account: SENDER,
          CheckID: 'A'.repeat(66),
        }),
      ).toThrow(/64 hex characters/);
    });

    it('throws on an odd-length hex CheckID', () => {
      // 63 hex chars — odd, not byte-aligned. UInt256 requires 32 bytes.
      expect(() =>
        checkCancel({
          Account: SENDER,
          CheckID: 'A'.repeat(63),
        }),
      ).toThrow(/64 hex characters/);
    });

    it('throws on a non-hex CheckID', () => {
      // 64 chars but contains a non-hex letter ('Z' is not in [0-9A-Fa-f]).
      expect(() =>
        checkCancel({
          Account: SENDER,
          CheckID: 'Z'.repeat(64),
        }),
      ).toThrow(/hex/);
    });

    it('throws on the all-zeros HASH256 CheckID (xrpl.org fixCleanup3_3_0: temMALFORMED)', () => {
      expect(() =>
        checkCancel({
          Account: SENDER,
          CheckID: CHECK_ID_ZERO,
        }),
      ).toThrow(/all-zeros/);
    });

    it('accepts a 64-char hex CheckID', () => {
      const tx = make();
      expect(tx.CheckID).toBe(VALID_CHECK_ID);
    });

    it('accepts a lowercase hex CheckID (XRPL parses hex case-insensitively)', () => {
      const lower = VALID_CHECK_ID.toLowerCase();
      const tx = checkCancel({
        Account: SENDER,
        CheckID: lower,
      });
      expect(tx.CheckID).toBe(lower);
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
        (tx as unknown as Record<string, unknown>).CheckID = 'A'.repeat(64);
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      const tx = make();
      // Replace the first char of VALID_CHECK_ID — same length (64).
      const newId = 'D' + VALID_CHECK_ID.slice(1);
      const tx2 = tx.with({ CheckID: newId });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.CheckID).toBe(newId);
      expect(tx.CheckID).toBe(VALID_CHECK_ID);
    });

    it('.with() preserves unchanged fields', () => {
      const tx = make({ Fee: '12', Sequence: 5 });
      const tx2 = tx.with({ Fee: '20' });
      expect(tx2.Fee).toBe('20');
      expect(tx2.Sequence).toBe(5);
      expect(tx2.CheckID).toBe(VALID_CHECK_ID);
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() => tx.with({ CheckID: CHECK_ID_ZERO })).toThrow(/all-zeros/);
      expect(() => tx.with({ CheckID: 'short' })).toThrow(/CheckID/);
      expect(() => tx.with({ CheckID: 'Z'.repeat(64) })).toThrow(/hex/);
    });

    it('.with() re-validates Account', () => {
      const tx = make();
      expect(() => tx.with({ Account: 'bad' as never })).toThrow(/Account/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({ Fee: '12', Sequence: 5, Flags: 0 });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'CheckCancel',
        Account: SENDER,
        CheckID: VALID_CHECK_ID,
        Fee: '12',
        Sequence: 5,
        Flags: 0,
      });
    });

    it('.toJSON() skips undefined fields and methods', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
      expect('Flags' in json).toBe(false);
    });

    it('.validate() is a no-op after construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });

  // ─── Compatibility with class-based source ─────────────────────────

  describe('compatibility with class source', () => {
    it('produces an object shaped like the class output (Account + CheckID + TransactionType)', () => {
      // The class declares a `readonly CheckID: string` via `declare`
      // and no other instance fields, so the class shape is also just
      // { TransactionType, Account, CheckID, ...inherited base fields }
      // when no Fee/Sequence/Flags are set. The factory omits Fee/
      // Sequence/Flags from Object.keys when those fields are not
      // provided, matching the class's `isString`-only validate and
      // null TxFlags. This is the intentional fp divergence.
      const tx = make();
      const keys = Object.keys(tx).sort();
      expect(keys).toContain('TransactionType');
      expect(keys).toContain('Account');
      expect(keys).toContain('CheckID');
      expect(keys).not.toContain('Fee');
      expect(keys).not.toContain('Sequence');
      expect(keys).not.toContain('Flags');
      expect(tx.TransactionType).toBe('CheckCancel');
    });
  });
});