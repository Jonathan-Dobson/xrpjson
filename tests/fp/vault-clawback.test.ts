/**
 * Tests for the functional VaultClawback factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, VaultID, Holder).
 *   2. Optional Amount validation (IOU form, MPT form, omitted, NOT XRP).
 *   3. Amount sub-field validation (currency length, hex, issuer, value).
 *   4. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined values).
 *   5. .with() re-validates on overrides.
 */
import { describe, it, expect } from 'vitest';
import { vaultClawback } from '../../src/fp/index.js';

// ─── Test fixtures ───────────────────────────────────────────────────

const ISSUER = 'rXJSJiZMxaLuH3kQBUV5DLipnYtrE6iVb';
const HOLDER = 'rNGHoQwNG753zyfDrib4qDvvswtmV8Es';
const ACCOUNT = ISSUER; // VaultClawback submitter must be the asset issuer.

// 64-character hex vault ID (HASH256).
const VAULT_ID =
  '77D6234D074E505024D39C04C3F262997B773719AB29ACFA83119E4210328776';

const IOU_AMOUNT = {
  currency: 'USD',
  issuer: ISSUER,
  value: '1234',
};

const MPT_AMOUNT = {
  mpt_issuance_id: '00000000000000000000000001',
  value: '500',
};

function make(extras: Record<string, unknown> = {}) {
  return vaultClawback({
    Account: ACCOUNT,
    VaultID: VAULT_ID,
    Holder: HOLDER,
    ...extras,
  });
}

describe('fp/vaultClawback()', () => {
  describe('construction', () => {
    it('constructs with required fields only (Amount omitted)', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('VaultClawback');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.VaultID).toBe(VAULT_ID);
      expect(tx.Holder).toBe(HOLDER);
      expect(tx.Amount).toBeUndefined();
    });

    it('constructs with all base tx fields', () => {
      const tx = vaultClawback({
        Account: ACCOUNT,
        VaultID: VAULT_ID,
        Holder: HOLDER,
        Amount: IOU_AMOUNT,
        Flags: 0,
        Fee: '12',
        Sequence: 8,
      });
      expect(tx.Flags).toBe(0);
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(8);
      expect(tx.Amount).toEqual(IOU_AMOUNT);
    });
  });

  describe('Account validation', () => {
    it('throws when Account is missing', () => {
      expect(() =>
        vaultClawback({
          Account: undefined as never,
          VaultID: VAULT_ID,
          Holder: HOLDER,
        }),
      ).toThrow(/Account/);
    });

    it('throws when Account is invalid', () => {
      expect(() =>
        vaultClawback({
          Account: 'not-an-address',
          VaultID: VAULT_ID,
          Holder: HOLDER,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('VaultID validation', () => {
    it('throws when VaultID is missing', () => {
      expect(() =>
        vaultClawback({
          Account: ACCOUNT,
          VaultID: undefined as never,
          Holder: HOLDER,
        }),
      ).toThrow(/VaultID/);
    });

    it('throws when VaultID is too short', () => {
      expect(() =>
        make({ VaultID: 'ABCDEF1234567890' }), // 16 chars
      ).toThrow(/64-character hex/);
    });

    it('throws when VaultID is too long', () => {
      expect(() =>
        make({ VaultID: 'A'.repeat(66) }),
      ).toThrow(/64-character hex/);
    });

    it('throws when VaultID is non-hex', () => {
      expect(() =>
        make({ VaultID: 'Z'.repeat(64) }),
      ).toThrow(/64-character hex/);
    });

    it('accepts a valid 64-char hex VaultID', () => {
      const tx = make();
      expect(tx.VaultID).toBe(VAULT_ID);
      expect(tx.VaultID.length).toBe(64);
    });
  });

  describe('Holder validation', () => {
    it('throws when Holder is missing', () => {
      expect(() =>
        vaultClawback({
          Account: ACCOUNT,
          VaultID: VAULT_ID,
          Holder: undefined as never,
        }),
      ).toThrow(/Holder/);
    });

    it('throws when Holder is invalid', () => {
      expect(() => make({ Holder: 'bogus' })).toThrow(/Holder/);
    });

    it('accepts a valid Holder', () => {
      const tx = make();
      expect(tx.Holder).toBe(HOLDER);
    });
  });

  describe('Amount validation', () => {
    it('accepts omitted Amount', () => {
      const tx = make();
      expect(tx.Amount).toBeUndefined();
    });

    it('accepts IssuedCurrencyAmount', () => {
      const tx = make({ Amount: IOU_AMOUNT });
      expect(tx.Amount).toEqual(IOU_AMOUNT);
    });

    it('accepts MPTAmount', () => {
      const tx = make({ Amount: MPT_AMOUNT });
      expect(tx.Amount).toEqual(MPT_AMOUNT);
    });

    it('throws when Amount is an XRP string (clawbacks cannot be performed on XRP)', () => {
      expect(() => make({ Amount: '1000000' as never })).toThrow(/NOT XRP/);
    });

    it('throws on malformed Amount object', () => {
      expect(() => make({ Amount: { foo: 'bar' } as never })).toThrow(
        /Amount/,
      );
    });

    it('throws on IssuedCurrencyAmount with bad currency length', () => {
      expect(() =>
        make({
          Amount: {
            currency: 'USDD',
            issuer: ISSUER,
            value: '1',
          },
        }),
      ).toThrow(/currency/);
    });

    it('throws on 40-char hex currency that is not hex', () => {
      expect(() =>
        make({
          Amount: {
            currency: 'Z'.repeat(40),
            issuer: ISSUER,
            value: '1',
          },
        }),
      ).toThrow(/hex/);
    });

    it('accepts 40-char hex currency', () => {
      const hexCcy = '0158415500000000C1F76FFA276C27E60FBC1DAD';
      const tx = make({
        Amount: { currency: hexCcy, issuer: ISSUER, value: '1' },
      });
      expect(tx.Amount).toEqual({
        currency: hexCcy,
        issuer: ISSUER,
        value: '1',
      });
    });

    it('throws on IssuedCurrencyAmount with invalid issuer', () => {
      expect(() =>
        make({
          Amount: { currency: 'USD', issuer: 'bogus', value: '1' },
        }),
      ).toThrow(/issuer/);
    });

    it('throws on IssuedCurrencyAmount with negative value', () => {
      expect(() =>
        make({
          Amount: { currency: 'USD', issuer: ISSUER, value: '-1' },
        }),
      ).toThrow(/value/);
    });

    it('throws on IssuedCurrencyAmount with non-numeric value', () => {
      expect(() =>
        make({
          Amount: { currency: 'USD', issuer: ISSUER, value: 'abc' },
        }),
      ).toThrow(/value/);
    });

    it('throws on MPTAmount with short mpt_issuance_id', () => {
      expect(() =>
        make({
          Amount: { mpt_issuance_id: 'abc', value: '1' },
        }),
      ).toThrow(/mpt_issuance_id/);
    });

    it('throws on MPTAmount with non-hex mpt_issuance_id', () => {
      expect(() =>
        make({
          Amount: {
            mpt_issuance_id: 'ZZZZZZZZZZZZZZZZZZZZZZZZ',
            value: '1',
          },
        }),
      ).toThrow(/mpt_issuance_id/);
    });

    it('throws on MPTAmount with negative value', () => {
      expect(() =>
        make({
          Amount: {
            mpt_issuance_id: '00000000000000000000000001',
            value: '-1',
          },
        }),
      ).toThrow(/value/);
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
        (tx as any).VaultID = 'changed';
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides', () => {
      const tx = make();
      const tx2 = tx.with({ Holder: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe' });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Holder).toBe('rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe');
      expect(tx.Holder).toBe(HOLDER);
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() =>
        tx.with({ VaultID: 'too-short' }),
      ).toThrow(/64-character hex/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({ Amount: IOU_AMOUNT });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'VaultClawback',
        Account: ACCOUNT,
        VaultID: VAULT_ID,
        Holder: HOLDER,
        Amount: IOU_AMOUNT,
      });
    });

    it('.toJSON() skips undefined fields', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('Amount' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Flags' in json).toBe(false);
    });

    it('.validate() is a no-op after successful construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });

  // ─── Base transaction fields ──────────────────────────────────────────────
  // `VaultClawbackProps` now extends `BasePropsFields`, so the seven fields
  // that were previously absent from the prop type are accepted here — and
  // `validateBaseTransaction` checks them. Before this, each of the REJECT
  // cases below built a frozen transaction silently.
  //
  // Note the base is `BasePropsFields` (no index signature) rather than
  // `BaseTransactionFields` — see the doc comment in src/types/base.ts.
  describe('BaseTransactionFields', () => {
    const base = {
      Account: ACCOUNT,
      VaultID: VAULT_ID,
      Holder: HOLDER,
    };

    it('accepts TicketSequence', () => {
      const tx = vaultClawback({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.TicketSequence).toBe(42);
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() =>
        vaultClawback({ ...base, TicketSequence: 'nope' } as any),
      ).toThrow(/TicketSequence must be a number/);
    });

    it('accepts a valid Memos array', () => {
      const memos = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
      const tx = vaultClawback({ ...base, Memos: memos });
      expect(tx.Memos).toEqual(memos);
    });

    it('rejects a malformed Memos value', () => {
      expect(() => vaultClawback({ ...base, Memos: 'not-an-array' } as any)).toThrow(
        /invalid Memos/,
      );
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() => vaultClawback({ ...base, SourceTag: 'NaN' } as any)).toThrow(
        /SourceTag must be a number/,
      );
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() => vaultClawback({ ...base, NetworkID: {} } as any)).toThrow(
        /NetworkID must be a number/,
      );
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() => vaultClawback({ ...base, AccountTxnID: 42 } as any)).toThrow(
        /AccountTxnID must be a string/,
      );
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() =>
        vaultClawback({ ...base, LastLedgerSequence: 'soon' } as any),
      ).toThrow(/LastLedgerSequence must be a number/);
    });

    it('rejects a non-string Fee', () => {
      expect(() => vaultClawback({ ...base, Fee: 12 } as any)).toThrow(
        /Fee must be a string/,
      );
    });

    it('rejects an invalid Delegate address', () => {
      expect(() => vaultClawback({ ...base, Delegate: 'not-an-address' })).toThrow(
        /invalid Delegate/,
      );
    });

    it('accepts a distinct Delegate', () => {
      const tx = vaultClawback({ ...base, Delegate: HOLDER });
      expect(tx.Delegate).toBe(HOLDER);
    });

    it('rejects Delegate equal to Account', () => {
      expect(() => vaultClawback({ ...base, Delegate: ACCOUNT })).toThrow(
        /cannot be the same/,
      );
    });

    it('survives .with() with a base field set', () => {
      const tx = vaultClawback({ ...base, SourceTag: 99 });
      const next = tx.with({ Holder: ISSUER === HOLDER ? ACCOUNT : HOLDER });
      expect(next.SourceTag).toBe(99);
    });
  });
});