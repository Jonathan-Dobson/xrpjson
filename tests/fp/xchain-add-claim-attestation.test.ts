/**
 * Tests for the functional XChainAddClaimAttestation factory.
 *
 * Mirrors the contract used by the other fp tests — construction-time
 * validation, frozen shape, .with() re-validation, .toJSON() shape.
 * Specific to XChainAddClaimAttestation, we cover:
 *
 *   - All required fields present (Account, Amount,
 *     AttestationRewardAccount, AttestationSignerAccount, Destination
 *     (optional), OtherChainSource, PublicKey, Signature,
 *     WasLockingChainSend, XChainClaimID, XChainBridge).
 *   - Account-format validation on the five Account fields.
 *   - Currency Amount validation on Amount.
 *   - PublicKey / Signature non-empty even-length hex Blob validation.
 *   - WasLockingChainSend literal 0 | 1 enforcement.
 *   - XChainClaimID accepts both number and string.
 *   - XChainBridge full 4-key shape with both doors as valid accounts.
 *   - .with() re-validates.
 *   - XChainAttestationSequence is NOT a field of this tx (the class
 *     invented it; the factory omits it).
 *
 * Spec sources verified against:
 *   - xrpl.js: ~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/
 *     transactions/XChainAddClaimAttestation.ts
 *   - xrpl.org: ~/.mavis/docs.local/xrpl-dev-portal/repo/docs/
 *     references/protocol/transactions/types/xchainaddclaimattestation.md
 *   - XLS-38:   ~/.mavis/docs.local/xrpl-standards/repo/XLS-0038-cross-
 *     chain-bridge/README.md §2.3.3
 */
import { describe, it, expect } from 'vitest';
import { xchainAddClaimAttestation } from '../../src/fp/factories/xchain-add-claim-attestation.js';

// Sender / attestor — xrpl.org example JSON line 27 (witness).
const ACCOUNT = 'rnJmYAiqEVngtnb5ckRroXLtCbWC7CRUBx';
// OtherChainSource — source-chain account that submitted the commit.
const OTHER_CHAIN_SOURCE = 'rJMfWNVbyjcCtds8kpoEjEbYQ41J5B6MUd';
// Destination — destination-chain account that will receive the funds
// (line 46 of xrpl.org example JSON).
const DESTINATION = 'r9A8UyNpW3X46FUc6P7JZqgn6WgAPjBwPg';
// AttestationRewardAccount — receives this signer's share of the
// SignatureReward.
const ATTESTATION_REWARD_ACCOUNT = 'rEziJZmeZzsJvGVUmpUTey7qxQLKYxaK9f';
// AttestationSignerAccount — the account on the door account's signer
// list that is signing the transaction.
const ATTESTATION_SIGNER_ACCOUNT = 'rpWLegmW9WrFBzHUj7brhQNZzrxgLj9oxw';
// Doors — xrpl.org example JSON line 40 + 44.
const LOCKING_CHAIN_DOOR = 'rJvExveLEL4jNDEeLKCVdxaSCN9cEBnEQC';
const ISSUING_CHAIN_DOOR = 'rKeSSvHvaMZJp9ykaxutVwkhZgWuWMLnQt';

// Canonical XRP-XRP bridge.
const XCHAIN_BRIDGE_XRP = {
  LockingChainDoor: LOCKING_CHAIN_DOOR,
  LockingChainIssue: { currency: 'XRP' },
  IssuingChainDoor: ISSUING_CHAIN_DOOR,
  IssuingChainIssue: { currency: 'XRP' },
};

// xrpl.org example values (line 44, 47, 48, 49, 50).
const AMOUNT = '100000000';
const PUBLIC_KEY = '03DAB289CA36FF377F3F4304C7A7203FDE5EDCBFC209F430F6A4355361425526D0';
const SIGNATURE = '616263';
const XCHAIN_CLAIM_ID = '0000000000000000';

function make(extras: Record<string, unknown> = {}) {
  return xchainAddClaimAttestation({
    Account: ACCOUNT,
    Amount: AMOUNT,
    AttestationRewardAccount: ATTESTATION_REWARD_ACCOUNT,
    AttestationSignerAccount: ATTESTATION_SIGNER_ACCOUNT,
    Destination: DESTINATION,
    OtherChainSource: OTHER_CHAIN_SOURCE,
    PublicKey: PUBLIC_KEY,
    Signature: SIGNATURE,
    WasLockingChainSend: 1,
    XChainClaimID: XCHAIN_CLAIM_ID,
    XChainBridge: XCHAIN_BRIDGE_XRP,
    ...extras,
  });
}

describe('fp/xchainAddClaimAttestation()', () => {
  // ─── Happy paths ─────────────────────────────────────────────────

  it('constructs with the full xrpl.org example shape', () => {
    const tx = make();
    expect(tx.TransactionType).toBe('XChainAddClaimAttestation');
    expect(tx.Account).toBe(ACCOUNT);
    expect(tx.Amount).toBe(AMOUNT);
    expect(tx.AttestationRewardAccount).toBe(ATTESTATION_REWARD_ACCOUNT);
    expect(tx.AttestationSignerAccount).toBe(ATTESTATION_SIGNER_ACCOUNT);
    expect(tx.Destination).toBe(DESTINATION);
    expect(tx.OtherChainSource).toBe(OTHER_CHAIN_SOURCE);
    expect(tx.PublicKey).toBe(PUBLIC_KEY);
    expect(tx.Signature).toBe(SIGNATURE);
    expect(tx.WasLockingChainSend).toBe(1);
    expect(tx.XChainClaimID).toBe(XCHAIN_CLAIM_ID);
    expect(tx.XChainBridge).toEqual(XCHAIN_BRIDGE_XRP);
  });

  it('accepts WasLockingChainSend = 0 (issuing-chain send)', () => {
    const tx = make({ WasLockingChainSend: 0 });
    expect(tx.WasLockingChainSend).toBe(0);
  });

  it('accepts XChainClaimID as a number', () => {
    const tx = make({ XChainClaimID: 1 });
    expect(tx.XChainClaimID).toBe(1);
  });

  it('accepts Destination = undefined (optional per XLS-38 §2.3.3.1.4)', () => {
    // xrpl.js uses validateOptionalField; XLS-38 line 467 has no ✔️ on
    // Destination. The factory allows it to be omitted entirely.
    const tx = xchainAddClaimAttestation({
      Account: ACCOUNT,
      Amount: AMOUNT,
      AttestationRewardAccount: ATTESTATION_REWARD_ACCOUNT,
      AttestationSignerAccount: ATTESTATION_SIGNER_ACCOUNT,
      OtherChainSource: OTHER_CHAIN_SOURCE,
      PublicKey: PUBLIC_KEY,
      Signature: SIGNATURE,
      WasLockingChainSend: 1,
      XChainClaimID: XCHAIN_CLAIM_ID,
      XChainBridge: XCHAIN_BRIDGE_XRP,
    });
    expect(tx.Destination).toBeUndefined();
    expect('Destination' in tx).toBe(false);
  });

  it('accepts an IOU Amount (XRP-XRP or IOU-IOU bridge)', () => {
    const iou = {
      currency: 'USD',
      issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B',
      value: '100',
    };
    const tx = make({ Amount: iou });
    expect(tx.Amount).toEqual(iou);
  });

  // ─── XChainAttestationSequence is not in the spec ───────────────

  it('does not expose XChainAttestationSequence (class-invented field)', () => {
    // The class declares XChainAttestationSequence as a required field,
    // but no canonical source defines it. The factory omits it entirely.
    const tx = make();
    expect(tx.XChainAttestationSequence).toBeUndefined();
    expect('XChainAttestationSequence' in tx).toBe(false);
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
      xchainAddClaimAttestation({
        Account: '',
        Amount: AMOUNT,
        AttestationRewardAccount: ATTESTATION_REWARD_ACCOUNT,
        AttestationSignerAccount: ATTESTATION_SIGNER_ACCOUNT,
        OtherChainSource: OTHER_CHAIN_SOURCE,
        PublicKey: PUBLIC_KEY,
        Signature: SIGNATURE,
        WasLockingChainSend: 1,
        XChainClaimID: XCHAIN_CLAIM_ID,
        XChainBridge: XCHAIN_BRIDGE_XRP,
      } as unknown as Parameters<typeof xchainAddClaimAttestation>[0]),
    ).toThrow(/Account/);
  });

  it('throws on malformed OtherChainSource', () => {
    expect(() => make({ OtherChainSource: 'not-an-address' })).toThrow(
      /OtherChainSource/,
    );
  });

  it('throws on malformed AttestationSignerAccount', () => {
    expect(() =>
      make({ AttestationSignerAccount: 'not-an-address' }),
    ).toThrow(/AttestationSignerAccount/);
  });

  it('throws on malformed AttestationRewardAccount', () => {
    expect(() =>
      make({ AttestationRewardAccount: 'not-an-address' }),
    ).toThrow(/AttestationRewardAccount/);
  });

  it('throws on malformed Destination (when provided)', () => {
    expect(() => make({ Destination: 'not-an-address' })).toThrow(
      /Destination/,
    );
  });

  // ─── Currency Amount validation ─────────────────────────────────

  it('throws on malformed Amount', () => {
    expect(() => make({ Amount: 42 as unknown as string })).toThrow(
      /Amount must be a Currency Amount/,
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

  // ─── XChainClaimID accepts number OR string ────────────────────

  it('throws when XChainClaimID is a boolean', () => {
    expect(() =>
      make({ XChainClaimID: true as unknown as number }),
    ).toThrow(/XChainClaimID must be a number or decimal string/);
  });

  // ─── XChainBridge shape ─────────────────────────────────────────

  it('throws on missing XChainBridge', () => {
    expect(() =>
      xchainAddClaimAttestation({
        Account: ACCOUNT,
        Amount: AMOUNT,
        AttestationRewardAccount: ATTESTATION_REWARD_ACCOUNT,
        AttestationSignerAccount: ATTESTATION_SIGNER_ACCOUNT,
        Destination: DESTINATION,
        OtherChainSource: OTHER_CHAIN_SOURCE,
        PublicKey: PUBLIC_KEY,
        Signature: SIGNATURE,
        WasLockingChainSend: 1,
        XChainClaimID: XCHAIN_CLAIM_ID,
      } as unknown as Parameters<typeof xchainAddClaimAttestation>[0]),
    ).toThrow(/XChainBridge/);
  });

  it('throws when XChainBridge has wrong shape (missing doors)', () => {
    expect(() =>
      make({
        XChainBridge: { foo: 'bar' } as unknown as typeof XCHAIN_BRIDGE_XRP,
      }),
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
    expect(() =>
      tx.with({ WasLockingChainSend: 7 as unknown as 0 | 1 }),
    ).toThrow(/WasLockingChainSend must be exactly 0 or 1/);
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

  it('.with() re-validates OtherChainSource on override', () => {
    const tx = make();
    expect(() => tx.with({ OtherChainSource: 'garbage' })).toThrow(
      /OtherChainSource/,
    );
  });

  // ─── .toJSON() ──────────────────────────────────────────────────

  it('.toJSON() produces a plain object matching xrpl.js shape', () => {
    const json = make().toJSON();
    expect(json).toEqual({
      TransactionType: 'XChainAddClaimAttestation',
      Account: ACCOUNT,
      Amount: AMOUNT,
      AttestationRewardAccount: ATTESTATION_REWARD_ACCOUNT,
      AttestationSignerAccount: ATTESTATION_SIGNER_ACCOUNT,
      Destination: DESTINATION,
      OtherChainSource: OTHER_CHAIN_SOURCE,
      PublicKey: PUBLIC_KEY,
      Signature: SIGNATURE,
      WasLockingChainSend: 1,
      XChainClaimID: XCHAIN_CLAIM_ID,
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
    // XChainAttestationSequence must not leak in.
    expect(json).not.toHaveProperty('XChainAttestationSequence');
  });

  it('.toJSON() skips Destination when not provided', () => {
    const tx = xchainAddClaimAttestation({
      Account: ACCOUNT,
      Amount: AMOUNT,
      AttestationRewardAccount: ATTESTATION_REWARD_ACCOUNT,
      AttestationSignerAccount: ATTESTATION_SIGNER_ACCOUNT,
      OtherChainSource: OTHER_CHAIN_SOURCE,
      PublicKey: PUBLIC_KEY,
      Signature: SIGNATURE,
      WasLockingChainSend: 1,
      XChainClaimID: XCHAIN_CLAIM_ID,
      XChainBridge: XCHAIN_BRIDGE_XRP,
    });
    const json = tx.toJSON();
    expect('Destination' in json).toBe(false);
  });

  it('.validate() is a no-op (validation already happened)', () => {
    expect(() => make().validate()).not.toThrow();
  });

  // ─── Base transaction fields ──────────────────────────────────────────────
  // `xchainAddClaimAttestation` now calls `validateBaseTransaction` as a
  // backstop, placed after its own XChainAddClaimAttestation-specific checks
  // (payment.ts:123 is the reference). Before that call, every REJECT case
  // below built a frozen transaction silently.
  //
  // `XchainAddClaimAttestationProps` does not yet extend `BasePropsFields`, so
  // the seven shared fields are not on this props type yet — which is why the
  // `as any` casts appear on the ACCEPT cases too, not only the reject ones.
  // That is the type half of the same bug; without the casts these would not
  // compile.
  describe('BaseTransactionFields', () => {
    const base = {
      Account: ACCOUNT,
      Amount: AMOUNT,
      AttestationRewardAccount: ATTESTATION_REWARD_ACCOUNT,
      AttestationSignerAccount: ATTESTATION_SIGNER_ACCOUNT,
      Destination: DESTINATION,
      OtherChainSource: OTHER_CHAIN_SOURCE,
      PublicKey: PUBLIC_KEY,
      Signature: SIGNATURE,
      WasLockingChainSend: 1,
      XChainClaimID: XCHAIN_CLAIM_ID,
      XChainBridge: XCHAIN_BRIDGE_XRP,
    };
    // A valid classic address distinct from ACCOUNT.
    const DELEGATE = LOCKING_CHAIN_DOOR;
    const MEMOS = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
    const TXN_ID = 'AB'.repeat(32);

    it('accepts Memos', () => {
      const tx = xchainAddClaimAttestation({ ...base, Memos: MEMOS } as any);
      expect(tx.toJSON().Memos).toEqual(MEMOS);
    });

    it('rejects a malformed Memos value', () => {
      expect(() =>
        xchainAddClaimAttestation({ ...base, Memos: 'not-an-array' } as any),
      ).toThrow(/invalid Memos/);
    });

    it('accepts SourceTag', () => {
      const tx = xchainAddClaimAttestation({ ...base, SourceTag: 99 } as any);
      expect(tx.toJSON().SourceTag).toBe(99);
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() =>
        xchainAddClaimAttestation({ ...base, SourceTag: 'NaN' } as any),
      ).toThrow(/SourceTag must be a number/);
    });

    it('accepts LastLedgerSequence', () => {
      const tx = xchainAddClaimAttestation({
        ...base,
        LastLedgerSequence: 1_000_000,
      } as any);
      expect(tx.toJSON().LastLedgerSequence).toBe(1_000_000);
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() =>
        xchainAddClaimAttestation({ ...base, LastLedgerSequence: 'soon' } as any),
      ).toThrow(/LastLedgerSequence must be a number/);
    });

    it('accepts AccountTxnID', () => {
      const tx = xchainAddClaimAttestation({
        ...base,
        AccountTxnID: TXN_ID,
      } as any);
      expect(tx.toJSON().AccountTxnID).toBe(TXN_ID);
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() =>
        xchainAddClaimAttestation({ ...base, AccountTxnID: 99 } as any),
      ).toThrow(/AccountTxnID must be a string/);
    });

    it('accepts NetworkID', () => {
      const tx = xchainAddClaimAttestation({ ...base, NetworkID: 1 } as any);
      expect(tx.toJSON().NetworkID).toBe(1);
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() =>
        xchainAddClaimAttestation({ ...base, NetworkID: {} } as any),
      ).toThrow(/NetworkID must be a number/);
    });

    it('accepts a Delegate distinct from Account', () => {
      const tx = xchainAddClaimAttestation({
        ...base,
        Delegate: DELEGATE,
      } as any);
      expect(tx.toJSON().Delegate).toBe(DELEGATE);
    });

    it('rejects a Delegate that is not a valid address', () => {
      expect(() =>
        xchainAddClaimAttestation({ ...base, Delegate: 'not-an-address' } as any),
      ).toThrow(/invalid Delegate/);
    });

    it('rejects Delegate equal to Account', () => {
      expect(() =>
        xchainAddClaimAttestation({ ...base, Delegate: ACCOUNT } as any),
      ).toThrow(/cannot be the same/);
    });

    it('accepts TicketSequence alongside Sequence: 0', () => {
      const tx = xchainAddClaimAttestation({
        ...base,
        Sequence: 0,
        TicketSequence: 42,
      } as any);
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() =>
        xchainAddClaimAttestation({ ...base, TicketSequence: 'nope' } as any),
      ).toThrow(/TicketSequence must be a number/);
    });
  });
});