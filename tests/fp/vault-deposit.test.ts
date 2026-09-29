/**
 * Tests for the functional VaultDeposit factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, VaultID, Amount) and
 *      all 3 Amount forms (XRP drops, trust line, MPT).
 *   2. Optional field handling (Flags, Fee, Sequence).
 *   3. Spec-mandated guards the class API omits:
 *        a. VaultID must not be all-zeros (XLS-65 §3.5.2.1 check 1).
 *        b. Amount must be strictly positive (XLS-65 §3.5.2.1 check 2).
 *   4. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined fields).
 */
import { describe, it, expect } from 'vitest';
import { vaultDeposit } from '../../src/fp/index.js';

const DEPOSITOR = 'rNGHoQwNG753zyfDrib4qDvvswtmV8Es';
const ISSUER = 'rXJSJiZMxaLuH3kQBUV5DLipnYtrE6iVb';

// 64-char hex non-zero HASH256 ledger entry ID.
const VAULT_ID =
  '77D6234D074E505024D39C04C3F262997B773719AB29ACFA83119E4210328776';
// The spec-reserved all-zeros HASH256.
const VAULT_ID_ZERO =
  '0000000000000000000000000000000000000000000000000000000000000000';

const IOU_AMOUNT = { currency: 'TST', issuer: ISSUER, value: '2.5' };
const MPT_AMOUNT = { mpt_issuance_id: '00000001', value: '100' };

function make(extras: Record<string, unknown> = {}) {
  return vaultDeposit({
    Account: DEPOSITOR,
    VaultID: VAULT_ID,
    Amount: '1000000',
    ...extras,
  });
}

describe('fp/vaultDeposit()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('VaultDeposit');
      expect(tx.Account).toBe(DEPOSITOR);
      expect(tx.VaultID).toBe(VAULT_ID);
      expect(tx.Amount).toBe('1000000');
    });

    it('accepts an XRP (drops) Amount as a positive decimal string', () => {
      const tx = vaultDeposit({
        Account: DEPOSITOR,
        VaultID: VAULT_ID,
        Amount: '1234567',
      });
      expect(tx.Amount).toBe('1234567');
    });

    it('accepts a trust-line IssuedCurrencyAmount', () => {
      const tx = vaultDeposit({
        Account: DEPOSITOR,
        VaultID: VAULT_ID,
        Amount: IOU_AMOUNT,
      });
      expect(tx.Amount).toEqual(IOU_AMOUNT);
    });

    it('accepts an MPTAmount', () => {
      const tx = vaultDeposit({
        Account: DEPOSITOR,
        VaultID: VAULT_ID,
        Amount: MPT_AMOUNT,
      });
      expect(tx.Amount).toEqual(MPT_AMOUNT);
    });

    it('passes through optional Fee/Sequence/Flags', () => {
      const tx = vaultDeposit({
        Account: DEPOSITOR,
        VaultID: VAULT_ID,
        Amount: '1000',
        Flags: 0,
        Fee: '12',
        Sequence: 8,
      });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(8);
      expect(tx.Flags).toBe(0);
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        vaultDeposit({
          Account: '' as never,
          VaultID: VAULT_ID,
          Amount: '1000',
        }),
      ).toThrow(/Account/);
    });
  });

  describe('VaultID validation', () => {
    it('throws on missing VaultID', () => {
      expect(() =>
        vaultDeposit({
          Account: DEPOSITOR,
          VaultID: '' as never,
          Amount: '1000',
        }),
      ).toThrow(/VaultID/);
    });

    it('throws on non-hex VaultID', () => {
      expect(() =>
        vaultDeposit({
          Account: DEPOSITOR,
          VaultID: 'Z'.repeat(64),
          Amount: '1000',
        }),
      ).toThrow(/VaultID/);
    });

    it('throws on VaultID of wrong length', () => {
      expect(() =>
        vaultDeposit({
          Account: DEPOSITOR,
          VaultID: 'AB',
          Amount: '1000',
        }),
      ).toThrow(/VaultID/);
    });

    it('throws on the all-zeros HASH256 VaultID (XLS-65 §3.5.2.1 check 1)', () => {
      expect(() =>
        vaultDeposit({
          Account: DEPOSITOR,
          VaultID: VAULT_ID_ZERO,
          Amount: '1000',
        }),
      ).toThrow(/all-zeros/);
    });
  });

  describe('Amount validation', () => {
    it('throws on missing Amount', () => {
      expect(() =>
        vaultDeposit({
          Account: DEPOSITOR,
          VaultID: VAULT_ID,
          Amount: undefined as never,
        }),
      ).toThrow(/Amount/);
    });

    it('throws on a malformed Amount (not an Amount form)', () => {
      expect(() =>
        vaultDeposit({
          Account: DEPOSITOR,
          VaultID: VAULT_ID,
          Amount: 123 as never,
        }),
      ).toThrow(/Amount/);
    });

    it('throws on a zero XRP drops Amount (XLS-65 §3.5.2.1 check 2)', () => {
      expect(() =>
        vaultDeposit({
          Account: DEPOSITOR,
          VaultID: VAULT_ID,
          Amount: '0',
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on a negative XRP drops Amount (XLS-65 §3.5.2.1 check 2)', () => {
      expect(() =>
        vaultDeposit({
          Account: DEPOSITOR,
          VaultID: VAULT_ID,
          Amount: '-1',
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on a zero IOU value Amount', () => {
      expect(() =>
        vaultDeposit({
          Account: DEPOSITOR,
          VaultID: VAULT_ID,
          Amount: { currency: 'TST', issuer: ISSUER, value: '0' },
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on a negative IOU value Amount', () => {
      expect(() =>
        vaultDeposit({
          Account: DEPOSITOR,
          VaultID: VAULT_ID,
          Amount: { currency: 'TST', issuer: ISSUER, value: '-2.5' },
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on a zero MPT value Amount', () => {
      expect(() =>
        vaultDeposit({
          Account: DEPOSITOR,
          VaultID: VAULT_ID,
          Amount: { mpt_issuance_id: '00000001', value: '0' },
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on a negative MPT value Amount', () => {
      expect(() =>
        vaultDeposit({
          Account: DEPOSITOR,
          VaultID: VAULT_ID,
          Amount: { mpt_issuance_id: '00000001', value: '-100' },
        }),
      ).toThrow(/strictly positive/);
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
        (tx as unknown as Record<string, unknown>).VaultID = 'deadbeef';
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      const tx = make();
      const tx2 = tx.with({ Amount: '2000000' });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Amount).toBe('2000000');
      expect(tx.Amount).toBe('1000000');
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() => tx.with({ VaultID: VAULT_ID_ZERO })).toThrow(/all-zeros/);
      expect(() => tx.with({ Amount: '0' })).toThrow(/strictly positive/);
      expect(() => tx.with({ VaultID: 'short' })).toThrow(/VaultID/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = vaultDeposit({
        Account: DEPOSITOR,
        VaultID: VAULT_ID,
        Amount: '5000000',
        Fee: '12',
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'VaultDeposit',
        Account: DEPOSITOR,
        VaultID: VAULT_ID,
        Amount: '5000000',
        Fee: '12',
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

    it('.validate() is a no-op after construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });
});