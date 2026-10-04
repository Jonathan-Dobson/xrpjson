/**
 * Tests for the functional DelegateSet factory.
 *
 * Mirrors the contract used by the other fp tests — construction-time
 * validation, frozen shape, .with() re-validation, .toJSON() shape,
 * round-trip through xrpl encode/decode. Specific to DelegateSet, we
 * exhaustively cover the canonical xrpl.js guard list:
 *
 *   - Authorize required + isAccount
 *   - Authorize !== Account (no self-delegation)
 *   - Permissions required + Array
 *   - Permissions length <= 10
 *   - Each Permission shape = { Permission: { PermissionValue: string } }
 *   - PermissionValue non-delegatable transaction rejection
 *   - No duplicate PermissionValues
 */
import { describe, it, expect } from 'vitest';
import { decode, encode } from 'xrpl';
import { delegateSet } from '../../src/fp/factories/delegate-set.js';

const ACCOUNT_A = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const ACCOUNT_B = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';

const ONE_PAYMENT: { Permission: { PermissionValue: string } } = {
  Permission: { PermissionValue: 'Payment' },
};
const ONE_ESCROW: { Permission: { PermissionValue: string } } = {
  Permission: { PermissionValue: 'EscrowCreate' },
};

describe('fp/delegateSet()', () => {
  it('constructs with the minimum valid field set', () => {
    const tx = delegateSet({
      Account: ACCOUNT_A,
      Authorize: ACCOUNT_B,
      Permissions: [ONE_PAYMENT],
    });
    expect(tx.TransactionType).toBe('DelegateSet');
    expect(tx.Account).toBe(ACCOUNT_A);
    expect(tx.Authorize).toBe(ACCOUNT_B);
    expect(tx.Permissions).toEqual([ONE_PAYMENT]);
  });

  it('returns a frozen object', () => {
    const tx = delegateSet({
      Account: ACCOUNT_A,
      Authorize: ACCOUNT_B,
      Permissions: [ONE_PAYMENT],
    });
    expect(Object.isFrozen(tx)).toBe(true);
  });

  it('mutation throws in strict mode (frozen at every layer)', () => {
    const tx = delegateSet({
      Account: ACCOUNT_A,
      Authorize: ACCOUNT_B,
      Permissions: [ONE_PAYMENT],
    });
    expect(() => {
      (tx as unknown as { Account: string }).Account = ACCOUNT_B;
    }).toThrow(TypeError);
    expect(tx.Account).toBe(ACCOUNT_A);
  });

  it('throws at construction on missing Account', () => {
    expect(() =>
      delegateSet({
        Account: '',
        Authorize: ACCOUNT_B,
        Permissions: [ONE_PAYMENT],
      } as unknown as Parameters<typeof delegateSet>[0]),
    ).toThrow(/Account/);
  });

  it('throws at construction on missing Authorize', () => {
    expect(() =>
      delegateSet({
        Account: ACCOUNT_A,
        Authorize: '',
        Permissions: [ONE_PAYMENT],
      } as unknown as Parameters<typeof delegateSet>[0]),
    ).toThrow(/Authorize/);
  });

  it('throws at construction when Authorize === Account (self-delegation)', () => {
    expect(() =>
      delegateSet({
        Account: ACCOUNT_A,
        Authorize: ACCOUNT_A,
        Permissions: [ONE_PAYMENT],
      }),
    ).toThrow(/Authorize and Account must be different/);
  });

  it('throws at construction on missing Permissions', () => {
    expect(() =>
      delegateSet({
        Account: ACCOUNT_A,
        Authorize: ACCOUNT_B,
      } as unknown as Parameters<typeof delegateSet>[0]),
    ).toThrow(/Permissions/);
  });

  it('throws when Permissions array length > 10', () => {
    const eleven = Array.from({ length: 11 }, () => ONE_PAYMENT);
    expect(() =>
      delegateSet({
        Account: ACCOUNT_A,
        Authorize: ACCOUNT_B,
        Permissions: eleven,
      }),
    ).toThrow(/cannot be greater than 10/);
  });

  it('throws when a Permission element is malformed (wrong shape)', () => {
    expect(() =>
      delegateSet({
        Account: ACCOUNT_A,
        Authorize: ACCOUNT_B,
        // Outer object has 2 keys instead of 1.
        Permissions: [
          {
            Permission: { PermissionValue: 'Payment' },
            Extra: 'no',
          } as unknown as { Permission: { PermissionValue: string } },
        ],
      }),
    ).toThrow(/malformed/);
  });

  it('throws when PermissionValue is missing', () => {
    expect(() =>
      delegateSet({
        Account: ACCOUNT_A,
        Authorize: ACCOUNT_B,
        Permissions: [
          {
            Permission: { PermissionValue: undefined as unknown as string },
          },
        ],
      }),
    ).toThrow(/PermissionValue must be defined/);
  });

  it('throws when PermissionValue is not a string', () => {
    expect(() =>
      delegateSet({
        Account: ACCOUNT_A,
        Authorize: ACCOUNT_B,
        Permissions: [
          { Permission: { PermissionValue: 42 as unknown as string } },
        ],
      }),
    ).toThrow(/PermissionValue must be a string/);
  });

  it('rejects non-delegatable transaction types (AccountSet)', () => {
    expect(() =>
      delegateSet({
        Account: ACCOUNT_A,
        Authorize: ACCOUNT_B,
        Permissions: [
          { Permission: { PermissionValue: 'AccountSet' } },
        ],
      }),
    ).toThrow(/non-delegatable transaction AccountSet/);
  });

  it('rejects self-delegation type (DelegateSet)', () => {
    expect(() =>
      delegateSet({
        Account: ACCOUNT_A,
        Authorize: ACCOUNT_B,
        Permissions: [
          { Permission: { PermissionValue: 'DelegateSet' } },
        ],
      }),
    ).toThrow(/non-delegatable transaction DelegateSet/);
  });

  it('throws when Permissions contain duplicate values', () => {
    expect(() =>
      delegateSet({
        Account: ACCOUNT_A,
        Authorize: ACCOUNT_B,
        Permissions: [ONE_PAYMENT, ONE_PAYMENT],
      }),
    ).toThrow(/duplicate values/);
  });

  it('accepts multiple distinct permissions up to the cap', () => {
    const tx = delegateSet({
      Account: ACCOUNT_A,
      Authorize: ACCOUNT_B,
      Permissions: [ONE_PAYMENT, ONE_ESCROW],
    });
    expect(tx.Permissions).toHaveLength(2);
  });

  it('accepts the maximum 10 permissions without duplicates', () => {
    const ten = [
      'Payment',
      'EscrowCreate',
      'EscrowFinish',
      'EscrowCancel',
      'CheckCreate',
      'CheckCash',
      'CheckCancel',
      'TrustSet',
      'OfferCreate',
      'OfferCancel',
    ].map((v) => ({ Permission: { PermissionValue: v } }));
    const tx = delegateSet({
      Account: ACCOUNT_A,
      Authorize: ACCOUNT_B,
      Permissions: ten,
    });
    expect(tx.Permissions).toHaveLength(10);
  });

  it('.with() returns a new frozen tx with overrides applied', () => {
    const tx = delegateSet({
      Account: ACCOUNT_A,
      Authorize: ACCOUNT_B,
      Permissions: [ONE_PAYMENT],
    });
    const tx2 = tx.with({ Fee: '12', Sequence: 42 });
    expect(tx2).not.toBe(tx);
    expect(Object.isFrozen(tx2)).toBe(true);
    expect(tx2.Fee).toBe('12');
    expect(tx2.Sequence).toBe(42);
    expect(tx2.Account).toBe(ACCOUNT_A);
    expect(tx.Fee).toBeUndefined();
  });

  it('.with() re-validates on overrides', () => {
    const tx = delegateSet({
      Account: ACCOUNT_A,
      Authorize: ACCOUNT_B,
      Permissions: [ONE_PAYMENT],
    });
    expect(() =>
      tx.with({
        Authorize: ACCOUNT_A, // self-delegation
      }),
    ).toThrow(/Authorize and Account must be different/);
  });

  it('.with() re-validates Permissions length on overrides', () => {
    const tx = delegateSet({
      Account: ACCOUNT_A,
      Authorize: ACCOUNT_B,
      Permissions: [ONE_PAYMENT],
    });
    const tooMany = Array.from({ length: 11 }, () => ONE_PAYMENT);
    expect(() => tx.with({ Permissions: tooMany })).toThrow(
      /cannot be greater than 10/,
    );
  });

  it('.toJSON() produces a plain object matching xrpl.js shape', () => {
    const tx = delegateSet({
      Account: ACCOUNT_A,
      Authorize: ACCOUNT_B,
      Permissions: [ONE_PAYMENT],
      Fee: '12',
      Sequence: 42,
    });
    const json = tx.toJSON();
    expect(json).toEqual({
      TransactionType: 'DelegateSet',
      Account: ACCOUNT_A,
      Authorize: ACCOUNT_B,
      Permissions: [ONE_PAYMENT],
      Fee: '12',
      Sequence: 42,
    });
  });

  it('.toJSON() skips methods and undefined fields', () => {
    const tx = delegateSet({
      Account: ACCOUNT_A,
      Authorize: ACCOUNT_B,
      Permissions: [ONE_PAYMENT],
    });
    const json = tx.toJSON();
    expect(json).not.toHaveProperty('validate');
    expect(json).not.toHaveProperty('toJSON');
    expect(json).not.toHaveProperty('with');
    expect(json).not.toHaveProperty('Fee'); // undefined
  });

  it('.validate() is a no-op (validation already happened)', () => {
    const tx = delegateSet({
      Account: ACCOUNT_A,
      Authorize: ACCOUNT_B,
      Permissions: [ONE_PAYMENT],
    });
    expect(() => tx.validate()).not.toThrow();
  });

  it('round-trips through xrpl encode/decode', () => {
    const tx = delegateSet({
      Account: ACCOUNT_A,
      Authorize: ACCOUNT_B,
      Permissions: [ONE_PAYMENT, ONE_ESCROW],
      Fee: '12',
    });
    const encoded = encode(tx.toJSON() as unknown as Parameters<typeof encode>[0]);
    expect(encoded).toBeDefined();
    const decoded = decode(encoded);
    expect(decoded.TransactionType).toBe('DelegateSet');
    expect((decoded as { Account: string }).Account).toBe(ACCOUNT_A);
    expect((decoded as { Authorize: string }).Authorize).toBe(ACCOUNT_B);
  });
  // ─── Base transaction fields ──────────────────────────────────────────────
  // `DelegateSetProps` extends `BasePropsFields`, so the seven shared base
  // transaction fields are part of this factory's prop type and are checked
  // by `validateBaseTransaction` at construction.
  describe('BaseTransactionFields', () => {
    // A third valid address, distinct from `Account`, for the Delegate cases.
    const DELEGATE = 'ra5nK24KXen9AHvsdFTKHSANinZseWnPcX';

    const base = {
      Account: ACCOUNT_A,
      Authorize: ACCOUNT_B,
      Permissions: [ONE_PAYMENT],
    };

    it('accepts a valid Memos array', () => {
      const memos = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
      const tx = delegateSet({ ...base, Memos: memos });
      expect(tx.Memos).toEqual(memos);
    });

    it('rejects a malformed Memos value', () => {
      expect(() => delegateSet({ ...base, Memos: 'not-an-array' } as any)).toThrow(
        /invalid Memos/,
      );
    });

    it('accepts SourceTag', () => {
      const tx = delegateSet({ ...base, SourceTag: 99 });
      expect(tx.SourceTag).toBe(99);
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() => delegateSet({ ...base, SourceTag: 'NaN' } as any)).toThrow(
        /SourceTag must be a number/,
      );
    });

    it('accepts LastLedgerSequence', () => {
      const tx = delegateSet({ ...base, LastLedgerSequence: 900000 });
      expect(tx.LastLedgerSequence).toBe(900000);
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() =>
        delegateSet({ ...base, LastLedgerSequence: 'soon' } as any),
      ).toThrow(/LastLedgerSequence must be a number/);
    });

    it('accepts AccountTxnID', () => {
      const tx = delegateSet({ ...base, AccountTxnID: 'ABC123' });
      expect(tx.AccountTxnID).toBe('ABC123');
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() => delegateSet({ ...base, AccountTxnID: 42 } as any)).toThrow(
        /AccountTxnID must be a string/,
      );
    });

    it('accepts NetworkID', () => {
      const tx = delegateSet({ ...base, NetworkID: 1 });
      expect(tx.NetworkID).toBe(1);
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() => delegateSet({ ...base, NetworkID: {} } as any)).toThrow(
        /NetworkID must be a number/,
      );
    });

    it('accepts a distinct Delegate', () => {
      const tx = delegateSet({ ...base, Delegate: DELEGATE });
      expect(tx.Delegate).toBe(DELEGATE);
    });

    it('rejects a Delegate that is not a valid account address', () => {
      expect(() =>
        delegateSet({ ...base, Delegate: 'not-an-address' } as any),
      ).toThrow(/invalid Delegate/);
    });

    it('rejects Delegate equal to Account', () => {
      expect(() => delegateSet({ ...base, Delegate: base.Account })).toThrow(
        /cannot be the same/,
      );
    });

    it('accepts TicketSequence (the field that made tickets unspendable)', () => {
      const tx = delegateSet({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.TicketSequence).toBe(42);
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() => delegateSet({ ...base, TicketSequence: 'nope' } as any)).toThrow(
        /TicketSequence must be a number/,
      );
    });
  });
});
