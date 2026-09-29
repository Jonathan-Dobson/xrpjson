/**
 * Tests for the functional ConfidentialMptSend factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, MPTokenIssuanceID,
 *      Destination, 3 ciphertexts, ZKProof, 2 commitments).
 *   2. Optional fields (DestinationTag, AuditorEncryptedAmount,
 *      CredentialIDs, Fee, Sequence).
 *   3. Account validation (classic, X-address, missing, malformed,
 *      Account !== Destination).
 *   4. MPTokenIssuanceID validation: 48-char hex (UInt192), missing,
 *      wrong length, non-hex.
 *   5. Destination validation (missing, malformed, same as Account).
 *   6. DestinationTag validation (type, range).
 *   7. Ciphertext fields: Sender / Destination / Issuer / Auditor
 *      (66-byte hex, 132 hex chars).
 *   8. ZKProof length (946-byte hex, 1892 hex chars).
 *   9. AmountCommitment / BalanceCommitment length (33-byte hex,
 *      66 hex chars).
 *  10. CredentialIDs validation: must be array if present, non-empty,
 *      length ≤ 8, each a 64-char hex, no duplicates.
 *  11. Frozen-shape contract (frozen, mutation throws, .with() returns
 *      a new frozen object, .toJSON() strips methods and undefined
 *      fields).
 *  12. .with() re-validates on overrides.
 */
import { describe, it, expect } from 'vitest';
import { confidentialMptSend } from '../../src/fp/factories/confidential-mpt-send.js';

// ─── Test fixtures ───────────────────────────────────────────────────

const ACCOUNT = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const DESTINATION = 'rUY3q8Dr3nhEpyMEvWmcg7cuCv9UkEyGy9';
const X_ADDRESS_ACCOUNT =
  'X7Acg9t9WtR2Y4HXUsScrU5KhH4PmgBxX3RcL8soFpPJz8X';

// 48-character hex MPT issuance ID (UInt192).
const MPT_ID = 'AB'.repeat(24);

// 66-byte ElGamal ciphertext → 132 hex chars.
const CIPHERTEXT = `02${'AB'.repeat(32)}03${'CD'.repeat(32)}`;

// 33-byte compressed EC point → 66 hex chars.
const EC_POINT = `02${'AB'.repeat(32)}`;

// 946-byte ConfidentialMPTSend proof → 1892 hex chars.
const ZK_PROOF = 'AB'.repeat(946);

// 64-character credential IDs.
const CREDENTIAL_ID_1 =
  'EA85602C1B41F6F1F5E83C0E6B87142FB8957BD209469E4CC347BA2D0C26F66A';
const CREDENTIAL_ID_2 =
  'EA85602C1B41F6F1F5E83C0E6B87142FB8957BD209469E4CC347BA2D0C26F66B';

function make(extras: Record<string, unknown> = {}) {
  return confidentialMptSend({
    Account: ACCOUNT,
    MPTokenIssuanceID: MPT_ID,
    Destination: DESTINATION,
    SenderEncryptedAmount: CIPHERTEXT,
    DestinationEncryptedAmount: CIPHERTEXT,
    IssuerEncryptedAmount: CIPHERTEXT,
    ZKProof: ZK_PROOF,
    AmountCommitment: EC_POINT,
    BalanceCommitment: EC_POINT,
    ...extras,
  });
}

describe('fp/confidentialMptSend()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('ConfidentialMPTSend');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.MPTokenIssuanceID).toBe(MPT_ID);
      expect(tx.Destination).toBe(DESTINATION);
      expect(tx.SenderEncryptedAmount).toBe(CIPHERTEXT);
      expect(tx.DestinationEncryptedAmount).toBe(CIPHERTEXT);
      expect(tx.IssuerEncryptedAmount).toBe(CIPHERTEXT);
      expect(tx.AmountCommitment).toBe(EC_POINT);
      expect(tx.BalanceCommitment).toBe(EC_POINT);
      expect(tx.ZKProof).toBe(ZK_PROOF);
    });

    it('omits all optional fields by default', () => {
      const tx = make();
      expect(tx.DestinationTag).toBeUndefined();
      expect(tx.AuditorEncryptedAmount).toBeUndefined();
      expect(tx.CredentialIDs).toBeUndefined();
      expect(tx.Fee).toBeUndefined();
      expect(tx.Sequence).toBeUndefined();
    });

    it('accepts every optional field', () => {
      const tx = confidentialMptSend({
        Account: ACCOUNT,
        MPTokenIssuanceID: MPT_ID,
        Destination: DESTINATION,
        DestinationTag: 12345,
        SenderEncryptedAmount: CIPHERTEXT,
        DestinationEncryptedAmount: CIPHERTEXT,
        IssuerEncryptedAmount: CIPHERTEXT,
        AuditorEncryptedAmount: CIPHERTEXT,
        ZKProof: ZK_PROOF,
        AmountCommitment: EC_POINT,
        BalanceCommitment: EC_POINT,
        CredentialIDs: [CREDENTIAL_ID_1],
        Fee: '100',
        Sequence: 42,
      });
      expect(tx.DestinationTag).toBe(12345);
      expect(tx.AuditorEncryptedAmount).toBe(CIPHERTEXT);
      expect(tx.CredentialIDs).toEqual([CREDENTIAL_ID_1]);
      expect(tx.Fee).toBe('100');
      expect(tx.Sequence).toBe(42);
    });

    it('exposes no Flags field (ConfidentialMPTSend defines no flags)', () => {
      const tx = make();
      expect(tx.Flags).toBeUndefined();
      expect('Flags' in tx).toBe(false);
    });

    it('accepts lowercase hex for ciphertext / commitment / ZKProof', () => {
      const tx = confidentialMptSend({
        Account: ACCOUNT,
        MPTokenIssuanceID: MPT_ID,
        Destination: DESTINATION,
        SenderEncryptedAmount: CIPHERTEXT.toLowerCase(),
        DestinationEncryptedAmount: CIPHERTEXT.toLowerCase(),
        IssuerEncryptedAmount: CIPHERTEXT.toLowerCase(),
        ZKProof: ZK_PROOF.toLowerCase(),
        AmountCommitment: EC_POINT.toLowerCase(),
        BalanceCommitment: EC_POINT.toLowerCase(),
      });
      expect(tx.SenderEncryptedAmount).toBe(CIPHERTEXT.toLowerCase());
    });

    it('accepts an X-address as Account', () => {
      const tx = confidentialMptSend({
        Account: X_ADDRESS_ACCOUNT,
        MPTokenIssuanceID: MPT_ID,
        Destination: DESTINATION,
        SenderEncryptedAmount: CIPHERTEXT,
        DestinationEncryptedAmount: CIPHERTEXT,
        IssuerEncryptedAmount: CIPHERTEXT,
        ZKProof: ZK_PROOF,
        AmountCommitment: EC_POINT,
        BalanceCommitment: EC_POINT,
      });
      expect(tx.Account).toBe(X_ADDRESS_ACCOUNT);
    });

    it('accepts an X-address as Destination', () => {
      const tx = confidentialMptSend({
        Account: ACCOUNT,
        MPTokenIssuanceID: MPT_ID,
        Destination: X_ADDRESS_ACCOUNT,
        SenderEncryptedAmount: CIPHERTEXT,
        DestinationEncryptedAmount: CIPHERTEXT,
        IssuerEncryptedAmount: CIPHERTEXT,
        ZKProof: ZK_PROOF,
        AmountCommitment: EC_POINT,
        BalanceCommitment: EC_POINT,
      });
      expect(tx.Destination).toBe(X_ADDRESS_ACCOUNT);
    });
  });

  describe('Account validation', () => {
    it('throws when Account is missing (empty string)', () => {
      expect(() =>
        confidentialMptSend({
          Account: '',
          MPTokenIssuanceID: MPT_ID,
          Destination: DESTINATION,
          SenderEncryptedAmount: CIPHERTEXT,
          DestinationEncryptedAmount: CIPHERTEXT,
          IssuerEncryptedAmount: CIPHERTEXT,
          ZKProof: ZK_PROOF,
          AmountCommitment: EC_POINT,
          BalanceCommitment: EC_POINT,
        }),
      ).toThrow(/Account/);
    });

    it('throws when Account is undefined', () => {
      expect(() =>
        confidentialMptSend({
          Account: undefined as never,
          MPTokenIssuanceID: MPT_ID,
          Destination: DESTINATION,
          SenderEncryptedAmount: CIPHERTEXT,
          DestinationEncryptedAmount: CIPHERTEXT,
          IssuerEncryptedAmount: CIPHERTEXT,
          ZKProof: ZK_PROOF,
          AmountCommitment: EC_POINT,
          BalanceCommitment: EC_POINT,
        }),
      ).toThrow(/Account/);
    });

    it('throws when Account is malformed', () => {
      expect(() =>
        confidentialMptSend({
          Account: 'not-an-address',
          MPTokenIssuanceID: MPT_ID,
          Destination: DESTINATION,
          SenderEncryptedAmount: CIPHERTEXT,
          DestinationEncryptedAmount: CIPHERTEXT,
          IssuerEncryptedAmount: CIPHERTEXT,
          ZKProof: ZK_PROOF,
          AmountCommitment: EC_POINT,
          BalanceCommitment: EC_POINT,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('Destination validation', () => {
    it('throws when Destination is missing', () => {
      expect(() =>
        confidentialMptSend({
          Account: ACCOUNT,
          MPTokenIssuanceID: MPT_ID,
          Destination: '',
          SenderEncryptedAmount: CIPHERTEXT,
          DestinationEncryptedAmount: CIPHERTEXT,
          IssuerEncryptedAmount: CIPHERTEXT,
          ZKProof: ZK_PROOF,
          AmountCommitment: EC_POINT,
          BalanceCommitment: EC_POINT,
        }),
      ).toThrow(/Destination/);
    });

    it('throws when Destination is malformed', () => {
      expect(() =>
        confidentialMptSend({
          Account: ACCOUNT,
          MPTokenIssuanceID: MPT_ID,
          Destination: 'bogus',
          SenderEncryptedAmount: CIPHERTEXT,
          DestinationEncryptedAmount: CIPHERTEXT,
          IssuerEncryptedAmount: CIPHERTEXT,
          ZKProof: ZK_PROOF,
          AmountCommitment: EC_POINT,
          BalanceCommitment: EC_POINT,
        }),
      ).toThrow(/Destination/);
    });

    it('throws when Destination equals Account (XLS-0096 §9.4.1.4)', () => {
      expect(() =>
        confidentialMptSend({
          Account: ACCOUNT,
          MPTokenIssuanceID: MPT_ID,
          Destination: ACCOUNT,
          SenderEncryptedAmount: CIPHERTEXT,
          DestinationEncryptedAmount: CIPHERTEXT,
          IssuerEncryptedAmount: CIPHERTEXT,
          ZKProof: ZK_PROOF,
          AmountCommitment: EC_POINT,
          BalanceCommitment: EC_POINT,
        }),
      ).toThrow(/must be different/);
    });
  });

  describe('MPTokenIssuanceID validation', () => {
    it('throws when MPTokenIssuanceID is missing', () => {
      expect(() =>
        confidentialMptSend({
          Account: ACCOUNT,
          MPTokenIssuanceID: '',
          Destination: DESTINATION,
          SenderEncryptedAmount: CIPHERTEXT,
          DestinationEncryptedAmount: CIPHERTEXT,
          IssuerEncryptedAmount: CIPHERTEXT,
          ZKProof: ZK_PROOF,
          AmountCommitment: EC_POINT,
          BalanceCommitment: EC_POINT,
        }),
      ).toThrow(/MPTokenIssuanceID/);
    });

    it('throws when MPTokenIssuanceID is too short (47 hex chars)', () => {
      expect(() =>
        confidentialMptSend({
          Account: ACCOUNT,
          MPTokenIssuanceID: 'AB'.repeat(23) + 'A',
          Destination: DESTINATION,
          SenderEncryptedAmount: CIPHERTEXT,
          DestinationEncryptedAmount: CIPHERTEXT,
          IssuerEncryptedAmount: CIPHERTEXT,
          ZKProof: ZK_PROOF,
          AmountCommitment: EC_POINT,
          BalanceCommitment: EC_POINT,
        }),
      ).toThrow(/48-character hex/);
    });

    it('throws when MPTokenIssuanceID is non-hex', () => {
      expect(() =>
        confidentialMptSend({
          Account: ACCOUNT,
          MPTokenIssuanceID: 'Z'.repeat(48),
          Destination: DESTINATION,
          SenderEncryptedAmount: CIPHERTEXT,
          DestinationEncryptedAmount: CIPHERTEXT,
          IssuerEncryptedAmount: CIPHERTEXT,
          ZKProof: ZK_PROOF,
          AmountCommitment: EC_POINT,
          BalanceCommitment: EC_POINT,
        }),
      ).toThrow(/48-character hex/);
    });
  });

  describe('DestinationTag validation', () => {
    it('accepts a valid DestinationTag (UINT32)', () => {
      const tx = make({ DestinationTag: 12345 });
      expect(tx.DestinationTag).toBe(12345);
    });

    it('accepts DestinationTag = 0', () => {
      const tx = make({ DestinationTag: 0 });
      expect(tx.DestinationTag).toBe(0);
    });

    it('throws on non-integer DestinationTag', () => {
      expect(() => make({ DestinationTag: 1.5 })).toThrow(/DestinationTag/);
    });

    it('throws on negative DestinationTag', () => {
      expect(() => make({ DestinationTag: -1 })).toThrow(/DestinationTag/);
    });

    it('throws on string DestinationTag', () => {
      expect(() => make({ DestinationTag: '12345' as never })).toThrow(
        /DestinationTag/,
      );
    });
  });

  describe('ciphertext validation', () => {
    it('throws on SenderEncryptedAmount of wrong length', () => {
      expect(() =>
        confidentialMptSend({
          Account: ACCOUNT,
          MPTokenIssuanceID: MPT_ID,
          Destination: DESTINATION,
          SenderEncryptedAmount: EC_POINT, // 33-byte where 66-byte is required
          DestinationEncryptedAmount: CIPHERTEXT,
          IssuerEncryptedAmount: CIPHERTEXT,
          ZKProof: ZK_PROOF,
          AmountCommitment: EC_POINT,
          BalanceCommitment: EC_POINT,
        }),
      ).toThrow(/SenderEncryptedAmount/);
    });

    it('throws on DestinationEncryptedAmount of wrong length', () => {
      expect(() =>
        confidentialMptSend({
          Account: ACCOUNT,
          MPTokenIssuanceID: MPT_ID,
          Destination: DESTINATION,
          SenderEncryptedAmount: CIPHERTEXT,
          DestinationEncryptedAmount: EC_POINT,
          IssuerEncryptedAmount: CIPHERTEXT,
          ZKProof: ZK_PROOF,
          AmountCommitment: EC_POINT,
          BalanceCommitment: EC_POINT,
        }),
      ).toThrow(/DestinationEncryptedAmount/);
    });

    it('throws on IssuerEncryptedAmount of wrong length', () => {
      expect(() =>
        confidentialMptSend({
          Account: ACCOUNT,
          MPTokenIssuanceID: MPT_ID,
          Destination: DESTINATION,
          SenderEncryptedAmount: CIPHERTEXT,
          DestinationEncryptedAmount: CIPHERTEXT,
          IssuerEncryptedAmount: EC_POINT,
          ZKProof: ZK_PROOF,
          AmountCommitment: EC_POINT,
          BalanceCommitment: EC_POINT,
        }),
      ).toThrow(/IssuerEncryptedAmount/);
    });

    it('throws on non-hex SenderEncryptedAmount', () => {
      expect(() =>
        confidentialMptSend({
          Account: ACCOUNT,
          MPTokenIssuanceID: MPT_ID,
          Destination: DESTINATION,
          SenderEncryptedAmount: 'Z'.repeat(132),
          DestinationEncryptedAmount: CIPHERTEXT,
          IssuerEncryptedAmount: CIPHERTEXT,
          ZKProof: ZK_PROOF,
          AmountCommitment: EC_POINT,
          BalanceCommitment: EC_POINT,
        }),
      ).toThrow(/SenderEncryptedAmount/);
    });

    it('accepts optional AuditorEncryptedAmount when 132-char hex', () => {
      const tx = make({ AuditorEncryptedAmount: CIPHERTEXT });
      expect(tx.AuditorEncryptedAmount).toBe(CIPHERTEXT);
    });

    it('throws on AuditorEncryptedAmount of wrong length', () => {
      expect(() =>
        make({ AuditorEncryptedAmount: EC_POINT }),
      ).toThrow(/AuditorEncryptedAmount/);
    });

    it('throws on AuditorEncryptedAmount that is non-hex', () => {
      expect(() =>
        make({ AuditorEncryptedAmount: 'Z'.repeat(132) }),
      ).toThrow(/AuditorEncryptedAmount/);
    });
  });

  describe('commitment / ZKProof validation', () => {
    it('throws on AmountCommitment of wrong length (66-byte ciphertext where 33-byte required)', () => {
      expect(() =>
        confidentialMptSend({
          Account: ACCOUNT,
          MPTokenIssuanceID: MPT_ID,
          Destination: DESTINATION,
          SenderEncryptedAmount: CIPHERTEXT,
          DestinationEncryptedAmount: CIPHERTEXT,
          IssuerEncryptedAmount: CIPHERTEXT,
          ZKProof: ZK_PROOF,
          AmountCommitment: CIPHERTEXT,
          BalanceCommitment: EC_POINT,
        }),
      ).toThrow(/AmountCommitment/);
    });

    it('throws on BalanceCommitment of wrong length', () => {
      expect(() =>
        confidentialMptSend({
          Account: ACCOUNT,
          MPTokenIssuanceID: MPT_ID,
          Destination: DESTINATION,
          SenderEncryptedAmount: CIPHERTEXT,
          DestinationEncryptedAmount: CIPHERTEXT,
          IssuerEncryptedAmount: CIPHERTEXT,
          ZKProof: ZK_PROOF,
          AmountCommitment: EC_POINT,
          BalanceCommitment: CIPHERTEXT,
        }),
      ).toThrow(/BalanceCommitment/);
    });

    it('throws on non-hex AmountCommitment', () => {
      expect(() =>
        confidentialMptSend({
          Account: ACCOUNT,
          MPTokenIssuanceID: MPT_ID,
          Destination: DESTINATION,
          SenderEncryptedAmount: CIPHERTEXT,
          DestinationEncryptedAmount: CIPHERTEXT,
          IssuerEncryptedAmount: CIPHERTEXT,
          ZKProof: ZK_PROOF,
          AmountCommitment: 'Z'.repeat(66),
          BalanceCommitment: EC_POINT,
        }),
      ).toThrow(/AmountCommitment/);
    });

    it('throws on ZKProof shorter than 946 bytes', () => {
      expect(() =>
        confidentialMptSend({
          Account: ACCOUNT,
          MPTokenIssuanceID: MPT_ID,
          Destination: DESTINATION,
          SenderEncryptedAmount: CIPHERTEXT,
          DestinationEncryptedAmount: CIPHERTEXT,
          IssuerEncryptedAmount: CIPHERTEXT,
          ZKProof: 'AB'.repeat(64),
          AmountCommitment: EC_POINT,
          BalanceCommitment: EC_POINT,
        }),
      ).toThrow(/ZKProof/);
    });

    it('throws on ZKProof longer than 946 bytes', () => {
      expect(() =>
        confidentialMptSend({
          Account: ACCOUNT,
          MPTokenIssuanceID: MPT_ID,
          Destination: DESTINATION,
          SenderEncryptedAmount: CIPHERTEXT,
          DestinationEncryptedAmount: CIPHERTEXT,
          IssuerEncryptedAmount: CIPHERTEXT,
          ZKProof: 'AB'.repeat(1024),
          AmountCommitment: EC_POINT,
          BalanceCommitment: EC_POINT,
        }),
      ).toThrow(/ZKProof/);
    });

    it('throws on non-hex ZKProof of correct length', () => {
      expect(() =>
        confidentialMptSend({
          Account: ACCOUNT,
          MPTokenIssuanceID: MPT_ID,
          Destination: DESTINATION,
          SenderEncryptedAmount: CIPHERTEXT,
          DestinationEncryptedAmount: CIPHERTEXT,
          IssuerEncryptedAmount: CIPHERTEXT,
          ZKProof: 'Z'.repeat(1892),
          AmountCommitment: EC_POINT,
          BalanceCommitment: EC_POINT,
        }),
      ).toThrow(/ZKProof/);
    });
  });

  describe('CredentialIDs validation', () => {
    it('accepts a single 64-char hex credential', () => {
      const tx = make({ CredentialIDs: [CREDENTIAL_ID_1] });
      expect(tx.CredentialIDs).toEqual([CREDENTIAL_ID_1]);
    });

    it('accepts up to 8 credentials', () => {
      const ids = Array.from(
        { length: 8 },
        (_, i) =>
          `EA85602C1B41F6F1F5E83C0E6B87142FB8957BD209469E4CC347BA2D0C26F66${
            i.toString(16).toUpperCase().padStart(1, '0')
          }`,
      );
      const tx = make({ CredentialIDs: ids });
      expect(tx.CredentialIDs).toHaveLength(8);
    });

    it('throws when CredentialIDs is a single non-array value', () => {
      expect(() => make({ CredentialIDs: CREDENTIAL_ID_1 as never })).toThrow(
        /array/,
      );
    });

    it('throws when CredentialIDs is an empty array (XLS-0096 temMALFORMED)', () => {
      expect(() => make({ CredentialIDs: [] })).toThrow(/empty array/);
    });

    it('throws when CredentialIDs has more than 8 elements', () => {
      const ids = Array.from(
        { length: 9 },
        (_, i) =>
          `EA85602C1B41F6F1F5E83C0E6B87142FB8957BD209469E4CC347BA2D0C26F66${
            i.toString(16).toUpperCase().padStart(1, '0')
          }`,
      );
      expect(() => make({ CredentialIDs: ids })).toThrow(/cannot exceed 8/);
    });

    it('throws when a credential ID is non-hex', () => {
      expect(() =>
        make({ CredentialIDs: ['Z'.repeat(64)] }),
      ).toThrow(/64-character hex/);
    });

    it('throws when a credential ID is the wrong length', () => {
      expect(() => make({ CredentialIDs: ['AB'.repeat(20)] })).toThrow(
        /64-character hex/,
      );
    });

    it('throws when CredentialIDs contains duplicates', () => {
      expect(() =>
        make({ CredentialIDs: [CREDENTIAL_ID_1, CREDENTIAL_ID_1] }),
      ).toThrow(/duplicates/);
    });

    it('accepts two distinct credential IDs', () => {
      const tx = make({
        CredentialIDs: [CREDENTIAL_ID_1, CREDENTIAL_ID_2],
      });
      expect(tx.CredentialIDs).toEqual([CREDENTIAL_ID_1, CREDENTIAL_ID_2]);
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
        (tx as unknown as Record<string, unknown>).Destination = 'changed';
      }).toThrow(TypeError);
    });

    it('mutation throws when overwriting MPTokenIssuanceID', () => {
      const tx = make();
      expect(() => {
        (tx as unknown as Record<string, unknown>).MPTokenIssuanceID =
          'CD'.repeat(24);
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
      expect(tx2.Destination).toBe(DESTINATION);
      expect(tx2.Sequence).toBe(7);
      expect(tx2.Fee).toBe('30');
    });

    it('.with() re-validates on overrides (Destination equality)', () => {
      const tx = make();
      expect(() => tx.with({ Destination: ACCOUNT })).toThrow(
        /must be different/,
      );
    });

    it('.with() re-validates on overrides (bad MPTokenIssuanceID)', () => {
      const tx = make();
      expect(() =>
        tx.with({ MPTokenIssuanceID: 'too-short' }),
      ).toThrow(/48-character hex/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = confidentialMptSend({
        Account: ACCOUNT,
        MPTokenIssuanceID: MPT_ID,
        Destination: DESTINATION,
        DestinationTag: 12345,
        SenderEncryptedAmount: CIPHERTEXT,
        DestinationEncryptedAmount: CIPHERTEXT,
        IssuerEncryptedAmount: CIPHERTEXT,
        ZKProof: ZK_PROOF,
        AmountCommitment: EC_POINT,
        BalanceCommitment: EC_POINT,
        CredentialIDs: [CREDENTIAL_ID_1],
        Fee: '15',
        Sequence: 7,
      });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'ConfidentialMPTSend',
        Account: ACCOUNT,
        MPTokenIssuanceID: MPT_ID,
        Destination: DESTINATION,
        DestinationTag: 12345,
        SenderEncryptedAmount: CIPHERTEXT,
        DestinationEncryptedAmount: CIPHERTEXT,
        IssuerEncryptedAmount: CIPHERTEXT,
        ZKProof: ZK_PROOF,
        AmountCommitment: EC_POINT,
        BalanceCommitment: EC_POINT,
        CredentialIDs: [CREDENTIAL_ID_1],
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
      expect('AuditorEncryptedAmount' in json).toBe(false);
      expect('CredentialIDs' in json).toBe(false);
      expect('DestinationTag' in json).toBe(false);
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
});