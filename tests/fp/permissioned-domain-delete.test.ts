/**
 * Tests for the functional PermissionedDomainDelete factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, DomainID).
 *   2. DomainID validation: 64-char hex.
 *   3. Account validation: well-formed XRPL classic/X-address (strict,
 *      matches xrpl.js `isAccount`; stricter than the class API's
 *      `isString(Account)` deferred check).
 *   4. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined values).
 *   5. No Flags field — per xrpl-dev-portal docs there are no flags
 *      defined for PermissionedDomainDelete transactions.
 *
 * Imports the factory directly from its file rather than via `src/fp/
 * index.ts` because the parent integrates the export line separately.
 */
import { describe, it, expect } from 'vitest';
import { permissionedDomainDelete } from '../../src/fp/factories/permissioned-domain-delete.js';

const ACCOUNT = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

// 64-char hex ledger entry ID, non-zero.
const DOMAIN_ID =
  'A730EB18A9D4BB52502C898589558B4CCEB4BE10044500EE5581137A2E80E849';

function make(extras: Record<string, unknown> = {}) {
  return permissionedDomainDelete({
    Account: ACCOUNT,
    DomainID: DOMAIN_ID,
    ...extras,
  });
}

describe('fp/permissionedDomainDelete()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('PermissionedDomainDelete');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.DomainID).toBe(DOMAIN_ID);
      expect(tx.Fee).toBeUndefined();
      expect(tx.Sequence).toBeUndefined();
    });

    it('accepts every spec field together', () => {
      const tx = permissionedDomainDelete({
        Account: ACCOUNT,
        DomainID: DOMAIN_ID,
        Fee: '12',
        Sequence: 392,
      });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(392);
    });

    it('exposes no Flags field on the tx object', () => {
      // Per xrpl-dev-portal docs: "There are no flags defined for
      // PermissionedDomainDelete transactions."
      const tx = make();
      expect(tx.Flags).toBeUndefined();
      expect('Flags' in tx).toBe(false);
    });

    it('accepts mixed-case hex DomainID', () => {
      const mixed =
        'aBcDeF1234567890ABCDEF1234567890ABCDEF1234567890abcdef1234567890';
      const tx = permissionedDomainDelete({
        Account: ACCOUNT,
        DomainID: mixed,
      });
      expect(tx.DomainID.toLowerCase()).toBe(
        'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      );
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        permissionedDomainDelete({
          Account: '',
          DomainID: DOMAIN_ID,
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      // Factory uses `isAccount` (strict XRPL address regex), which is
      // stricter than the class API's deferred `isString(Account)` check.
      expect(() =>
        permissionedDomainDelete({
          Account: 'not-an-account',
          DomainID: DOMAIN_ID,
        }),
      ).toThrow(/Account/);
    });

    it('throws on non-string Account', () => {
      expect(() =>
        permissionedDomainDelete({
          Account: 12345 as unknown as string,
          DomainID: DOMAIN_ID,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('DomainID validation', () => {
    it('throws on missing DomainID', () => {
      expect(() =>
        permissionedDomainDelete({
          Account: ACCOUNT,
          DomainID: '' as never,
        }),
      ).toThrow(/DomainID/);
    });

    it('throws on non-hex DomainID', () => {
      expect(() =>
        permissionedDomainDelete({
          Account: ACCOUNT,
          DomainID: 'NOTHEX',
        }),
      ).toThrow(/DomainID/);
    });

    it('throws on DomainID with non-hex characters at full length', () => {
      // 64 chars but contains 'Z', which is not hex.
      expect(() =>
        permissionedDomainDelete({
          Account: ACCOUNT,
          DomainID: 'Z'.repeat(64),
        }),
      ).toThrow(/DomainID/);
    });

    it('throws on too-short DomainID', () => {
      expect(() =>
        permissionedDomainDelete({
          Account: ACCOUNT,
          DomainID: 'AB',
        }),
      ).toThrow(/DomainID/);
    });

    it('throws on too-long DomainID', () => {
      expect(() =>
        permissionedDomainDelete({
          Account: ACCOUNT,
          DomainID: 'A'.repeat(66),
        }),
      ).toThrow(/DomainID/);
    });

    it('throws on non-string DomainID', () => {
      expect(() =>
        permissionedDomainDelete({
          Account: ACCOUNT,
          DomainID: 12345 as unknown as string,
        }),
      ).toThrow(/DomainID/);
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
        (tx as unknown as Record<string, unknown>).DomainID =
          'A'.repeat(64);
      }).toThrow(TypeError);
    });

    it('mutation throws when overwriting Account', () => {
      const tx = make();
      expect(() => {
        (tx as unknown as Record<string, unknown>).Account =
          'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
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

    it('.with() re-validates DomainID on overrides', () => {
      const tx = make();
      expect(() => tx.with({ DomainID: 'short' })).toThrow(/DomainID/);
      expect(() => tx.with({ DomainID: 'NOTHEX' })).toThrow(/DomainID/);
    });

    it('.with() re-validates Account on overrides', () => {
      const tx = make();
      expect(() => tx.with({ Account: 'garbage' })).toThrow(/Account/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = permissionedDomainDelete({
        Account: ACCOUNT,
        DomainID: DOMAIN_ID,
        Fee: '10',
        Sequence: 392,
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'PermissionedDomainDelete',
        Account: ACCOUNT,
        DomainID: DOMAIN_ID,
        Fee: '10',
        Sequence: 392,
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
});
