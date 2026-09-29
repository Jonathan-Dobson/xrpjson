/**
 * Functional OfferCreate factory — frozen-object style.
 *
 * Places an offer on the Decentralized Exchange (DEX). The class-based
 * equivalent requires a separate `.validate()` call after construction;
 * this factory validates at construction so an invalid tx can never exist.
 *
 *   import { offerCreate } from 'xrplt/fp';
 *   const tx = offerCreate({ Account, TakerGets: '1000000', TakerPays: { … } });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Expiration: 770000000 });
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/offercreate
 * @see https://github.com/XRPLF/xrpl.js/blob/main/packages/xrpl/src/models/transactions/offerCreate.ts
 *
 * ## Divergences
 *
 * Compared with `src/transactions/offer-create.ts`, this factory adds
 * guards the class skips and fixes a flag-value bug:
 *
 * - **The class hard-codes `tfHybrid = 0x00400000` in `validate()` but
 *   the spec value is `0x00100000`.** The class therefore fails to detect
 *   tfHybrid offers that use the correct bit and (worse) would falsely
 *   pass the tfHybrid-without-DomainID guard for an invalid-bit tx.
 *   The factory uses `0x00100000` directly so it matches the canonical
 *   spec.
 *   - Source: xrpl.js `OfferCreateFlags.tfHybrid = 0x00100000`
 *     (xrpl.js repo packages/xrpl/src/models/transactions/offerCreate.ts
 *     line 52) and the canonical XRPL definitions table
 *     (xrpl.js repo packages/ripple-binary-codec/src/enums/definitions.json
 *     line 5275: `"tfHybrid": 1048576` = `0x00100000`).
 *   - Source: xrpl-dev-portal `offercreate.md` flag table
 *     `tfHybrid | 0x00100000 | 1048576`.
 *
 * - **`tfImmediateOrCancel` and `tfFillOrKill` are mutually exclusive.**
 *   The class doesn't check this — only the single-flag `tfHybrid`
 *   guard. Both flags are uint32 values; their bits overlap with
 *   nothing else, but rippled rejects the combination with
 *   `temINVALID_FLAG` ("such as both `tfImmediateOrCancel` and
 *   `tfFillOrKill`").
 *   - Source: xrpl-dev-portal `offercreate.md` Error Cases row
 *     `temINVALID_FLAG`: "The transaction specifies an invalid flag
 *     combination, such as both `tfImmediateOrCancel` and `tfFillOrKill`."
 *
 * - **Both `TakerGets` and `TakerPays` must be strictly positive amounts.**
 *   The class only checks shape via `isAmount`, which allows the XRP
 *   string `"0"` and any numeric string for IOU/MPT `value`. rippled
 *   rejects negative or zero amounts with `temBAD_OFFER` ("The offer
 *   tries to trade XRP for XRP, or tries to trade an invalid or negative
 *   amount of a token"). The factory performs the same positive-value
 *   check used by `ammCreate` for `Amount`/`Amount2`.
 *   - Source: xrpl-dev-portal `offercreate.md` Error Cases
 *     `temBAD_OFFER` row.
 *
 * - **`TakerGets` and `TakerPays` may not be the same currency (same
 *   issuer + currency code, or both XRP).** This catches both the
 *   XRP-for-XRP case (`temBAD_OFFER`) and the IOU-for-same-IOU case
 *   (`temREDUNDANT`). The class skips this cross-field invariant entirely.
 *   - Source: xrpl-dev-portal `offercreate.md` Error Cases
 *     `temBAD_OFFER` row ("The offer tries to trade XRP for XRP") and
 *     `temREDUNDANT` row ("The transaction would trade a token for the
 *     same token (same issuer and currency code)").
 *
 * - **`Account` must be a valid XRPL classic or X-address.** The class
 *   inherits only `validateBaseTransaction`'s `isString(Account)` check,
 *   which accepts any string. The factory uses `isAccount` so an
 *   obvious typo (e.g. `"r…"`) is caught at construction.
 *   - Source: xrpl-dev-portal basic-data-types.md (`AccountID` is a
 *     classic address or X-address).
 *
 * - **`Expiration` must be a UInt32.** The class accepts any number via
 *   `super.validate()` (none) — i.e. no check at all. The factory checks
 *   that, when present, the value is an integer in `[0, 0xffffffff]`.
 *   - Source: xrpl-dev-portal `offercreate.md` Fields table
 *     `Expiration | Number | UInt32`.
 *
 * - **`OfferSequence` must be a UInt32.** Same rationale as `Expiration`.
 *   The factory additionally rejects `OfferSequence > Sequence` here
 *   only when `Sequence` is also provided, per
 *   `temBAD_SEQUENCE` ("the `OfferSequence` ... is higher than the
 *   transaction's own `Sequence` number").
 *   - Source: xrpl-dev-portal `offercreate.md` Fields table
 *     `OfferSequence | Number | UInt32`; Error Cases `temBAD_SEQUENCE`.
 *
 * - **`IssuedCurrencyAmount` shape is validated** (currency length /
 *   hex, issuer must be a valid account, value must be a positive
 *   XRPLNumber). The class delegates to `isAmount`, which only checks
 *   key presence.
 *   - Source: xrpl-dev-portal basic-data-types.md
 *     `#specifying-currency-amounts`.
 *
 * - **`MPTAmount.mpt_issuance_id` must be 24–48 hex characters.** The
 *   class only checks key presence via `isAmount`.
 *   - Source: XLS-0033 Multi-Purpose Tokens (192-bit issuance ID,
 *     hex-encoded; the 24–48 char window matches the policy used by
 *     `ammCreate` and `vaultClawback`).
 */
import type { Amount } from '../../types/amounts.js';
import type { OfferCreateFlagsInterface } from '../../types/flags.js';
import {
  isAccount,
  isAmount,
  isFlagEnabled,
  isHex,
  isIssuedCurrencyAmount,
  isMPTAmount,
  isNumber,
  isRecord,
  isString,
} from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// OfferCreate flag bits (per xrpl-dev-portal offercreate.md and
// xrpl.js OfferCreateFlags enum).
const TF_PASSIVE = 0x00010000;
const TF_IMMEDIATE_OR_CANCEL = 0x00020000;
const TF_FILL_OR_KILL = 0x00040000;
const TF_SELL = 0x00080000;
const TF_HYBRID = 0x00100000;

// UInt32 bounds (per xrpl-dev-portal offercreate.md Fields table).
const UINT32_MIN = 0;
const UINT32_MAX = 0xffffffff;

// Currency code shapes (per xrpl.org generic Amount spec).
const CURRENCY_ASCII_LENGTH = 3;
const CURRENCY_HEX_LENGTH = 40;

// MPT issuance IDs are 192-bit, hex-encoded (≤ 48 chars). We accept
// 24–48 to leave slack for future widenings / leading-zero encoders.
// (XLS-0033; matches the policy used by ammCreate and vaultClawback.)
const MPT_ISSUANCE_ID_MIN = 24;
const MPT_ISSUANCE_ID_MAX = 48;

// DomainID is a 64-char hex (UInt256).
const DOMAIN_ID_LENGTH = 64;

// ─── Public types ────────────────────────────────────────────────────

export interface OfferCreateProps {
  /** The unique address of the transaction sender (the offer creator). */
  Account: string;
  /** The amount and type of currency being sold by the offer creator. */
  TakerGets: Amount;
  /** The amount and type of currency being bought by the offer creator. */
  TakerPays: Amount;
  /** Time after which the offer is no longer active (UInt32, seconds since the Ripple Epoch). */
  Expiration?: number | undefined;
  /** An Offer to delete first, specified the same way as OfferCancel. */
  OfferSequence?: number | undefined;
  /** Permissioned Domain ID (64-char hex). Required when tfHybrid is set. */
  DomainID?: string | undefined;
  /** Bit-flags for this transaction. */
  Flags?: number | OfferCreateFlagsInterface | undefined;
  Fee?: string | undefined;
  Sequence?: number | undefined;
}

export interface OfferCreate extends Readonly<OfferCreateProps> {
  readonly TransactionType: 'OfferCreate';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<OfferCreateProps>): OfferCreate;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * XRPLNumber: a non-negative base-10 integer string. Matches the policy
 * used across other factories (loanSet, ammCreate, vaultCreate,
 * vaultClawback).
 */
function isXrplNumber(value: unknown): value is string {
  return isString(value) && /^[0-9]+$/u.test(value);
}

/**
 * True iff the given Amount is a positive amount (currency string for
 * XRP, IssuedCurrencyAmount, or MPTAmount).
 */
function isPositiveAmount(amount: Amount, path: string): void {
  if (!isAmount(amount)) {
    throw new ValidationError(
      `OfferCreate: ${path} must be a valid Amount (XRP string, IOU, or MPT form)`,
    );
  }

  // XRP path: positive base-10 integer string.
  if (isString(amount)) {
    if (!isXrplNumber(amount)) {
      throw new ValidationError(
        `OfferCreate: ${path} (XRP) must be a non-negative base-10 integer string`,
      );
    }
    if (amount === '0') {
      throw new ValidationError(
        `OfferCreate: ${path} must be a positive amount (got "0")`,
      );
    }
    return;
  }

  // IOU path.
  if (isIssuedCurrencyAmount(amount)) {
    const ccy = amount.currency;
    if (
      ccy.length !== CURRENCY_ASCII_LENGTH &&
      ccy.length !== CURRENCY_HEX_LENGTH
    ) {
      throw new ValidationError(
        `OfferCreate: ${path}.currency must be ${CURRENCY_ASCII_LENGTH} ASCII characters or ${CURRENCY_HEX_LENGTH} hex characters (actual: ${ccy.length})`,
      );
    }
    if (ccy.length === CURRENCY_HEX_LENGTH && !isHex(ccy)) {
      throw new ValidationError(
        `OfferCreate: ${path}.currency (40-char form) must be hex`,
      );
    }
    if (!isAccount(amount.issuer)) {
      throw new ValidationError(
        `OfferCreate: ${path}.issuer must be a valid XRPL account address`,
      );
    }
    if (!isXrplNumber(amount.value)) {
      throw new ValidationError(
        `OfferCreate: ${path}.value must be a non-negative base-10 integer string`,
      );
    }
    if (amount.value === '0') {
      throw new ValidationError(
        `OfferCreate: ${path} must be a positive amount (got "0")`,
      );
    }
    return;
  }

  // MPT path.
  if (isMPTAmount(amount)) {
    const mptid = amount.mpt_issuance_id;
    if (
      mptid.length < MPT_ISSUANCE_ID_MIN ||
      mptid.length > MPT_ISSUANCE_ID_MAX ||
      !isHex(mptid)
    ) {
      throw new ValidationError(
        `OfferCreate: ${path}.mpt_issuance_id must be a ${MPT_ISSUANCE_ID_MIN}-${MPT_ISSUANCE_ID_MAX} character hex string`,
      );
    }
    if (!isXrplNumber(amount.value)) {
      throw new ValidationError(
        `OfferCreate: ${path}.value must be a non-negative base-10 integer string`,
      );
    }
    if (amount.value === '0') {
      throw new ValidationError(
        `OfferCreate: ${path} must be a positive amount (got "0")`,
      );
    }
    return;
  }

  // Unreachable — defensive.
  throw new ValidationError(
    `OfferCreate: ${path} must be a valid Amount (XRP string, IOU, or MPT form)`,
  );
}

/**
 * True if the two amounts trade the same currency. Used to reject
 * XRP-for-XRP and same-IOU-for-same-IOU offers.
 */
function isSameCurrency(a: Amount, b: Amount): boolean {
  // XRP-for-XRP.
  if (isString(a) && isString(b)) return true;

  // IOU-for-IOU with matching currency and issuer.
  if (isIssuedCurrencyAmount(a) && isIssuedCurrencyAmount(b)) {
    return a.currency === b.currency && a.issuer === b.issuer;
  }

  // MPT-for-MPT with matching mpt_issuance_id.
  if (isMPTAmount(a) && isMPTAmount(b)) {
    return a.mpt_issuance_id === b.mpt_issuance_id;
  }

  // Mixed forms (XRP/IOU/MPT) are different currencies.
  return false;
}

/**
 * Decoded OfferCreate flag bits.
 */
interface DecodedFlags {
  hybrid: boolean;
  fillOrKill: boolean;
  immediateOrCancel: boolean;
  passive: boolean;
  sell: boolean;
}

/**
 * Decode the bit-set for a numeric Flags value, returning the names of
 * each known tfHybrid / tfFillOrKill / tfImmediateOrCancel / tfPassive /
 * tfSell bit. Unknown bits are ignored — rippled will reject them, but
 * we don't second-guess the flag schema here.
 */
function decodeOfferCreateFlags(flags: number): DecodedFlags {
  return {
    hybrid: isFlagEnabled(flags, TF_HYBRID),
    fillOrKill: isFlagEnabled(flags, TF_FILL_OR_KILL),
    immediateOrCancel: isFlagEnabled(flags, TF_IMMEDIATE_OR_CANCEL),
    passive: isFlagEnabled(flags, TF_PASSIVE),
    sell: isFlagEnabled(flags, TF_SELL),
  };
}

/**
 * Decode the bit-set for a FlagsInterface object. Returns the same
 * shape as `decodeOfferCreateFlags` for uniform downstream checks.
 */
function decodeOfferCreateFlagsInterface(
  flags: OfferCreateFlagsInterface,
): DecodedFlags {
  return {
    hybrid: flags.tfHybrid === true,
    fillOrKill: flags.tfFillOrKill === true,
    immediateOrCancel: flags.tfImmediateOrCancel === true,
    passive: flags.tfPassive === true,
    sell: flags.tfSell === true,
  };
}

// ─── Factory ─────────────────────────────────────────────────────────

export function offerCreate(props: OfferCreateProps): OfferCreate {
  // ── Account ── required, must be a valid XRPL classic / X-address.
  require(props.Account, 'OfferCreate: Account is required', isAccount);

  // ── TakerGets / TakerPays ── required, must be a strictly positive Amount.
  isPositiveAmount(props.TakerGets, 'TakerGets');
  isPositiveAmount(props.TakerPays, 'TakerPays');

  // ── Cross-field: must not trade the same currency for itself.
  // (xrpl-dev-portal offercreate.md Error Cases: temBAD_OFFER
  // "The offer tries to trade XRP for XRP" + temREDUNDANT
  // "The transaction would trade a token for the same token".)
  if (isSameCurrency(props.TakerGets, props.TakerPays)) {
    throw new ValidationError(
      'OfferCreate: TakerGets and TakerPays must not be the same currency',
    );
  }

  // ── Expiration ── optional UInt32.
  if (props.Expiration !== undefined) {
    if (
      !isNumber(props.Expiration) ||
      !Number.isInteger(props.Expiration) ||
      props.Expiration < UINT32_MIN ||
      props.Expiration > UINT32_MAX
    ) {
      throw new ValidationError(
        `OfferCreate: Expiration must be a UInt32 in [${UINT32_MIN}, ${UINT32_MAX}] (seconds since the Ripple Epoch)`,
      );
    }
  }

  // ── OfferSequence ── optional UInt32, must be ≤ Sequence.
  if (props.OfferSequence !== undefined) {
    if (
      !isNumber(props.OfferSequence) ||
      !Number.isInteger(props.OfferSequence) ||
      props.OfferSequence < UINT32_MIN ||
      props.OfferSequence > UINT32_MAX
    ) {
      throw new ValidationError(
        `OfferCreate: OfferSequence must be a UInt32 in [${UINT32_MIN}, ${UINT32_MAX}]`,
      );
    }
    if (
      props.Sequence !== undefined &&
      isNumber(props.Sequence) &&
      props.OfferSequence > props.Sequence
    ) {
      throw new ValidationError(
        'OfferCreate: OfferSequence must not be greater than the transaction Sequence',
      );
    }
  }

  // ── DomainID ── optional 64-char hex.
  if (props.DomainID !== undefined) {
    if (
      !isString(props.DomainID) ||
      !isHex(props.DomainID) ||
      props.DomainID.length !== DOMAIN_ID_LENGTH
    ) {
      throw new ValidationError(
        `OfferCreate: DomainID must be a ${DOMAIN_ID_LENGTH}-character hex string`,
      );
    }
  }

  // ── Flags ── decode, then enforce spec invariants.
  let decoded: DecodedFlags | null = null;
  if (props.Flags !== undefined) {
    if (typeof props.Flags === 'number') {
      if (!Number.isInteger(props.Flags) || props.Flags < 0) {
        throw new ValidationError(
          'OfferCreate: Flags must be a non-negative integer',
        );
      }
      decoded = decodeOfferCreateFlags(props.Flags);
    } else if (isRecord(props.Flags)) {
      decoded = decodeOfferCreateFlagsInterface(
        props.Flags as OfferCreateFlagsInterface,
      );
    } else {
      throw new ValidationError(
        'OfferCreate: Flags must be a number or OfferCreateFlagsInterface object',
      );
    }
  }

  if (decoded !== null) {
    // tfImmediateOrCancel and tfFillOrKill are mutually exclusive.
    if (decoded.immediateOrCancel && decoded.fillOrKill) {
      throw new ValidationError(
        'OfferCreate: tfImmediateOrCancel and tfFillOrKill cannot both be set',
      );
    }

    // tfHybrid requires DomainID.
    if (decoded.hybrid && props.DomainID === undefined) {
      throw new ValidationError(
        'OfferCreate: tfHybrid requires DomainID',
      );
    }
  }

  return buildFrozenTx<OfferCreateProps, OfferCreate>(
    'OfferCreate',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: OfferCreate) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: OfferCreate, overrides: Partial<OfferCreateProps>) {
        return offerCreate(mergeForWith(this, overrides));
      },
    },
  );
}