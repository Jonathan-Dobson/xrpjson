/**
 * Functional PaymentChannelClaim factory — frozen-object style.
 *
 * Claims XRP from a payment channel, adjusts the channel's expiration,
 * or both. The transaction can be sent by the channel source, the
 * channel destination, or any account when the channel has already
 * expired. The destination must supply `Signature` + `PublicKey`; the
 * source can omit them. Validation happens at construction; there is
 * no way to construct an invalid tx.
 *
 *   import { paymentChannelClaim } from 'xrplt/fp';
 *   const tx = paymentChannelClaim({ Account, Channel });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Balance: '2000000' });
 *
 * Affected amendments:
 *   - `PayChan` (base PaymentChannelClaim)
 *   - `Credentials` (CredentialIDs field for permissioned-domain auth)
 *   - `fixPayChanRecipientOwnerDir` (legacy channels with deleted
 *     destinations have relaxed delivery rules; runtime-only)
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/paymentchannelclaim
 * @see https://github.com/XRPLF/rippled/blob/develop/src/libxrpl/tx/transactors/payment_channel/PaymentChannelClaim.cpp
 *
 * ## Divergences
 *
 * Compared with `src/transactions/payment-channel-claim.ts`, this
 * factory adds preclaim guards the class API skips:
 *
 * 1. **`Channel` must be a 64-character hex string (UInt256).**
 *    Source: xrpl.org `paymentchannelclaim.md` Fields table — "Channel
 *    | String - Hexadecimal | UInt256 | Yes". xrpl.js
 *    `validatePaymentChannelClaim`
 *    (`packages/xrpl/src/models/transactions/paymentChannelClaim.ts:164`)
 *    only checks `typeof tx.Channel === 'string'`. The class also
 *    only checks `isString`. The Channel ID is the SHA-512-half of
 *    (Account, Destination, Sequence) — i.e. the ledger object hash
 *    of the PayChannel entry — which is always a 64-char hex string.
 *
 * 2. **`Amount` and `Balance` must be strictly-positive XRP drops
 *    strings (XRP-only — no IOU/MPT object forms).**
 *    Source: xrpl.org `paymentchannelclaim.md` Fields table — both
 *    fields are documented as "XRP, in drops". xrpl.js
 *    `validatePaymentChannelClaim` only checks `typeof tx.Amount === 'string'`
 *    (no positive/sign guard). The class declares them as `Amount`
 *    (`string | IssuedCurrencyAmount | MPTAmount`) and runs them
 *    through `isAmount`, which accepts IOU/MPT objects and arbitrary
 *    numeric strings (including `'0'` and `'-1'`). The ledger rejects
 *    IOU/MPT forms outright (`temBAD_AMOUNT`) and a non-positive
 *    Balance would deliver nothing — this factory rejects both cases
 *    at construction.
 *
 * 3. **`PublicKey`, if provided, must be a hex string of 32 or 33
 *    bytes (Ed25519 or compressed secp256k1).**
 *    Source: xrpl.org `paymentchannelclaim.md` Fields table —
 *    "PublicKey | String - Hexadecimal | Blob". rippled's preflight
 *    uses `publicKeyType()` to gate this — same set of accepted
 *    lengths as `PaymentChannelCreate`. xrpl.js only checks
 *    `typeof tx.PublicKey === 'string'`; the class also only checks
 *    `isString`. A non-hex or wrong-length PublicKey makes signature
 *    verification fail with `temMALFORMED`.
 *
 * 4. **`Signature`, if provided, must be a hex string.**
 *    Source: xrpl.org `paymentchannelclaim.md` Fields table —
 *    "Signature | String - Hexadecimal | Blob". xrpl.js only checks
 *    `typeof tx.Signature === 'string'`; the class also only checks
 *    `isString`. Non-hex signature blobs fail signature verification
 *    with `temMALFORMED`.
 *
 * 5. **`CredentialIDs` field is supported (Credentials amendment).**
 *    Source: xrpl.js `PaymentChannelClaim` interface
 *    (`packages/xrpl/src/models/transactions/paymentChannelClaim.ts:141`)
 *    — "CredentialIDs?: string[] — Credentials associated with the
 *    sender of this transaction. The credentials included must not be
 *    expired." xrpl.org `paymentchannelclaim.md` Fields table also
 *    lists `CredentialIDs` as a `Vector256` field. The local class
 *    silently drops the field.
 *
 * 6. **`CredentialIDs` length must be in
 *    [1, MAX_AUTHORIZED_CREDENTIALS = 8], each entry must be a
 *    64-character hex string, and duplicates are rejected.**
 *    Source: xrpl.js `validateCredentialsList`
 *    (`packages/xrpl/src/models/transactions/common.ts:1106–1148`)
 *    enforces empty-array reject, length cap, 64-char hex entries,
 *    and "Credentials cannot contain duplicate elements." The class
 *    does not model the field.
 *
 * 7. **`Account` must be a valid XRPL classic or X-address.**
 *    Source: protocol-level invariant — every transaction's `Account`
 *    field must be a parseable address. The class does not validate
 *    `Account` at all (its `super.validate()` delegates to
 * `BaseTransaction.validate`, which performs no address format
 * check).
 *
 * Preclaim checks that require ledger state (NOT locally checkable):
 *   - The `Channel` ledger object must exist (`tecNO_ENTRY`).
 *   - The sender's authorization (Signature/PublicKey) must verify
 *     against the channel's stored PublicKey and the claimed
 *     Amount (`temBAD_AUTH` / `temBAD_SIGNATURE`).
 *   - `Balance`, when delivering, must exceed channel's current
 *     `Balance` and must not exceed `Amount` (`temBAD_AMOUNT`).
 *   - The destination account must exist when this transaction
 *     delivers XRP (`tecNO_DST`, per XLS-0007 §3.1.3).
 *   - If the channel's `Expiration` or `CancelAfter` is older than the
 *     previous ledger's close time, the channel closes regardless of
 *     the transaction's contents.
 */
import type { PaymentChannelClaimFlagsInterface } from '../../types/flags.js';
import {
  isAccount,
  isArray,
  isHex,
  isString,
} from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// HASH256 in hex is 64 characters. (xrpl.org paymentchannelclaim.md:
// "Channel | String - Hexadecimal | UInt256 | Yes".)
const HASH256_HEX_LENGTH = 64;

// Allowed public-key hex lengths — Ed25519 (32 bytes / 64 hex) or
// secp256k1 compressed (33 bytes / 66 hex). Same set as rippled's
// `publicKeyType()` accepts.
const ALLOWED_PUBLIC_KEY_HEX_LENGTHS = [64, 66] as const;

// xrpl.js caps non-DomainSet credential arrays at 8 entries
// (`packages/xrpl/src/models/transactions/common.ts:28`).
const MAX_CREDENTIAL_IDS = 8;

// ─── Public types ────────────────────────────────────────────────────

export interface PaymentChannelClaimProps {
  /** The unique address of the transaction sender. */
  Account: string;
  /** The unique ID of the payment channel (64-char hex / UInt256). */
  Channel: string;
  /**
   * Total XRP authorized by the signature, in drops. Cumulative across
   * the channel's lifetime. Required when delivering XRP; must match
   * the signed message. Must be > 0.
   */
  Amount?: string | undefined;
  /**
   * Total XRP delivered by the channel after this claim is processed,
   * in drops. Required to deliver XRP; must be > 0 and strictly
   * greater than the channel's current `Balance`.
   */
  Balance?: string | undefined;
  /**
   * Public key used to verify `Signature` (32 or 33-byte hex). Must
   * match the channel's stored `PublicKey`.
   */
  PublicKey?: string | undefined;
  /**
   * Claim signature, hex-encoded. Required unless the sender is the
   * channel's source address.
   */
  Signature?: string | undefined;
  /**
   * Optional credentials authorizing this claim. Each entry is a
   * 64-char hex ledger entry ID. Length must be in [1, 8].
   */
  CredentialIDs?: string[] | undefined;
  /** Bit-flags: 0, tfRenew (0x00010000), and/or tfClose (0x00020000). */
  Flags?: number | PaymentChannelClaimFlagsInterface | undefined;
  Fee?: string | undefined;
  Sequence?: number | undefined;
}

export interface PaymentChannelClaim
  extends Readonly<PaymentChannelClaimProps> {
  readonly TransactionType: 'PaymentChannelClaim';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(
    overrides: Partial<PaymentChannelClaimProps>,
  ): PaymentChannelClaim;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Validate a strictly-positive XRP drops string. Accepts canonical
 * decimal-or-scientific mantissa form; rejects zero, negative, and
 * non-numeric values. Used for `Amount` and `Balance` which are
 * documented as "XRP, in drops" (XRP-only — no IOU/MPT forms).
 */
function isPositiveXrpDrops(value: unknown): boolean {
  if (!isString(value)) return false;
  if (!/^[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u.test(value)) {
    return false;
  }
  return parseFloat(value) > 0;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function paymentChannelClaim(
  props: PaymentChannelClaimProps,
): PaymentChannelClaim {
  // ── Account ── required, must be a valid XRPL classic or X-address.
  require(
    props.Account,
    'PaymentChannelClaim: Account is required',
    isAccount,
  );

  // ── Channel ── required, 64-char hex (UInt256 — the ledger object
  //    hash of the PayChannel entry).
  if (
    !isString(props.Channel) ||
    !isHex(props.Channel) ||
    props.Channel.length !== HASH256_HEX_LENGTH
  ) {
    throw new ValidationError(
      'PaymentChannelClaim: Channel must be a 64-character hex string (UInt256, the PayChannel ledger object hash)',
    );
  }

  // ── Amount ── optional, but if supplied must be a strictly-positive
  //    XRP drops string. Rejects IOU/MPT object forms (those would
  //    match the class's `isAmount` shape but the ledger is
  //    XRP-only for this tx).
  if (props.Amount !== undefined && !isPositiveXrpDrops(props.Amount)) {
    throw new ValidationError(
      'PaymentChannelClaim: Amount must be a strictly-positive XRP drops string (temBAD_AMOUNT)',
    );
  }

  // ── Balance ── optional, but if supplied must be a strictly-positive
  //    XRP drops string.
  if (props.Balance !== undefined && !isPositiveXrpDrops(props.Balance)) {
    throw new ValidationError(
      'PaymentChannelClaim: Balance must be a strictly-positive XRP drops string (temBAD_AMOUNT)',
    );
  }

  // ── PublicKey ── optional, but if supplied must be hex of 32 or
  //    33 bytes (Ed25519 or compressed secp256k1). Matches rippled's
  //    `publicKeyType()` preflight check.
  if (props.PublicKey !== undefined) {
    if (!isString(props.PublicKey) || !isHex(props.PublicKey)) {
      throw new ValidationError(
        'PaymentChannelClaim: PublicKey must be a hex string',
      );
    }
    if (
      !ALLOWED_PUBLIC_KEY_HEX_LENGTHS.includes(
        props.PublicKey.length as 64 | 66,
      )
    ) {
      throw new ValidationError(
        `PaymentChannelClaim: PublicKey hex must be 64 (Ed25519, 32 bytes) or 66 (secp256k1, 33 bytes) characters; got ${props.PublicKey.length} hex chars (temMALFORMED)`,
      );
    }
  }

  // ── Signature ── optional, but if supplied must be a hex string.
  if (props.Signature !== undefined) {
    if (!isString(props.Signature) || !isHex(props.Signature)) {
      throw new ValidationError(
        'PaymentChannelClaim: Signature must be a hex string (temMALFORMED)',
      );
    }
  }

  // ── CredentialIDs ── optional array, but bounds + entry-shape
  //    enforced when present. Per xrpl.js: length in
  //    [1, MAX_AUTHORIZED_CREDENTIALS]; each entry a 64-char hex
  //    string; no duplicates.
  if (props.CredentialIDs !== undefined) {
    if (!isArray(props.CredentialIDs)) {
      throw new ValidationError(
        'PaymentChannelClaim: CredentialIDs must be an array of credential ID strings',
      );
    }
    if (props.CredentialIDs.length === 0) {
      throw new ValidationError(
        'PaymentChannelClaim: CredentialIDs must not be an empty array',
      );
    }
    if (props.CredentialIDs.length > MAX_CREDENTIAL_IDS) {
      throw new ValidationError(
        `PaymentChannelClaim: CredentialIDs length cannot exceed ${MAX_CREDENTIAL_IDS} elements (actual: ${props.CredentialIDs.length})`,
      );
    }
    const seen = new Set<string>();
    for (let i = 0; i < props.CredentialIDs.length; i++) {
      const cid = props.CredentialIDs[i];
      if (
        !isString(cid) ||
        !isHex(cid) ||
        cid.length !== HASH256_HEX_LENGTH
      ) {
        throw new ValidationError(
          `PaymentChannelClaim: CredentialIDs[${i}] must be a ${HASH256_HEX_LENGTH}-character hex string`,
        );
      }
      if (seen.has(cid)) {
        throw new ValidationError(
          `PaymentChannelClaim: CredentialIDs[${i}] is a duplicate of an earlier entry`,
        );
      }
      seen.add(cid);
    }
  }

  return buildFrozenTx<PaymentChannelClaimProps, PaymentChannelClaim>(
    'PaymentChannelClaim',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: PaymentChannelClaim) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: PaymentChannelClaim,
        overrides: Partial<PaymentChannelClaimProps>,
      ) {
        return paymentChannelClaim(mergeForWith(this, overrides));
      },
    },
  );
}