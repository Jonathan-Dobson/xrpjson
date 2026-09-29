/**
 * Tests for the functional MPTokenIssuanceSet factory.
 *
 * Covers:
 *   1. Construction with required Account + MPTokenIssuanceID.
 *   2. MPTokenIssuanceID shape (48-char hex / UINT192, non-zero).
 *   3. Account validation (classic/X-address).
 *   4. Holder validation (valid address, differs from Account).
 *   5. DomainID validation (64-char hex; requires tfMPTSetRequireAuth).
 *   6. Issuer/Auditor encryption key validation (66-char hex; Auditor
 *      requires Issuer).
 *   7. MPTokenMetadata validation (hex; empty clears; 0 < length/2 ≤ 1024).
 *   8. TransferFee bounds + tfMPTSetCanHoldConfidentialBalance rejection.
 *   9. ImmutableFlags validation (non-zero; known tif bits only).
 *  10. Flag bit-mask validation (per-tx bits only).
 *  11. Flag boolean-map shape validation (closed key set).
 *  12. Cross-field rules: Lock/Unlock mutual exclusivity, mutation +
 *      Lock/Unlock, Holder + mutation, Holder + encryption keys,
 *      DomainID + Holder, no-op detection.
 *  13. Frozen-shape contract (mutation throws, .with() returns a new
 *      frozen object, .toJSON() strips methods and undefined values).
 */
import { describe, it, expect } from 'vitest';
import { mptokenIssuanceSet } from '../../src/fp/factories/mptoken-issuance-set.js';

const ISSUER = 'rNFta7UKwcoiCpxEYbhH2v92numE3cceB6';
const HOLDER = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';

// 48-char hex UINT192 (4-byte sequence + 20-byte issuer AccountID).
// Example id from XLS-0033 §3.2.2 and xrpl.org docs.
const VALID_MP_TOKEN_ISSUANCE_ID =
  '000004C463C52827307480341125DA0577DEFC38405B0E3E';
const ZERO_MP_TOKEN_ISSUANCE_ID = '0'.repeat(48);

// 64-char hex permissioned domain ID (HASH256).
const VALID_DOMAIN_ID =
  'A730EB18A9D4BB52502C898589558B4CCEB4BE10044500EE5581137A2E80E849';

// 33-byte compressed EC-ElGamal public key (66 hex chars).
// Pattern: 0x02/0x03 prefix + 32 bytes of X coordinate.
// (These are deterministic-looking but fake — isHex only checks
// shape; the factory never decodes the EC point.)
const VALID_EC_POINT = '02' + 'A'.repeat(64);

const TF_MPT_LOCK = 0x00000001;
const TF_MPT_UNLOCK = 0x00000002;
const TF_MPT_SET_CAN_LOCK = 0x00000004;
const TF_MPT_SET_REQUIRE_AUTH = 0x00000008;
const TF_MPT_SET_CAN_TRANSFER = 0x00000040;
const TF_MPT_SET_CAN_HOLD_CONFIDENTIAL_BALANCE = 0x00000100;

// Non-zero MPTokenMetadata (16 bytes hex).
const VALID_METADATA = '7B2274797065223A226D7074227D';

function base(overrides: Record<string, unknown> = {}) {
  return mptokenIssuanceSet({
    Account: ISSUER,
    MPTokenIssuanceID: VALID_MP_TOKEN_ISSUANCE_ID,
    ...overrides,
  });
}

describe('fp/mptokenIssuanceSet()', () => {
  describe('construction', () => {
    it('constructs with required Account + MPTokenIssuanceID + Flags', () => {
      // A bare Account + MPTokenIssuanceID tx is a no-op per the spec
      // ("temMALFORMED — Transaction isn't changing anything"). Real
      // constructions always include either Flags or a mutation field.
      const tx = base({ Flags: TF_MPT_LOCK });
      expect(tx.TransactionType).toBe('MPTokenIssuanceSet');
      expect(tx.Account).toBe(ISSUER);
      expect(tx.MPTokenIssuanceID).toBe(VALID_MP_TOKEN_ISSUANCE_ID);
      expect(tx.Flags).toBe(TF_MPT_LOCK);
    });

    it('accepts Fee and Sequence', () => {
      const tx = base({
        Fee: '10',
        Sequence: 99536577,
        Flags: TF_MPT_LOCK,
      });
      expect(tx.Fee).toBe('10');
      expect(tx.Sequence).toBe(99536577);
    });

    it('accepts a numeric Flags bitmask (lock globally)', () => {
      const tx = base({ Flags: TF_MPT_LOCK });
      expect(tx.Flags).toBe(TF_MPT_LOCK);
    });

    it('accepts a boolean-map Flags object', () => {
      const tx = base({ Flags: { tfMPTLock: true } });
      expect(tx.Flags).toEqual({ tfMPTLock: true });
    });

    it('accepts the spec example JSON shape (lock with Holder)', () => {
      const tx = base({
        Account: ISSUER,
        MPTokenIssuanceID:
          '05EECEBE97A7D635DE2393068691A015FED5A89AD203F5AA',
        Fee: '10',
        Flags: 1,
        Sequence: 99536577,
      });
      expect(tx.TransactionType).toBe('MPTokenIssuanceSet');
      expect(tx.Flags).toBe(1);
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account (empty string)', () => {
      expect(() =>
        mptokenIssuanceSet({
          Account: '',
          MPTokenIssuanceID: VALID_MP_TOKEN_ISSUANCE_ID,
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      expect(() =>
        mptokenIssuanceSet({
          Account: 'not-an-account',
          MPTokenIssuanceID: VALID_MP_TOKEN_ISSUANCE_ID,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('MPTokenIssuanceID validation', () => {
    it('throws on missing MPTokenIssuanceID', () => {
      expect(() =>
        mptokenIssuanceSet({
          Account: ISSUER,
          MPTokenIssuanceID: '' as never,
        }),
      ).toThrow(/MPTokenIssuanceID/);
    });

    it('throws on wrong-length MPTokenIssuanceID (too short)', () => {
      expect(() =>
        mptokenIssuanceSet({
          Account: ISSUER,
          MPTokenIssuanceID: 'AB',
        }),
      ).toThrow(/MPTokenIssuanceID/);
    });

    it('throws on non-hex MPTokenIssuanceID', () => {
      expect(() =>
        mptokenIssuanceSet({
          Account: ISSUER,
          MPTokenIssuanceID: 'Z'.repeat(48),
        }),
      ).toThrow(/MPTokenIssuanceID/);
    });

    it('throws on all-zero MPTokenIssuanceID', () => {
      expect(() =>
        mptokenIssuanceSet({
          Account: ISSUER,
          MPTokenIssuanceID: ZERO_MP_TOKEN_ISSUANCE_ID,
        }),
      ).toThrow(/zero/i);
    });
  });

  describe('Holder validation', () => {
    it('accepts a valid Holder differing from Account', () => {
      const tx = base({ Holder: HOLDER, Flags: TF_MPT_LOCK });
      expect(tx.Holder).toBe(HOLDER);
    });

    it('throws when Holder equals Account (temMALFORMED)', () => {
      expect(() =>
        mptokenIssuanceSet({
          Account: ISSUER,
          MPTokenIssuanceID: VALID_MP_TOKEN_ISSUANCE_ID,
          Holder: ISSUER,
          Flags: TF_MPT_LOCK,
        }),
      ).toThrow(/Holder/);
    });

    it('throws on malformed Holder', () => {
      expect(() =>
        mptokenIssuanceSet({
          Account: ISSUER,
          MPTokenIssuanceID: VALID_MP_TOKEN_ISSUANCE_ID,
          Holder: 'not-an-address',
          Flags: TF_MPT_LOCK,
        }),
      ).toThrow(/Holder/);
    });
  });

  describe('DomainID validation', () => {
    it('accepts a 64-char hex DomainID with tfMPTSetRequireAuth', () => {
      const tx = base({
        DomainID: VALID_DOMAIN_ID,
        Flags: TF_MPT_SET_REQUIRE_AUTH,
      });
      expect(tx.DomainID).toBe(VALID_DOMAIN_ID);
    });

    it('throws when DomainID is set without tfMPTSetRequireAuth flag', () => {
      expect(() =>
        base({
          DomainID: VALID_DOMAIN_ID,
          Flags: TF_MPT_LOCK, // some other flag, not the right one
        }),
      ).toThrow(/DomainID.*tfMPTSetRequireAuth/);
    });

    it('accepts empty DomainID without tfMPTSetRequireAuth (clears field)', () => {
      const tx = base({
        DomainID: '',
        Flags: TF_MPT_LOCK,
      });
      expect(tx.DomainID).toBe('');
    });

    it('accepts "0" DomainID without tfMPTSetRequireAuth (clears field)', () => {
      const tx = base({
        DomainID: '0',
        Flags: TF_MPT_LOCK,
      });
      expect(tx.DomainID).toBe('0');
    });

    it('throws on wrong-length DomainID', () => {
      expect(() =>
        base({
          DomainID: 'AB',
          Flags: TF_MPT_SET_REQUIRE_AUTH,
        }),
      ).toThrow(/DomainID/);
    });
  });

  describe('Encryption key validation', () => {
    it('accepts a valid IssuerEncryptionKey', () => {
      const tx = base({ IssuerEncryptionKey: VALID_EC_POINT });
      expect(tx.IssuerEncryptionKey).toBe(VALID_EC_POINT);
    });

    it('accepts IssuerEncryptionKey paired with AuditorEncryptionKey', () => {
      const tx = base({
        IssuerEncryptionKey: VALID_EC_POINT,
        AuditorEncryptionKey: VALID_EC_POINT,
      });
      expect(tx.AuditorEncryptionKey).toBe(VALID_EC_POINT);
    });

    it('throws when AuditorEncryptionKey is set without IssuerEncryptionKey', () => {
      expect(() =>
        base({ AuditorEncryptionKey: VALID_EC_POINT }),
      ).toThrow(/AuditorEncryptionKey.*IssuerEncryptionKey/);
    });

    it('throws on wrong-length IssuerEncryptionKey', () => {
      expect(() =>
        base({ IssuerEncryptionKey: 'AB' }),
      ).toThrow(/IssuerEncryptionKey/);
    });

    it('throws on non-hex IssuerEncryptionKey', () => {
      expect(() =>
        base({ IssuerEncryptionKey: 'Z'.repeat(66) }),
      ).toThrow(/IssuerEncryptionKey/);
    });
  });

  describe('MPTokenMetadata validation', () => {
    it('accepts a non-empty hex metadata', () => {
      const tx = base({ MPTokenMetadata: VALID_METADATA });
      expect(tx.MPTokenMetadata).toBe(VALID_METADATA);
    });

    it('accepts an empty metadata (clears field per spec)', () => {
      const tx = base({ MPTokenMetadata: '' });
      expect(tx.MPTokenMetadata).toBe('');
    });

    it('throws on odd-length hex metadata', () => {
      expect(() => base({ MPTokenMetadata: 'ABC' })).toThrow(
        /MPTokenMetadata/,
      );
    });

    it('throws on non-hex metadata', () => {
      expect(() =>
        base({ MPTokenMetadata: 'Z'.repeat(32) }),
      ).toThrow(/MPTokenMetadata/);
    });

    it('throws on metadata over 1024 bytes', () => {
      expect(() =>
        base({ MPTokenMetadata: 'A'.repeat(2 * 1025) }),
      ).toThrow(/MPTokenMetadata/);
    });
  });

  describe('TransferFee validation', () => {
    it('accepts TransferFee = 0 (clears the field)', () => {
      const tx = base({ TransferFee: 0 });
      expect(tx.TransferFee).toBe(0);
    });

    it('accepts TransferFee up to 50000', () => {
      const tx = base({
        TransferFee: 50_000,
        Flags: TF_MPT_SET_CAN_TRANSFER,
      });
      expect(tx.TransferFee).toBe(50_000);
    });

    it('throws on TransferFee > 50000', () => {
      expect(() =>
        base({
          TransferFee: 50_001,
          Flags: TF_MPT_SET_CAN_TRANSFER,
        }),
      ).toThrow(/TransferFee/);
    });

    it('throws on negative TransferFee', () => {
      expect(() => base({ TransferFee: -1 })).toThrow(/TransferFee/);
    });

    it('throws on fractional TransferFee', () => {
      expect(() =>
        base({ TransferFee: 100.5, Flags: TF_MPT_SET_CAN_TRANSFER }),
      ).toThrow(/TransferFee/);
    });

    it('throws on non-zero TransferFee combined with tfMPTSetCanHoldConfidentialBalance (temBAD_TRANSFER_FEE)', () => {
      expect(() =>
        base({
          TransferFee: 100,
          Flags: TF_MPT_SET_CAN_HOLD_CONFIDENTIAL_BALANCE,
        }),
      ).toThrow(/temBAD_TRANSFER_FEE/);
    });

    it('accepts TransferFee = 0 with tfMPTSetCanHoldConfidentialBalance (zero clears, no fee)', () => {
      const tx = base({
        TransferFee: 0,
        Flags: TF_MPT_SET_CAN_HOLD_CONFIDENTIAL_BALANCE,
      });
      expect(tx.TransferFee).toBe(0);
    });
  });

  describe('ImmutableFlags validation', () => {
    it('accepts a known tif bit', () => {
      const tx = base({ ImmutableFlags: 0x00000004 }); // tifMPTRequireAuth
      expect(tx.ImmutableFlags).toBe(0x00000004);
    });

    it('throws on ImmutableFlags = 0 (must be non-zero when present)', () => {
      expect(() => base({ ImmutableFlags: 0 })).toThrow(/ImmutableFlags/);
    });

    it('throws on ImmutableFlags with undefined bit (0x00010001)', () => {
      expect(() => base({ ImmutableFlags: 0x00010001 })).toThrow(
        /ImmutableFlags/,
      );
    });
  });

  describe('Flags shape validation', () => {
    it('throws on Flags numeric with an undefined per-tx bit', () => {
      // 0x00000200 is between tfMPTSetCanHoldConfidentialBalance
      // (0x100) and tifMPTCanLock (0x00000002 in ImmutableFlags);
      // it is not defined for any per-tx flag.
      expect(() => base({ Flags: 0x00000200 })).toThrow(/per-tx bits/);
    });

    it('accepts Flags numeric with only valid per-tx bits + global bits', () => {
      // tfInnerBatchTxn (0x40000000) + tfFullyCanonicalSig (0x80000000)
      // + tfMPTLock (0x1) are all valid.
      const tx = base({ Flags: 0x40000001 });
      expect(tx.Flags).toBe(0x40000001);
    });

    it('throws on Flags object with an unknown key', () => {
      expect(() =>
        base({ Flags: { tfNotARealFlag: true } }),
      ).toThrow(/unknown key/);
    });

    it('accepts Flags object with only known keys', () => {
      const tx = base({
        Flags: {
          tfMPTLock: true,
          tfInnerBatchTxn: true,
        },
      });
      expect(tx.Flags).toEqual({
        tfMPTLock: true,
        tfInnerBatchTxn: true,
      });
    });

    it('throws on Flags object key with non-boolean value', () => {
      expect(() =>
        base({ Flags: { tfMPTLock: 'yes' as unknown as boolean } }),
      ).toThrow(/must be a boolean/);
    });
  });

  describe('Cross-field rules', () => {
    it('throws when tfMPTLock and tfMPTUnlock are both set', () => {
      expect(() =>
        base({ Flags: TF_MPT_LOCK | TF_MPT_UNLOCK }),
      ).toThrow(/mutually exclusive/);
    });

    it('throws when Lock/Unlock combines with TransferFee (mutation)', () => {
      expect(() =>
        base({
          Flags: TF_MPT_LOCK,
          TransferFee: 100,
        }),
      ).toThrow(/lock\/unlock.*field updates/i);
    });

    it('throws when Lock/Unlock combines with capability-set flag', () => {
      expect(() =>
        base({
          Flags: TF_MPT_LOCK | TF_MPT_SET_CAN_LOCK,
        }),
      ).toThrow(/lock\/unlock.*field updates/i);
    });

    it('throws when Holder combines with a mutation field', () => {
      // Use TransferFee alone (no Lock/Unlock) so the Holder+mutation
      // rule fires rather than the Lock+mutation rule.
      expect(() =>
        mptokenIssuanceSet({
          Account: ISSUER,
          MPTokenIssuanceID: VALID_MP_TOKEN_ISSUANCE_ID,
          Holder: HOLDER,
          TransferFee: 100,
        }),
      ).toThrow(/Holder.*mutating/);
    });

    it('throws when Holder combines with IssuerEncryptionKey', () => {
      // No Lock flag — test the Holder+encryption-key rule directly.
      expect(() =>
        mptokenIssuanceSet({
          Account: ISSUER,
          MPTokenIssuanceID: VALID_MP_TOKEN_ISSUANCE_ID,
          Holder: HOLDER,
          IssuerEncryptionKey: VALID_EC_POINT,
        }),
      ).toThrow(/Holder.*confidential encryption keys/);
    });

    it('throws when Holder combines with tfMPTSetCanHoldConfidentialBalance', () => {
      expect(() =>
        mptokenIssuanceSet({
          Account: ISSUER,
          MPTokenIssuanceID: VALID_MP_TOKEN_ISSUANCE_ID,
          Holder: HOLDER,
          Flags: TF_MPT_SET_CAN_HOLD_CONFIDENTIAL_BALANCE,
        }),
      ).toThrow(/tfMPTSetCanHoldConfidentialBalance.*Holder/);
    });

    it('throws when DomainID and Holder are both set', () => {
      expect(() =>
        mptokenIssuanceSet({
          Account: ISSUER,
          MPTokenIssuanceID: VALID_MP_TOKEN_ISSUANCE_ID,
          Holder: HOLDER,
          DomainID: VALID_DOMAIN_ID,
          Flags: TF_MPT_SET_REQUIRE_AUTH,
        }),
      ).toThrow(/DomainID and Holder cannot both be set/);
    });

    it('throws on a no-op transaction (no Flags, no DomainID, no mutation)', () => {
      expect(() =>
        mptokenIssuanceSet({
          Account: ISSUER,
          MPTokenIssuanceID: VALID_MP_TOKEN_ISSUANCE_ID,
        }),
      ).toThrow(/does not change the state/);
    });
  });

  describe('frozen-shape contract', () => {
    it('returns a frozen object', () => {
      const tx = base({ Flags: TF_MPT_LOCK });
      expect(Object.isFrozen(tx)).toBe(true);
    });

    it('mutation throws in strict mode', () => {
      const tx = base({ Flags: TF_MPT_LOCK });
      expect(() => {
        (tx as unknown as Record<string, unknown>).Account =
          'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      // Use a capability-set flag (not Lock) so we can add TransferFee
      // without triggering the Lock + mutation rule.
      const tx = base({ Flags: TF_MPT_SET_CAN_LOCK });
      const tx2 = tx.with({ TransferFee: 100 });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.TransferFee).toBe(100);
      expect(tx.TransferFee).toBeUndefined();
    });

    it('.with() re-validates on overrides (zero id rejected)', () => {
      const tx = base({ Flags: TF_MPT_LOCK });
      expect(() =>
        tx.with({ MPTokenIssuanceID: ZERO_MP_TOKEN_ISSUANCE_ID }),
      ).toThrow(/zero/i);
    });

    it('.with() re-validates cross-field rules on overrides', () => {
      const tx = base({ Flags: TF_MPT_LOCK });
      expect(() =>
        tx.with({ Flags: TF_MPT_LOCK | TF_MPT_UNLOCK }),
      ).toThrow(/mutually exclusive/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = mptokenIssuanceSet({
        Account: ISSUER,
        MPTokenIssuanceID: VALID_MP_TOKEN_ISSUANCE_ID,
        Flags: TF_MPT_LOCK,
        Holder: HOLDER,
        Fee: '10',
        Sequence: 7,
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'MPTokenIssuanceSet',
        Account: ISSUER,
        MPTokenIssuanceID: VALID_MP_TOKEN_ISSUANCE_ID,
        Flags: TF_MPT_LOCK,
        Holder: HOLDER,
        Fee: '10',
        Sequence: 7,
      });
    });

    it('.toJSON() skips undefined fields and methods', () => {
      const tx = base({ Flags: TF_MPT_LOCK });
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('Holder' in json).toBe(false);
      expect('TransferFee' in json).toBe(false);
    });

    it('.validate() is a no-op (no throw after construction)', () => {
      const tx = base({ Flags: TF_MPT_LOCK });
      expect(() => tx.validate()).not.toThrow();
    });
  });
});