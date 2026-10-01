/**
 * Functional XChainAddClaimAttestation factory — frozen-object style.
 *
 * Provides a witness-server attestation that an `XChainCommit`
 * transaction occurred on the source chain. The witness signs a message
 * that names the destination chain account (`Destination`), the source
 * chain account (`OtherChainSource`), the amount, and which side of the
 * bridge the commit happened on (`WasLockingChainSend`).
 *
 *   import { xchainAddClaimAttestation } from 'xrpjson';
 *   const tx = xchainAddClaimAttestation({
 *     Account: ATTESTOR,
 *     Amount: '100000000',
 *     AttestationRewardAccount: REWARD,
 *     AttestationSignerAccount: SIGNER,
 *     Destination: 'r9A8UyNpW3X46FUc6P7JZqgn6WgAPjBwPg',
 *     OtherChainSource: 'rnJmYAiqEVngtnb5ckRroXLtCbWC7CRUBx',
 *     PublicKey: '03DAB289CA36FF377F3F4304C7A7203FDE5EDCBFC209F430F6A4355361425526D0',
 *     Signature: '616263',
 *     WasLockingChainSend: 1,
 *     XChainClaimID: '0000000000000000',
 *     XChainBridge: { ... },
 *   });
 *
 * Required amendment: `XChainBridge`.
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/xchainaddclaimattestation
 * @see xrpl.js `packages/xrpl/src/models/transactions/XChainAddClaimAttestation.ts`
 *      (`validateXChainAddClaimAttestation` — source of every required-
 *      field check in this factory).
 * @see XLS-0038 §2.3.3 — "The `XChainAddClaimAttestation` transaction"
 *      `~/.mavis/docs.local/xrpl-standards/repo/XLS-0038-cross-chain-bridge/README.md`
 *      lines 448–517 (Fields table at lines 462–473).
 *
 * ## Divergences
 *
 * The class-based API at
 * the Class API's `XChainAddClaimAttestation` is missing several
 * fields the canonical sources require AND exposes one field that is
 * not in the spec at all. The factory corrects both:
 *
 *   1. **`AttestationRewardAccount` is required (XLS-38 §2.3.3.1.2).**
 *      The class does not declare this field. xrpl.js requires
 *      `validateRequiredField(tx, 'AttestationRewardAccount', isAccount)`
 *      (`XChainAddClaimAttestation.ts:92`); XRPL.org marks it as
 *      required (`xchainaddclaimattestation.md:79`); XLS-38 §2.3.3.1.2
 *      (line 465) describes it as "The account that should receive
 *      this signer's share of the `SignatureReward`." The factory
 *      requires it as a valid XRPL classic/X-address.
 *      Source: xrpl.js `XChainAddClaimAttestation.ts:92`;
 *              XRPL.org `xchainaddclaimattestation.md:79`;
 *              XLS-38 §2.3.3.1.2 (line 465).
 *
 *   2. **`AttestationSignerAccount` is required (XLS-38 §2.3.3.1.3).**
 *      The class does not declare this field. xrpl.js requires
 *      `validateRequiredField(tx, 'AttestationSignerAccount', isAccount)`
 *      (`XChainAddClaimAttestation.ts:94`); XRPL.org marks it as
 *      required (`xchainaddclaimattestation.md:80`); XLS-38 §2.3.3.1.3
 *      (line 466) describes it as "the account on the door account's
 *      signer list that is signing the transaction." The factory
 *      requires it as a valid XRPL classic/X-address.
 *      Source: xrpl.js `XChainAddClaimAttestation.ts:94`;
 *              XRPL.org `xchainaddclaimattestation.md:80`;
 *              XLS-38 §2.3.3.1.3 (line 466).
 *
 *   3. **`WasLockingChainSend` is the literal `0 | 1` union.** The
 *      class does not declare this field at all (its `ASSIGNABLE_FIELDS`
 *      list omits it). xrpl.js types it as `0 | 1` and validates with
 *      `(inp): inp is 0 | 1 => inp === 0 || inp === 1`
 *      (`XChainAddClaimAttestation.ts:65,104–108`). XRPL.org marks it
 *      `Number / UInt8` required (`xchainaddclaimattestation.md:85`);
 *      XLS-38 §2.3.3.1.8 (line 471) marks it required `UINT8`. The
 *      factory requires it and rejects anything other than `0` or `1`.
 *      Source: xrpl.js `XChainAddClaimAttestation.ts:65,104–108`;
 *              XRPL.org `xchainaddclaimattestation.md:85`;
 *              XLS-38 §2.3.3.1.8 (line 471).
 *
 *   4. **`XChainClaimID` accepts number OR string.** The class types the
 *      field as `number` only. xrpl.js types it as `number | string`
 *      (`XChainAddClaimAttestation.ts:76`) and validates with
 *      `isNumber(inp) || isString(inp)` (line 114). XRPL.org marks it
 *      `String / UInt64` internal type (`xchainaddclaimattestation.md:87`);
 *      XLS-38 §2.3.3.1.10 (line 473) defines it as `UINT64`. The wire
 *      format encodes UInt64 as a decimal string; callers frequently
 *      pass it as a string. The factory accepts either.
 *      Source: xrpl.js `XChainAddClaimAttestation.ts:76,113–116`;
 *              XRPL.org `xchainaddclaimattestation.md:87`;
 *              XLS-38 §2.3.3.1.10 (line 473).
 *
 *   5. **`XChainAttestationSequence` is NOT in the spec.** The class
 *      declares `XChainAttestationSequence: number` as a required
 *      field. XLS-38 §2.3.3.1 has no such field; xrpl.js's
 *      `XChainAddClaimAttestation` interface (lines 22–77) has no
 *      `XChainAttestationSequence`; XRPL.org's field table has no
 *      `XChainAttestationSequence`. The factory omits this field
 *      entirely.
 *      Source: xrpl.js `XChainAddClaimAttestation.ts:22–77`
 *              (no `XChainAttestationSequence` property);
 *              XRPL.org `xchainaddclaimattestation.md:76–87`
 *              (field table has no row for it);
 *              XLS-38 §2.3.3.1 lines 462–473
 *              (field table has no row for it).
 *
 *   6. **`XChainBridge` is fully shape-validated.** The class only
 *      checks `isRecord` (line 52), which accepts any object including
 *      `{}`. The factory uses the local `isXChainBridge` helper (4
 *      keys, both Issues valid currency objects, both doors as
 *      strings) AND verifies each door is a valid XRPL account
 *      (mirrors `xchain-account-create-commit.ts` Divergences #3-#4
 *      and `xchain-add-account-create-attestation.ts` Divergence #7,
 *      applies to all bridge-bearing transactions).
 *      Source: `src/validation/helpers.ts:168–177` (`isXChainBridge`);
 *              xrpl.js `common.ts` `isXChainBridge` source of truth.
 *
 *   7. **`Account`, `AttestationRewardAccount`, `AttestationSignerAccount`,
 *      and `OtherChainSource` are validated as valid XRPL classic or
 *      X-addresses.** The class delegates `Account` to the base
 *      transaction validator and does not validate the other three
 *      account fields at all. The factory uses `isAccount` for all
 *      four (and uses `isAccount` for the optional `Destination` when
 *      present), matching the rest of the M4 fp family and xrpl.js's
 *      `validateXChainAddClaimAttestation` (`XChainAddClaimAttestation.ts:92,94,96,98`).
 *
 *   8. **`PublicKey` and `Signature` must be non-empty hex Blobs.**
 *      xrpl.js only checks `isString`
 *      (`XChainAddClaimAttestation.ts:100,102`); XRPL.org marks both
 *      as `String / Blob` internal type
 *      (`xchainaddclaimattestation.md:83-84`). The factory enforces a
 *      non-empty, even-length hex string so malformed blobs surface at
 *      construction rather than at the binary codec layer. Per
 *      XLS-38 §2.3.3.1.6 (line 469) and §2.3.3.1.7 (line 470),
 *      `PublicKey` is conventionally a 33-byte compressed secp256k1
 *      key (66 hex chars), but the wire format accepts any Blob so
 *      we do NOT cap the length — the witness-server pubkey length is
 *      a network convention, not a tx-format rule.
 *      Source: XRPL.org `xchainaddclaimattestation.md:83-84`.
 */
import type { XChainBridge } from '../../types/common.js';
import {
  isAccount,
  isAmount,
  isHex,
  isNumber,
  isString,
  isXChainBridge,
} from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Validate a non-empty hex Blob per the XRPL.org field tables
 * (`PublicKey` and `Signature`: `String / Blob` internal type). Even
 * length is required for whole-byte serialisation.
 */
function validateBlob(value: unknown, field: string): string {
  if (!isString(value)) {
    throw new ValidationError(
      `XChainAddClaimAttestation: ${field} must be a hex string`,
    );
  }
  if (value.length === 0) {
    throw new ValidationError(
      `XChainAddClaimAttestation: ${field} must not be an empty string`,
    );
  }
  if (!isHex(value)) {
    throw new ValidationError(
      `XChainAddClaimAttestation: ${field} must be encoded in hex`,
    );
  }
  if (value.length % 2 !== 0) {
    throw new ValidationError(
      `XChainAddClaimAttestation: ${field} must have an even number of hex characters (whole-byte Blob encoding)`,
    );
  }
  return value;
}

/**
 * Verify both XChainBridge doors are valid XRPL account addresses
 * (the local `isXChainBridge` helper only checks `typeof === 'string'`).
 */
function assertValidXChainBridge(bridge: XChainBridge): void {
  if (!isAccount(bridge.LockingChainDoor)) {
    throw new ValidationError(
      'XChainAddClaimAttestation: XChainBridge.LockingChainDoor must be a valid XRPL account address',
    );
  }
  if (!isAccount(bridge.IssuingChainDoor)) {
    throw new ValidationError(
      'XChainAddClaimAttestation: XChainBridge.IssuingChainDoor must be a valid XRPL account address',
    );
  }
}

// ─── Public types ────────────────────────────────────────────────────

export interface XchainAddClaimAttestationProps {
  /** The unique address of the transaction sender (the witness
   *  submitting this attestation). Required, valid XRPL address. */
  Account: string;

  /** The amount committed by the `XChainCommit` transaction on the
   *  source chain. Currency Amount — XRP drops string, IOU object,
   *  or MPT object. Required.
   *  Source: XLS-38 §2.3.3.1.1 (line 464). */
  Amount: string | Record<string, unknown>;

  /** The account that should receive this signer's share of the
   *  `SignatureReward`. Required, valid XRPL address.
   *  Source: XLS-38 §2.3.3.1.2 (line 465). */
  AttestationRewardAccount: string;

  /** The account on the door account's signer list that is signing
   *  the transaction. Required, valid XRPL address.
   *  Source: XLS-38 §2.3.3.1.3 (line 466). */
  AttestationSignerAccount: string;

  /** The destination account for the funds on the destination chain
   *  (taken from the `XChainCommit` transaction). Optional per
   *  XLS-38 §2.3.3.1.4 (line 467), XRPL.org, and xrpl.js. When
   *  present must be a valid XRPL address.
   *  Source: XLS-38 §2.3.3.1.4 (line 467). */
  Destination?: string | undefined;

  /** The account on the source chain that submitted the `XChainCommit`
   *  transaction that triggered the event associated with the
   *  attestation. Required, valid XRPL address.
   *  Source: XLS-38 §2.3.3.1.5 (line 468). */
  OtherChainSource: string;

  /** The public key used to verify the attestation signature. Hex
   *  Blob; by convention a 33-byte compressed secp256k1 key (66 hex
   *  chars). Required. */
  PublicKey: string;

  /** The signature attesting to the event on the other chain. Hex
   *  Blob. Required. */
  Signature: string;

  /** Boolean (encoded as UInt8): true (=1) if the event occurred on
   *  the locking chain (so `OtherChainSource` is on the locking
   *  chain); false (=0) if on the issuing chain. Required, must be
   *  exactly `0` or `1`.
   *  Source: XLS-38 §2.3.3.1.8 (line 471). */
  WasLockingChainSend: 0 | 1;

  /** The `XChainClaimID` associated with the transfer, which was
   *  included in the `XChainCommit` transaction. UInt64 — accepts
   *  number or decimal string. Required.
   *  Source: XLS-38 §2.3.3.1.10 (line 473). */
  XChainClaimID: number | string;

  /** The bridge associated with the attestation. 4-key shape with
   *  both doors as valid XRPL accounts and both Issues as valid
   *  currency objects. Required.
   *  Source: XLS-38 §2.3.3.1.9 (line 472). */
  XChainBridge: XChainBridge;

  /** Bit-flags for this transaction. XChainAddClaimAttestation has no
   *  defined flags; only `tfFullyCanonicalSig` (global) is normally
   *  meaningful. Accepted for parity with the base tx shape. */
  Flags?: number | undefined;
  /** Fee in XRP (drops), base-10 integer string. */
  Fee?: string | undefined;
  /** Account sequence number. */
  Sequence?: number | undefined;
}

export interface XchainAddClaimAttestation
  extends Readonly<XchainAddClaimAttestationProps> {
  readonly TransactionType: 'XChainAddClaimAttestation';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(
    overrides: Partial<XchainAddClaimAttestationProps>,
  ): XchainAddClaimAttestation;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function xchainAddClaimAttestation(
  props: XchainAddClaimAttestationProps,
): XchainAddClaimAttestation {
  // ── Account ── required, valid XRPL classic/X-address.
  require(
    props.Account,
    'XChainAddClaimAttestation: missing or invalid Account',
    isAccount,
  );

  // ── Amount ── required, any Currency Amount form (XRP / IOU / MPT).
  if (!isAmount(props.Amount)) {
    throw new ValidationError(
      'XChainAddClaimAttestation: Amount must be a Currency Amount (XRP drops string, IOU object, or MPT object)',
    );
  }

  // ── AttestationRewardAccount ── required, valid XRPL account.
  //    Class API does not declare this field at all.
  require(
    props.AttestationRewardAccount,
    'XChainAddClaimAttestation: missing or invalid AttestationRewardAccount',
    isAccount,
  );

  // ── AttestationSignerAccount ── required, valid XRPL account.
  //    Class API does not declare this field at all.
  require(
    props.AttestationSignerAccount,
    'XChainAddClaimAttestation: missing or invalid AttestationSignerAccount',
    isAccount,
  );

  // ── Destination ── optional per spec, but when present must be a
  //    valid XRPL account.
  if (props.Destination !== undefined) {
    if (!isAccount(props.Destination)) {
      throw new ValidationError(
        'XChainAddClaimAttestation: Destination is not a valid XRPL account address',
      );
    }
  }

  // ── OtherChainSource ── required, valid XRPL account.
  //    Class API does not declare this field at all.
  require(
    props.OtherChainSource,
    'XChainAddClaimAttestation: missing or invalid OtherChainSource',
    isAccount,
  );

  // ── PublicKey ── required, non-empty even-length hex Blob.
  validateBlob(props.PublicKey, 'PublicKey');

  // ── Signature ── required, non-empty even-length hex Blob.
  validateBlob(props.Signature, 'Signature');

  // ── WasLockingChainSend ── required, exactly 0 or 1.
  if (props.WasLockingChainSend !== 0 && props.WasLockingChainSend !== 1) {
    throw new ValidationError(
      'XChainAddClaimAttestation: WasLockingChainSend must be exactly 0 or 1 (UInt8 boolean)',
    );
  }

  // ── XChainClaimID ── required, number OR string (UInt64).
  if (!isNumber(props.XChainClaimID) && !isString(props.XChainClaimID)) {
    throw new ValidationError(
      'XChainAddClaimAttestation: XChainClaimID must be a number or decimal string (UInt64)',
    );
  }

  // ── XChainBridge ── required, full shape (4 keys + valid Issues) +
  //    both doors as valid XRPL accounts.
  require(
    props.XChainBridge,
    'XChainAddClaimAttestation: XChainBridge is required and must have shape {LockingChainDoor, LockingChainIssue, IssuingChainDoor, IssuingChainIssue}',
    isXChainBridge,
  );
  assertValidXChainBridge(props.XChainBridge);

  return buildFrozenTx<
    XchainAddClaimAttestationProps,
    XchainAddClaimAttestation
  >(
    'XChainAddClaimAttestation',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: XchainAddClaimAttestation) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: XchainAddClaimAttestation,
        overrides: Partial<XchainAddClaimAttestationProps>,
      ) {
        return xchainAddClaimAttestation(mergeForWith(this, overrides));
      },
    },
  );
}