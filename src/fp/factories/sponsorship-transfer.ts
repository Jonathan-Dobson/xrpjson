/**
 * Functional SponsorshipTransfer factory — frozen-object style.
 *
 * Create, transfer, or end reserve sponsorship for a ledger object or
 * account. Operates in one of three mutually-exclusive modes, selected by
 * exactly one of:
 *   - `tfSponsorshipEnd`      (0x00010000)
 *   - `tfSponsorshipCreate`   (0x00020000)
 *   - `tfSponsorshipReassign` (0x00040000)
 *
 *   import { sponsorshipTransfer } from 'xrpjson';
 *   const tx = sponsorshipTransfer({
 *     Account,
 *     Flags: 0x00020000,                  // tfSponsorshipCreate
 *     ObjectID: '...64 hex...',
 *     Sponsor: 'rNEW_SPONSOR',
 *     SponsorFlags: 0x00000002,           // spfSponsorReserve
 *   });
 *   const tx2 = tx.with({ Flags: 0x00010000 });   // tfSponsorshipEnd
 *   const j = tx.toJSON();
 *
 * Affected amendments:
 *   - `Sponsor` (base SponsorshipTransfer + the three sponsorship scenarios)
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/sponsortransfer
 * @see xrpl.js `validateSponsorshipTransfer`
 *      (`~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/
 *       transactions/sponsorshipTransfer.ts`)
 *
 * ## Divergences
 *
 * The factory enforces eight preclaim rules that the class API
 * (the Class API's `SponsorshipTransfer`) skips. Each one is mandated
 * by the Sponsor amendment / `validateSponsorshipTransfer` /
 * `sponsorshiptransfer.md`.
 *
 *   1. `ObjectID`, when present, must be a 64-character hex string
 *      (HASH256 form).
 *      Source: xrpl.js `validateSponsorshipTransfer` (lines 141–145) —
 *      "ObjectID should be a 64-character hex string (ledger object ID)".
 *      The class only checks `isString(ObjectID)` and accepts any string.
 *
 *   2. `Sponsor` is REQUIRED for `tfSponsorshipCreate` and
 *      `tfSponsorshipReassign`; the field must NOT be present for
 *      `tfSponsorshipEnd`.
 *      Source: xrpl-dev-portal `sponsorshiptransfer.md` Error Cases —
 *      `temMALFORMED`: "The `Sponsor` field is missing when creating or
 *      reassigning a sponsorship." / "The `Sponsor` field is present when
 *      ending a sponsorship." xrpl.js lines 149–163 enforce both.
 *      The class does not accept the `Sponsor` field at all.
 *
 *   3. `Sponsor` must be a valid XRPL account address AND must not equal
 *      `Account`.
 *      Source: xrpl.js lines 166–183 (validates with `isAccount` and
 *      `areAddressesEqual(Account, Sponsor)`). The class does not check
 *      this because it doesn't accept the field.
 *
 *   4. `SponsorFlags` is REQUIRED for Create/Reassign and must have the
 *      `spfSponsorReserve` (0x00000002) bit set; the field must NOT be
 *      present for `tfSponsorshipEnd`.
 *      Source: xrpl-dev-portal `sponsorshiptransfer.md` Create / Reassign
 *      tabs — "Provide the `Sponsor` field with the
 *      `SponsorFlags.spfSponsorReserve` flag." End tab — "Do not include
 *      the `Sponsor` and `SponsorFlags` fields." xrpl.js lines 187–199
 *      enforce the required-bit. The class does not accept the field at
 *      all.
 *
 *   5. `SponsorSignature` is REQUIRED for **account-level** Create/Reassign
 *      (i.e. when `ObjectID` is omitted); optional (but allowed) for
 *      object-level Create/Reassign.
 *      Source: xrpl-dev-portal `sponsorshiptransfer.md` Create / Reassign
 *      tabs — "Include the `SponsorSignature` when sponsoring an account.
 *      This is optional when sponsoring an object." xrpl.js lines
 *      205–212 enforce this. The class does not accept the field at all.
 *
 *   6. `SponsorSignature`, when present, must be a well-formed object
 *      with EITHER single-sign fields (`SigningPubKey` + `TxnSignature`)
 *      OR a `Signers` array (multi-sign), but not both.
 *      Source: xrpl.js `SponsorSignature` type
 *      (`packages/xrpl/src/models/common/index.ts` lines 57–69) and
 *      rippled's `STObject` deserialization rules. The class doesn't
 *      validate shape because it doesn't accept the field.
 *
 *   7. `Sponsee` must not equal `Account`.
 *      Source: xrpl.js lines 231–235 (uses `areAddressesEqual`).
 *      The class does not check identity.
 *
 *   8. Both numeric and boolean-map `Flags` forms are accepted (matching
 *      xrpl.js), and the two forms are normalised — but neither may carry
 *      any unknown mode bits. The class accepts the object form only and
 *      does not validate bit values against the three documented modes.
 *
 * Note: the factory is the **only** place that distinguishes "object-level
 * sponsorship" (ObjectID present) from "account-level sponsorship"
 * (ObjectID omitted) for the SponsorSignature-required check. The class
 * lets you build a Create/Reassign tx with no ObjectID and no
 * SponsorSignature, which the ledger rejects with `temMALFORMED`.
 */
import type {
  SponsorshipTransferFlagsInterface,
} from '../../types/flags.js';
import { SponsorshipTransferFlags } from '../../types/flags.js';
import { isAccount, isHex, isRecord, isString } from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// HASH256 ledger entry ID — 32 bytes = 64 hex characters.
const HASH256_LENGTH = 64;

// Sponsor flags bitfield. Mirrors the xrpl.js `SponsorFlags` enum
// (`packages/xrpl/src/models/transactions/common.ts` lines 660–665).
//
// BOTH bits are legal on a SponsorshipTransfer:
//   - `spfSponsorReserve` is *required* for the Create and Reassign
//     scenarios (the sponsorship being established is a reserve
//     sponsorship).
//   - `spfSponsorFee` is legal on ANY transaction type and is orthogonal
//     to the reserve bit — it only says the sponsor pays the fee. rippled
//     reads it in `STTx::getFeePayerID()`.
//   - Source: rippled `TxFlags.h:459-461` —
//     `spfSponsorFlagMask = ~(spfSponsorFee | spfSponsorReserve)`, i.e.
//     both bits are outside the invalid set.
//   - Source: xrpl.org `common-fields.md:196` — "The `spfSponsorFee`
//     flag can be used with any transaction type."
//   - Source: xrpl.org `common-fields.md:190` — "Both flags can be used
//     together in a single transaction."
//   - Cross-ref: rippled `SponsorshipTransfer::preflight` lines 120, 147
//     require `isReserveSponsored` but never forbid `spfSponsorFee`.
//
// Rejecting `spfSponsorFee` here made the factory refuse a transaction
// rippled accepts.
const SPF_SPONSOR_FEE = 0x00000001;
const SPF_SPONSOR_RESERVE = 0x00000002;

// The set of bits rippled permits in `SponsorFlags` — the complement of
// rippled's own `spfSponsorFlagMask`.
const VALID_SPONSOR_FLAGS_MASK = SPF_SPONSOR_FEE | SPF_SPONSOR_RESERVE;

// ─── Public types ────────────────────────────────────────────────────

/**
 * Sponsor authorization signature. Mirrors the xrpl.js `SponsorSignature`
 * discriminated union: either single-sign fields OR multi-sign Signers,
 * but not both.
 *
 * The factory validates this shape locally; no need for the consumer to
 * depend on xrpl.js for the type.
 */
export type SponsorSignatureProps =
  | {
      /** The sponsor's public key (for single-signing). */
      SigningPubKey: string;
      /** The sponsor's signature (for single-signing). */
      TxnSignature: string;
      Signers?: never;
    }
  | {
      SigningPubKey?: never;
      TxnSignature?: never;
      /** Array of sponsor signatures (for multi-signing). */
      Signers: readonly {
        readonly Signer: {
          readonly Account: string;
          readonly TxnSignature: string;
          readonly SigningPubKey: string;
        };
      }[];
    };

export interface SponsorshipTransferProps {
  /** The unique address of the transaction sender (sponsee or sponsor). */
  Account: string;
  /**
   * The mode flag. Must be exactly one of `tfSponsorshipEnd`,
   * `tfSponsorshipCreate`, or `tfSponsorshipReassign`. Numeric or
   * boolean-map form is accepted (canonical form is numeric).
   */
  Flags?: number | SponsorshipTransferFlagsInterface | undefined;
  /**
   * The ID of the ledger entry whose sponsorship is being changed.
   * 64-char hex. Required when sponsoring / ending sponsorship for an
   * object; omit for account-level sponsorship.
   */
  ObjectID?: string | undefined;
  /**
   * The sponsee account whose sponsorship is being ended. Only valid for
   * `tfSponsorshipEnd`; omit when `Account` itself is the sponsee. Must
   * not be present for Create / Reassign.
   */
  Sponsee?: string | undefined;
  /**
   * The new sponsor for Create / Reassign. Must NOT be present for End.
   * Required for Create / Reassign.
   */
  Sponsor?: string | undefined;
  /**
   * Sponsor flags. Must include `spfSponsorReserve` (0x00000002) for
   * Create / Reassign; must NOT be present for End. Required for
   * Create / Reassign.
   */
  SponsorFlags?: number | undefined;
  /**
   * Sponsor's signature. Required for account-level (no ObjectID)
   * Create / Reassign; optional for object-level Create / Reassign.
   */
  SponsorSignature?: SponsorSignatureProps | undefined;
  Fee?: string | undefined;
  Sequence?: number | undefined;
}

export interface SponsorshipTransfer extends Readonly<SponsorshipTransferProps> {
  readonly TransactionType: 'SponsorshipTransfer';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<SponsorshipTransferProps>): SponsorshipTransfer;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Extract the three mode-flag booleans and the numeric flag value from
 * either the numeric or boolean-map form. Mirrors xrpl.js
 * `validateSponsorshipTransfer` lines 96–115.
 */
function getModeFlags(rawFlags: unknown): {
  numericFlags: number;
  isEnd: boolean;
  isCreate: boolean;
  isReassign: boolean;
} {
  let numericFlags = 0;
  let isEnd = false;
  let isCreate = false;
  let isReassign = false;

  if (typeof rawFlags === 'number') {
    numericFlags = rawFlags;
    isEnd = (numericFlags & SponsorshipTransferFlags.tfSponsorshipEnd) !== 0;
    isCreate =
      (numericFlags & SponsorshipTransferFlags.tfSponsorshipCreate) !== 0;
    isReassign =
      (numericFlags & SponsorshipTransferFlags.tfSponsorshipReassign) !== 0;
  } else if (isRecord(rawFlags)) {
    isEnd = rawFlags['tfSponsorshipEnd'] === true;
    isCreate = rawFlags['tfSponsorshipCreate'] === true;
    isReassign = rawFlags['tfSponsorshipReassign'] === true;
    numericFlags =
      (isEnd ? SponsorshipTransferFlags.tfSponsorshipEnd : 0) |
      (isCreate ? SponsorshipTransferFlags.tfSponsorshipCreate : 0) |
      (isReassign ? SponsorshipTransferFlags.tfSponsorshipReassign : 0);
  }

  return { numericFlags, isEnd, isCreate, isReassign };
}

/**
 * Validate the shape of a SponsorSignature object. Mirrors the xrpl.js
 * `SponsorSignature` discriminated union
 * (`packages/xrpl/src/models/common/index.ts` lines 57–69).
 */
function validateSponsorSignature(
  value: unknown,
  path: string,
): void {
  if (!isRecord(value)) {
    throw new ValidationError(
      `${path}: SponsorSignature must be an object`,
    );
  }
  const hasSingleSign =
    value['SigningPubKey'] !== undefined ||
    value['TxnSignature'] !== undefined;
  const hasMultiSign = value['Signers'] !== undefined;

  if (hasSingleSign && hasMultiSign) {
    throw new ValidationError(
      `${path}: SponsorSignature must not combine SigningPubKey/TxnSignature with Signers`,
    );
  }
  if (!hasSingleSign && !hasMultiSign) {
    throw new ValidationError(
      `${path}: SponsorSignature must include either single-sign fields or Signers`,
    );
  }
  if (hasSingleSign) {
    if (!isString(value['SigningPubKey']) || value['SigningPubKey'].length === 0) {
      throw new ValidationError(
        `${path}: SponsorSignature.SigningPubKey must be a non-empty string`,
      );
    }
    if (!isString(value['TxnSignature']) || value['TxnSignature'].length === 0) {
      throw new ValidationError(
        `${path}: SponsorSignature.TxnSignature must be a non-empty string`,
      );
    }
  } else {
    const signers = value['Signers'];
    if (!Array.isArray(signers) || signers.length === 0) {
      throw new ValidationError(
        `${path}: SponsorSignature.Signers must be a non-empty array`,
      );
    }
    for (let i = 0; i < signers.length; i++) {
      const entry = signers[i];
      if (!isRecord(entry)) {
        throw new ValidationError(
          `${path}: SponsorSignature.Signers[${i}] must be an object`,
        );
      }
      const inner = entry['Signer'];
      if (!isRecord(inner)) {
        throw new ValidationError(
          `${path}: SponsorSignature.Signers[${i}].Signer must be an object`,
        );
      }
      if (
        !isString(inner['Account']) ||
        !isString(inner['TxnSignature']) ||
        !isString(inner['SigningPubKey'])
      ) {
        throw new ValidationError(
          `${path}: SponsorSignature.Signers[${i}].Signer must include Account, TxnSignature, and SigningPubKey strings`,
        );
      }
    }
  }
}

// ─── Factory ─────────────────────────────────────────────────────────

export function sponsorshipTransfer(
  props: SponsorshipTransferProps,
): SponsorshipTransfer {
  // ── Account ── required, must be a valid XRPL classic or X-address.
  require(props.Account, 'SponsorshipTransfer: Account is required', isAccount);

  // ── Mode flag dispatch ── exactly one of three mode bits must be set.
  const { isEnd, isCreate, isReassign } = getModeFlags(props.Flags);
  const scenarioCount =
    (isEnd ? 1 : 0) + (isCreate ? 1 : 0) + (isReassign ? 1 : 0);
  if (scenarioCount === 0) {
    throw new ValidationError(
      'SponsorshipTransfer: must specify exactly one scenario flag (tfSponsorshipEnd, tfSponsorshipCreate, or tfSponsorshipReassign)',
    );
  }
  if (scenarioCount > 1) {
    throw new ValidationError(
      'SponsorshipTransfer: cannot specify multiple scenario flags (tfSponsorshipEnd, tfSponsorshipCreate, tfSponsorshipReassign are mutually exclusive)',
    );
  }

  // ── ObjectID ── if present, 64-char hex.
  if (props.ObjectID !== undefined) {
    if (
      !isString(props.ObjectID) ||
      !isHex(props.ObjectID) ||
      props.ObjectID.length !== HASH256_LENGTH
    ) {
      throw new ValidationError(
        'SponsorshipTransfer: ObjectID must be a 64-character hexadecimal string',
      );
    }
  }

  // ── End-mode rules ──
  //   - Sponsee is allowed (and optional).
  //   - Sponsor / SponsorFlags must NOT be present.
  if (isEnd) {
    if (props.Sponsor !== undefined) {
      throw new ValidationError(
        'SponsorshipTransfer: Sponsor field must not be present for tfSponsorshipEnd scenario',
      );
    }
    if (props.SponsorFlags !== undefined) {
      throw new ValidationError(
        'SponsorshipTransfer: SponsorFlags field must not be present for tfSponsorshipEnd scenario',
      );
    }
  }

  // ── Create / Reassign rules ──
  //   - Sponsor REQUIRED, must be a valid account, must not equal Account.
  //   - SponsorFlags REQUIRED with spfSponsorReserve bit set.
  //   - Sponsee MUST NOT be present.
  //   - SponsorSignature REQUIRED when ObjectID is omitted (account-level).
  if (isCreate || isReassign) {
    if (props.Sponsee !== undefined) {
      throw new ValidationError(
        'SponsorshipTransfer: Sponsee field must not be present for tfSponsorshipCreate or tfSponsorshipReassign scenarios',
      );
    }
    if (props.Sponsor === undefined) {
      throw new ValidationError(
        'SponsorshipTransfer: Sponsor field is required for tfSponsorshipCreate and tfSponsorshipReassign scenarios',
      );
    }
    if (!isAccount(props.Sponsor)) {
      throw new ValidationError(
        'SponsorshipTransfer: Sponsor must be a valid account address',
      );
    }
    if (props.Sponsor === props.Account) {
      throw new ValidationError(
        'SponsorshipTransfer: Account and Sponsor cannot be the same',
      );
    }
    if (props.SponsorFlags === undefined) {
      throw new ValidationError(
        'SponsorshipTransfer: SponsorFlags is required for tfSponsorshipCreate and tfSponsorshipReassign scenarios',
      );
    }
    if (typeof props.SponsorFlags !== 'number') {
      throw new ValidationError(
        'SponsorshipTransfer: SponsorFlags must be a number',
      );
    }
    if ((props.SponsorFlags & SPF_SPONSOR_RESERVE) !== SPF_SPONSOR_RESERVE) {
      throw new ValidationError(
        'SponsorshipTransfer: SponsorFlags must have the spfSponsorReserve bit set for tfSponsorshipCreate and tfSponsorshipReassign scenarios',
      );
    }
    // Reject only bits rippled also rejects. `spfSponsorFee` is legal
    // here, so `SponsorFlags: 3` (fee + reserve) must be accepted.
    // `&` is int32 in JS, so the negated mask is handled correctly here.
    const undefinedSponsorBits = props.SponsorFlags & ~VALID_SPONSOR_FLAGS_MASK;
    if (undefinedSponsorBits !== 0) {
      throw new ValidationError(
        `SponsorshipTransfer: SponsorFlags contains undefined bit(s) (0x${undefinedSponsorBits.toString(16)}); only spfSponsorFee (0x00000001) and spfSponsorReserve (0x00000002) are allowed`,
      );
    }

    // Account-level sponsorship: no ObjectID, so the sponsor must
    // explicitly co-sign via SponsorSignature.
    if (props.ObjectID === undefined && props.SponsorSignature === undefined) {
      throw new ValidationError(
        'SponsorshipTransfer: SponsorSignature is required for account-level tfSponsorshipCreate or tfSponsorshipReassign (no ObjectID)',
      );
    }
  }

  // ── Sponsee ── valid account + identity check (End mode only).
  if (props.Sponsee !== undefined) {
    if (!isAccount(props.Sponsee)) {
      throw new ValidationError(
        'SponsorshipTransfer: Sponsee must be a valid account address',
      );
    }
    if (props.Sponsee === props.Account) {
      throw new ValidationError(
        'SponsorshipTransfer: Account and Sponsee cannot be the same',
      );
    }
  }

  // ── SponsorSignature ── validate shape whenever present.
  if (props.SponsorSignature !== undefined) {
    validateSponsorSignature(
      props.SponsorSignature,
      'SponsorshipTransfer',
    );
  }

  return buildFrozenTx<SponsorshipTransferProps, SponsorshipTransfer>(
    'SponsorshipTransfer',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: SponsorshipTransfer) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: SponsorshipTransfer,
        overrides: Partial<SponsorshipTransferProps>,
      ) {
        return sponsorshipTransfer(mergeForWith(this, overrides));
      },
    },
  );
}
