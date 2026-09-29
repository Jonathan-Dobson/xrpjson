/**
 * Tests for the functional VaultSet factory.
 *
 * Validates:
 *   1. Construction with required Account + VaultID + at least one of
 *      Data/AssetsMaximum/DomainID.
 *   2. Optional field handling (Data, AssetsMaximum, DomainID, Flags,
 *      Fee, Sequence).
 *   3. Spec-mandated guards the class API omits:
 *        a. VaultID must not be all-zeros (XLS-65 §3.3.2.1 check 1).
 *        b. At least one mutable field must be provided (XLS-65 §3.3.2.1
 *           check 4).
 *        c. Data must be non-empty (XLS-65 §3.3.2.1 check 2).
 *        d. DomainID all-zeros is accepted to mean "remove DomainID"
 *           (XLS-65 §3.3.3 state change 3).
 *   4. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined fields).
 */
import { describe, it, expect } from 'vitest';
import { vaultSet } from '../../src/fp/index.js';

const OWNER = 'rNGHoQwNG753zyfDrib4qDvvswtmV8Es';

// 64-char hex non-zero HASH256 ledger entry ID.
const VAULT_ID =
  '77D6234D074E505024D39C04C3F262997B773719AB29ACFA83119E4210328776';
// 64-char hex non-zero HASH256 (used as DomainID elsewhere in tests).
const DOMAIN_ID =
  'A730EB18A9D4BB52502C898589558B4CCEB4BE10044500EE5581137A2E80E849';
// The spec-reserved all-zeros HASH256.
const HASH256_ZERO =
  '0000000000000000000000000000000000000000000000000000000000000000';

function make(extras: Record<string, unknown> = {}) {
  return vaultSet({
    Account: OWNER,
    VaultID: VAULT_ID,
    Data: '5661756C74206D65746164617461', // "Vault metadata"
    ...extras,
  });
}

describe('fp/vaultSet()', () => {
  describe('construction', () => {
    it('constructs with Account + VaultID + Data', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('VaultSet');
      expect(tx.Account).toBe(OWNER);
      expect(tx.VaultID).toBe(VAULT_ID);
      expect(tx.Data).toBe('5661756C74206D65746164617461');
    });

    it('constructs with only AssetsMaximum supplied', () => {
      const tx = vaultSet({
        Account: OWNER,
        VaultID: VAULT_ID,
        AssetsMaximum: '5000000',
      });
      expect(tx.AssetsMaximum).toBe('5000000');
      expect(tx.Data).toBeUndefined();
      expect(tx.DomainID).toBeUndefined();
    });

    it('constructs with only DomainID supplied', () => {
      const tx = vaultSet({
        Account: OWNER,
        VaultID: VAULT_ID,
        DomainID: DOMAIN_ID,
      });
      expect(tx.DomainID).toBe(DOMAIN_ID);
      expect(tx.Data).toBeUndefined();
      expect(tx.AssetsMaximum).toBeUndefined();
    });

    it('passes through optional Fee/Sequence/Flags', () => {
      const tx = vaultSet({
        Account: OWNER,
        VaultID: VAULT_ID,
        Data: 'AB',
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
        vaultSet({
          Account: '' as never,
          VaultID: VAULT_ID,
          Data: 'AB',
        }),
      ).toThrow(/Account/);
    });
  });

  describe('VaultID validation', () => {
    it('throws on missing VaultID', () => {
      expect(() =>
        vaultSet({
          Account: OWNER,
          VaultID: '' as never,
          Data: 'AB',
        }),
      ).toThrow(/VaultID/);
    });

    it('throws on non-hex VaultID', () => {
      expect(() =>
        vaultSet({
          Account: OWNER,
          VaultID: 'Z'.repeat(64),
          Data: 'AB',
        }),
      ).toThrow(/VaultID/);
    });

    it('throws on VaultID of wrong length', () => {
      expect(() =>
        vaultSet({
          Account: OWNER,
          VaultID: 'AB',
          Data: 'AB',
        }),
      ).toThrow(/VaultID/);
    });

    it('throws on the all-zeros HASH256 VaultID (XLS-65 §3.3.2.1 check 1)', () => {
      expect(() =>
        vaultSet({
          Account: OWNER,
          VaultID: HASH256_ZERO,
          Data: 'AB',
        }),
      ).toThrow(/all-zeros/);
    });
  });

  describe('at-least-one-mutable-field rule', () => {
    it('throws when Data, AssetsMaximum, DomainID are all absent (XLS-65 §3.3.2.1 check 4)', () => {
      expect(() =>
        vaultSet({ Account: OWNER, VaultID: VAULT_ID }),
      ).toThrow(/at least one of/);
    });

    it('accepts a tx that supplies only Data', () => {
      const tx = vaultSet({
        Account: OWNER,
        VaultID: VAULT_ID,
        Data: 'AB',
      });
      expect(tx.Data).toBe('AB');
    });

    it('accepts a tx that supplies only AssetsMaximum', () => {
      const tx = vaultSet({
        Account: OWNER,
        VaultID: VAULT_ID,
        AssetsMaximum: '1000',
      });
      expect(tx.AssetsMaximum).toBe('1000');
    });

    it('accepts a tx that supplies only DomainID', () => {
      const tx = vaultSet({
        Account: OWNER,
        VaultID: VAULT_ID,
        DomainID: DOMAIN_ID,
      });
      expect(tx.DomainID).toBe(DOMAIN_ID);
    });
  });

  describe('Data validation', () => {
    it('throws on non-hex Data', () => {
      expect(() =>
        vaultSet({
          Account: OWNER,
          VaultID: VAULT_ID,
          Data: 'not-hex!',
        }),
      ).toThrow(/Data/);
    });

    it('throws on empty Data (XLS-65 §3.3.2.1 check 2)', () => {
      expect(() =>
        vaultSet({
          Account: OWNER,
          VaultID: VAULT_ID,
          Data: '',
        }),
      ).toThrow(/Data/);
    });

    it('throws on odd-length hex Data', () => {
      expect(() =>
        vaultSet({
          Account: OWNER,
          VaultID: VAULT_ID,
          Data: 'ABC',
        }),
      ).toThrow(/even/);
    });

    it('throws on Data > 256 bytes', () => {
      const huge = 'A'.repeat(514); // 514 hex chars = 257 bytes
      expect(() =>
        vaultSet({
          Account: OWNER,
          VaultID: VAULT_ID,
          Data: huge,
        }),
      ).toThrow(/256/);
    });

    it('accepts Data at exactly 256 bytes', () => {
      const ok = 'A'.repeat(512); // 512 hex chars = 256 bytes
      const tx = vaultSet({
        Account: OWNER,
        VaultID: VAULT_ID,
        Data: ok,
      });
      expect(tx.Data).toBe(ok);
    });

    it('accepts Data of exactly 1 byte', () => {
      const tx = vaultSet({
        Account: OWNER,
        VaultID: VAULT_ID,
        Data: 'FF',
      });
      expect(tx.Data).toBe('FF');
    });
  });

  describe('AssetsMaximum validation', () => {
    it('throws on negative AssetsMaximum (XLS-65 §3.3.2.1 check 3)', () => {
      expect(() =>
        vaultSet({
          Account: OWNER,
          VaultID: VAULT_ID,
          AssetsMaximum: '-1',
        }),
      ).toThrow(/AssetsMaximum/);
    });

    it('throws on non-numeric AssetsMaximum', () => {
      expect(() =>
        vaultSet({
          Account: OWNER,
          VaultID: VAULT_ID,
          AssetsMaximum: 'abc',
        }),
      ).toThrow(/AssetsMaximum/);
    });

    it('throws on decimal AssetsMaximum', () => {
      expect(() =>
        vaultSet({
          Account: OWNER,
          VaultID: VAULT_ID,
          AssetsMaximum: '1.5',
        }),
      ).toThrow(/AssetsMaximum/);
    });

    it('accepts AssetsMaximum = "0" (special meaning per spec)', () => {
      const tx = vaultSet({
        Account: OWNER,
        VaultID: VAULT_ID,
        AssetsMaximum: '0',
      });
      expect(tx.AssetsMaximum).toBe('0');
    });

    it('accepts AssetsMaximum = "1000000"', () => {
      const tx = vaultSet({
        Account: OWNER,
        VaultID: VAULT_ID,
        AssetsMaximum: '1000000',
      });
      expect(tx.AssetsMaximum).toBe('1000000');
    });
  });

  describe('DomainID validation', () => {
    it('throws on non-hex DomainID', () => {
      expect(() =>
        vaultSet({
          Account: OWNER,
          VaultID: VAULT_ID,
          DomainID: 'not-hex',
        }),
      ).toThrow(/DomainID/);
    });

    it('throws on DomainID of wrong length', () => {
      expect(() =>
        vaultSet({
          Account: OWNER,
          VaultID: VAULT_ID,
          DomainID: 'AB',
        }),
      ).toThrow(/DomainID/);
    });

    it('throws on non-string DomainID', () => {
      expect(() =>
        vaultSet({
          Account: OWNER,
          VaultID: VAULT_ID,
          DomainID: 1234 as never,
        }),
      ).toThrow(/DomainID/);
    });

    it('accepts a 64-char hex DomainID', () => {
      const tx = vaultSet({
        Account: OWNER,
        VaultID: VAULT_ID,
        DomainID: DOMAIN_ID,
      });
      expect(tx.DomainID).toBe(DOMAIN_ID);
    });

    it('accepts the all-zeros DomainID to remove any existing DomainID (XLS-65 §3.3.3 state change 3)', () => {
      const tx = vaultSet({
        Account: OWNER,
        VaultID: VAULT_ID,
        DomainID: HASH256_ZERO,
      });
      expect(tx.DomainID).toBe(HASH256_ZERO);
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
      const tx2 = tx.with({ Data: '00' });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Data).toBe('00');
      expect(tx.Data).toBe('5661756C74206D65746164617461');
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() => tx.with({ VaultID: HASH256_ZERO })).toThrow(/all-zeros/);
      expect(() => tx.with({ Data: 'not-hex' })).toThrow(/Data/);
      expect(() => tx.with({ AssetsMaximum: '-1' })).toThrow(/AssetsMaximum/);
      // Overriding Data to undefined strips every mutable field and must
      // therefore fail the at-least-one check on re-validation.
      expect(() => tx.with({ Data: undefined })).toThrow(
        /at least one of/,
      );
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = vaultSet({
        Account: OWNER,
        VaultID: VAULT_ID,
        Data: 'AB',
        AssetsMaximum: '500',
        Fee: '12',
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'VaultSet',
        Account: OWNER,
        VaultID: VAULT_ID,
        Data: 'AB',
        AssetsMaximum: '500',
        Fee: '12',
      });
    });

    it('.toJSON() skips undefined fields and methods', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('AssetsMaximum' in json).toBe(false);
      expect('DomainID' in json).toBe(false);
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