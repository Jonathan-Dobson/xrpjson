/**
 * Tests for the functional PermissionedDomainSet factory.
 *
 * Validates:
 *   1. Construction with required AcceptedCredentials (1+ entries).
 *   2. Optional DomainID validation (64-char hex, non-zero).
 *   3. Per-entry validation of AuthorizeCredential (CredentialType hex,
 *      non-empty, even-length, ≤ 64 bytes).
 *   4. List-level rules: non-empty, max 10, no duplicates.
 *   5. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined values).
 *   6. Factory-only rules not enforced by the class API (see Divergences
 *      in the factory header).
 */
import { describe, it, expect } from 'vitest';
import { permissionedDomainSet } from '../../src/fp/factories/permissioned-domain-set.js';

const OWNER = 'rfmDuhDyLGgx94qiwf3YF8BUV5j6KSvE8';
const ISSUER_A = 'ra5nK24KXen9AHvsdFTKHSANinZseWnPcX';
const ISSUER_B = 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH';
const VALID_DOMAIN_ID =
  'D88930B33C2B6831660BFD006D91FF100011AD4E67CBB78B460AF0A215103737';
const ZERO_DOMAIN_ID = '0'.repeat(64);
const SAMPLE_CRED_TYPE = '6D795F63726564656E7469616C'; // hex for "my_credential"

function make(
  extras: Partial<{
    Account: string;
    DomainID: string;
    AcceptedCredentials: ReturnType<typeof cred>[];
  }> = {},
) {
  return permissionedDomainSet({
    Account: extras.Account ?? OWNER,
    AcceptedCredentials:
      extras.AcceptedCredentials ?? [cred({ Issuer: ISSUER_A })],
    ...(extras.DomainID !== undefined ? { DomainID: extras.DomainID } : {}),
  });
}

function cred(args: {
  Issuer?: string;
  CredentialType?: string;
}): {
  Credential: { Issuer: string; CredentialType: string };
} {
  return {
    Credential: {
      Issuer: args.Issuer ?? ISSUER_A,
      CredentialType: args.CredentialType ?? SAMPLE_CRED_TYPE,
    },
  };
}

describe('fp/permissionedDomainSet()', () => {
  describe('construction', () => {
    it('constructs with required AcceptedCredentials', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('PermissionedDomainSet');
      expect(tx.Account).toBe(OWNER);
      expect(tx.AcceptedCredentials).toHaveLength(1);
      expect(tx.AcceptedCredentials[0]).toEqual(cred({}));
      expect(tx.DomainID).toBeUndefined();
    });

    it('accepts optional DomainID', () => {
      const tx = make({ DomainID: VALID_DOMAIN_ID });
      expect(tx.DomainID).toBe(VALID_DOMAIN_ID);
    });

    it('accepts up to 10 unique credentials', () => {
      const list = Array.from({ length: 10 }, (_, i) =>
        cred({
          Issuer: i % 2 === 0 ? ISSUER_A : ISSUER_B,
          // Pad to 2 hex chars per index so each entry is unique.
          CredentialType: (i + 1).toString(16).padStart(2, '0'),
        }),
      );
      const tx = permissionedDomainSet({
        Account: OWNER,
        AcceptedCredentials: list,
      });
      expect(tx.AcceptedCredentials).toHaveLength(10);
    });

    it('accepts every spec field together', () => {
      const tx = permissionedDomainSet({
        Account: OWNER,
        DomainID: VALID_DOMAIN_ID,
        AcceptedCredentials: [cred({})],
        Fee: '10',
        Sequence: 390,
      });
      expect(tx.Fee).toBe('10');
      expect(tx.Sequence).toBe(390);
    });
  });

  describe('Account validation', () => {
    it('throws when Account is missing', () => {
      expect(() =>
        permissionedDomainSet({
          Account: undefined as unknown as string,
          AcceptedCredentials: [cred({})],
        }),
      ).toThrow(/Account is required/);
    });

    it('throws when Account is empty', () => {
      expect(() =>
        permissionedDomainSet({
          Account: '',
          AcceptedCredentials: [cred({})],
        }),
      ).toThrow(/Account is required/);
    });
  });

  describe('DomainID validation', () => {
    it('throws when DomainID is not hex', () => {
      expect(() => make({ DomainID: 'not-hex!' })).toThrow(/DomainID/);
    });

    it('throws when DomainID is too short', () => {
      expect(() => make({ DomainID: 'AB' })).toThrow(/DomainID/);
    });

    it('throws when DomainID is too long', () => {
      expect(() => make({ DomainID: 'A'.repeat(66) })).toThrow(/DomainID/);
    });

    it('throws when DomainID is a non-string', () => {
      expect(() =>
        make({ DomainID: 12345 as unknown as string }),
      ).toThrow(/DomainID/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws when DomainID is all-zero', () => {
      expect(() => make({ DomainID: ZERO_DOMAIN_ID })).toThrow(/zero/);
    });
  });

  describe('AcceptedCredentials list validation', () => {
    // ── Factory-only divergence: class marks it optional ──
    it('throws when AcceptedCredentials is missing (XLS-0080 §3.1)', () => {
      expect(() =>
        permissionedDomainSet({
          Account: OWNER,
          AcceptedCredentials: undefined as unknown as never,
        }),
      ).toThrow(/AcceptedCredentials is required/);
    });

    it('throws when AcceptedCredentials is not an array', () => {
      expect(() =>
        permissionedDomainSet({
          Account: OWNER,
          AcceptedCredentials: 'not-an-array' as unknown as never,
        }),
      ).toThrow(/AcceptedCredentials must be an array/);
    });

    // ── Factory-only divergence: class accepts empty array ──
    it('throws on empty array (XLS-0080 §6 invariant 2)', () => {
      expect(() =>
        permissionedDomainSet({
          Account: OWNER,
          AcceptedCredentials: [],
        }),
      ).toThrow(/cannot be an empty array/);
    });

    // ── Factory-only divergence: class has no max-length check ──
    it('throws on > 10 entries (XLS-0080 §3.2)', () => {
      const list = Array.from({ length: 11 }, (_, i) =>
        cred({ CredentialType: i.toString(16).padStart(2, '0') }),
      );
      expect(() =>
        permissionedDomainSet({ Account: OWNER, AcceptedCredentials: list }),
      ).toThrow(/cannot exceed 10/);
    });

    // ── Factory-only divergence: class has no dedupe check ──
    it('throws on duplicate (Issuer, CredentialType) entries', () => {
      expect(() =>
        permissionedDomainSet({
          Account: OWNER,
          AcceptedCredentials: [cred({}), cred({})],
        }),
      ).toThrow(/cannot contain duplicate/);
    });
  });

  describe('AcceptedCredentials entry validation', () => {
    // ── Factory-only divergence: class accepts any unknown[] shape ──
    it('throws when an entry is not an object', () => {
      expect(() =>
        permissionedDomainSet({
          Account: OWNER,
          AcceptedCredentials: ['plain-string' as unknown as never],
        }),
      ).toThrow(/AuthorizeCredential/);
    });

    it('throws when an entry lacks the Credential wrapper', () => {
      expect(() =>
        permissionedDomainSet({
          Account: OWNER,
          AcceptedCredentials: [
            { Issuer: ISSUER_A, CredentialType: SAMPLE_CRED_TYPE } as unknown as never,
          ],
        }),
      ).toThrow(/AuthorizeCredential/);
    });

    it('throws when CredentialType is missing', () => {
      expect(() =>
        permissionedDomainSet({
          Account: OWNER,
          AcceptedCredentials: [
            { Credential: { Issuer: ISSUER_A } } as unknown as never,
          ],
        }),
      ).toThrow(/AuthorizeCredential/);
    });

    it('throws when CredentialType is empty (XLS-0070 §2.1.3)', () => {
      expect(() =>
        permissionedDomainSet({
          Account: OWNER,
          AcceptedCredentials: [cred({ CredentialType: '' })],
        }),
      ).toThrow(/must not be empty/);
    });

    it('throws when CredentialType is non-hex', () => {
      expect(() =>
        permissionedDomainSet({
          Account: OWNER,
          AcceptedCredentials: [cred({ CredentialType: 'zzzz' })],
        }),
      ).toThrow(/hex/);
    });

    it('throws when CredentialType has odd length', () => {
      expect(() =>
        permissionedDomainSet({
          Account: OWNER,
          AcceptedCredentials: [cred({ CredentialType: 'ABC' })],
        }),
      ).toThrow(/even/);
    });

    // ── Factory-only divergence: class has no CredentialType length check ──
    it('throws when CredentialType exceeds 64 bytes (XLS-0070 §2.1.3)', () => {
      const tooLong = 'A'.repeat(130); // 130 hex chars = 65 bytes
      expect(() =>
        permissionedDomainSet({
          Account: OWNER,
          AcceptedCredentials: [cred({ CredentialType: tooLong })],
        }),
      ).toThrow(/64 bytes/);
    });

    it('accepts CredentialType at exactly 64 bytes (XLS-0070 §2.1.3)', () => {
      const ok = 'A'.repeat(128); // 128 hex chars = 64 bytes
      const tx = permissionedDomainSet({
        Account: OWNER,
        AcceptedCredentials: [cred({ CredentialType: ok })],
      });
      expect(tx.AcceptedCredentials[0]?.Credential.CredentialType).toBe(ok);
    });

    it('accepts CredentialType at 1 byte (smallest non-empty)', () => {
      const tx = permissionedDomainSet({
        Account: OWNER,
        AcceptedCredentials: [cred({ CredentialType: '41' })],
      });
      expect(tx.AcceptedCredentials[0]?.Credential.CredentialType).toBe('41');
    });

    it('throws on first invalid entry even with later valid entries', () => {
      expect(() =>
        permissionedDomainSet({
          Account: OWNER,
          AcceptedCredentials: [cred({}), cred({ CredentialType: '' })],
        }),
      ).toThrow(/must not be empty/);
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
        (tx as unknown as Record<string, unknown>).Account = 'x';
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides', () => {
      const tx = make();
      const tx2 = tx.with({ DomainID: VALID_DOMAIN_ID });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.DomainID).toBe(VALID_DOMAIN_ID);
      expect(tx.DomainID).toBeUndefined();
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() => tx.with({ DomainID: 'short' })).toThrow(/DomainID/);
      expect(() => tx.with({ DomainID: ZERO_DOMAIN_ID })).toThrow(/zero/);
      expect(() => tx.with({ AcceptedCredentials: [] })).toThrow(
        /cannot be an empty array/,
      );
      expect(() =>
        tx.with({ AcceptedCredentials: [cred({ CredentialType: 'zzzz' })] }),
      ).toThrow(/hex/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({ DomainID: VALID_DOMAIN_ID });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'PermissionedDomainSet',
        Account: OWNER,
        DomainID: VALID_DOMAIN_ID,
        AcceptedCredentials: [cred({})],
      });
    });

    it('.toJSON() skips undefined fields', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('DomainID' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });
  });
});
