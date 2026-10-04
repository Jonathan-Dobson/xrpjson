/**
 * Tests for the functional SetRegularKey factory.
 *
 * Validates:
 *   1. Construction with required Account only (RegularKey omitted →
 *      removes the regular key).
 *   2. Construction with Account + RegularKey (assigns a new key).
 *   3. TransactionType is the literal 'SetRegularKey'.
 *   4. Account format validation.
 *   5. RegularKey format validation (valid XRPL address).
 *   6. temBAD_REGKEY — RegularKey must not equal Account.
 *   7. Frozen-shape contract (frozen, methods bound, .with() returns a
 *      new frozen object, .toJSON() strips methods + undefined values).
 *   8. .with() re-validates (cannot bypass via overrides).
 *   9. Defensive type-rejection (non-string RegularKey → throw).
 */
import { describe, it, expect } from 'vitest';
import { setRegularKey } from '../../src/fp/factories/set-regular-key.js';

// Sender (account whose regular key is being managed).
const ACCOUNT = 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn';
// A different, well-formed XRPL classic address used as a new regular key.
const REGULAR_KEY = 'rAR8rR8sUkBoCZFawhkWzY4Y5YoyuznwD';

function make(extras: Record<string, unknown> = {}) {
  return setRegularKey({ Account: ACCOUNT, ...extras });
}

describe('fp/setRegularKey()', () => {
  describe('construction', () => {
    it('constructs with Account only (RegularKey undefined → removal)', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('SetRegularKey');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.RegularKey).toBeUndefined();
    });

    it('constructs with RegularKey present (assign/change)', () => {
      const tx = make({ RegularKey: REGULAR_KEY });
      expect(tx.TransactionType).toBe('SetRegularKey');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.RegularKey).toBe(REGULAR_KEY);
    });

    it('passes Fee and Sequence through', () => {
      const tx = make({ Fee: '12', Sequence: 7 });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(7);
    });

    it('throws when Account is missing (undefined)', () => {
      expect(() =>
        setRegularKey({ Account: undefined as unknown as string }),
      ).toThrow(/Account is required/);
    });

    it('throws when Account is an invalid XRPL address format', () => {
      expect(() =>
        setRegularKey({ Account: 'not-an-address' }),
      ).toThrow(/Account/);
    });
  });

  describe('RegularKey validation', () => {
    it('throws when RegularKey is an invalid XRPL address format', () => {
      expect(() =>
        make({ RegularKey: 'rINVALID' }),
      ).toThrow(/RegularKey/);
    });

    it('throws when RegularKey is an empty string', () => {
      // Empty string fails isAccount() regex; surfaces as RegularKey error.
      expect(() => make({ RegularKey: '' })).toThrow(/RegularKey/);
    });

    it('throws when RegularKey is not a string (defensive)', () => {
      expect(() =>
        make({ RegularKey: 12369846963 as unknown as string }),
      ).toThrow(/RegularKey/);
    });

    it('accepts a RegularKey that differs from Account', () => {
      const tx = make({ RegularKey: REGULAR_KEY });
      expect(tx.RegularKey).toBe(REGULAR_KEY);
    });
  });

  describe('temBAD_REGKEY guard (RegularKey must not equal Account)', () => {
    it('throws when RegularKey equals Account', () => {
      expect(() => make({ RegularKey: ACCOUNT })).toThrow(
        /must not equal Account/,
      );
    });

    it('throws when RegularKey equals Account via .with()', () => {
      const tx = make({ RegularKey: REGULAR_KEY });
      expect(() => tx.with({ RegularKey: ACCOUNT })).toThrow(
        /must not equal Account/,
      );
    });
  });

  describe('frozen-shape contract', () => {
    it('returns a frozen object', () => {
      const tx = make({ RegularKey: REGULAR_KEY });
      expect(Object.isFrozen(tx)).toBe(true);
    });

    it('throws on mutation (strict mode)', () => {
      const tx = make({ RegularKey: REGULAR_KEY });
      expect(() => {
        (tx as unknown as Record<string, unknown>)['RegularKey'] =
          'rDifferentAddressXXXXXXXXXXXXXX';
      }).toThrow();
    });

    it('exposes validate(), toJSON(), with() as own enumerable methods', () => {
      const tx = make({ RegularKey: REGULAR_KEY });
      expect(typeof tx.validate).toBe('function');
      expect(typeof tx.toJSON).toBe('function');
      expect(typeof tx.with).toBe('function');
    });

    it('.validate() is a no-op (validated at construction)', () => {
      const tx = make({ RegularKey: REGULAR_KEY });
      expect(() => tx.validate()).not.toThrow();
    });
  });

  describe('.with()', () => {
    it('returns a new frozen tx with overrides applied', () => {
      const tx = make({ RegularKey: REGULAR_KEY });
      const tx2 = tx.with({ Fee: '20' });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Fee).toBe('20');
      expect(tx2.Account).toBe(ACCOUNT); // preserved
      expect(tx2.RegularKey).toBe(REGULAR_KEY); // preserved
      expect(tx.Fee).toBeUndefined(); // original untouched
    });

    it('re-validates: cannot bypass Account via overrides', () => {
      const tx = make({ RegularKey: REGULAR_KEY });
      expect(() => tx.with({ Account: 'bad' as unknown as string })).toThrow(
        /Account/,
      );
    });

    it('re-validates: cannot bypass RegularKey format via overrides', () => {
      const tx = make({ RegularKey: REGULAR_KEY });
      expect(() => tx.with({ RegularKey: 'bogus' })).toThrow(/RegularKey/);
    });

    it('can clear RegularKey via override (undefined → removal)', () => {
      const tx = make({ RegularKey: REGULAR_KEY });
      const tx2 = tx.with({ RegularKey: undefined });
      expect(tx2.RegularKey).toBeUndefined();
    });
  });

  describe('.toJSON()', () => {
    it('strips methods and undefined values', () => {
      const tx = make({ RegularKey: REGULAR_KEY });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'SetRegularKey',
        Account: ACCOUNT,
        RegularKey: REGULAR_KEY,
      });
      expect(json).not.toHaveProperty('validate');
      expect(json).not.toHaveProperty('toJSON');
      expect(json).not.toHaveProperty('with');
    });

    it('omits RegularKey when undefined (removal case)', () => {
      const tx = make();
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'SetRegularKey',
        Account: ACCOUNT,
      });
      expect(json).not.toHaveProperty('RegularKey');
    });

    it('includes Fee and Sequence when present', () => {
      const tx = make({ RegularKey: REGULAR_KEY, Fee: '12', Sequence: 5 });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'SetRegularKey',
        Account: ACCOUNT,
        RegularKey: REGULAR_KEY,
        Fee: '12',
        Sequence: 5,
      });
    });
  });

  // ─── Base transaction fields ─────────────────────────────────────────────
  // `SetRegularKey`Props accepts the seven shared base fields and the factory now
  // calls `validateBaseTransaction`, so a malformed one is rejected at
  // construction instead of freezing a transaction that would fail at
  // submit. Values below are chosen to be VALID under src/validation/base.ts.
  describe('BaseTransactionFields', () => {
    const base = { Account: ACCOUNT };
    const MEMOS = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
    const TXN_ID = 'AB'.repeat(32);
    // A valid classic address distinct from `base.Account`.
    const DELEGATE = REGULAR_KEY;

    it('accepts Memos', () => {
      const tx = setRegularKey({ ...base, Memos: MEMOS });
      expect(tx.toJSON().Memos).toEqual(MEMOS);
    });

    it('accepts SourceTag', () => {
      const tx = setRegularKey({ ...base, SourceTag: 99 });
      expect(tx.toJSON().SourceTag).toBe(99);
    });

    it('accepts LastLedgerSequence', () => {
      const tx = setRegularKey({ ...base, LastLedgerSequence: 1_000_000 });
      expect(tx.toJSON().LastLedgerSequence).toBe(1_000_000);
    });

    it('accepts AccountTxnID', () => {
      const tx = setRegularKey({ ...base, AccountTxnID: TXN_ID });
      expect(tx.toJSON().AccountTxnID).toBe(TXN_ID);
    });

    it('accepts NetworkID', () => {
      const tx = setRegularKey({ ...base, NetworkID: 1 });
      expect(tx.toJSON().NetworkID).toBe(1);
    });

    it('accepts a Delegate distinct from Account', () => {
      const tx = setRegularKey({ ...base, Delegate: DELEGATE });
      expect(tx.toJSON().Delegate).toBe(DELEGATE);
    });

    it('accepts TicketSequence alongside Sequence: 0', () => {
      const tx = setRegularKey({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    // ── Reject side ── the runtime backstop. Before the
    // `validateBaseTransaction` call landed, every case below built a frozen
    // transaction silently. The bad values are cast `as any` on purpose: the
    // point under test is the runtime check, and a type error would make the
    // test uncompilable.
    it('rejects a malformed Memos value', () => {
      expect(() => setRegularKey({ ...base, Memos: 'not-an-array' } as any)).toThrow(/invalid Memos/);
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() => setRegularKey({ ...base, SourceTag: 'NaN' } as any)).toThrow(
        /SourceTag must be a number/,
      );
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() => setRegularKey({ ...base, LastLedgerSequence: 'soon' } as any)).toThrow(
        /LastLedgerSequence must be a number/,
      );
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() => setRegularKey({ ...base, AccountTxnID: 99 } as any)).toThrow(
        /AccountTxnID must be a string/,
      );
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() => setRegularKey({ ...base, NetworkID: {} } as any)).toThrow(/NetworkID must be a number/);
    });

    it('rejects a Delegate that is not a valid address', () => {
      expect(() => setRegularKey({ ...base, Delegate: 'not-an-address' } as any)).toThrow(
        /invalid Delegate/,
      );
    });

    it('rejects a Delegate equal to Account', () => {
      expect(() => setRegularKey({ ...base, Delegate: ACCOUNT })).toThrow(/cannot be the same/);
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() => setRegularKey({ ...base, TicketSequence: 'nope' } as any)).toThrow(
        /TicketSequence must be a number/,
      );
    });

    it('rejects a non-string Fee', () => {
      expect(() => setRegularKey({ ...base, Fee: 12 } as any)).toThrow(/Fee must be a string/);
    });
  });
});