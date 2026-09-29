/**
 * Tests for the functional VaultWithdraw factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, VaultID, Amount) and
 *      all 3 Amount forms (XRP drops, trust line, MPT).
 *   2. Optional fields (Destination, DestinationTag, CredentialIDs).
 *   3. Spec-mandated guards the class API omits:
 *        a. VaultID must not be all-zeros (XLS-65 §3.6.2.1 check 1).
 *        b. Amount must be strictly positive (XLS-65 §3.6.2.1 check 2).
 *        c. Destination must not be all-zeros AccountID (XLS-65 §3.6.2.1
 *           check 3) — covered implicitly because the all-zeros 40-char
 *           hex string fails `isAccount` (no `r…` / `X…` prefix).
 *        d. CredentialIDs length in [1, 8] (xrpl.js MAX_AUTHORIZED_CREDENTIALS).
 *   4. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined fields).
 */
import { describe, it, expect } from 'vitest';
import { vaultWithdraw } from '../../src/fp/index.js';

// ─── Test fixtures ───────────────────────────────────────────────────

const ACCOUNT = 'rGFBE8WA2ZKfqGGB7CFkLusVt7hsVT4r8H';
const DESTINATION = 'rXJSJiZMxaLuH3kQBUV5DLipnYtrE6iVb';
const ISSUER = 'rXJSJiZMxaLuH3kQBUV5DLipnYtrE6iVb';

// 64-char hex non-zero HASH256 vault ID.
const VAULT_ID =
  '77D6234D074E505024D39C04C3F262997B773719AB29ACFA83119E4210328776';
// The spec-reserved all-zeros HASH256.
const VAULT_ID_ZERO =
  '0000000000000000000000000000000000000000000000000000000000000000';
// The spec-reserved all-zeros AccountID.
const ACCOUNT_ID_ZERO = '0000000000000000000000000000000000000000';

const IOU_AMOUNT = { currency: 'USD', issuer: ISSUER, value: '50' };
const MPT_AMOUNT = {
  mpt_issuance_id: '00000000000000000000000001',
  value: '500',
};

const VALID_CREDENTIAL_ID =
  'A7B7B3ED3F5BD8E58C9064278EB29519CD6475D87A4517707DE108E65AE9C08C';

function make(extras: Record<string, unknown> = {}) {
  return vaultWithdraw({
    Account: ACCOUNT,
    VaultID: VAULT_ID,
    Amount: '1000000',
    ...extras,
  });
}

describe('fp/vaultWithdraw()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('VaultWithdraw');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.VaultID).toBe(VAULT_ID);
      expect(tx.Amount).toBe('1000000');
      expect(tx.Destination).toBeUndefined();
      expect(tx.DestinationTag).toBeUndefined();
      expect(tx.CredentialIDs).toBeUndefined();
    });

    it('accepts an XRP (drops) Amount as a positive decimal string', () => {
      const tx = vaultWithdraw({
        Account: ACCOUNT,
        VaultID: VAULT_ID,
        Amount: '1234567',
      });
      expect(tx.Amount).toBe('1234567');
    });

    it('accepts a trust-line IssuedCurrencyAmount', () => {
      const tx = vaultWithdraw({
        Account: ACCOUNT,
        VaultID: VAULT_ID,
        Amount: IOU_AMOUNT,
      });
      expect(tx.Amount).toEqual(IOU_AMOUNT);
    });

    it('accepts an MPTAmount', () => {
      const tx = vaultWithdraw({
        Account: ACCOUNT,
        VaultID: VAULT_ID,
        Amount: MPT_AMOUNT,
      });
      expect(tx.Amount).toEqual(MPT_AMOUNT);
    });

    it('passes through optional Fee/Sequence/Flags', () => {
      const tx = vaultWithdraw({
        Account: ACCOUNT,
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

    it('accepts a Destination and DestinationTag', () => {
      const tx = vaultWithdraw({
        Account: ACCOUNT,
        VaultID: VAULT_ID,
        Amount: '100',
        Destination: DESTINATION,
        DestinationTag: 42,
      });
      expect(tx.Destination).toBe(DESTINATION);
      expect(tx.DestinationTag).toBe(42);
    });

    it('accepts CredentialIDs array', () => {
      const tx = vaultWithdraw({
        Account: ACCOUNT,
        VaultID: VAULT_ID,
        Amount: '100',
        CredentialIDs: [VALID_CREDENTIAL_ID],
      });
      expect(tx.CredentialIDs).toEqual([VALID_CREDENTIAL_ID]);
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        vaultWithdraw({
          Account: undefined as never,
          VaultID: VAULT_ID,
          Amount: '1000',
        }),
      ).toThrow(/Account/);
    });

    it('throws on invalid Account', () => {
      expect(() =>
        vaultWithdraw({
          Account: 'not-an-address',
          VaultID: VAULT_ID,
          Amount: '1000',
        }),
      ).toThrow(/Account/);
    });
  });

  describe('VaultID validation', () => {
    it('throws on missing VaultID', () => {
      expect(() =>
        vaultWithdraw({
          Account: ACCOUNT,
          VaultID: undefined as never,
          Amount: '1000',
        }),
      ).toThrow(/VaultID/);
    });

    it('throws on non-hex VaultID', () => {
      expect(() =>
        vaultWithdraw({
          Account: ACCOUNT,
          VaultID: 'Z'.repeat(64),
          Amount: '1000',
        }),
      ).toThrow(/VaultID/);
    });

    it('throws on VaultID of wrong length', () => {
      expect(() =>
        vaultWithdraw({
          Account: ACCOUNT,
          VaultID: 'AB',
          Amount: '1000',
        }),
      ).toThrow(/VaultID/);
    });

    it('throws on the all-zeros HASH256 VaultID (XLS-65 §3.6.2.1 check 1)', () => {
      expect(() =>
        vaultWithdraw({
          Account: ACCOUNT,
          VaultID: VAULT_ID_ZERO,
          Amount: '1000',
        }),
      ).toThrow(/all-zeros/);
    });
  });

  describe('Amount validation', () => {
    it('throws on missing Amount', () => {
      expect(() =>
        vaultWithdraw({
          Account: ACCOUNT,
          VaultID: VAULT_ID,
          Amount: undefined as never,
        }),
      ).toThrow(/Amount/);
    });

    it('throws on a malformed Amount (not an Amount form)', () => {
      expect(() =>
        vaultWithdraw({
          Account: ACCOUNT,
          VaultID: VAULT_ID,
          Amount: 123 as never,
        }),
      ).toThrow(/Amount/);
    });

    it('throws on a zero XRP drops Amount (XLS-65 §3.6.2.1 check 2)', () => {
      expect(() =>
        vaultWithdraw({
          Account: ACCOUNT,
          VaultID: VAULT_ID,
          Amount: '0',
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on a negative XRP drops Amount (XLS-65 §3.6.2.1 check 2)', () => {
      expect(() =>
        vaultWithdraw({
          Account: ACCOUNT,
          VaultID: VAULT_ID,
          Amount: '-1',
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on a zero IOU value Amount', () => {
      expect(() =>
        vaultWithdraw({
          Account: ACCOUNT,
          VaultID: VAULT_ID,
          Amount: { currency: 'USD', issuer: ISSUER, value: '0' },
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on a negative IOU value Amount', () => {
      expect(() =>
        vaultWithdraw({
          Account: ACCOUNT,
          VaultID: VAULT_ID,
          Amount: { currency: 'USD', issuer: ISSUER, value: '-2.5' },
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on a zero MPT value Amount', () => {
      expect(() =>
        vaultWithdraw({
          Account: ACCOUNT,
          VaultID: VAULT_ID,
          Amount: { mpt_issuance_id: '00000001', value: '0' },
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on a negative MPT value Amount', () => {
      expect(() =>
        vaultWithdraw({
          Account: ACCOUNT,
          VaultID: VAULT_ID,
          Amount: { mpt_issuance_id: '00000001', value: '-100' },
        }),
      ).toThrow(/strictly positive/);
    });
  });

  describe('Destination validation', () => {
    it('throws on an invalid Destination', () => {
      expect(() =>
        vaultWithdraw({
          Account: ACCOUNT,
          VaultID: VAULT_ID,
          Amount: '100',
          Destination: 'bogus',
        }),
      ).toThrow(/Destination/);
    });

    it('rejects the all-zeros AccountID Destination (implicit via isAccount, XLS-65 §3.6.2.1 check 3)', () => {
      // The all-zeros 40-char hex string is not a valid XRPL classic
      // address (no `r…` prefix), so isAccount rejects it. This satisfies
      // the XLS check "Destination is zero" at the JSON layer.
      expect(() =>
        vaultWithdraw({
          Account: ACCOUNT,
          VaultID: VAULT_ID,
          Amount: '100',
          Destination: ACCOUNT_ID_ZERO,
        }),
      ).toThrow(/valid XRPL account/);
    });

    it('accepts a self-Destination (sender == destination)', () => {
      const tx = vaultWithdraw({
        Account: ACCOUNT,
        VaultID: VAULT_ID,
        Amount: '100',
        Destination: ACCOUNT,
      });
      expect(tx.Destination).toBe(ACCOUNT);
    });
  });

  describe('DestinationTag validation', () => {
    it('throws on a non-number DestinationTag', () => {
      expect(() =>
        vaultWithdraw({
          Account: ACCOUNT,
          VaultID: VAULT_ID,
          Amount: '100',
          DestinationTag: '42' as never,
        }),
      ).toThrow(/DestinationTag/);
    });

    it('accepts an integer DestinationTag', () => {
      const tx = vaultWithdraw({
        Account: ACCOUNT,
        VaultID: VAULT_ID,
        Amount: '100',
        DestinationTag: 42,
      });
      expect(tx.DestinationTag).toBe(42);
    });
  });

  describe('CredentialIDs validation', () => {
    it('throws when CredentialIDs is not an array', () => {
      expect(() =>
        vaultWithdraw({
          Account: ACCOUNT,
          VaultID: VAULT_ID,
          Amount: '100',
          CredentialIDs: 'not-an-array' as never,
        }),
      ).toThrow(/CredentialIDs/);
    });

    it('throws when CredentialIDs is empty (xrpl.js validateCredentialsList)', () => {
      expect(() =>
        vaultWithdraw({
          Account: ACCOUNT,
          VaultID: VAULT_ID,
          Amount: '100',
          CredentialIDs: [],
        }),
      ).toThrow(/empty array/);
    });

    it('throws when CredentialIDs exceeds MAX_AUTHORIZED_CREDENTIALS (8)', () => {
      const ids = Array(9).fill(VALID_CREDENTIAL_ID);
      expect(() =>
        vaultWithdraw({
          Account: ACCOUNT,
          VaultID: VAULT_ID,
          Amount: '100',
          CredentialIDs: ids,
        }),
      ).toThrow(/cannot exceed 8/);
    });

    it('accepts CredentialIDs at the MAX_AUTHORIZED_CREDENTIALS (8) boundary', () => {
      const ids = Array(8).fill(VALID_CREDENTIAL_ID);
      const tx = vaultWithdraw({
        Account: ACCOUNT,
        VaultID: VAULT_ID,
        Amount: '100',
        CredentialIDs: ids,
      });
      expect(tx.CredentialIDs?.length).toBe(8);
    });

    it('throws when a CredentialID is the wrong length', () => {
      expect(() =>
        vaultWithdraw({
          Account: ACCOUNT,
          VaultID: VAULT_ID,
          Amount: '100',
          CredentialIDs: ['short'],
        }),
      ).toThrow(/64-character hex/);
    });

    it('throws when a CredentialID is non-hex', () => {
      expect(() =>
        vaultWithdraw({
          Account: ACCOUNT,
          VaultID: VAULT_ID,
          Amount: '100',
          CredentialIDs: ['Z'.repeat(64)],
        }),
      ).toThrow(/64-character hex/);
    });

    it('includes the index in the per-entry error message', () => {
      expect(() =>
        vaultWithdraw({
          Account: ACCOUNT,
          VaultID: VAULT_ID,
          Amount: '100',
          CredentialIDs: [VALID_CREDENTIAL_ID, 'bogus'],
        }),
      ).toThrow(/CredentialIDs\[1\]/);
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

    it('.with() re-validates on overrides (all-zeros VaultID)', () => {
      const tx = make();
      expect(() => tx.with({ VaultID: VAULT_ID_ZERO })).toThrow(/all-zeros/);
    });

    it('.with() re-validates on overrides (zero Amount)', () => {
      const tx = make();
      expect(() => tx.with({ Amount: '0' })).toThrow(/strictly positive/);
    });

    it('.with() re-validates on overrides (short VaultID)', () => {
      const tx = make();
      expect(() => tx.with({ VaultID: 'short' })).toThrow(/VaultID/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = vaultWithdraw({
        Account: ACCOUNT,
        VaultID: VAULT_ID,
        Amount: '5000000',
        Destination: DESTINATION,
        DestinationTag: 7,
        Fee: '12',
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'VaultWithdraw',
        Account: ACCOUNT,
        VaultID: VAULT_ID,
        Amount: '5000000',
        Destination: DESTINATION,
        DestinationTag: 7,
        Fee: '12',
      });
    });

    it('.toJSON() skips undefined fields and methods', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('Destination' in json).toBe(false);
      expect('DestinationTag' in json).toBe(false);
      expect('CredentialIDs' in json).toBe(false);
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
