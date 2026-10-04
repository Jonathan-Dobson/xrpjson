/**
 * Tests for the functional VaultDelete factory.
 *
 * Validates:
 *   1. Construction with required VaultID.
 *   2. Optional MemoData validation (hex, non-empty, even-length, ≤ 256 bytes).
 *   3. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined values).
 *   4. Factory-only rules not enforced by the class API:
 *      - all-zero VaultID rejected
 *      - empty MemoData rejected
 */
import { describe, it, expect } from 'vitest';
import { vaultDelete } from '../../src/fp/index.js';

const OWNER = 'rfmDuhDyLGgx94qiwf3YF8BUV5j6KSvE8';
const VALID_VAULT_ID =
  '77D6234D074E505024D39C04C3F262997B773719AB29ACFA83119E4210328776';
const ZERO_VAULT_ID = '0'.repeat(64);

function make(extras: Record<string, unknown> = {}) {
  return vaultDelete({
    Account: OWNER,
    VaultID: VALID_VAULT_ID,
    ...extras,
  });
}

describe('fp/vaultDelete()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('VaultDelete');
      expect(tx.Account).toBe(OWNER);
      expect(tx.VaultID).toBe(VALID_VAULT_ID);
      expect(tx.MemoData).toBeUndefined();
    });

    it('accepts MemoData with valid hex', () => {
      const tx = make({ MemoData: '77696E642D646F776E' });
      expect(tx.MemoData).toBe('77696E642D646F776E');
    });

    it('accepts every spec field together', () => {
      const tx = vaultDelete({
        Account: OWNER,
        VaultID: VALID_VAULT_ID,
        MemoData: '77696E642D646F776E20636F6D706C65746564',
        Fee: '12',
        Sequence: 8,
      });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(8);
      expect(tx.MemoData).toBe('77696E642D646F776E20636F6D706C65746564');
    });
  });

  describe('Account validation', () => {
    it('throws when Account is missing', () => {
      expect(() =>
        vaultDelete({
          Account: undefined as unknown as string,
          VaultID: VALID_VAULT_ID,
        }),
      ).toThrow(/Account is required/);
    });
  });

  describe('VaultID validation', () => {
    it('throws when VaultID is missing', () => {
      expect(() =>
        vaultDelete({
          Account: OWNER,
          VaultID: undefined as unknown as string,
        }),
      ).toThrow(/VaultID/);
    });

    it('throws when VaultID is not hex', () => {
      expect(() => make({ VaultID: 'not-hex!' })).toThrow(/VaultID/);
    });

    it('throws when VaultID is too short', () => {
      expect(() => make({ VaultID: 'AB' })).toThrow(/VaultID/);
    });

    it('throws when VaultID is too long', () => {
      expect(() => make({ VaultID: 'A'.repeat(66) })).toThrow(/VaultID/);
    });

    it('throws when VaultID is a non-string', () => {
      expect(() =>
        make({ VaultID: 12345 as unknown as string }),
      ).toThrow(/VaultID/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws when VaultID is all-zero (XLS-0065 §3.4.2.1 #1)', () => {
      expect(() => make({ VaultID: ZERO_VAULT_ID })).toThrow(/zero/);
    });
  });

  describe('MemoData validation', () => {
    it('throws on non-hex MemoData', () => {
      expect(() => make({ MemoData: 'zznothex' })).toThrow(/MemoData/);
    });

    it('throws on non-string MemoData', () => {
      expect(() => make({ MemoData: 123 as unknown as string })).toThrow(
        /MemoData/,
      );
    });

    it('throws on odd-length hex MemoData', () => {
      expect(() => make({ MemoData: 'ABC' })).toThrow(/even/);
    });

    it('throws on MemoData > 256 bytes', () => {
      const huge = 'A'.repeat(514); // 514 hex chars = 257 bytes
      expect(() => make({ MemoData: huge })).toThrow(/256/);
    });

    it('accepts MemoData at exactly 256 bytes', () => {
      const ok = 'A'.repeat(512); // 512 hex chars = 256 bytes
      const tx = make({ MemoData: ok });
      expect(tx.MemoData).toBe(ok);
    });

    it('accepts MemoData at 1 byte (smallest non-empty)', () => {
      const ok = '41'; // 'A' = 0x41
      const tx = make({ MemoData: ok });
      expect(tx.MemoData).toBe(ok);
    });

    // ── Factory-only divergence from the class API ──
    it('throws on empty MemoData (XLS-0065 §3.4.2.1 #3)', () => {
      expect(() => make({ MemoData: '' })).toThrow(/must not be empty/);
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
        (tx as unknown as Record<string, unknown>).VaultID = 'x';
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides', () => {
      const tx = make();
      const tx2 = tx.with({ MemoData: '41' });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.MemoData).toBe('41');
      expect(tx.MemoData).toBeUndefined();
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() => tx.with({ VaultID: 'short' })).toThrow(/VaultID/);
      expect(() => tx.with({ VaultID: ZERO_VAULT_ID })).toThrow(/zero/);
      expect(() => tx.with({ MemoData: '' })).toThrow(/must not be empty/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({ MemoData: '41' });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'VaultDelete',
        Account: OWNER,
        VaultID: VALID_VAULT_ID,
        MemoData: '41',
      });
    });

    it('.toJSON() skips undefined fields', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('MemoData' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });
  });

  // ─── Base transaction fields ──────────────────────────────────────────────
  // `VaultDeleteProps` extends `BasePropsFields`, so the seven shared base
  // fields are part of this props type: Memos, SourceTag, LastLedgerSequence,
  // AccountTxnID, NetworkID, Delegate and TicketSequence.
  //
  // The factory now CALLS `validateBaseTransaction` as its last check before
  // `buildFrozenTx`, so both directions below are real runtime behaviour: the
  // accept cases must survive the validator, and the reject cases assert the
  // validator's own messages from src/validation/base.ts. Bad values are cast
  // `as any` deliberately — the point is the runtime check, and a type error
  // would make the tests uncompilable.
  describe('BaseTransactionFields', () => {
    const base = { Account: OWNER, VaultID: VALID_VAULT_ID };
    const MEMOS = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
    const TXN_ID = 'AB'.repeat(32);
    const DELEGATE = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';

    it('accepts Memos', () => {
      const tx = vaultDelete({ ...base, Memos: MEMOS });
      expect(tx.Memos).toEqual(MEMOS);
      expect(tx.toJSON().Memos).toEqual(MEMOS);
    });

    it('accepts SourceTag', () => {
      const tx = vaultDelete({ ...base, SourceTag: 99 });
      expect(tx.SourceTag).toBe(99);
    });

    it('accepts LastLedgerSequence', () => {
      const tx = vaultDelete({ ...base, LastLedgerSequence: 1_000_000 });
      expect(tx.LastLedgerSequence).toBe(1_000_000);
    });

    it('accepts AccountTxnID', () => {
      const tx = vaultDelete({ ...base, AccountTxnID: TXN_ID });
      expect(tx.AccountTxnID).toBe(TXN_ID);
    });

    it('accepts NetworkID', () => {
      const tx = vaultDelete({ ...base, NetworkID: 1 });
      expect(tx.NetworkID).toBe(1);
    });

    it('accepts a Delegate distinct from Account', () => {
      const tx = vaultDelete({ ...base, Delegate: DELEGATE });
      expect(tx.Delegate).toBe(DELEGATE);
    });

    it('accepts TicketSequence alongside Sequence: 0', () => {
      const tx = vaultDelete({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.TicketSequence).toBe(42);
    });

    // ─── Reject side ───

    it('rejects a malformed Memos value', () => {
      expect(() => vaultDelete({ ...base, Memos: 'not-an-array' } as any)).toThrow(
        /invalid Memos/,
      );
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() => vaultDelete({ ...base, SourceTag: 'NaN' } as any)).toThrow(
        /SourceTag must be a number/,
      );
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() =>
        vaultDelete({ ...base, LastLedgerSequence: 'soon' } as any),
      ).toThrow(/LastLedgerSequence must be a number/);
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() => vaultDelete({ ...base, AccountTxnID: 12345 } as any)).toThrow(
        /AccountTxnID must be a string/,
      );
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() => vaultDelete({ ...base, NetworkID: {} } as any)).toThrow(
        /NetworkID must be a number/,
      );
    });

    it('rejects a Delegate that is not a valid address', () => {
      expect(() =>
        vaultDelete({ ...base, Delegate: 'not-an-address' } as any),
      ).toThrow(/invalid Delegate/);
    });

    it('rejects a Delegate equal to Account', () => {
      expect(() => vaultDelete({ ...base, Delegate: base.Account })).toThrow(
        /cannot be the same/,
      );
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() => vaultDelete({ ...base, TicketSequence: 'nope' } as any)).toThrow(
        /TicketSequence must be a number/,
      );
    });

    it('rejects a non-string Fee', () => {
      expect(() => vaultDelete({ ...base, Fee: 12 } as any)).toThrow(
        /Fee must be a string/,
      );
    });

    it('still checks VaultID before the shared base fields', () => {
      // Ordering check: a factory-specific mistake still produces the
      // factory's own message, not the base validator's backstop message.
      expect(() =>
        vaultDelete({
          ...base,
          VaultID: ZERO_VAULT_ID,
          SourceTag: 'NaN',
        } as any),
      ).toThrow(/VaultID/);
    });

    it('survives .with() with a base field set', () => {
      const tx = vaultDelete({ ...base, SourceTag: 7 });
      const next = tx.with({ Fee: '20' });
      expect(next.SourceTag).toBe(7);
    });
  });
});