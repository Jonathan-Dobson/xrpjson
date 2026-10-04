/**
 * Tests for the functional MPTokenIssuanceDestroy factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, MPTokenIssuanceID).
 *   2. MPTokenIssuanceID shape (48-char hex / UINT192, non-zero).
 *   3. Account validation (classic or X-address).
 *   4. Optional fields (Fee, Sequence, Flags) pass through.
 *   5. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined values).
 *
 * Per XLS-0033 §3.2.1, MPTokenIssuanceID is the only transaction-specific
 * field (UINT192 — 24 bytes / 48 hex chars). TransactionType is 55.
 */
import { describe, it, expect } from 'vitest';
import { mptokenIssuanceDestroy } from '../../src/fp/factories/mptoken-issuance-destroy.js';

const ISSUER = 'rNFta7UKwcoiCpxEYbhH2v92numE3cceB6';

// 48-char hex UINT192 (4-byte sequence + 20-byte issuer AccountID).
// Example id from XLS-0033 §3.2.2 and the xrpl.org docs.
const VALID_MP_TOKEN_ISSUANCE_ID =
  '000004C463C52827307480341125DA0577DEFC38405B0E3E';

// All-zeros UINT192 — must be rejected.
const ZERO_MP_TOKEN_ISSUANCE_ID = '0'.repeat(48);

function make(extras: Record<string, unknown> = {}) {
  return mptokenIssuanceDestroy({
    Account: ISSUER,
    MPTokenIssuanceID: VALID_MP_TOKEN_ISSUANCE_ID,
    ...extras,
  });
}

describe('fp/mptokenIssuanceDestroy()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('MPTokenIssuanceDestroy');
      expect(tx.Account).toBe(ISSUER);
      expect(tx.MPTokenIssuanceID).toBe(VALID_MP_TOKEN_ISSUANCE_ID);
    });

    it('accepts Fee and Sequence', () => {
      const tx = make({ Fee: '12', Sequence: 7 });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(7);
    });

    it('accepts numeric Flags (spec defines none)', () => {
      const tx = make({ Flags: 0 });
      expect(tx.Flags).toBe(0);
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        mptokenIssuanceDestroy({
          Account: '' as never,
          MPTokenIssuanceID: VALID_MP_TOKEN_ISSUANCE_ID,
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      expect(() =>
        mptokenIssuanceDestroy({
          Account: 'not-an-account',
          MPTokenIssuanceID: VALID_MP_TOKEN_ISSUANCE_ID,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('MPTokenIssuanceID validation', () => {
    it('throws on missing MPTokenIssuanceID', () => {
      expect(() =>
        mptokenIssuanceDestroy({
          Account: ISSUER,
          MPTokenIssuanceID: '' as never,
        }),
      ).toThrow(/MPTokenIssuanceID/);
    });

    it('throws on non-string MPTokenIssuanceID', () => {
      expect(() =>
        mptokenIssuanceDestroy({
          Account: ISSUER,
          MPTokenIssuanceID: 123 as never,
        }),
      ).toThrow(/MPTokenIssuanceID/);
    });

    it('throws on non-hex MPTokenIssuanceID', () => {
      expect(() =>
        mptokenIssuanceDestroy({
          Account: ISSUER,
          MPTokenIssuanceID: 'Z'.repeat(48),
        }),
      ).toThrow(/MPTokenIssuanceID/);
    });

    it('throws on wrong-length MPTokenIssuanceID (too short)', () => {
      expect(() =>
        mptokenIssuanceDestroy({
          Account: ISSUER,
          MPTokenIssuanceID: 'AB',
        }),
      ).toThrow(/MPTokenIssuanceID/);
    });

    it('throws on wrong-length MPTokenIssuanceID (too long)', () => {
      expect(() =>
        mptokenIssuanceDestroy({
          Account: ISSUER,
          MPTokenIssuanceID: 'A'.repeat(50),
        }),
      ).toThrow(/MPTokenIssuanceID/);
    });

    it('throws on all-zeros MPTokenIssuanceID', () => {
      expect(() =>
        mptokenIssuanceDestroy({
          Account: ISSUER,
          MPTokenIssuanceID: ZERO_MP_TOKEN_ISSUANCE_ID,
        }),
      ).toThrow(/MPTokenIssuanceID.*zero/i);
    });

    it('accepts a non-zero 48-char hex MPTokenIssuanceID', () => {
      const tx = make();
      expect(tx.MPTokenIssuanceID).toBe(VALID_MP_TOKEN_ISSUANCE_ID);
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
        (tx as unknown as Record<string, unknown>).MPTokenIssuanceID =
          'B'.repeat(48);
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

    it('.with() re-validates on overrides (zero id rejected)', () => {
      const tx = make();
      expect(() =>
        tx.with({ MPTokenIssuanceID: ZERO_MP_TOKEN_ISSUANCE_ID }),
      ).toThrow(/zero/i);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({ Fee: '12', Sequence: 7 });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'MPTokenIssuanceDestroy',
        Account: ISSUER,
        MPTokenIssuanceID: VALID_MP_TOKEN_ISSUANCE_ID,
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
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
      expect('Flags' in json).toBe(false);
    });

    it('.validate() is a no-op (no throw after construction)', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });
  // ─── Base transaction fields ──────────────────────────────────────────────
  // `MptokenIssuanceDestroyProps` extends `BasePropsFields`, so the seven shared base
  // transaction fields are part of this factory's prop type and are checked
  // by `validateBaseTransaction` at construction.
  describe('BaseTransactionFields', () => {
    // A third valid address, distinct from `Account`, for the Delegate cases.
    const DELEGATE = 'ra5nK24KXen9AHvsdFTKHSANinZseWnPcX';

    const base = {
      Account: ISSUER,
      MPTokenIssuanceID: VALID_MP_TOKEN_ISSUANCE_ID,
    };

    it('accepts a valid Memos array', () => {
      const memos = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
      const tx = mptokenIssuanceDestroy({ ...base, Memos: memos });
      expect(tx.Memos).toEqual(memos);
    });

    it('rejects a malformed Memos value', () => {
      expect(() => mptokenIssuanceDestroy({ ...base, Memos: 'not-an-array' } as any)).toThrow(
        /invalid Memos/,
      );
    });

    it('accepts SourceTag', () => {
      const tx = mptokenIssuanceDestroy({ ...base, SourceTag: 99 });
      expect(tx.SourceTag).toBe(99);
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() => mptokenIssuanceDestroy({ ...base, SourceTag: 'NaN' } as any)).toThrow(
        /SourceTag must be a number/,
      );
    });

    it('accepts LastLedgerSequence', () => {
      const tx = mptokenIssuanceDestroy({ ...base, LastLedgerSequence: 900000 });
      expect(tx.LastLedgerSequence).toBe(900000);
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() =>
        mptokenIssuanceDestroy({ ...base, LastLedgerSequence: 'soon' } as any),
      ).toThrow(/LastLedgerSequence must be a number/);
    });

    it('accepts AccountTxnID', () => {
      const tx = mptokenIssuanceDestroy({ ...base, AccountTxnID: 'ABC123' });
      expect(tx.AccountTxnID).toBe('ABC123');
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() => mptokenIssuanceDestroy({ ...base, AccountTxnID: 42 } as any)).toThrow(
        /AccountTxnID must be a string/,
      );
    });

    it('accepts NetworkID', () => {
      const tx = mptokenIssuanceDestroy({ ...base, NetworkID: 1 });
      expect(tx.NetworkID).toBe(1);
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() => mptokenIssuanceDestroy({ ...base, NetworkID: {} } as any)).toThrow(
        /NetworkID must be a number/,
      );
    });

    it('accepts a distinct Delegate', () => {
      const tx = mptokenIssuanceDestroy({ ...base, Delegate: DELEGATE });
      expect(tx.Delegate).toBe(DELEGATE);
    });

    it('rejects a Delegate that is not a valid account address', () => {
      expect(() =>
        mptokenIssuanceDestroy({ ...base, Delegate: 'not-an-address' } as any),
      ).toThrow(/invalid Delegate/);
    });

    it('rejects Delegate equal to Account', () => {
      expect(() => mptokenIssuanceDestroy({ ...base, Delegate: base.Account })).toThrow(
        /cannot be the same/,
      );
    });

    it('accepts TicketSequence (the field that made tickets unspendable)', () => {
      const tx = mptokenIssuanceDestroy({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.TicketSequence).toBe(42);
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() => mptokenIssuanceDestroy({ ...base, TicketSequence: 'nope' } as any)).toThrow(
        /TicketSequence must be a number/,
      );
    });
  });
});
