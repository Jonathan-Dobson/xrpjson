/**
 * Tests for the functional XChainAddAccountCreateAttestation factory.
 *
 * Mirrors the contract used by the other fp tests — construction-time
 * validation, frozen shape, .with() re-validation, .toJSON() shape,
 * round-trip through xrpl encode/decode. Specific to
 * XChainAddAccountCreateAttestation, we exhaustively cover:
 *
 *   - All required fields present (Account, Amount, AttestationReward-
 *     Account, AttestationSignerAccount, Destination, OtherChainSource,
 *     PublicKey, Signature, SignatureReward, WasLockingChainSend,
 *     XChainAccountCreateCount, XChainBridge).
 *   - Account-format validation on the four Account fields.
 *   - Currency Amount validation on Amount and SignatureReward.
 *   - PublicKey / Signature non-empty even-length hex Blob validation.
 *   - WasLockingChainSend literal 0 | 1 enforcement.
 *   - XChainAccountCreateCount accepts both number and string.
 *   - XChainBridge full 4-key shape with both doors as valid accounts.
 *   - .with() re-validates.
 *
 * Spec sources verified against:
 *   - xrpl.js: ~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/
 *     transactions/XChainAddAccountCreateAttestation.ts
 *   - xrpl.org: ~/.mavis/docs.local/xrpl-dev-portal/repo/docs/
 *     references/protocol/transactions/types/xchainaddaccountcreateattestation.md
 *   - XLS-38:   ~/.mavis/docs.local/xrpl-standards/repo/XLS-0038-cross-
 *     chain-bridge/README.md §2.4.2
 */
import { describe, it, expect } from 'vitest';
import { decode, encode } from 'xrpl';
import { xchainAddAccountCreateAttestation } from '../../src/fp/factories/xchain-add-account-create-attestation.js';

// Sender / attestor — xrpl.org example JSON line 27.
const ACCOUNT = 'rDr5okqGKmMpn44Bbhe5WAfDQx8e9XquEv';
// OtherChainSource — source-chain account that submitted the commit (line 29).
const OTHER_CHAIN_SOURCE = 'rUzB7yg1LcFa7m3q1hfrjr5w53vcWzNh3U';
// Destination — destination-chain account that will be created (line 30).
const DESTINATION = 'rJMfWNVbyjcCtds8kpoEjEbYQ41J5B6MUd';
// AttestationRewardAccount — line 35.
const ATTESTATION_REWARD_ACCOUNT = 'rpFp36UHW6FpEcZjZqq5jSJWY6UCj3k4Es';
// AttestationSignerAccount — line 36.
const ATTESTATION_SIGNER_ACCOUNT = 'rpWLegmW9WrFBzHUj7brhQNZzrxgLj9oxw';
// Doors — lines 40 + 44.
const LOCKING_CHAIN_DOOR = 'r3nCVTbZGGYoWvZ58BcxDmiMUU7ChMa1eC';
const ISSUING_CHAIN_DOOR = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

// Canonical XRP-XRP bridge (line 39–48).
const XCHAIN_BRIDGE_XRP = {
  LockingChainDoor: LOCKING_CHAIN_DOOR,
  LockingChainIssue: { currency: 'XRP' },
  IssuingChainDoor: ISSUING_CHAIN_DOOR,
  IssuingChainIssue: { currency: 'XRP' },
};

// xrpl.org example values (lines 31–38).
const AMOUNT = '2000000000';
const SIGNATURE_REWARD = '204';
const XCHAIN_ACCOUNT_CREATE_COUNT = '2';
const PUBLIC_KEY = 'EDF7C3F9C80C102AF6D241752B37356E91ED454F26A35C567CF6F8477960F66614';
const SIGNATURE =
  'F95675BA8FDA21030DE1B687937A79E8491CE51832D6BEEBC071484FA5AF5B8A0E9AFF11A4AA46F09ECFFB04C6A8DAE8284AF3ED8128C7D0046D842448478500';

function make(
  extras: Record<string, unknown> = {},
) {
  return xchainAddAccountCreateAttestation({
    Account: ACCOUNT,
    Amount: AMOUNT,
    AttestationRewardAccount: ATTESTATION_REWARD_ACCOUNT,
    AttestationSignerAccount: ATTESTATION_SIGNER_ACCOUNT,
    Destination: DESTINATION,
    OtherChainSource: OTHER_CHAIN_SOURCE,
    PublicKey: PUBLIC_KEY,
    Signature: SIGNATURE,
    SignatureReward: SIGNATURE_REWARD,
    WasLockingChainSend: 1,
    XChainAccountCreateCount: XCHAIN_ACCOUNT_CREATE_COUNT,
    XChainBridge: XCHAIN_BRIDGE_XRP,
    ...extras,
  });
}

describe('fp/xchainAddAccountCreateAttestation()', () => {
  // ─── Happy paths ─────────────────────────────────────────────────

  it('constructs with the full xrpl.org example shape', () => {
    const tx = make();
    expect(tx.TransactionType).toBe('XChainAddAccountCreateAttestation');
    expect(tx.Account).toBe(ACCOUNT);
    expect(tx.Amount).toBe(AMOUNT);
    expect(tx.AttestationRewardAccount).toBe(ATTESTATION_REWARD_ACCOUNT);
    expect(tx.AttestationSignerAccount).toBe(ATTESTATION_SIGNER_ACCOUNT);
    expect(tx.Destination).toBe(DESTINATION);
    expect(tx.OtherChainSource).toBe(OTHER_CHAIN_SOURCE);
    expect(tx.PublicKey).toBe(PUBLIC_KEY);
    expect(tx.Signature).toBe(SIGNATURE);
    expect(tx.SignatureReward).toBe(SIGNATURE_REWARD);
    expect(tx.WasLockingChainSend).toBe(1);
    expect(tx.XChainAccountCreateCount).toBe(XCHAIN_ACCOUNT_CREATE_COUNT);
    expect(tx.XChainBridge).toEqual(XCHAIN_BRIDGE_XRP);
  });

  it('accepts WasLockingChainSend = 0 (issuing-chain send)', () => {
    const tx = make({ WasLockingChainSend: 0 });
    expect(tx.WasLockingChainSend).toBe(0);
  });

  it('accepts XChainAccountCreateCount as a number', () => {
    const tx = make({ XChainAccountCreateCount: 7 });
    expect(tx.XChainAccountCreateCount).toBe(7);
  });

  it('accepts an IOU Amount', () => {
    const iou = {
      currency: 'USD',
      issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B',
      value: '100',
    };
    const tx = make({ Amount: iou, SignatureReward: iou });
    expect(tx.Amount).toEqual(iou);
    expect(tx.SignatureReward).toEqual(iou);
  });

  // ─── Frozen shape contract ──────────────────────────────────────

  it('returns a frozen object', () => {
    const tx = make();
    expect(Object.isFrozen(tx)).toBe(true);
  });

  it('mutation throws in strict mode (frozen at every layer)', () => {
    const tx = make();
    expect(() => {
      (tx as unknown as { Account: string }).Account = OTHER_CHAIN_SOURCE;
    }).toThrow(TypeError);
    expect(tx.Account).toBe(ACCOUNT);
  });

  // ─── Account validation ─────────────────────────────────────────

  it('throws at construction on missing Account', () => {
    expect(() =>
      xchainAddAccountCreateAttestation({
        Account: '',
        Amount: AMOUNT,
        AttestationRewardAccount: ATTESTATION_REWARD_ACCOUNT,
        AttestationSignerAccount: ATTESTATION_SIGNER_ACCOUNT,
        Destination: DESTINATION,
        OtherChainSource: OTHER_CHAIN_SOURCE,
        PublicKey: PUBLIC_KEY,
        Signature: SIGNATURE,
        SignatureReward: SIGNATURE_REWARD,
        WasLockingChainSend: 1,
        XChainAccountCreateCount: XCHAIN_ACCOUNT_CREATE_COUNT,
        XChainBridge: XCHAIN_BRIDGE_XRP,
      } as unknown as Parameters<typeof xchainAddAccountCreateAttestation>[0]),
    ).toThrow(/Account/);
  });

  it('throws on malformed Destination', () => {
    expect(() => make({ Destination: 'not-an-address' })).toThrow(
      /Destination/,
    );
  });

  it('throws on malformed AttestationSignerAccount', () => {
    expect(() => make({ AttestationSignerAccount: 'not-an-address' })).toThrow(
      /AttestationSignerAccount/,
    );
  });

  it('throws on malformed AttestationRewardAccount', () => {
    expect(() => make({ AttestationRewardAccount: 'not-an-address' })).toThrow(
      /AttestationRewardAccount/,
    );
  });

  it('throws on malformed OtherChainSource', () => {
    expect(() => make({ OtherChainSource: 'not-an-address' })).toThrow(
      /OtherChainSource/,
    );
  });

  // ─── Currency Amount validation ─────────────────────────────────

  it('throws on malformed Amount', () => {
    expect(() => make({ Amount: 42 as unknown as string })).toThrow(
      /Amount must be a Currency Amount/,
    );
  });

  it('throws on malformed SignatureReward', () => {
    expect(() => make({ SignatureReward: 42 as unknown as string })).toThrow(
      /SignatureReward must be a Currency Amount/,
    );
  });

  // ─── PublicKey / Signature Blob validation ─────────────────────

  it('throws on empty PublicKey', () => {
    expect(() => make({ PublicKey: '' })).toThrow(
      /PublicKey must not be an empty string/,
    );
  });

  it('throws on non-hex PublicKey', () => {
    expect(() => make({ PublicKey: 'not-hex' })).toThrow(
      /PublicKey must be encoded in hex/,
    );
  });

  it('throws on odd-length PublicKey', () => {
    expect(() => make({ PublicKey: 'ABC' })).toThrow(
      /PublicKey must have an even number of hex characters/,
    );
  });

  it('throws on empty Signature', () => {
    expect(() => make({ Signature: '' })).toThrow(
      /Signature must not be an empty string/,
    );
  });

  it('throws on non-hex Signature', () => {
    expect(() => make({ Signature: 'zzzzz' })).toThrow(
      /Signature must be encoded in hex/,
    );
  });

  // ─── WasLockingChainSend literal 0 | 1 ─────────────────────────

  it('throws when WasLockingChainSend is 2', () => {
    expect(() =>
      make({ WasLockingChainSend: 2 as unknown as 0 | 1 }),
    ).toThrow(/WasLockingChainSend must be exactly 0 or 1/);
  });

  it('throws when WasLockingChainSend is true (boolean)', () => {
    expect(() =>
      make({ WasLockingChainSend: true as unknown as 0 | 1 }),
    ).toThrow(/WasLockingChainSend must be exactly 0 or 1/);
  });

  // ─── XChainAccountCreateCount accepts number OR string ──────────

  it('throws when XChainAccountCreateCount is a boolean', () => {
    expect(() =>
      make({ XChainAccountCreateCount: true as unknown as number }),
    ).toThrow(/XChainAccountCreateCount must be a number or decimal string/);
  });

  // ─── XChainBridge shape ─────────────────────────────────────────

  it('throws on missing XChainBridge', () => {
    expect(() =>
      xchainAddAccountCreateAttestation({
        Account: ACCOUNT,
        Amount: AMOUNT,
        AttestationRewardAccount: ATTESTATION_REWARD_ACCOUNT,
        AttestationSignerAccount: ATTESTATION_SIGNER_ACCOUNT,
        Destination: DESTINATION,
        OtherChainSource: OTHER_CHAIN_SOURCE,
        PublicKey: PUBLIC_KEY,
        Signature: SIGNATURE,
        SignatureReward: SIGNATURE_REWARD,
        WasLockingChainSend: 1,
        XChainAccountCreateCount: XCHAIN_ACCOUNT_CREATE_COUNT,
      } as unknown as Parameters<typeof xchainAddAccountCreateAttestation>[0]),
    ).toThrow(/XChainBridge/);
  });

  it('throws when XChainBridge has wrong shape (missing doors)', () => {
    expect(() =>
      make({ XChainBridge: { foo: 'bar' } as unknown as typeof XCHAIN_BRIDGE_XRP }),
    ).toThrow(/XChainBridge/);
  });

  it('throws when XChainBridge door is not a valid XRPL address', () => {
    expect(() =>
      make({
        XChainBridge: {
          ...XCHAIN_BRIDGE_XRP,
          LockingChainDoor: 'not-an-address',
        },
      }),
    ).toThrow(/LockingChainDoor must be a valid XRPL account address/);
  });

  // ─── .with() — re-validates ─────────────────────────────────────

  it('.with() returns a new frozen tx with overrides applied', () => {
    const tx = make();
    const tx2 = tx.with({ Fee: '15', Sequence: 5 });
    expect(tx2).not.toBe(tx);
    expect(Object.isFrozen(tx2)).toBe(true);
    expect(tx2.Fee).toBe('15');
    expect(tx2.Sequence).toBe(5);
    expect(tx2.Account).toBe(ACCOUNT);
    expect(tx.Fee).toBeUndefined();
  });

  it('.with() re-validates WasLockingChainSend on override', () => {
    const tx = make();
    expect(() => tx.with({ WasLockingChainSend: 7 as unknown as 0 | 1 })).toThrow(
      /WasLockingChainSend must be exactly 0 or 1/,
    );
  });

  it('.with() re-validates XChainBridge shape on override', () => {
    const tx = make();
    expect(() =>
      tx.with({
        XChainBridge: { wrong: 'shape' } as unknown as typeof XCHAIN_BRIDGE_XRP,
      }),
    ).toThrow(/XChainBridge/);
  });

  it('.with() re-validates PublicKey hex on override', () => {
    const tx = make();
    expect(() => tx.with({ PublicKey: 'NOT_HEX' })).toThrow(
      /PublicKey must be encoded in hex/,
    );
  });

  // ─── .toJSON() ──────────────────────────────────────────────────

  it('.toJSON() produces a plain object matching xrpl.js shape', () => {
    const json = make().toJSON();
    expect(json).toEqual({
      TransactionType: 'XChainAddAccountCreateAttestation',
      Account: ACCOUNT,
      Amount: AMOUNT,
      AttestationRewardAccount: ATTESTATION_REWARD_ACCOUNT,
      AttestationSignerAccount: ATTESTATION_SIGNER_ACCOUNT,
      Destination: DESTINATION,
      OtherChainSource: OTHER_CHAIN_SOURCE,
      PublicKey: PUBLIC_KEY,
      Signature: SIGNATURE,
      SignatureReward: SIGNATURE_REWARD,
      WasLockingChainSend: 1,
      XChainAccountCreateCount: XCHAIN_ACCOUNT_CREATE_COUNT,
      XChainBridge: XCHAIN_BRIDGE_XRP,
    });
  });

  it('.toJSON() skips methods and undefined fields', () => {
    const json = make().toJSON();
    expect(json).not.toHaveProperty('validate');
    expect(json).not.toHaveProperty('toJSON');
    expect(json).not.toHaveProperty('with');
    expect(json).not.toHaveProperty('Flags');
    expect(json).not.toHaveProperty('Fee');
  });

  it('.validate() is a no-op (validation already happened)', () => {
    expect(() => make().validate()).not.toThrow();
  });

  // ─── Wire round-trip ────────────────────────────────────────────

  it('round-trips through xrpl encode/decode', () => {
    const tx = make({ Fee: '20' });
    const encoded = encode(tx.toJSON() as unknown as Parameters<typeof encode>[0]);
    expect(encoded).toBeDefined();
    const decoded = decode(encoded);
    expect(decoded.TransactionType).toBe('XChainAddAccountCreateAttestation');
    const d = decoded as {
      Account: string;
      Amount: string;
      AttestationRewardAccount: string;
      AttestationSignerAccount: string;
      Destination: string;
      OtherChainSource: string;
      PublicKey: string;
      Signature: string;
      SignatureReward: string;
      WasLockingChainSend: number;
      XChainAccountCreateCount: string;
    };
    expect(d.Account).toBe(ACCOUNT);
    expect(d.Amount).toBe(AMOUNT);
    expect(d.AttestationRewardAccount).toBe(ATTESTATION_REWARD_ACCOUNT);
    expect(d.AttestationSignerAccount).toBe(ATTESTATION_SIGNER_ACCOUNT);
    expect(d.Destination).toBe(DESTINATION);
    expect(d.OtherChainSource).toBe(OTHER_CHAIN_SOURCE);
    expect(d.PublicKey).toBe(PUBLIC_KEY);
    expect(d.Signature).toBe(SIGNATURE);
    expect(d.SignatureReward).toBe(SIGNATURE_REWARD);
    expect(d.WasLockingChainSend).toBe(1);
    // XChainAccountCreateCount is UInt64 on the wire; the binary
    // codec returns the numeric value padded to a fixed-width hex
    // string. Compare numerically rather than as exact strings.
    expect(BigInt(d.XChainAccountCreateCount)).toBe(
      BigInt(XCHAIN_ACCOUNT_CREATE_COUNT),
    );
  });
});
