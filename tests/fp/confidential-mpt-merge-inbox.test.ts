/**
 * Tests for the functional ConfidentialMptMergeInbox factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, MPTokenIssuanceID).
 *   2. Account validation (classic address, X-address, missing, malformed).
 *   3. MPTokenIssuanceID validation: 48-char hex (UInt192), missing,
 *      wrong length, non-hex.
 *   4. Frozen-shape contract (frozen object, mutation throws,
 *      .with() returns a new frozen object, .toJSON() strips methods
 *      and undefined fields).
 *   5. .with() re-validates on overrides.
 */
import { describe, it, expect } from 'vitest';
import { confidentialMptMergeInbox } from '../../src/fp/factories/confidential-mpt-merge-inbox.js';

// ─── Test fixtures ───────────────────────────────────────────────────

const ACCOUNT = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

// 48-character hex MPT issuance ID (UInt192).
// Same fixture xrpl.js uses in `tests/confidential/mergeInbox.test.ts`.
const MPT_ID = 'AB'.repeat(24);

// An obviously-not-issuer MPTokenIssuanceID for the lender / holder
// account above — first 8 hex chars are the sequence number, last 40
// are the issuer AccountID hex form. We do not decode it; the factory
// only checks structural well-formedness.
const MPT_ID_ALT =
  '003CE807D39D78123FFBDD9401BEC038D88BD328AC353B9C'; // 48 chars

function make(extras: Record<string, unknown> = {}) {
  return confidentialMptMergeInbox({
    Account: ACCOUNT,
    MPTokenIssuanceID: MPT_ID,
    ...extras,
  });
}

describe('fp/confidentialMptMergeInbox()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('ConfidentialMPTMergeInbox');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.MPTokenIssuanceID).toBe(MPT_ID);
      expect(tx.Fee).toBeUndefined();
      expect(tx.Sequence).toBeUndefined();
    });

    it('constructs with base-tx fields (Fee, Sequence)', () => {
      const tx = confidentialMptMergeInbox({
        Account: ACCOUNT,
        MPTokenIssuanceID: MPT_ID,
        Fee: '100',
        Sequence: 42,
      });
      expect(tx.Fee).toBe('100');
      expect(tx.Sequence).toBe(42);
    });

    it('exposes no Flags field (ConfidentialMPTMergeInbox has no per-tx flags)', () => {
      // XLS-0096 §10.2 defines no `Flags` field for this tx type.
      const tx = make();
      expect(tx.Flags).toBeUndefined();
      expect('Flags' in tx).toBe(false);
    });

    it('accepts lowercase hex MPTokenIssuanceID', () => {
      const tx = confidentialMptMergeInbox({
        Account: ACCOUNT,
        MPTokenIssuanceID: MPT_ID.toLowerCase(),
      });
      expect(tx.MPTokenIssuanceID).toBe(MPT_ID.toLowerCase());
    });

    it('accepts mixed-case hex MPTokenIssuanceID', () => {
      const tx = confidentialMptMergeInbox({
        Account: ACCOUNT,
        MPTokenIssuanceID:
          '003CE807d39d78123ffbdd9401BEC038D88BD328AC353b9c',
      });
      expect(tx.MPTokenIssuanceID.length).toBe(48);
    });

    it('accepts an X-address Account', () => {
      const tx = confidentialMptMergeInbox({
        Account:
          'X7Acg9t9WtR2Y4HXUsScrU5KhH4PmgBxX3RcL8soFpPJz8X',
        MPTokenIssuanceID: MPT_ID,
      });
      expect(tx.Account).toBe(
        'X7Acg9t9WtR2Y4HXUsScrU5KhH4PmgBxX3RcL8soFpPJz8X',
      );
    });
  });

  describe('Account validation', () => {
    it('throws when Account is missing (empty string)', () => {
      expect(() =>
        confidentialMptMergeInbox({
          Account: '',
          MPTokenIssuanceID: MPT_ID,
        }),
      ).toThrow(/Account/);
    });

    it('throws when Account is undefined', () => {
      expect(() =>
        confidentialMptMergeInbox({
          Account: undefined as never,
          MPTokenIssuanceID: MPT_ID,
        }),
      ).toThrow(/Account/);
    });

    it('throws when Account is malformed', () => {
      expect(() =>
        confidentialMptMergeInbox({
          Account: 'not-an-address',
          MPTokenIssuanceID: MPT_ID,
        }),
      ).toThrow(/Account/);
    });

    it('throws when Account is the wrong shape (hex string, not classic address)', () => {
      expect(() =>
        confidentialMptMergeInbox({
          Account: 'a'.repeat(40), // looks like an AccountID but not a classic address
          MPTokenIssuanceID: MPT_ID,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('MPTokenIssuanceID validation', () => {
    it('throws when MPTokenIssuanceID is missing (empty string)', () => {
      expect(() =>
        confidentialMptMergeInbox({
          Account: ACCOUNT,
          MPTokenIssuanceID: '',
        }),
      ).toThrow(/MPTokenIssuanceID/);
    });

    it('throws when MPTokenIssuanceID is undefined', () => {
      expect(() =>
        confidentialMptMergeInbox({
          Account: ACCOUNT,
          MPTokenIssuanceID: undefined as never,
        }),
      ).toThrow(/MPTokenIssuanceID/);
    });

    it('throws when MPTokenIssuanceID is too short (47 hex chars)', () => {
      expect(() =>
        confidentialMptMergeInbox({
          Account: ACCOUNT,
          MPTokenIssuanceID: 'AB'.repeat(23) + 'A', // 47 chars
        }),
      ).toThrow(/48-character hex/);
    });

    it('throws when MPTokenIssuanceID is too long (49 hex chars)', () => {
      expect(() =>
        confidentialMptMergeInbox({
          Account: ACCOUNT,
          MPTokenIssuanceID: 'AB'.repeat(24) + 'A', // 49 chars
        }),
      ).toThrow(/48-character hex/);
    });

    it('throws when MPTokenIssuanceID is non-hex', () => {
      expect(() =>
        confidentialMptMergeInbox({
          Account: ACCOUNT,
          MPTokenIssuanceID: 'Z'.repeat(48),
        }),
      ).toThrow(/48-character hex/);
    });

    it('throws when MPTokenIssuanceID is the wrong length and non-hex (combined failure)', () => {
      expect(() =>
        confidentialMptMergeInbox({
          Account: ACCOUNT,
          MPTokenIssuanceID: 'not-hex-at-all',
        }),
      ).toThrow(/48-character hex/);
    });

    it('throws when MPTokenIssuanceID is a number, not a string', () => {
      expect(() =>
        confidentialMptMergeInbox({
          Account: ACCOUNT,
          MPTokenIssuanceID: 12345 as never,
        }),
      ).toThrow(/MPTokenIssuanceID/);
    });

    it('accepts a 48-char hex MPTokenIssuanceID matching the spec example', () => {
      const tx = confidentialMptMergeInbox({
        Account: ACCOUNT,
        MPTokenIssuanceID: MPT_ID_ALT,
      });
      expect(tx.MPTokenIssuanceID).toBe(MPT_ID_ALT);
      expect(tx.MPTokenIssuanceID.length).toBe(48);
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
          'CD'.repeat(24);
      }).toThrow(TypeError);
    });

    it('mutation throws when overwriting Account too', () => {
      const tx = make();
      expect(() => {
        (tx as unknown as Record<string, unknown>).Account =
          'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
      }).toThrow(TypeError);
    });

    it('mutation throws when attempting to assign to TransactionType', () => {
      const tx = make();
      expect(() => {
        (tx as unknown as Record<string, unknown>).TransactionType = 'Payment';
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

    it('.with() preserves unchanged fields', () => {
      const tx = make({ Fee: '15', Sequence: 7 });
      const tx2 = tx.with({ Fee: '30' });
      expect(tx2.Account).toBe(ACCOUNT);
      expect(tx2.MPTokenIssuanceID).toBe(MPT_ID);
      expect(tx2.Sequence).toBe(7);
      expect(tx2.Fee).toBe('30');
    });

    it('.with() re-validates on overrides (Account)', () => {
      const tx = make();
      expect(() => tx.with({ Account: 'garbage' })).toThrow(/Account/);
    });

    it('.with() re-validates on overrides (MPTokenIssuanceID)', () => {
      const tx = make();
      expect(() => tx.with({ MPTokenIssuanceID: 'too-short' })).toThrow(
        /48-character hex/,
      );
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = confidentialMptMergeInbox({
        Account: ACCOUNT,
        MPTokenIssuanceID: MPT_ID,
        Fee: '15',
        Sequence: 7,
      });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'ConfidentialMPTMergeInbox',
        Account: ACCOUNT,
        MPTokenIssuanceID: MPT_ID,
        Fee: '15',
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

    it('.validate() is a no-op after successful construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });

    it('exposes exactly three methods: validate, toJSON, with', () => {
      const tx = make();
      const methodNames = Object.keys(tx).filter(
        (k) => typeof (tx as unknown as Record<string, unknown>)[k] === 'function',
      );
      expect(methodNames.sort()).toEqual(['toJSON', 'validate', 'with']);
    });
  });

  // ─── Base transaction fields ──────────────────────────────────────────────
  // `ConfidentialMptMergeInboxProps` now extends `BasePropsFields`, so the
  // seven shared base fields that were previously absent from this factory's
  // prop type — Memos, SourceTag, LastLedgerSequence, AccountTxnID, NetworkID,
  // Delegate and TicketSequence — are part of the type surface and survive onto
  // the frozen transaction.
  //
  // Every value below is chosen to be VALID under `validateBaseTransaction`
  // (src/validation/base.ts), so this block stays green once that call is
  // added. The reject-side assertions are deliberately NOT here yet: unlike
  // payment.ts, this factory does not call `validateBaseTransaction`, so those
  // validator messages are never reached. Adding the call is a runtime change
  // and is out of scope for this type-only conversion.
  describe('BaseTransactionFields', () => {
    const base = {
      Account: ACCOUNT,
      MPTokenIssuanceID: MPT_ID,
    };
    const MEMOS = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
    const TXN_ID = 'AB'.repeat(32);
    // A valid classic address distinct from ACCOUNT.
    const DELEGATE = 'rWYkbWkCeg8dP6rXALnjgZSjjLyih5NXm';

    it('accepts Memos', () => {
      const tx = confidentialMptMergeInbox({ ...base, Memos: MEMOS });
      expect(tx.Memos).toEqual(MEMOS);
      expect(tx.toJSON().Memos).toEqual(MEMOS);
    });

    it('accepts SourceTag', () => {
      const tx = confidentialMptMergeInbox({ ...base, SourceTag: 99 });
      expect(tx.SourceTag).toBe(99);
      expect(tx.toJSON().SourceTag).toBe(99);
    });

    it('accepts LastLedgerSequence', () => {
      const tx = confidentialMptMergeInbox({ ...base, LastLedgerSequence: 1_000_000 });
      expect(tx.LastLedgerSequence).toBe(1_000_000);
      expect(tx.toJSON().LastLedgerSequence).toBe(1_000_000);
    });

    it('accepts AccountTxnID', () => {
      const tx = confidentialMptMergeInbox({ ...base, AccountTxnID: TXN_ID });
      expect(tx.AccountTxnID).toBe(TXN_ID);
      expect(tx.toJSON().AccountTxnID).toBe(TXN_ID);
    });

    it('accepts NetworkID', () => {
      const tx = confidentialMptMergeInbox({ ...base, NetworkID: 1 });
      expect(tx.NetworkID).toBe(1);
      expect(tx.toJSON().NetworkID).toBe(1);
    });

    it('accepts a Delegate distinct from Account', () => {
      const tx = confidentialMptMergeInbox({ ...base, Delegate: DELEGATE });
      expect(tx.Delegate).toBe(DELEGATE);
      expect(tx.toJSON().Delegate).toBe(DELEGATE);
    });

    it('accepts TicketSequence alongside Sequence: 0', () => {
      const tx = confidentialMptMergeInbox({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.TicketSequence).toBe(42);
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    // ── Reject side ── the runtime backstop. Before the
    // `validateBaseTransaction` call landed, every case below built a frozen
    // transaction silently. The bad values are cast `as any` on purpose: the
    // point under test is the runtime check, and a type error would make the
    // test uncompilable.
    it('rejects a malformed Memos value', () => {
      expect(() => confidentialMptMergeInbox({ ...base, Memos: 'not-an-array' } as any)).toThrow(/invalid Memos/);
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() => confidentialMptMergeInbox({ ...base, SourceTag: 'NaN' } as any)).toThrow(
        /SourceTag must be a number/,
      );
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() => confidentialMptMergeInbox({ ...base, LastLedgerSequence: 'soon' } as any)).toThrow(
        /LastLedgerSequence must be a number/,
      );
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() => confidentialMptMergeInbox({ ...base, AccountTxnID: 99 } as any)).toThrow(
        /AccountTxnID must be a string/,
      );
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() => confidentialMptMergeInbox({ ...base, NetworkID: {} } as any)).toThrow(/NetworkID must be a number/);
    });

    it('rejects a Delegate that is not a valid address', () => {
      expect(() => confidentialMptMergeInbox({ ...base, Delegate: 'not-an-address' } as any)).toThrow(
        /invalid Delegate/,
      );
    });

    it('rejects a Delegate equal to Account', () => {
      expect(() => confidentialMptMergeInbox({ ...base, Delegate: ACCOUNT })).toThrow(/cannot be the same/);
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() => confidentialMptMergeInbox({ ...base, TicketSequence: 'nope' } as any)).toThrow(
        /TicketSequence must be a number/,
      );
    });

    it('rejects a non-string Fee', () => {
      expect(() => confidentialMptMergeInbox({ ...base, Fee: 12 } as any)).toThrow(/Fee must be a string/);
    });
  });
});