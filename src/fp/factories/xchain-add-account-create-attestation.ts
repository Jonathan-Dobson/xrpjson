/**
 * Functional XChainAddAccountCreateAttestation factory — frozen-object
 * style.
 *
 * Provides a witness-server attestation that an `XChainAccountCreateCommit`
 * transaction occurred on the source chain. The witness signs a message
 * that names the destination chain account, the source chain account
 * (`OtherChainSource`), the amount, and which side of the bridge
 * the commit happened on (`WasLockingChainSend`).
 *
 *   import { xchainAddAccountCreateAttestation } from 'xrpjson';
 *   const tx = xchainAddAccountCreateAttestation({
 *     Account: 'rDr5okqGKmMpn44Bbhe5WAfDQx8e9XquEv',
 *     OtherChainSource: 'rUzB7yg1LcFa7m3q1hfrjr5w53vcWzNh3U',
 *     Destination: 'rJMfWNVbyjcCtds8kpoEjEbYQ41J5B6MUd',
 *     Amount: '2000000000',
 *     SignatureReward: '204',
 *     PublicKey: 'EDF7C3F9C80C102AF6D241752B37356E91ED454F26A35C567CF6F8477960F66614',
 *     Signature: 'F95675BA...',
 *     WasLockingChainSend: 1,
 *     AttestationRewardAccount: 'rpFp36UHW6FpEcZjZqq5jSJWY6UCj3k4Es',
 *     AttestationSignerAccount: 'rpWLegmW9WrFBzHUj7brhQNZzrxgLj9oxw',
 *     XChainAccountCreateCount: '2',
 *     XChainBridge: { ... },
 *   });
 *
 * Required amendment: `XChainBridge`.
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/xchainaddaccountcreateattestation
 * @see xrpl.js `packages/xrpl/src/models/transactions/XChainAddAccountCreateAttestation.ts`
 *      (`validateXChainAddAccountCreateAttestation` — source of every
 *      required-field check below).
 * @see XLS-0038 §2.4.2 — "The `XChainAddAccountCreateAttestation`
 *      transaction"
 *      `~/.mavis/docs.local/xrpl-standards/repo/XLS-0038-cross-chain-bridge/README.md`
 *      lines 608–683 (Fields table at lines 622–634).
 *
 * ## Divergences
 *
 * The factory implements the canonical XLS-0038 §2.4.2 field set,
 * which is a strict superset of what the class API at
 * the Class API's `XChainAddAccountCreateAttestation` exposes.
 * The class is missing four required fields (`AttestationSignerAccount`,
 * `OtherChainSource`, `SignatureReward`, plus `XChainAccountCreateCount`
 * typed as `number` only). It also uses a generic `isRecord` for
 * `XChainBridge` instead of the full 4-key structural check, and types
 * `WasLockingChainSend` as the loose `number` instead of the literal
 * `0 | 1`. Concretely:
 *
 *   1. **Validation is eager, not lazy.** The class's `validate()`
 *      only checks `XChainBridge isRecord` and `XChainAccountCreateCount
 *      isNumber` (`the Class API's `XChainAddAccountCreateAttestation`:
 *      44-52`). The factory mirrors the full xrpl.js guard sequence
 *      (`XChainAddAccountCreateAttestation.ts:89-123`) at construction
 *      time so an invalid tx is impossible to construct.
 *
 *   2. **`AttestationSignerAccount` is modelled (XLS-38 §2.4.2.1.3).**
 *      The class does not declare this field. xrpl.js requires
 *      `validateRequiredField(tx, 'AttestationSignerAccount', isAccount)`
 *      (`XChainAddAccountCreateAttestation.ts:98`); XRPL.org marks it
 *      as required (`xchainaddaccountcreateattestation.md:60`); XLS-38
 *      §2.4.2.1.3 (line 626 + 644) describes it as "the account on the
 *      door account's signer list that is signing the transaction."
 *      The factory requires it as a valid XRPL account.
 *      Source: xrpl.js `XChainAddAccountCreateAttestation.ts:98`;
 *              XRPL.org `xchainaddaccountcreateattestation.md:60`;
 *              XLS-38 §2.4.2.1.3 (line 644).
 *
 *   3. **`OtherChainSource` is modelled (XLS-38 §2.4.2.1.5).** The
 *      class does not declare this field. xrpl.js requires
 *      `validateRequiredField(tx, 'OtherChainSource', isAccount)`
 *      (`XChainAddAccountCreateAttestation.ts:102`); XRPL.org marks it
 *      as required (`xchainaddaccountcreateattestation.md:62`); XLS-38
 *      §2.4.2.1.5 (line 652) defines it as "the account on the source
 *      chain that submitted the XChainAccountCreateCommit transaction."
 *      The factory requires it as a valid XRPL account.
 *      Source: xrpl.js `XChainAddAccountCreateAttestation.ts:102`;
 *              XRPL.org `xchainaddaccountcreateattestation.md:62`;
 *              XLS-38 §2.4.2.1.5 (line 652).
 *
 *   4. **`SignatureReward` is modelled (XLS-38 §2.4.2.1.8).** The
 *      class does not declare this field. xrpl.js requires
 *      `validateRequiredField(tx, 'SignatureReward', isAmount)`
 *      (`XChainAddAccountCreateAttestation.ts:108`); XRPL.org marks it
 *      as required (`xchainaddaccountcreateattestation.md:65`); XLS-38
 *      §2.4.2.1.8 (line 664) defines it as "the signature reward paid
 *      in the XChainAccountCreateCommit transaction." The factory
 *      requires it via `isAmount` (XRP drops string, IOU object, or
 *      MPT object — whichever matches the bridge asset).
 *      Source: xrpl.js `XChainAddAccountCreateAttestation.ts:108`;
 *              XRPL.org `xchainaddaccountcreateattestation.md:65`;
 *              XLS-38 §2.4.2.1.8 (line 664).
 *
 *   5. **`XChainAccountCreateCount` accepts number OR string.**
 *      The class types the field as `number` only and accepts any
 *      `isNumber`. xrpl.js types it as `number | string`
 *      (`XChainAddAccountCreateAttestation.ts:75`) and validates with
 *      `isNumber(inp) || isString(inp)` (line 119). XRPL.org marks it
 *      `String / UInt64` internal type (`xchainaddaccountcreateattestation.md:67`).
 *      The wire format encodes UInt64 as a decimal string; callers
 *      frequently pass it as a string. The factory accepts either.
 *      Source: xrpl.js `XChainAddAccountCreateAttestation.ts:75,119`;
 *              XRPL.org `xchainaddaccountcreateattestation.md:67`.
 *
 *   6. **`WasLockingChainSend` is the literal `0 | 1` union.**
 *      The class types it as loose `number`; the factory types it as
 *      `0 | 1` to match the xrpl.js interface and the XRPL.org field
 *      table ("Number / UInt8", `xchainaddaccountcreateattestation.md:66`).
 *      Anything other than `0` or `1` is rejected. xrpl.js's
 *      validator literal `(inp): inp is 0 | 1 => inp === 0 || inp === 1`
 *      (`XChainAddAccountCreateAttestation.ts:113`) is mirrored.
 *      Source: xrpl.js `XChainAddAccountCreateAttestation.ts:70,113`;
 *              XRPL.org `xchainaddaccountcreateattestation.md:66`.
 *
 *   7. **`XChainBridge` is fully shape-validated.** The class only
 *      checks `isRecord` (the Class API's `XChainAddAccountCreateAttestation`, line 46),
 *      which accepts any object including `{}`. The factory uses the
 *      local `isXChainBridge` helper (4 keys, both Issues valid
 *      currency objects, both doors as strings) AND verifies each
 *      door is a valid XRPL account (mirrors
 *      `xchain-account-create-commit.ts` Divergences #3-#4, applies to
 *      all bridge-bearing transactions).
 *      Source: xrpl.js `common.ts` `isXChainBridge` (lines 168–177 in
 *              our `validation/helpers.ts`).
 *
 *   8. **`Account`, `Destination`, `AttestationRewardAccount`, and
 *      `AttestationSignerAccount` are validated as valid XRPL classic
 *      or X-addresses.** The class delegates `Account` to the base
 *      class (which only requires `typeof === 'string'`) and does
 *      not validate the other three account fields at all. The
 *      factory uses `isAccount` for all four, matching the rest of
 *      the M4 fp family and xrpl.js
 *      `validateXChainAddAccountCreateAttestation`.
 *
 *   9. **`PublicKey` and `Signature` must be non-empty hex Blobs.**
 *      xrpl.js only checks `isString`
 *      (`XChainAddAccountCreateAttestation.ts:104,106`); XRPL.org
 *      marks both as `String / Blob` internal type
 *      (`xchainaddaccountcreateattestation.md:63-64`). The factory
 *      enforces a non-empty, even-length hex string so malformed
 *      blobs surface at construction rather than at the binary
 *      codec layer. Note: per XLS-38 §2.4.2.1.6 (line 656),
 *      `PublicKey` is conventionally a 33-byte compressed secp256k1
 *      key (66 hex chars), but the wire format accepts any Blob so
 *      we do NOT cap the length — the witness-server pubkey length
 *      is a network convention, not a tx-format rule.
 *      Source: XRPL.org `xchainaddaccountcreateattestation.md:63-64`.
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
      `XChainAddAccountCreateAttestation: ${field} must be a hex string`,
    );
  }
  if (value.length === 0) {
    throw new ValidationError(
      `XChainAddAccountCreateAttestation: ${field} must not be an empty string`,
    );
  }
  if (!isHex(value)) {
    throw new ValidationError(
      `XChainAddAccountCreateAttestation: ${field} must be encoded in hex`,
    );
  }
  if (value.length % 2 !== 0) {
    throw new ValidationError(
      `XChainAddAccountCreateAttestation: ${field} must have an even number of hex characters (whole-byte Blob encoding)`,
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
      'XChainAddAccountCreateAttestation: XChainBridge.LockingChainDoor must be a valid XRPL account address',
    );
  }
  if (!isAccount(bridge.IssuingChainDoor)) {
    throw new ValidationError(
      'XChainAddAccountCreateAttestation: XChainBridge.IssuingChainDoor must be a valid XRPL account address',
    );
  }
}

// ─── Public types ────────────────────────────────────────────────────

export interface XchainAddAccountCreateAttestationProps {
  /** The unique address of the transaction sender (the witness
   *  submitting this attestation). Required, valid XRPL address. */
  Account: string;

  /** The amount committed by the `XChainAccountCreateCommit`
   *  transaction on the source chain. Currency Amount — XRP drops
   *  string, IOU object, or MPT object. Required. */
  Amount: string | Record<string, unknown>;

  /** The account that should receive this signer's share of the
   *  `SignatureReward`. Required, valid XRPL address. */
  AttestationRewardAccount: string;

  /** The account on the door account's signer list that is signing
   *  the transaction. Required, valid XRPL address.
   *  Source: XLS-38 §2.4.2.1.3 (line 644). */
  AttestationSignerAccount: string;

  /** The destination account for the funds on the destination chain.
   *  Required, valid XRPL address. */
  Destination: string;

  /** The account on the source chain that submitted the
   *  `XChainAccountCreateCommit` transaction that triggered the
   *  event associated with the attestation. Required, valid XRPL
   *  address. Source: XLS-38 §2.4.2.1.5 (line 652). */
  OtherChainSource: string;

  /** The public key used to verify the signature. Hex Blob; by
   *  convention 33-byte compressed secp256k1 (66 hex chars).
   *  Required. */
  PublicKey: string;

  /** The signature attesting to the event on the other chain. Hex
   *  Blob. Required. */
  Signature: string;

  /** The signature reward paid in the `XChainAccountCreateCommit`
   *  transaction. Currency Amount. Required.
   *  Source: XLS-38 §2.4.2.1.8 (line 664). */
  SignatureReward: string | Record<string, unknown>;

  /** Boolean (encoded as UInt8): true (=1) if the event occurred on
   *  the locking chain (so `OtherChainSource` is on the locking
   *  chain); false (=0) if on the issuing chain. Required, must be
   *  exactly `0` or `1`. */
  WasLockingChainSend: 0 | 1;

  /** The counter that represents the order that the claims must be
   *  processed in. UInt64 — accepts number or decimal string.
   *  Required. */
  XChainAccountCreateCount: number | string;

  /** The bridge associated with the attestation. 4-key shape with
   *  both doors as valid XRPL accounts and both Issues as valid
   *  currency objects. Required. */
  XChainBridge: XChainBridge;

  /** Bit-flags for this transaction. XChainAddAccountCreateAttestation
   *  has no defined flags; only `tfFullyCanonicalSig` (global) is
   *  normally meaningful. Accepted for parity with the base tx shape. */
  Flags?: number | undefined;
  /** Fee in XRP (drops), base-10 integer string. */
  Fee?: string | undefined;
  /** Account sequence number. */
  Sequence?: number | undefined;
}

export interface XchainAddAccountCreateAttestation
  extends Readonly<XchainAddAccountCreateAttestationProps> {
  readonly TransactionType: 'XChainAddAccountCreateAttestation';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(
    overrides: Partial<XchainAddAccountCreateAttestationProps>,
  ): XchainAddAccountCreateAttestation;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function xchainAddAccountCreateAttestation(
  props: XchainAddAccountCreateAttestationProps,
): XchainAddAccountCreateAttestation {
  // ── Account ── required, valid XRPL classic/X-address.
  require(
    props.Account,
    'XChainAddAccountCreateAttestation: missing or invalid Account',
    isAccount,
  );

  // ── Amount ── required, any Currency Amount form (XRP / IOU / MPT).
  if (!isAmount(props.Amount)) {
    throw new ValidationError(
      'XChainAddAccountCreateAttestation: Amount must be a Currency Amount (XRP drops string, IOU object, or MPT object)',
    );
  }

  // ── AttestationRewardAccount ── required, valid XRPL account.
  require(
    props.AttestationRewardAccount,
    'XChainAddAccountCreateAttestation: missing or invalid AttestationRewardAccount',
    isAccount,
  );

  // ── AttestationSignerAccount ── required, valid XRPL account.
  //    Class API does not declare this field at all.
  require(
    props.AttestationSignerAccount,
    'XChainAddAccountCreateAttestation: missing or invalid AttestationSignerAccount',
    isAccount,
  );

  // ── Destination ── required, valid XRPL account.
  require(
    props.Destination,
    'XChainAddAccountCreateAttestation: missing or invalid Destination',
    isAccount,
  );

  // ── OtherChainSource ── required, valid XRPL account.
  //    Class API does not declare this field at all.
  require(
    props.OtherChainSource,
    'XChainAddAccountCreateAttestation: missing or invalid OtherChainSource',
    isAccount,
  );

  // ── PublicKey ── required, non-empty even-length hex Blob.
  validateBlob(props.PublicKey, 'PublicKey');

  // ── Signature ── required, non-empty even-length hex Blob.
  validateBlob(props.Signature, 'Signature');

  // ── SignatureReward ── required, any Currency Amount form.
  if (!isAmount(props.SignatureReward)) {
    throw new ValidationError(
      'XChainAddAccountCreateAttestation: SignatureReward must be a Currency Amount (XRP drops string, IOU object, or MPT object)',
    );
  }

  // ── WasLockingChainSend ── required, exactly 0 or 1.
  if (props.WasLockingChainSend !== 0 && props.WasLockingChainSend !== 1) {
    throw new ValidationError(
      'XChainAddAccountCreateAttestation: WasLockingChainSend must be exactly 0 or 1 (UInt8 boolean)',
    );
  }

  // ── XChainAccountCreateCount ── required, number OR string.
  if (!isNumber(props.XChainAccountCreateCount) && !isString(props.XChainAccountCreateCount)) {
    throw new ValidationError(
      'XChainAddAccountCreateAttestation: XChainAccountCreateCount must be a number or decimal string (UInt64)',
    );
  }

  // ── XChainBridge ── required, full shape (4 keys + valid Issues) +
  //    both doors as valid XRPL accounts.
  require(
    props.XChainBridge,
    'XChainAddAccountCreateAttestation: XChainBridge is required and must have shape {LockingChainDoor, LockingChainIssue, IssuingChainDoor, IssuingChainIssue}',
    isXChainBridge,
  );
  assertValidXChainBridge(props.XChainBridge);

  return buildFrozenTx<
    XchainAddAccountCreateAttestationProps,
    XchainAddAccountCreateAttestation
  >(
    'XChainAddAccountCreateAttestation',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: XchainAddAccountCreateAttestation) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: XchainAddAccountCreateAttestation,
        overrides: Partial<XchainAddAccountCreateAttestationProps>,
      ) {
        return xchainAddAccountCreateAttestation(mergeForWith(this, overrides));
      },
    },
  );
}
