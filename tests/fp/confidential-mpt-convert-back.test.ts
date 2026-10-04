/**
 * Tests for the functional ConfidentialMptConvertBack factory.
 *
 * Validates:
 *   1. Construction with all required fields (Account, MPTokenIssuanceID,
 *      MPTAmount, HolderEncryptedAmount, IssuerEncryptedAmount,
 *      BlindingFactor, BalanceCommitment, ZKProof).
 *   2. Account validation (classic address, X-address, missing, malformed).
 *   3. MPTokenIssuanceID validation: 48-char hex (UInt192), missing,
 *      wrong length, non-hex.
 *   4. MPTAmount validation: integer, non-zero, ≤ MAX_MPT_AMOUNT, decimal
 *      rejection.
 *   5. HolderEncryptedAmount / IssuerEncryptedAmount / optional
 *      AuditorEncryptedAmount: 132-char hex (66 bytes), missing, wrong
 *      length, non-hex.
 *   6. BlindingFactor validation: 64-char hex (32 bytes).
 *   7. BalanceCommitment validation: 66-char hex (33 bytes).
 *   8. ZKProof validation: 1632-char hex (816 bytes).
 *   9. Frozen-shape contract (frozen object, mutation throws,
 *      .with() returns a new frozen object, .toJSON() strips methods
 *      and undefined fields).
 *  10. .with() re-validates on overrides.
 *
 * NOTE: imports the factory file directly (not via `src/fp/index.ts`) per
 * the worker-fanout policy (no shared write target).
 */
import { describe, it, expect } from 'vitest';
import { confidentialMptConvertBack } from '../../src/fp/factories/confidential-mpt-convert-back.js';

// ─── Test fixtures ───────────────────────────────────────────────────

// Holder / submitter classic address.
const ACCOUNT = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

// 48-character hex MPT issuance ID (UInt192). Issuer portion (last 40
// hex chars) does not need to decode to ACCOUNT for the factory to accept
// it (that guard is documented as NOT IMPLEMENTED in the factory header).
const MPT_ID = '003CE807D39D78123FFBDD9401BEC038D88BD328AC353B9C';

// 66-byte ElGamal ciphertext, hex-encoded to 132 chars.
const HOLDER_CIPHERTEXT = 'AB'.repeat(66);
const ISSUER_CIPHERTEXT = 'CD'.repeat(66);
const AUDITOR_CIPHERTEXT = 'EF'.repeat(66);

// 32-byte scalar blinding factor, hex-encoded to 64 chars.
const BLINDING_FACTOR = '11'.repeat(32);

// 33-byte Pedersen commitment, hex-encoded to 66 chars.
const BALANCE_COMMITMENT = '22'.repeat(33);

// 816-byte ConvertBack proof bundle (128-byte sigma + 688-byte single
// Bulletproof range proof), hex-encoded to 1632 chars.
const ZK_PROOF = 'AB'.repeat(816);

function make(extras: Record<string, unknown> = {}) {
  return confidentialMptConvertBack({
    Account: ACCOUNT,
    MPTokenIssuanceID: MPT_ID,
    MPTAmount: '100',
    HolderEncryptedAmount: HOLDER_CIPHERTEXT,
    IssuerEncryptedAmount: ISSUER_CIPHERTEXT,
    BlindingFactor: BLINDING_FACTOR,
    BalanceCommitment: BALANCE_COMMITMENT,
    ZKProof: ZK_PROOF,
    ...extras,
  });
}

describe('fp/confidentialMptConvertBack()', () => {
  describe('construction', () => {
    it('constructs with all required fields', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('ConfidentialMPTConvertBack');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.MPTokenIssuanceID).toBe(MPT_ID);
      expect(tx.MPTAmount).toBe('100');
      expect(tx.HolderEncryptedAmount).toBe(HOLDER_CIPHERTEXT);
      expect(tx.IssuerEncryptedAmount).toBe(ISSUER_CIPHERTEXT);
      expect(tx.BlindingFactor).toBe(BLINDING_FACTOR);
      expect(tx.BalanceCommitment).toBe(BALANCE_COMMITMENT);
      expect(tx.ZKProof).toBe(ZK_PROOF);
      expect(tx.AuditorEncryptedAmount).toBeUndefined();
      expect(tx.Fee).toBeUndefined();
      expect(tx.Sequence).toBeUndefined();
    });

    it('constructs with optional AuditorEncryptedAmount', () => {
      const tx = make({ AuditorEncryptedAmount: AUDITOR_CIPHERTEXT });
      expect(tx.AuditorEncryptedAmount).toBe(AUDITOR_CIPHERTEXT);
    });

    it('constructs with base-tx fields (Fee, Sequence)', () => {
      const tx = confidentialMptConvertBack({
        Account: ACCOUNT,
        MPTokenIssuanceID: MPT_ID,
        MPTAmount: '100',
        HolderEncryptedAmount: HOLDER_CIPHERTEXT,
        IssuerEncryptedAmount: ISSUER_CIPHERTEXT,
        BlindingFactor: BLINDING_FACTOR,
        BalanceCommitment: BALANCE_COMMITMENT,
        ZKProof: ZK_PROOF,
        Fee: '100',
        Sequence: 42,
      });
      expect(tx.Fee).toBe('100');
      expect(tx.Sequence).toBe(42);
    });

    it('exposes no Flags field (ConfidentialMPTConvertBack has no per-tx flags)', () => {
      // XLS-0096 §11.3 defines no `Flags` field for this tx type.
      const tx = make();
      expect(tx.Flags).toBeUndefined();
      expect('Flags' in tx).toBe(false);
    });

    it('accepts lowercase hex fields', () => {
      const tx = confidentialMptConvertBack({
        Account: ACCOUNT,
        MPTokenIssuanceID: MPT_ID.toLowerCase(),
        MPTAmount: '100',
        HolderEncryptedAmount: HOLDER_CIPHERTEXT.toLowerCase(),
        IssuerEncryptedAmount: ISSUER_CIPHERTEXT.toLowerCase(),
        BlindingFactor: BLINDING_FACTOR.toLowerCase(),
        BalanceCommitment: BALANCE_COMMITMENT.toLowerCase(),
        ZKProof: ZK_PROOF.toLowerCase(),
      });
      expect(tx.MPTokenIssuanceID).toBe(MPT_ID.toLowerCase());
      expect(tx.HolderEncryptedAmount).toBe(HOLDER_CIPHERTEXT.toLowerCase());
    });

    it('accepts an X-address Account', () => {
      const tx = confidentialMptConvertBack({
        Account: 'X7Acg9t9WtR2Y4HXUsScrU5KhH4PmgBxX3RcL8soFpPJz8X',
        MPTokenIssuanceID: MPT_ID,
        MPTAmount: '100',
        HolderEncryptedAmount: HOLDER_CIPHERTEXT,
        IssuerEncryptedAmount: ISSUER_CIPHERTEXT,
        BlindingFactor: BLINDING_FACTOR,
        BalanceCommitment: BALANCE_COMMITMENT,
        ZKProof: ZK_PROOF,
      });
      expect(tx.Account).toBe(
        'X7Acg9t9WtR2Y4HXUsScrU5KhH4PmgBxX3RcL8soFpPJz8X',
      );
    });
  });

  describe('Account validation', () => {
    it('throws when Account is missing (empty string)', () => {
      expect(() =>
        confidentialMptConvertBack({
          Account: '',
          MPTokenIssuanceID: MPT_ID,
          MPTAmount: '100',
          HolderEncryptedAmount: HOLDER_CIPHERTEXT,
          IssuerEncryptedAmount: ISSUER_CIPHERTEXT,
          BlindingFactor: BLINDING_FACTOR,
          BalanceCommitment: BALANCE_COMMITMENT,
          ZKProof: ZK_PROOF,
        }),
      ).toThrow(/Account/);
    });

    it('throws when Account is undefined', () => {
      expect(() =>
        confidentialMptConvertBack({
          Account: undefined as never,
          MPTokenIssuanceID: MPT_ID,
          MPTAmount: '100',
          HolderEncryptedAmount: HOLDER_CIPHERTEXT,
          IssuerEncryptedAmount: ISSUER_CIPHERTEXT,
          BlindingFactor: BLINDING_FACTOR,
          BalanceCommitment: BALANCE_COMMITMENT,
          ZKProof: ZK_PROOF,
        }),
      ).toThrow(/Account/);
    });

    it('throws when Account is malformed', () => {
      expect(() => make({ Account: 'not-an-address' })).toThrow(/Account/);
    });
  });

  describe('MPTokenIssuanceID validation', () => {
    it('throws when MPTokenIssuanceID is wrong length', () => {
      expect(() =>
        make({ MPTokenIssuanceID: 'AB'.repeat(23) + 'A' }), // 47 chars
      ).toThrow(/48-character hex/);
    });

    it('throws when MPTokenIssuanceID is non-hex', () => {
      expect(() =>
        make({ MPTokenIssuanceID: 'Z'.repeat(48) }),
      ).toThrow(/48-character hex/);
    });

    it('accepts a 48-char hex MPTokenIssuanceID', () => {
      const tx = make({ MPTokenIssuanceID: MPT_ID });
      expect(tx.MPTokenIssuanceID.length).toBe(48);
    });
  });

  describe('MPTAmount validation', () => {
    it('throws when MPTAmount is zero (ConvertBack forbids zero)', () => {
      expect(() => make({ MPTAmount: '0' })).toThrow(/non-zero/);
    });

    it('throws when MPTAmount is negative', () => {
      expect(() => make({ MPTAmount: '-1' })).toThrow(
        /non-negative base-10 integer/,
      );
    });

    it('throws when MPTAmount is decimal', () => {
      expect(() => make({ MPTAmount: '1.5' })).toThrow(
        /non-negative base-10 integer/,
      );
    });

    it('throws when MPTAmount is non-numeric', () => {
      expect(() => make({ MPTAmount: 'abc' })).toThrow(
        /non-negative base-10 integer/,
      );
    });

    it('throws when MPTAmount exceeds MAX_MPT_AMOUNT (2^63)', () => {
      expect(() =>
        make({ MPTAmount: '9223372036854775808' }), // 2^63
      ).toThrow(/out of range/);
    });

    it('accepts MPTAmount at MAX_MPT_AMOUNT boundary (2^63 - 1)', () => {
      const tx = make({ MPTAmount: '9223372036854775807' });
      expect(tx.MPTAmount).toBe('9223372036854775807');
    });

    it('accepts MPTAmount = 1 (smallest non-zero)', () => {
      const tx = make({ MPTAmount: '1' });
      expect(tx.MPTAmount).toBe('1');
    });
  });

  describe('HolderEncryptedAmount validation', () => {
    it('throws when HolderEncryptedAmount is wrong length', () => {
      expect(() =>
        make({ HolderEncryptedAmount: 'AB'.repeat(65) }), // 130 chars
      ).toThrow(/HolderEncryptedAmount must be a 132-character hex/);
    });

    it('throws when HolderEncryptedAmount is non-hex', () => {
      expect(() =>
        make({ HolderEncryptedAmount: 'Z'.repeat(132) }),
      ).toThrow(/HolderEncryptedAmount must be a 132-character hex/);
    });

    it('accepts 132-char hex HolderEncryptedAmount', () => {
      const tx = make({ HolderEncryptedAmount: 'ab'.repeat(66) });
      expect(tx.HolderEncryptedAmount.length).toBe(132);
    });
  });

  describe('IssuerEncryptedAmount validation', () => {
    it('throws when IssuerEncryptedAmount is wrong length', () => {
      expect(() =>
        make({ IssuerEncryptedAmount: 'AB'.repeat(67) }), // 134 chars
      ).toThrow(/IssuerEncryptedAmount must be a 132-character hex/);
    });

    it('throws when IssuerEncryptedAmount is non-hex', () => {
      expect(() =>
        make({ IssuerEncryptedAmount: 'Z'.repeat(132) }),
      ).toThrow(/IssuerEncryptedAmount must be a 132-character hex/);
    });
  });

  describe('AuditorEncryptedAmount validation', () => {
    it('accepts omitted AuditorEncryptedAmount', () => {
      const tx = make();
      expect(tx.AuditorEncryptedAmount).toBeUndefined();
    });

    it('accepts a valid 132-char hex AuditorEncryptedAmount', () => {
      const tx = make({ AuditorEncryptedAmount: AUDITOR_CIPHERTEXT });
      expect(tx.AuditorEncryptedAmount).toBe(AUDITOR_CIPHERTEXT);
    });

    it('throws when AuditorEncryptedAmount is wrong length', () => {
      expect(() =>
        make({ AuditorEncryptedAmount: 'AB'.repeat(64) }), // 128 chars
      ).toThrow(/AuditorEncryptedAmount must be a 132-character hex/);
    });

    it('throws when AuditorEncryptedAmount is non-hex', () => {
      expect(() =>
        make({ AuditorEncryptedAmount: 'Z'.repeat(132) }),
      ).toThrow(/AuditorEncryptedAmount must be a 132-character hex/);
    });
  });

  describe('BlindingFactor validation', () => {
    it('throws when BlindingFactor is wrong length', () => {
      expect(() =>
        make({ BlindingFactor: 'AB'.repeat(31) + 'A' }), // 63 chars
      ).toThrow(/BlindingFactor must be a 64-character hex/);
    });

    it('throws when BlindingFactor is non-hex', () => {
      expect(() =>
        make({ BlindingFactor: 'Z'.repeat(64) }),
      ).toThrow(/BlindingFactor must be a 64-character hex/);
    });
  });

  describe('BalanceCommitment validation', () => {
    it('throws when BalanceCommitment is wrong length', () => {
      expect(() =>
        make({ BalanceCommitment: 'AB'.repeat(32) + 'A' }), // 65 chars
      ).toThrow(/BalanceCommitment must be a 66-character hex/);
    });

    it('throws when BalanceCommitment is non-hex', () => {
      expect(() =>
        make({ BalanceCommitment: 'Z'.repeat(66) }),
      ).toThrow(/BalanceCommitment must be a 66-character hex/);
    });
  });

  describe('ZKProof validation', () => {
    it('throws when ZKProof is wrong length', () => {
      expect(() =>
        make({ ZKProof: 'AB'.repeat(815) + 'A' }), // 1631 chars
      ).toThrow(/ZKProof must be a 1632-character hex/);
    });

    it('throws when ZKProof is non-hex', () => {
      expect(() =>
        make({ ZKProof: 'Z'.repeat(1632) }),
      ).toThrow(/ZKProof must be a 1632-character hex/);
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
        (tx as unknown as Record<string, unknown>).MPTAmount = '999';
      }).toThrow(TypeError);
    });

    it('mutation throws when overwriting Account', () => {
      const tx = make();
      expect(() => {
        (tx as unknown as Record<string, unknown>).Account =
          'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
      }).toThrow(TypeError);
    });

    it('mutation throws when attempting to assign to TransactionType', () => {
      const tx = make();
      expect(() => {
        (tx as unknown as Record<string, unknown>).TransactionType = 'Payment';
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

    it('.with() preserves unchanged fields', () => {
      const tx = make({ Fee: '15', Sequence: 7 });
      const tx2 = tx.with({ Fee: '30' });
      expect(tx2.Account).toBe(ACCOUNT);
      expect(tx2.MPTokenIssuanceID).toBe(MPT_ID);
      expect(tx2.Sequence).toBe(7);
      expect(tx2.Fee).toBe('30');
    });

    it('.with() re-validates on overrides (Account)', () => {
      const tx = make();
      expect(() => tx.with({ Account: 'garbage' })).toThrow(/Account/);
    });

    it('.with() re-validates on overrides (MPTAmount zero)', () => {
      const tx = make();
      expect(() => tx.with({ MPTAmount: '0' })).toThrow(/non-zero/);
    });

    it('.with() re-validates on overrides (ZKProof too short)', () => {
      const tx = make();
      expect(() => tx.with({ ZKProof: 'AB'.repeat(100) })).toThrow(
        /1632-character hex/,
      );
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = confidentialMptConvertBack({
        Account: ACCOUNT,
        MPTokenIssuanceID: MPT_ID,
        MPTAmount: '500',
        HolderEncryptedAmount: HOLDER_CIPHERTEXT,
        IssuerEncryptedAmount: ISSUER_CIPHERTEXT,
        BlindingFactor: BLINDING_FACTOR,
        BalanceCommitment: BALANCE_COMMITMENT,
        ZKProof: ZK_PROOF,
        Fee: '15',
        Sequence: 7,
      });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'ConfidentialMPTConvertBack',
        Account: ACCOUNT,
        MPTokenIssuanceID: MPT_ID,
        MPTAmount: '500',
        HolderEncryptedAmount: HOLDER_CIPHERTEXT,
        IssuerEncryptedAmount: ISSUER_CIPHERTEXT,
        BlindingFactor: BLINDING_FACTOR,
        BalanceCommitment: BALANCE_COMMITMENT,
        ZKProof: ZK_PROOF,
        Fee: '15',
        Sequence: 7,
      });
    });

    it('.toJSON() includes AuditorEncryptedAmount when present', () => {
      const tx = make({ AuditorEncryptedAmount: AUDITOR_CIPHERTEXT });
      const json = tx.toJSON();
      expect(json.AuditorEncryptedAmount).toBe(AUDITOR_CIPHERTEXT);
    });

    it('.toJSON() skips undefined fields and methods', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('AuditorEncryptedAmount' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
      expect('Flags' in json).toBe(false);
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
  // `ConfidentialMptConvertBackProps` now extends `BasePropsFields`, so the
  // seven shared base fields that were previously absent from this factory's
  // prop type — Memos, SourceTag, LastLedgerSequence, AccountTxnID, NetworkID,
  // Delegate and TicketSequence — are part of the type surface and survive onto
  // the frozen transaction.
  //
  // Every accept value below is chosen to be VALID under
  // `validateBaseTransaction` (src/validation/base.ts). The factory now CALLS
  // that validator as its final check, immediately before `buildFrozenTx` and
  // after every ConfidentialMPTConvertBack-specific check, so the reject cases
  // below reach the shared validator's messages — and a more specific mistake
  // still produces the ConfidentialMPTConvertBack-specific message.
  describe('BaseTransactionFields', () => {
    const base = {
      Account: ACCOUNT,
      MPTokenIssuanceID: MPT_ID,
      MPTAmount: '100',
      HolderEncryptedAmount: HOLDER_CIPHERTEXT,
      IssuerEncryptedAmount: ISSUER_CIPHERTEXT,
      BlindingFactor: BLINDING_FACTOR,
      BalanceCommitment: BALANCE_COMMITMENT,
      ZKProof: ZK_PROOF,
    };
    const MEMOS = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
    const TXN_ID = 'AB'.repeat(32);
    // A valid classic address distinct from ACCOUNT.
    const DELEGATE = 'rWYkbWkCeg8dP6rXALnjgZSjjLyih5NXm';

    it('accepts Memos', () => {
      const tx = confidentialMptConvertBack({ ...base, Memos: MEMOS });
      expect(tx.Memos).toEqual(MEMOS);
      expect(tx.toJSON().Memos).toEqual(MEMOS);
    });

    it('accepts SourceTag', () => {
      const tx = confidentialMptConvertBack({ ...base, SourceTag: 99 });
      expect(tx.SourceTag).toBe(99);
      expect(tx.toJSON().SourceTag).toBe(99);
    });

    it('accepts LastLedgerSequence', () => {
      const tx = confidentialMptConvertBack({ ...base, LastLedgerSequence: 1_000_000 });
      expect(tx.LastLedgerSequence).toBe(1_000_000);
      expect(tx.toJSON().LastLedgerSequence).toBe(1_000_000);
    });

    it('accepts AccountTxnID', () => {
      const tx = confidentialMptConvertBack({ ...base, AccountTxnID: TXN_ID });
      expect(tx.AccountTxnID).toBe(TXN_ID);
      expect(tx.toJSON().AccountTxnID).toBe(TXN_ID);
    });

    it('accepts NetworkID', () => {
      const tx = confidentialMptConvertBack({ ...base, NetworkID: 1 });
      expect(tx.NetworkID).toBe(1);
      expect(tx.toJSON().NetworkID).toBe(1);
    });

    it('accepts a Delegate distinct from Account', () => {
      const tx = confidentialMptConvertBack({ ...base, Delegate: DELEGATE });
      expect(tx.Delegate).toBe(DELEGATE);
      expect(tx.toJSON().Delegate).toBe(DELEGATE);
    });

    it('accepts TicketSequence alongside Sequence: 0', () => {
      const tx = confidentialMptConvertBack({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.TicketSequence).toBe(42);
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    it('rejects a malformed Memos value', () => {
      expect(() =>
        confidentialMptConvertBack({ ...base, Memos: 'not-an-array' } as any),
      ).toThrow(/invalid Memos/);
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() =>
        confidentialMptConvertBack({ ...base, SourceTag: 'NaN' } as any),
      ).toThrow(/SourceTag must be a number/);
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() =>
        confidentialMptConvertBack({ ...base, LastLedgerSequence: 'soon' } as any),
      ).toThrow(/LastLedgerSequence must be a number/);
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() =>
        confidentialMptConvertBack({ ...base, AccountTxnID: 12345 } as any),
      ).toThrow(/AccountTxnID must be a string/);
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() =>
        confidentialMptConvertBack({ ...base, NetworkID: {} } as any),
      ).toThrow(/NetworkID must be a number/);
    });

    it('rejects Delegate equal to Account', () => {
      expect(() =>
        confidentialMptConvertBack({ ...base, Delegate: ACCOUNT }),
      ).toThrow(/cannot be the same/);
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() =>
        confidentialMptConvertBack({ ...base, TicketSequence: 'nope' } as any),
      ).toThrow(/TicketSequence must be a number/);
    });
  });
});
