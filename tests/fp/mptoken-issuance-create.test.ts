/**
 * Tests for the functional MPTokenIssuanceCreate factory.
 *
 * Covers:
 *   1. Construction with Account (only required field).
 *   2. Optional field validation:
 *      - TransferFee (bounds + tfMPTCanTransfer coupling)
 *      - MaximumAmount (base-10 integer, > 0, <= 2^63-1)
 *      - MPTokenMetadata (hex, 0 < bytes <= 1024)
 *      - DomainID (tfMPTRequireAuth coupling, empty/'0' treated as unset)
 *      - ImmutableFlags (non-zero, defined bits only)
 *   3. Amendment-driven flag combinations:
 *      - DynamicMPT (ImmutableFlags)
 *      - PermissionedDomains (DomainID + tfMPTRequireAuth)
 *      - ConfidentialTransfer (tfMPTCanHoldConfidentialBalance)
 *   4. Frozen-shape contract (frozen, mutation throws,
 *      .with() re-validates, .toJSON() strips).
 */
import { describe, it, expect } from 'vitest';
import { mptokenIssuanceCreate } from '../../src/fp/index.js';

const ISSUER = 'rNGHoQwNG753zyfDrib4qDvvswtmV8Es';

const VALID_DOMAIN = 'A730EB18A9D4BB52502C898589558B4CCEB4BE10044500EE5581137A2E80E849';
const VALID_METADATA = '7B2274797065223A226D7074227D'; // 16 bytes hex

function base(overrides: Record<string, unknown> = {}) {
  return mptokenIssuanceCreate({ Account: ISSUER, ...overrides });
}

describe('fp/mptokenIssuanceCreate()', () => {
  describe('construction', () => {
    it('constructs with only Account required', () => {
      const tx = base();
      expect(tx.TransactionType).toBe('MPTokenIssuanceCreate');
      expect(tx.Account).toBe(ISSUER);
    });

    it('accepts all 6 optional spec fields + Flags', () => {
      const tx = base({
        AssetScale: 2,
        DomainID: VALID_DOMAIN,
        TransferFee: 100,
        MaximumAmount: '1000000',
        MPTokenMetadata: VALID_METADATA,
        ImmutableFlags: 0x00000002, // tifMPTCanLock
        Flags: 0x00000020 | 0x00000004, // tfMPTCanTransfer | tfMPTRequireAuth
      });
      expect(tx.AssetScale).toBe(2);
      expect(tx.DomainID).toBe(VALID_DOMAIN);
      expect(tx.TransferFee).toBe(100);
      expect(tx.MaximumAmount).toBe('1000000');
      expect(tx.MPTokenMetadata).toBe(VALID_METADATA);
      expect(tx.ImmutableFlags).toBe(0x00000002);
    });

    it('throws when Account is missing', () => {
      expect(() =>
        mptokenIssuanceCreate({ Account: undefined as never }),
      ).toThrow(/Account is required/);
    });

    it('throws when Account is empty string', () => {
      expect(() =>
        mptokenIssuanceCreate({ Account: '' }),
      ).toThrow(/Account is required/);
    });
  });

  describe('TransferFee validation', () => {
    it('accepts TransferFee = 0 without tfMPTCanTransfer', () => {
      const tx = base({ TransferFee: 0 });
      expect(tx.TransferFee).toBe(0);
    });

    it('accepts TransferFee at boundary MAX_TRANSFER_FEE', () => {
      const tx = base({ TransferFee: 50_000, Flags: 0x00000020 });
      expect(tx.TransferFee).toBe(50_000);
    });

    it('throws when TransferFee < 0', () => {
      expect(() => base({ TransferFee: -1 })).toThrow(/TransferFee/);
    });

    it('throws when TransferFee > 50000', () => {
      expect(() => base({ TransferFee: 50_001 })).toThrow(/TransferFee/);
    });

    it('throws when TransferFee is not a number', () => {
      expect(() => base({ TransferFee: '100' as never })).toThrow(/TransferFee/);
    });

    it('throws on non-zero TransferFee without tfMPTCanTransfer', () => {
      expect(() => base({ TransferFee: 100 })).toThrow(/tfMPTCanTransfer/);
    });

    it('accepts non-zero TransferFee with tfMPTCanTransfer', () => {
      const tx = base({ TransferFee: 100, Flags: 0x00000020 });
      expect(tx.TransferFee).toBe(100);
    });
  });

  // ─── boolean-map Flags ─────────────────────────────────────────────
  //
  // `Flags` has two documented input forms (see
  // `MPTokenIssuanceCreateProps`): a numeric bitmask, or a boolean map
  // keyed by the `tfMPT*` names. The map form used to be collapsed to `0`
  // before the cross-field gates ran, so a caller who correctly wrote
  // `{ tfMPTCanTransfer: true }` was told their TransferFee needed a flag
  // they had just set — a transaction rippled accepts.
  //
  //   - Source: xrpl.org `mptokenissuancecreate.md` line 45 — "A non-zero
  //     value is only valid if the `tfMPTCanTransfer` flag is also set."
  //   - Source: xrpl.org `mptokenissuancecreate.md` line 44 — "You must
  //     enable the `tfMPTRequireAuth` flag to use permissioned domains."
  //   - Cross-ref: `mptoken-issuance-set.ts` already resolved the map form
  //     to bits before gating, so the two factories disagreed.

  describe('boolean-map Flags form', () => {
    it('honours tfMPTCanTransfer from a boolean map for the TransferFee gate', () => {
      const tx = base({ TransferFee: 100, Flags: { tfMPTCanTransfer: true } });
      expect(tx.TransferFee).toBe(100);
    });

    it('honours tfMPTRequireAuth from a boolean map for the DomainID gate', () => {
      const tx = base({ DomainID: VALID_DOMAIN, Flags: { tfMPTRequireAuth: true } });
      expect(tx.DomainID).toBe(VALID_DOMAIN);
    });

    it('accepts both capability flags in one boolean map', () => {
      const tx = base({
        TransferFee: 100,
        DomainID: VALID_DOMAIN,
        Flags: { tfMPTCanTransfer: true, tfMPTRequireAuth: true },
      });
      expect(tx.TransferFee).toBe(100);
      expect(tx.DomainID).toBe(VALID_DOMAIN);
    });

    it('still throws when the boolean map omits the required capability', () => {
      expect(() =>
        base({ TransferFee: 100, Flags: { tfMPTRequireAuth: true } }),
      ).toThrow(/tfMPTCanTransfer/);
    });

    it('treats an explicit false in a boolean map as unset', () => {
      expect(() =>
        base({ TransferFee: 100, Flags: { tfMPTCanTransfer: false } }),
      ).toThrow(/tfMPTCanTransfer/);
    });

    it('ignores unknown boolean-map keys (forward-compatible)', () => {
      const tx = base({ Flags: { tfSomeFutureFlag: true } });
      expect(tx.Account).toBe(ISSUER);
    });
  });

  describe('MaximumAmount validation', () => {
    it('accepts a normal MaximumAmount', () => {
      const tx = base({ MaximumAmount: '1000000' });
      expect(tx.MaximumAmount).toBe('1000000');
    });

    it('accepts MaximumAmount at boundary 2^63 - 1', () => {
      const tx = base({ MaximumAmount: '9223372036854775807' });
      expect(tx.MaximumAmount).toBe('9223372036854775807');
    });

    it('throws when MaximumAmount is "0"', () => {
      expect(() => base({ MaximumAmount: '0' })).toThrow(/MaximumAmount/);
    });

    it('throws when MaximumAmount is non-numeric', () => {
      expect(() => base({ MaximumAmount: 'abc' })).toThrow(/MaximumAmount/);
    });

    it('throws when MaximumAmount > 2^63 - 1', () => {
      expect(() =>
        base({ MaximumAmount: '9223372036854775808' }),
      ).toThrow(/MaximumAmount/);
    });

    it('throws when MaximumAmount is not a string', () => {
      expect(() => base({ MaximumAmount: 1000 as never })).toThrow(
        /MaximumAmount/,
      );
    });
  });

  describe('MPTokenMetadata validation', () => {
    it('accepts valid hex MPTokenMetadata', () => {
      const tx = base({ MPTokenMetadata: VALID_METADATA });
      expect(tx.MPTokenMetadata).toBe(VALID_METADATA);
    });

    it('accepts MPTokenMetadata at exactly 1024 bytes', () => {
      const ok = 'A'.repeat(2048); // 2048 hex chars = 1024 bytes
      const tx = base({ MPTokenMetadata: ok });
      expect(tx.MPTokenMetadata).toBe(ok);
    });

    it('throws on empty MPTokenMetadata (0 bytes)', () => {
      expect(() => base({ MPTokenMetadata: '' })).toThrow(/MPTokenMetadata/);
    });

    it('throws when MPTokenMetadata > 1024 bytes', () => {
      const huge = 'A'.repeat(2050); // 1025 bytes
      expect(() => base({ MPTokenMetadata: huge })).toThrow(/MPTokenMetadata/);
    });

    it('throws on non-hex MPTokenMetadata', () => {
      expect(() => base({ MPTokenMetadata: 'not-hex-zz' })).toThrow(
        /MPTokenMetadata/,
      );
    });

    it('throws when MPTokenMetadata is not a string', () => {
      expect(() => base({ MPTokenMetadata: 123 as never })).toThrow(
        /MPTokenMetadata/,
      );
    });
  });

  describe('DomainID validation (PermissionedDomains amendment)', () => {
    it('accepts DomainID with tfMPTRequireAuth flag', () => {
      const tx = base({ DomainID: VALID_DOMAIN, Flags: 0x00000004 });
      expect(tx.DomainID).toBe(VALID_DOMAIN);
    });

    it('throws when DomainID set without tfMPTRequireAuth', () => {
      expect(() => base({ DomainID: VALID_DOMAIN })).toThrow(/DomainID/);
    });

    it('accepts empty DomainID without flag (treated as unset)', () => {
      const tx = base({ DomainID: '' });
      expect(tx.DomainID).toBe('');
    });

    it('accepts DomainID "0" without flag (treated as unset)', () => {
      const tx = base({ DomainID: '0' });
      expect(tx.DomainID).toBe('0');
    });
  });

  describe('ImmutableFlags validation (DynamicMPT amendment)', () => {
    it('accepts ImmutableFlags with defined bits', () => {
      const tx = base({ ImmutableFlags: 0x00000002 }); // tifMPTCanLock
      expect(tx.ImmutableFlags).toBe(0x00000002);
    });

    it('accepts ImmutableFlags with multiple defined bits', () => {
      // tifMPTCanLock | tifMPTCanTransfer | tifMPTMetadata
      const bits = 0x00000002 | 0x00000020 | 0x00010000;
      const tx = base({ ImmutableFlags: bits });
      expect(tx.ImmutableFlags).toBe(bits);
    });

    it('accepts ImmutableFlags with tifMPTTransferFee bit', () => {
      const tx = base({ ImmutableFlags: 0x00020000 });
      expect(tx.ImmutableFlags).toBe(0x00020000);
    });

    it('throws when ImmutableFlags is zero', () => {
      expect(() => base({ ImmutableFlags: 0 })).toThrow(/ImmutableFlags/);
    });

    it('throws when ImmutableFlags contains undefined bits', () => {
      // 0x00000100 is not a defined `tif*` bit.
      expect(() => base({ ImmutableFlags: 0x00000100 })).toThrow(
        /ImmutableFlags/,
      );
    });

    it('throws when ImmutableFlags is not a number', () => {
      expect(() => base({ ImmutableFlags: '2' as never })).toThrow(
        /ImmutableFlags/,
      );
    });
  });

  describe('ConfidentialTransfer amendment', () => {
    it('accepts tfMPTCanHoldConfidentialBalance flag', () => {
      const tx = base({ Flags: 0x00000080 });
      expect(tx.Flags).toBe(0x00000080);
    });

    it('accepts tfMPTCanHoldConfidentialBalance combined with tif bit in ImmutableFlags', () => {
      const tx = base({
        Flags: 0x00000080,
        ImmutableFlags: 0x00000080, // tifMPTCanHoldConfidentialBalance
      });
      expect(tx.Flags).toBe(0x00000080);
      expect(tx.ImmutableFlags).toBe(0x00000080);
    });
  });

  describe('amendment-driven combinations', () => {
    it('DynamicMPT: tifMPTCanLock + tifMPTCanTransfer are both accepted', () => {
      const tx = base({ ImmutableFlags: 0x00000002 | 0x00000020 });
      const imf = tx.ImmutableFlags as number;
      expect(imf & 0x00000002).toBe(0x00000002);
      expect(imf & 0x00000020).toBe(0x00000020);
    });

    it('PermissionedDomains: DomainID + tfMPTRequireAuth are accepted together', () => {
      const tx = base({
        DomainID: VALID_DOMAIN,
        Flags: 0x00000004,
      });
      expect(tx.DomainID).toBe(VALID_DOMAIN);
      expect(tx.Flags).toBe(0x00000004);
    });

    it('ConfidentialTransfer: tfMPTCanHoldConfidentialBalance + ImmutableFlags accepted', () => {
      const tx = base({
        Flags: 0x00000080,
        ImmutableFlags: 0x00000080,
      });
      expect(tx.Flags).toBe(0x00000080);
      expect(tx.ImmutableFlags).toBe(0x00000080);
    });
  });

  describe('frozen-shape contract', () => {
    it('returns a frozen object', () => {
      const tx = base();
      expect(Object.isFrozen(tx)).toBe(true);
    });

    it('mutation throws in strict mode', () => {
      const tx = base();
      expect(() => {
        (tx as unknown as Record<string, unknown>).Account = 'spoof';
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides', () => {
      const tx = base();
      const tx2 = tx.with({ AssetScale: 4 });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.AssetScale).toBe(4);
      expect(tx.AssetScale).toBeUndefined();
    });

    it('.with() re-validates on overrides', () => {
      const tx = base();
      expect(() => tx.with({ TransferFee: 100 })).toThrow(/tfMPTCanTransfer/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = base({ AssetScale: 2, MaximumAmount: '1000' });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'MPTokenIssuanceCreate',
        Account: ISSUER,
        AssetScale: 2,
        MaximumAmount: '1000',
      });
    });

    it('.toJSON() skips undefined fields', () => {
      const tx = base();
      const json = tx.toJSON();
      expect('AssetScale' in json).toBe(false);
      expect('DomainID' in json).toBe(false);
      expect('TransferFee' in json).toBe(false);
      expect('MaximumAmount' in json).toBe(false);
      expect('MPTokenMetadata' in json).toBe(false);
      expect('ImmutableFlags' in json).toBe(false);
    });

    it('.validate() is a no-op (validation already happened at construction)', () => {
      const tx = base();
      expect(() => tx.validate()).not.toThrow();
    });
  });
});