/**
 * Tests for the functional AccountDelete factory.
 *
 * Validates:
 *   1. Construction with required Account + Destination.
 *   2. Optional DestinationTag bounds (UInt32).
 *   3. temDST_IS_SRC rejection.
 *   4. Optional CredentialIDs bounds (1–8 entries, 64-char hex, no dups).
 *   5. Frozen-shape contract (mutation throws, .with() returns a new
 *      frozen object, .toJSON() strips methods and undefined values).
 */
import { describe, it, expect } from 'vitest';
import { accountDelete } from '../../src/fp/factories/account-delete.js';

const ACCOUNT = 'rfmDuhDyLGgx94qiwf3YF8BUV5j6KSvE8';
const DESTINATION = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
const VALID_CREDENTIAL_ID =
  'EA85602C1B41F6F1F5E83C0E6B87142FB8957BD209469E4CC347BA2D0C26F66A';

function make(extras: Record<string, unknown> = {}) {
  return accountDelete({
    Account: ACCOUNT,
    Destination: DESTINATION,
    ...extras,
  });
}

describe('fp/accountDelete()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('AccountDelete');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.Destination).toBe(DESTINATION);
      expect(tx.DestinationTag).toBeUndefined();
      expect(tx.CredentialIDs).toBeUndefined();
    });

    it('accepts DestinationTag', () => {
      const tx = make({ DestinationTag: 13 });
      expect(tx.DestinationTag).toBe(13);
    });

    it('accepts DestinationTag = 0 (UInt32 lower bound, not undefined)', () => {
      const tx = make({ DestinationTag: 0 });
      expect(tx.DestinationTag).toBe(0);
    });

    it('accepts DestinationTag at the UInt32 upper bound (0xFFFFFFFF)', () => {
      const tx = make({ DestinationTag: 0xffffffff });
      expect(tx.DestinationTag).toBe(0xffffffff);
    });

    it('accepts CredentialIDs array', () => {
      const tx = make({ CredentialIDs: [VALID_CREDENTIAL_ID] });
      expect(tx.CredentialIDs).toEqual([VALID_CREDENTIAL_ID]);
    });

    it('accepts every spec field together', () => {
      const tx = accountDelete({
        Account: ACCOUNT,
        Destination: DESTINATION,
        DestinationTag: 13,
        CredentialIDs: [VALID_CREDENTIAL_ID],
        Fee: '5000000',
        Sequence: 2470665,
      });
      expect(tx.Fee).toBe('5000000');
      expect(tx.Sequence).toBe(2470665);
      expect(tx.DestinationTag).toBe(13);
      expect(tx.CredentialIDs).toEqual([VALID_CREDENTIAL_ID]);
    });
  });

  describe('Account validation', () => {
    it('throws when Account is missing', () => {
      expect(() =>
        accountDelete({
          Account: undefined as unknown as string,
          Destination: DESTINATION,
        }),
      ).toThrow(/Account is required/);
    });

    it('throws when Account is not a valid XRPL address', () => {
      expect(() =>
        accountDelete({
          Account: 'not-an-address',
          Destination: DESTINATION,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('Destination validation', () => {
    it('throws when Destination is missing', () => {
      expect(() =>
        accountDelete({
          Account: ACCOUNT,
          Destination: undefined as unknown as string,
        }),
      ).toThrow(/Destination is required/);
    });

    it('throws when Destination is not a valid XRPL address', () => {
      expect(() =>
        accountDelete({
          Account: ACCOUNT,
          Destination: 'not-an-address',
        }),
      ).toThrow(/Destination/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws when Destination equals Account (temDST_IS_SRC)', () => {
      expect(() =>
        accountDelete({
          Account: ACCOUNT,
          Destination: ACCOUNT,
        }),
      ).toThrow(/temDST_IS_SRC|Destination must not equal Account/);
    });
  });

  describe('DestinationTag validation', () => {
    it('throws when DestinationTag is a non-number', () => {
      expect(() =>
        make({ DestinationTag: 'gvftyujnbv' as unknown as number }),
      ).toThrow(/DestinationTag/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws on non-integer DestinationTag', () => {
      expect(() => make({ DestinationTag: 13.5 })).toThrow(/DestinationTag/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws on negative DestinationTag', () => {
      expect(() => make({ DestinationTag: -1 })).toThrow(/DestinationTag/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws on DestinationTag > 0xFFFFFFFF', () => {
      expect(() => make({ DestinationTag: 0x100000000 })).toThrow(
        /DestinationTag/,
      );
    });
  });

  describe('CredentialIDs validation', () => {
    it('throws when CredentialIDs is not an array', () => {
      expect(() =>
        make({ CredentialIDs: VALID_CREDENTIAL_ID as unknown as string[] }),
      ).toThrow(/CredentialIDs/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws when CredentialIDs is empty (xrpl.js validateCredentialsList)', () => {
      expect(() => make({ CredentialIDs: [] })).toThrow(/empty array/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws when CredentialIDs exceeds MAX_AUTHORIZED_CREDENTIALS (8)', () => {
      const ids = Array(9).fill(VALID_CREDENTIAL_ID);
      expect(() => make({ CredentialIDs: ids })).toThrow(/cannot exceed 8/);
    });

    it('accepts CredentialIDs at the MAX_AUTHORIZED_CREDENTIALS (8) boundary', () => {
      // 8 distinct 64-char hex IDs (last char cycled).
      const ids = Array.from({ length: 8 }, (_, i) =>
        (VALID_CREDENTIAL_ID.slice(0, 63) + i.toString(16).toUpperCase()),
      );
      const tx = make({ CredentialIDs: ids });
      expect(tx.CredentialIDs?.length).toBe(8);
    });

    // ── Factory-only divergence from the class API ──
    it('throws when a CredentialID is the wrong length', () => {
      expect(() => make({ CredentialIDs: ['short'] })).toThrow(
        /64-character hex/,
      );
    });

    // ── Factory-only divergence from the class API ──
    it('throws when a CredentialID is non-hex', () => {
      expect(() => make({ CredentialIDs: ['Z'.repeat(64)] })).toThrow(
        /64-character hex/,
      );
    });

    it('includes the index in the per-entry error message', () => {
      expect(() =>
        make({ CredentialIDs: [VALID_CREDENTIAL_ID, 'bogus'] }),
      ).toThrow(/CredentialIDs\[1\]/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws when CredentialIDs contains a duplicate (xrpl.js validateCredentialsList)', () => {
      expect(() =>
        make({
          CredentialIDs: [VALID_CREDENTIAL_ID, VALID_CREDENTIAL_ID],
        }),
      ).toThrow(/duplicate/);
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
        (tx as unknown as Record<string, unknown>).Destination =
          'r' + 'A'.repeat(33);
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides', () => {
      const tx = make();
      const tx2 = tx.with({ DestinationTag: 42 });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.DestinationTag).toBe(42);
      expect(tx.DestinationTag).toBeUndefined();
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      // temDST_IS_SRC re-triggered through .with()
      expect(() => tx.with({ Destination: ACCOUNT })).toThrow(
        /temDST_IS_SRC|Destination must not equal Account/,
      );
      // UInt32 bound re-checked
      expect(() => tx.with({ DestinationTag: -1 })).toThrow(/DestinationTag/);
      // CredentialIDs shape re-checked
      expect(() => tx.with({ CredentialIDs: [] })).toThrow(/empty array/);
      expect(() =>
        tx.with({ CredentialIDs: ['bogus'] }),
      ).toThrow(/64-character hex/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({
        DestinationTag: 13,
        CredentialIDs: [VALID_CREDENTIAL_ID],
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'AccountDelete',
        Account: ACCOUNT,
        Destination: DESTINATION,
        DestinationTag: 13,
        CredentialIDs: [VALID_CREDENTIAL_ID],
      });
    });

    it('.toJSON() skips undefined fields', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('DestinationTag' in json).toBe(false);
      expect('CredentialIDs' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('validate() is a no-op after successful construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });
});
