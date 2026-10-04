/**
 * Tests for the functional ConfidentialMptConvert factory.
 *
 * Validates:
 *   1. Construction with the required 6 base fields (Account,
 *      MPTokenIssuanceID, MPTAmount, HolderEncryptedAmount,
 *      IssuerEncryptedAmount, BlindingFactor).
 *   2. Optional HolderEncryptionKey / ZKProof symmetric pairing and
 *      byte-length guards (XLS-0096 §8.4.1.3–§8.4.1.6).
 *   3. Optional AuditorEncryptedAmount byte-length guard.
 *   4. MPTAmount range guard (UINT64 ≤ 2⁶³−1, zero permitted).
 *   5. Account validation (classic address, X-address, missing, malformed).
 *   6. Frozen-shape contract (frozen object, mutation throws, .with()
 *      returns a new frozen object, .toJSON() strips methods and
 *      undefined fields, .validate() is a no-op).
 *   7. .with() re-validates on overrides.
 */
import { describe, it, expect } from 'vitest';
import { confidentialMptConvert } from '../../src/fp/factories/confidential-mpt-convert.js';

// ─── Test fixtures ───────────────────────────────────────────────────

const ACCOUNT = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const X_ADDRESS =
  'X7Acg9t9WtR2Y4HXUsScrU5KhH4PmgBxX3RcL8soFpPJz8X';

// 48-character hex MPT issuance ID (UInt192).
const MPT_ID = 'AB'.repeat(24);

// 32-byte scalar blinding factor (64 hex chars) — UINT256.
const BLINDING_FACTOR = 'CD'.repeat(32);

// 66-byte ElGamal ciphertext (132 hex chars) — Holder + Issuer + Auditor.
const CIPHERTEXT = 'EF'.repeat(66);

// 33-byte compressed ElGamal EC point (66 hex chars).
const HOLDER_ENCRYPTION_KEY = '12'.repeat(33);

// 64-byte Schnorr PoK (128 hex chars).
const ZK_PROOF = '34'.repeat(64);

function baseFields(extras: Record<string, unknown> = {}) {
  return {
    Account: ACCOUNT,
    MPTokenIssuanceID: MPT_ID,
    MPTAmount: '1000',
    HolderEncryptedAmount: CIPHERTEXT,
    IssuerEncryptedAmount: CIPHERTEXT,
    BlindingFactor: BLINDING_FACTOR,
    ...extras,
  };
}

function make(extras: Record<string, unknown> = {}) {
  return confidentialMptConvert(baseFields(extras));
}

describe('fp/confidentialMptConvert()', () => {
  describe('construction', () => {
    it('constructs with the minimum required fields (no HolderEncryptionKey, no ZKProof, no Auditor)', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('ConfidentialMPTConvert');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.MPTokenIssuanceID).toBe(MPT_ID);
      expect(tx.MPTAmount).toBe('1000');
      expect(tx.HolderEncryptedAmount).toBe(CIPHERTEXT);
      expect(tx.IssuerEncryptedAmount).toBe(CIPHERTEXT);
      expect(tx.BlindingFactor).toBe(BLINDING_FACTOR);
      expect(tx.HolderEncryptionKey).toBeUndefined();
      expect(tx.ZKProof).toBeUndefined();
      expect(tx.AuditorEncryptedAmount).toBeUndefined();
    });

    it('constructs with HolderEncryptionKey + ZKProof (full opt-in path)', () => {
      const tx = confidentialMptConvert(baseFields({
        HolderEncryptionKey: HOLDER_ENCRYPTION_KEY,
        ZKProof: ZK_PROOF,
      }));
      expect(tx.HolderEncryptionKey).toBe(HOLDER_ENCRYPTION_KEY);
      expect(tx.ZKProof).toBe(ZK_PROOF);
    });

    it('constructs with AuditorEncryptedAmount (auditor-enabled issuance)', () => {
      const tx = make({ AuditorEncryptedAmount: CIPHERTEXT });
      expect(tx.AuditorEncryptedAmount).toBe(CIPHERTEXT);
    });

    it('constructs with all base tx fields (Fee, Sequence)', () => {
      const tx = confidentialMptConvert({
        ...baseFields(),
        Fee: '100',
        Sequence: 42,
      });
      expect(tx.Fee).toBe('100');
      expect(tx.Sequence).toBe(42);
    });

    it('accepts MPTAmount of "0" (zero-amount convert registers holder key per XLS-0096 §8.1)', () => {
      const tx = make({ MPTAmount: '0' });
      expect(tx.MPTAmount).toBe('0');
    });

    it('accepts lowercase hex MPTokenIssuanceID', () => {
      const tx = confidentialMptConvert({
        ...baseFields({ MPTokenIssuanceID: MPT_ID.toLowerCase() }),
      });
      expect(tx.MPTokenIssuanceID).toBe(MPT_ID.toLowerCase());
    });

    it('accepts an X-address Account', () => {
      const tx = confidentialMptConvert(baseFields({ Account: X_ADDRESS }));
      expect(tx.Account).toBe(X_ADDRESS);
    });
  });

  describe('Account validation', () => {
    it('throws when Account is missing (empty string)', () => {
      expect(() =>
        confidentialMptConvert(baseFields({ Account: '' })),
      ).toThrow(/Account/);
    });

    it('throws when Account is undefined', () => {
      expect(() =>
        confidentialMptConvert(baseFields({ Account: undefined as never })),
      ).toThrow(/Account/);
    });

    it('throws when Account is malformed', () => {
      expect(() =>
        confidentialMptConvert(baseFields({ Account: 'not-an-address' })),
      ).toThrow(/Account/);
    });
  });

  describe('MPTokenIssuanceID validation', () => {
    it('throws when MPTokenIssuanceID is missing', () => {
      expect(() =>
        confidentialMptConvert(baseFields({ MPTokenIssuanceID: '' })),
      ).toThrow(/MPTokenIssuanceID/);
    });

    it('throws when MPTokenIssuanceID is too short (47 hex chars)', () => {
      expect(() =>
        confidentialMptConvert(
          baseFields({ MPTokenIssuanceID: 'AB'.repeat(23) + 'A' }),
        ),
      ).toThrow(/48-character hex/);
    });

    it('throws when MPTokenIssuanceID is too long (49 hex chars)', () => {
      expect(() =>
        confidentialMptConvert(
          baseFields({ MPTokenIssuanceID: 'AB'.repeat(24) + 'A' }),
        ),
      ).toThrow(/48-character hex/);
    });

    it('throws when MPTokenIssuanceID is non-hex', () => {
      expect(() =>
        confidentialMptConvert(baseFields({ MPTokenIssuanceID: 'Z'.repeat(48) })),
      ).toThrow(/48-character hex/);
    });
  });

  describe('MPTAmount validation', () => {
    it('throws when MPTAmount is missing', () => {
      expect(() =>
        confidentialMptConvert(baseFields({ MPTAmount: undefined as never })),
      ).toThrow(/MPTAmount/);
    });

    it('throws when MPTAmount is non-numeric', () => {
      expect(() =>
        confidentialMptConvert(baseFields({ MPTAmount: 'abc' })),
      ).toThrow(/MPTAmount/);
    });

    it('throws when MPTAmount is negative', () => {
      expect(() =>
        confidentialMptConvert(baseFields({ MPTAmount: '-1' })),
      ).toThrow(/MPTAmount/);
    });

    it('throws when MPTAmount exceeds 2⁶³−1 (XLS-0096 §8.4.1.8, temBAD_AMOUNT)', () => {
      // MAX_MPT_AMOUNT = 9223372036854775807 (2^63 − 1).
      expect(() =>
        confidentialMptConvert(baseFields({ MPTAmount: '9223372036854775808' })),
      ).toThrow(/MPTAmount/);
    });

    it('accepts MPTAmount at the 2⁶³−1 boundary', () => {
      const tx = make({ MPTAmount: '9223372036854775807' });
      expect(tx.MPTAmount).toBe('9223372036854775807');
    });
  });

  describe('BlindingFactor validation', () => {
    it('throws when BlindingFactor is wrong length (66 hex chars)', () => {
      expect(() =>
        confidentialMptConvert(baseFields({ BlindingFactor: 'CD'.repeat(16) })),
      ).toThrow(/BlindingFactor/);
    });

    it('throws when BlindingFactor is non-hex', () => {
      expect(() =>
        confidentialMptConvert(baseFields({ BlindingFactor: 'Z'.repeat(64) })),
      ).toThrow(/BlindingFactor/);
    });
  });

  describe('EncryptedAmount validation', () => {
    it('throws when HolderEncryptedAmount is wrong length', () => {
      expect(() =>
        confidentialMptConvert(
          baseFields({ HolderEncryptedAmount: 'EF'.repeat(32) }),
        ),
      ).toThrow(/HolderEncryptedAmount/);
    });

    it('throws when IssuerEncryptedAmount is wrong length', () => {
      expect(() =>
        confidentialMptConvert(
          baseFields({ IssuerEncryptedAmount: 'EF'.repeat(32) }),
        ),
      ).toThrow(/IssuerEncryptedAmount/);
    });

    it('throws when HolderEncryptedAmount is non-hex', () => {
      expect(() =>
        confidentialMptConvert(
          baseFields({ HolderEncryptedAmount: 'Z'.repeat(132) }),
        ),
      ).toThrow(/HolderEncryptedAmount/);
    });
  });

  describe('HolderEncryptionKey / ZKProof pairing (XLS-0096 §8.4.1.3 + §8.4.1.4)', () => {
    it('throws when HolderEncryptionKey is present without ZKProof', () => {
      expect(() =>
        confidentialMptConvert(
          baseFields({
            HolderEncryptionKey: HOLDER_ENCRYPTION_KEY,
            ZKProof: undefined,
          }),
        ),
      ).toThrow(/together/);
    });

    it('throws when ZKProof is present without HolderEncryptionKey (BACKWARD guard)', () => {
      // The class API only checks the forward direction; the factory
      // enforces the canonical symmetric pairing per XLS-0096 §8.4.1.4.
      expect(() =>
        confidentialMptConvert(
          baseFields({
            HolderEncryptionKey: undefined,
            ZKProof: ZK_PROOF,
          }),
        ),
      ).toThrow(/together/);
    });

    it('throws when HolderEncryptionKey is wrong length (must be 33 bytes / 66 hex)', () => {
      // Class API does not check this; rippled rejects with temMALFORMED.
      expect(() =>
        confidentialMptConvert(
          baseFields({
            HolderEncryptionKey: '12'.repeat(32), // 64 hex chars
            ZKProof: ZK_PROOF,
          }),
        ),
      ).toThrow(/HolderEncryptionKey/);
    });

    it('throws when HolderEncryptionKey is non-hex', () => {
      expect(() =>
        confidentialMptConvert(
          baseFields({
            HolderEncryptionKey: 'Z'.repeat(66),
            ZKProof: ZK_PROOF,
          }),
        ),
      ).toThrow(/HolderEncryptionKey/);
    });

    it('throws when ZKProof is wrong length (must be 64 bytes / 128 hex)', () => {
      expect(() =>
        confidentialMptConvert(
          baseFields({
            HolderEncryptionKey: HOLDER_ENCRYPTION_KEY,
            ZKProof: '34'.repeat(32), // 64 hex chars (32 bytes)
          }),
        ),
      ).toThrow(/ZKProof/);
    });
  });

  describe('AuditorEncryptedAmount validation', () => {
    it('throws when AuditorEncryptedAmount is wrong length', () => {
      expect(() =>
        confidentialMptConvert(
          baseFields({ AuditorEncryptedAmount: 'EF'.repeat(32) }),
        ),
      ).toThrow(/AuditorEncryptedAmount/);
    });

    it('throws when AuditorEncryptedAmount is non-hex', () => {
      expect(() =>
        confidentialMptConvert(
          baseFields({ AuditorEncryptedAmount: 'Z'.repeat(132) }),
        ),
      ).toThrow(/AuditorEncryptedAmount/);
    });
  });

  describe('frozen-shape contract', () => {
    it('returns a frozen object', () => {
      const tx = make();
      expect(Object.isFrozen(tx)).toBe(true);
    });

    it('mutation throws in strict mode (Account)', () => {
      const tx = make();
      expect(() => {
        (tx as unknown as Record<string, unknown>).Account =
          'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
      }).toThrow(TypeError);
    });

    it('mutation throws when overwriting MPTokenIssuanceID', () => {
      const tx = make();
      expect(() => {
        (tx as unknown as Record<string, unknown>).MPTokenIssuanceID =
          'CD'.repeat(24);
      }).toThrow(TypeError);
    });

    it('mutation throws when attempting to assign to TransactionType', () => {
      const tx = make();
      expect(() => {
        (tx as unknown as Record<string, unknown>).TransactionType = 'Payment';
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides', () => {
      const tx = make();
      const tx2 = tx.with({ MPTAmount: '500' });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.MPTAmount).toBe('500');
      expect(tx.MPTAmount).toBe('1000');
    });

    it('.with() preserves unchanged fields', () => {
      const tx = make({ Fee: '15', Sequence: 7 });
      const tx2 = tx.with({ MPTAmount: '250' });
      expect(tx2.Account).toBe(ACCOUNT);
      expect(tx2.MPTokenIssuanceID).toBe(MPT_ID);
      expect(tx2.Sequence).toBe(7);
      expect(tx2.Fee).toBe('15');
    });

    it('.with() re-validates on overrides (MPTokenIssuanceID)', () => {
      const tx = make();
      expect(() => tx.with({ MPTokenIssuanceID: 'too-short' })).toThrow(
        /48-character hex/,
      );
    });

    it('.with() re-validates on overrides (MPTAmount out of range)', () => {
      const tx = make();
      expect(() =>
        tx.with({ MPTAmount: '9223372036854775808' }),
      ).toThrow(/MPTAmount/);
    });

    it('.with() re-validates on overrides (asymmetric ZKProof without HolderEncryptionKey)', () => {
      const tx = make();
      expect(() => tx.with({ ZKProof: ZK_PROOF })).toThrow(/together/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = confidentialMptConvert({
        Account: ACCOUNT,
        MPTokenIssuanceID: MPT_ID,
        MPTAmount: '15',
        HolderEncryptedAmount: CIPHERTEXT,
        IssuerEncryptedAmount: CIPHERTEXT,
        BlindingFactor: BLINDING_FACTOR,
        Fee: '15',
        Sequence: 7,
      });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'ConfidentialMPTConvert',
        Account: ACCOUNT,
        MPTokenIssuanceID: MPT_ID,
        MPTAmount: '15',
        HolderEncryptedAmount: CIPHERTEXT,
        IssuerEncryptedAmount: CIPHERTEXT,
        BlindingFactor: BLINDING_FACTOR,
        Fee: '15',
        Sequence: 7,
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
      expect('HolderEncryptionKey' in json).toBe(false);
      expect('ZKProof' in json).toBe(false);
      expect('AuditorEncryptedAmount' in json).toBe(false);
    });

    it('.toJSON() includes optional fields when set', () => {
      const tx = confidentialMptConvert({
        ...baseFields({
          HolderEncryptionKey: HOLDER_ENCRYPTION_KEY,
          ZKProof: ZK_PROOF,
          AuditorEncryptedAmount: CIPHERTEXT,
        }),
      });
      const json = tx.toJSON();
      expect(json.HolderEncryptionKey).toBe(HOLDER_ENCRYPTION_KEY);
      expect(json.ZKProof).toBe(ZK_PROOF);
      expect(json.AuditorEncryptedAmount).toBe(CIPHERTEXT);
    });

    it('.validate() is a no-op after successful construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });

    it('exposes exactly three methods: validate, toJSON, with', () => {
      const tx = make();
      const methodNames = Object.keys(tx).filter(
        (k) => typeof (tx as unknown as Record<string, unknown>)[k] === 'function',
      );
      expect(methodNames.sort()).toEqual(['toJSON', 'validate', 'with']);
    });
  });

  // ─── Base transaction fields ──────────────────────────────────────────────
  // `ConfidentialMptConvertProps` now extends `BasePropsFields`, so the seven
  // shared base fields that were previously absent from this factory's prop
  // type — Memos, SourceTag, LastLedgerSequence, AccountTxnID, NetworkID,
  // Delegate and TicketSequence — are part of the type surface and survive onto
  // the frozen transaction.
  //
  // Every value below is chosen to be VALID under `validateBaseTransaction`
  // (src/validation/base.ts), and the factory now calls that validator as a
  // backstop after its own ConfidentialMPTConvert-specific checks, so the
  // reject cases at the bottom of this block are reached.
  describe('BaseTransactionFields', () => {
    // `HolderEncryptionKey` is omitted, so `ZKProof` is not required.
    const base = {
      Account: ACCOUNT,
      MPTokenIssuanceID: MPT_ID,
      MPTAmount: '1000',
      HolderEncryptedAmount: CIPHERTEXT,
      IssuerEncryptedAmount: CIPHERTEXT,
      BlindingFactor: BLINDING_FACTOR,
    };
    const MEMOS = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
    const TXN_ID = 'AB'.repeat(32);
    // A valid classic address distinct from ACCOUNT.
    const DELEGATE = 'rWYkbWkCeg8dP6rXALnjgZSjjLyih5NXm';

    it('accepts Memos', () => {
      const tx = confidentialMptConvert({ ...base, Memos: MEMOS });
      expect(tx.Memos).toEqual(MEMOS);
      expect(tx.toJSON().Memos).toEqual(MEMOS);
    });

    it('accepts SourceTag', () => {
      const tx = confidentialMptConvert({ ...base, SourceTag: 99 });
      expect(tx.SourceTag).toBe(99);
      expect(tx.toJSON().SourceTag).toBe(99);
    });

    it('accepts LastLedgerSequence', () => {
      const tx = confidentialMptConvert({ ...base, LastLedgerSequence: 1_000_000 });
      expect(tx.LastLedgerSequence).toBe(1_000_000);
      expect(tx.toJSON().LastLedgerSequence).toBe(1_000_000);
    });

    it('accepts AccountTxnID', () => {
      const tx = confidentialMptConvert({ ...base, AccountTxnID: TXN_ID });
      expect(tx.AccountTxnID).toBe(TXN_ID);
      expect(tx.toJSON().AccountTxnID).toBe(TXN_ID);
    });

    it('accepts NetworkID', () => {
      const tx = confidentialMptConvert({ ...base, NetworkID: 1 });
      expect(tx.NetworkID).toBe(1);
      expect(tx.toJSON().NetworkID).toBe(1);
    });

    it('accepts a Delegate distinct from Account', () => {
      const tx = confidentialMptConvert({ ...base, Delegate: DELEGATE });
      expect(tx.Delegate).toBe(DELEGATE);
      expect(tx.toJSON().Delegate).toBe(DELEGATE);
    });

    it('accepts TicketSequence alongside Sequence: 0', () => {
      const tx = confidentialMptConvert({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.TicketSequence).toBe(42);
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    // ── Reject side ──
    // `confidentialMptConvert` now calls `validateBaseTransaction` after its
    // own ConfidentialMPTConvert-specific checks, so a malformed base field is
    // caught at construction instead of reaching `buildFrozenTx` unchecked.
    // The `as any` casts are deliberate: the point is the runtime check, and
    // a type error would make the test uncompilable.

    it('rejects a malformed Memos value', () => {
      expect(() =>
        confidentialMptConvert({ ...base, Memos: 'not-an-array' } as any),
      ).toThrow(/invalid Memos/);
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() =>
        confidentialMptConvert({ ...base, SourceTag: 'NaN' } as any),
      ).toThrow(/SourceTag must be a number/);
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() =>
        confidentialMptConvert({ ...base, LastLedgerSequence: 'soon' } as any),
      ).toThrow(/LastLedgerSequence must be a number/);
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() =>
        confidentialMptConvert({ ...base, AccountTxnID: 99 } as any),
      ).toThrow(/AccountTxnID must be a string/);
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() =>
        confidentialMptConvert({ ...base, NetworkID: {} } as any),
      ).toThrow(/NetworkID must be a number/);
    });

    it('rejects a Delegate that is not a valid address', () => {
      expect(() =>
        confidentialMptConvert({ ...base, Delegate: 'not-an-address' } as any),
      ).toThrow(/invalid Delegate/);
    });

    it('rejects Delegate equal to Account', () => {
      expect(() => confidentialMptConvert({ ...base, Delegate: ACCOUNT })).toThrow(
        /cannot be the same/,
      );
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() =>
        confidentialMptConvert({ ...base, TicketSequence: 'nope' } as any),
      ).toThrow(/TicketSequence must be a number/);
    });
  });
});