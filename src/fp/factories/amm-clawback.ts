/**
 * Functional AMMClawback factory — frozen-object style.
 *
 * Claw back tokens from a holder that has deposited the issuer's issued
 * tokens into an AMM pool. The submitter (`Account`) must be the issuer
 * of `Asset`. If `Amount` is omitted, all of the holder's tokens in
 * the AMM pool are clawed back.
 *
 * Validation happens at construction; there is no way to construct an
 * invalid tx.
 *
 *   import { ammClawback } from 'xrplt/fp';
 *   const tx = ammClawback({
 *     Account,
 *     Holder,
 *     Asset:  { currency: 'USD', issuer: Account },
 *     Asset2: { currency: 'XRP' },
 *     Amount: { currency: 'USD', issuer: Account, value: '1000' },
 *     Flags:  AMMClawbackFlags.tfClawTwoAssets,
 *   });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Amount: { currency: 'USD', issuer: Account, value: '500' } });
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/ammclawback
 * @see https://github.com/XRPLF/xrpl.js/blob/main/packages/xrpl/src/models/transactions/AMMClawback.ts
 * @see XLS-0073 §2.3 (https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0073-amm-clawback)
 *
 * ## Divergences
 *
 * Compared with `src/transactions/amm-clawback.ts`, this factory adds
 * preclaim guards the class API skips. Each is cited to the canonical
 * source.
 *
 * - **`Account` must be a valid XRPL classic (or X-) address.**
 *   The class inherits only `validateBaseTransaction`'s `isString(Account)`
 *   check, which lets `"not-an-address"` through.
 *   - Source: xrpl-dev-portal ammclawback.md, `Holder` row, Internal
 *     Type = `AccountID` (same encoding as `Account`).
 *
 * - **`Holder` must be a valid XRPL account** (format check).
 *   The class delegates to `isAccount`, which is fine — kept identical.
 *
 * - **`Holder` and `Asset.issuer` must be distinct.**
 *   The class only checks `isAccount(this.Holder)` and never compares
 *   it against `Asset.issuer`. The ledger rejects this with `temMALFORMED`
 *   ("Account is the same as the Holder" — docs use the word Account but
 *     the canonical check is against the asset issuer / submitter).
 *   - Source: xrpl.js `validateAMMClawback` lines 86–92, message
 *     `'AMMClawback: Holder and Asset.issuer must be distinct'`.
 *   - Source: xrpl-dev-portal ammclawback.md "Error Cases" table —
 *     `temMALFORMED` row.
 *
 * - **`Account` must equal `Asset.issuer`.**
 *   The class never compares them. Per the docs, this mismatches with
 *   `temMALFORMED` / `tecNO_PERMISSION`.
 *   - Source: xrpl.js `validateAMMClawback` lines 94–98, message
 *     `'AMMClawback: Account must be the same as Asset.issuer'`.
 *   - Source: xrpl-dev-portal ammclawback.md `Asset` row, Description:
 *     "The issuer must be the sender of this transaction."
 *   - Source: XLS-0073 §2.3, `Asset` row: "Asset's issuer should match
 *     with `Account`. Otherwise, `temMALFORMED` will be returned."
 *
 * - **`Asset` must be an IOU (`{ currency, issuer }`), NOT XRP and NOT MPT.**
 *   The class types `Asset` as `{ currency: string; issuer?: string }`,
 *   so callers can pass `{ currency: 'XRP' }` and the class accepts it.
 *   The ledger rejects `Asset` as XRP with `temMALFORMED`.
 *   - Source: xrpl.js `validateAMMClawback` line 84,
 *     `validateRequiredField(tx, 'Asset', isIssuedCurrency)`.
 *   - Source: xrpl-dev-portal ammclawback.md "Error Cases" table —
 *     `temMALFORMED` row, third bullet: "or `Asset` is XRP."
 *   - Source: XLS-0073 §2.3, `Asset` row: `Asset` is the token the issuer
 *     wants to claw back — by construction an IOU (the issuer is named).
 *
 * - **`Asset2` must be a valid `Currency`** (XRP, trust line IOU, or MPT).
 *   The class types `Asset2` as `{ currency: string; issuer?: string }`
 *   and never validates the object shape; MPT form slips through.
 *   - Source: xrpl.js `validateAMMClawback` line 100,
 *     `validateRequiredField(tx, 'Asset2', isIssuedCurrency)`.
 *   - Source: xrpl-dev-portal ammclawback.md `Asset2` row, Description:
 *     "The asset can be XRP, a trust line token, or an MPT."
 *   - Source: XLS-0073 §2.3, `Asset2` row: paired token in the AMM pool.
 *
 * - **`Amount` must be an `IssuedCurrencyAmount` — NOT an XRP drops
 *   string, NOT an MPTAmount.** The class types `Amount?: Amount`
 *   which accepts all three forms. Per the docs / xrpl.js, `Amount` is
 *   strictly IOU.
 *   - Source: xrpl.js `validateAMMClawback` line 102,
 *     `validateOptionalField(tx, 'Amount', isIssuedCurrencyAmount)`.
 *   - Source: xrpl-dev-portal ammclawback.md `Amount` row, JSON Type
 *     `Currency Amount`, Internal Type `Amount` (IOU-only for clawback).
 *
 * - **`Amount.currency` must equal `Asset.currency`.**
 *   The class never compares them.
 *   - Source: xrpl.js `validateAMMClawback` lines 104–108.
 *   - Source: xrpl-dev-portal ammclawback.md "Error Cases" table —
 *     `temBAD_AMOUNT` row: "the `currency` and `issuer` subfields don't
 *     match between `Amount` and `Asset`."
 *
 * - **`Amount.issuer` must equal `Asset.issuer`.**
 *   The class never compares them.
 *   - Source: xrpl.js `validateAMMClawback` lines 110–114 (note: xrpl.js
 *     source has a typo in the error message, "Amount.issuer must match
 *     Amount.issuer" — we keep the obvious correct intent: must match
 *     `Asset.issuer`).
 *   - Source: xrpl-dev-portal ammclawback.md `Amount` row, Description:
 *     "The `currency` and `issuer` subfields should match the `Asset`
 *     subfields."
 *
 * - **`Amount.value` must be a positive base-10 integer string.**
 *   The class delegates to `isAmount` which only checks shape; the docs
 *   say `Amount.value <= 0 → temBAD_AMOUNT`.
 *   - Source: xrpl-dev-portal ammclawback.md "Error Cases" table —
 *     `temBAD_AMOUNT` row: "the `Amount` field ... is less than or equal
 *     to 0".
 *   - Source: xrpl.org generic Amount spec
 *     (basic-data-types#specifying-currency-amounts).
 *
 * - **IssuedCurrencyAmount `currency` and `issuer` shape are validated**
 *   (3-char ASCII or 40-char hex `currency`; `issuer` must be a valid
 *   XRPL account). The class only checks `isAmount`, which does not
 *   enforce those sub-fields.
 *   - Source: xrpl-dev-portal basic-data-types#specifying-currency-amounts.
 *
 * - **`Flags` is restricted to 0 or `tfClawTwoAssets` (0x00000001).**
 *   The class inherits `Flags` from the parent and never inspects it.
 *   The ledger rejects other bit values with `temINVALID_FLAG`.
 *   - Source: xrpl-dev-portal ammclawback.md "AMMClawback Flags" section
 *     (only `tfClawTwoAssets` defined) + "Error Cases" table —
 *     `temINVALID_FLAG` row: "if you try enabling flags besides
 *     `tfClawTwoAssets`."
 */
import type { IssuedCurrency, IssuedCurrencyAmount, Currency } from '../../types/amounts.js';
import type { ClawbackFlagsInterface } from '../../types/flags.js';
import {
  isAccount,
  isCurrency,
  isHex,
  isIssuedCurrencyAmount,
  isString,
} from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// Only AMMClawback-specific bit flag defined by the protocol.
// xrpl-dev-portal ammclawback.md "AMMClawback Flags" section.
// tfClawTwoAssets is 0x00000001 (matches xrpl.js AMMClawbackFlags enum
// and the project's src/types/flags.ts ClawbackFlags enum).
const TF_CLAW_TWO_ASSETS = 0x00000001;

// Global transaction flags (NonFungibleTokensV1_1 etc.) — also legal,
// per xrpl.js `GlobalFlagsInterface` / base transaction semantics.
const TF_INNER_BATCH = 0x40000000;
const TF_BATCH = 0x80000000;

// Combined mask: only tfClawTwoAssets + the two global batch flags are
// legal. Anything else triggers `temINVALID_FLAG`.
const LEGAL_AMM_CLAWBACK_FLAGS_MASK = TF_CLAW_TWO_ASSETS | TF_BATCH | TF_INNER_BATCH;

// Currency codes are either 3 ASCII characters or 40 hex characters.
const CURRENCY_ASCII_LENGTH = 3;
const CURRENCY_HEX_LENGTH = 40;

// ─── Public types ────────────────────────────────────────────────────

export interface AmmClawbackProps {
  /** The issuer submitting the clawback (must equal `Asset.issuer`). */
  Account: string;
  /** The holder whose tokens will be clawed back from the AMM pool. */
  Holder: string;
  /**
   * The asset being clawed back — must be an IOU the submitter issued.
   * NOT the XRP form, NOT an MPT.
   */
  Asset: IssuedCurrency;
  /**
   * The other asset in the AMM pool. Can be XRP, an IOU, or an MPT.
   */
  Asset2: Currency;
  /**
   * Optional maximum amount to claw back (IssuedCurrencyAmount; NOT
   * XRP drops, NOT MPT). If omitted, all the holder's tokens are
   * clawed back. When present, `currency`/`issuer` must match `Asset`.
   */
  Amount?: IssuedCurrencyAmount | undefined;
  /** Bit-flags: only `tfClawTwoAssets` (0x00000001) is defined. */
  Flags?: number | ClawbackFlagsInterface | undefined;
  Fee?: string | undefined;
  Sequence?: number | undefined;
}

export interface AmmClawback extends Readonly<AmmClawbackProps> {
  readonly TransactionType: 'AMMClawback';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<AmmClawbackProps>): AmmClawback;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * XRPLNumber: a non-negative base-10 integer string. Matches the policy
 * used across other factories (ammCreate, vaultClawback, loanSet).
 */
function isXrplNumber(value: unknown): value is string {
  return isString(value) && /^[0-9]+$/u.test(value);
}

/**
 * Extract the numeric bitmask from `Flags` regardless of whether the
 * caller passed a numeric value or a boolean `ClawbackFlagsInterface`.
 */
function flagsToNumber(
  flags: number | ClawbackFlagsInterface | undefined,
): number {
  if (flags === undefined) return 0;
  if (typeof flags === 'number') return flags;
  let n = 0;
  if (flags.tfClawTwoAssets) n |= TF_CLAW_TWO_ASSETS;
  return n;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function ammClawback(props: AmmClawbackProps): AmmClawback {
  // ── Account ── required, valid XRPL classic / X-address.
  require(props.Account, 'AMMClawback: Account is required', isAccount);

  // ── Holder ── required, valid XRPL classic / X-address.
  require(props.Holder, 'AMMClawback: Holder is required', isAccount);

  // ── Asset ── required, IOU form (`{ currency, issuer }`).
  // xrpl.js uses `isIssuedCurrency` which would also accept XRP form,
  // but per docs (temMALFORMED if Asset is XRP) we explicitly reject it.
  if (props.Asset === undefined) {
    throw new ValidationError('AMMClawback: missing field Asset');
  }
  if (
    !isString(props.Asset.currency) ||
    isString((props.Asset as unknown as Record<string, unknown>).mpt_issuance_id) ||
    props.Asset.currency === 'XRP'
  ) {
    throw new ValidationError(
      'AMMClawback: Asset must be an IOU (currency + issuer; NOT XRP, NOT MPT)',
    );
  }
  if (!isString(props.Asset.issuer)) {
    throw new ValidationError(
      'AMMClawback: Asset.issuer is required (Asset must be an IOU)',
    );
  }
  // Asset currency shape: 3 ASCII or 40 hex characters.
  const assetCcy = props.Asset.currency;
  if (
    assetCcy.length !== CURRENCY_ASCII_LENGTH &&
    assetCcy.length !== CURRENCY_HEX_LENGTH
  ) {
    throw new ValidationError(
      `AMMClawback: Asset.currency must be ${CURRENCY_ASCII_LENGTH} ASCII characters or ${CURRENCY_HEX_LENGTH} hex characters (actual: ${assetCcy.length})`,
    );
  }
  if (assetCcy.length === CURRENCY_HEX_LENGTH && !isHex(assetCcy)) {
    throw new ValidationError(
      'AMMClawback: Asset.currency (40-char form) must be hex',
    );
  }
  // Asset.issuer must be a valid XRPL account.
  if (!isAccount(props.Asset.issuer)) {
    throw new ValidationError(
      'AMMClawback: Asset.issuer must be a valid XRPL account address',
    );
  }

  // ── Holder ≠ Asset.issuer ── (xrpl.js `validateAMMClawback` lines 86–92).
  if (props.Holder === props.Asset.issuer) {
    throw new ValidationError(
      'AMMClawback: Holder and Asset.issuer must be distinct',
    );
  }

  // ── Account === Asset.issuer ── (xrpl.js lines 94–98).
  if (props.Account !== props.Asset.issuer) {
    throw new ValidationError(
      'AMMClawback: Account must be the same as Asset.issuer',
    );
  }

  // ── Asset2 ── required, valid Currency (XRP, IOU, or MPT).
  if (props.Asset2 === undefined) {
    throw new ValidationError('AMMClawback: missing field Asset2');
  }
  if (!isCurrency(props.Asset2)) {
    throw new ValidationError(
      'AMMClawback: Asset2 must be a valid Currency (XRP, trust line, or MPT form)',
    );
  }

  // ── Amount ── optional; when present, must be an IssuedCurrencyAmount
  //    (NOT XRP drops string, NOT MPT).
  if (props.Amount !== undefined) {
    if (!isIssuedCurrencyAmount(props.Amount)) {
      throw new ValidationError(
        'AMMClawback: Amount must be an IssuedCurrencyAmount (NOT XRP drops, NOT MPT)',
      );
    }
    // Amount.currency === Asset.currency.
    if (props.Amount.currency !== props.Asset.currency) {
      throw new ValidationError(
        'AMMClawback: Amount.currency must match Asset.currency',
      );
    }
    // Amount.issuer === Asset.issuer.
    if (props.Amount.issuer !== props.Asset.issuer) {
      throw new ValidationError(
        'AMMClawback: Amount.issuer must match Asset.issuer',
      );
    }
    // Amount sub-field validation (issuer is a valid account).
    if (!isAccount(props.Amount.issuer)) {
      throw new ValidationError(
        'AMMClawback: Amount.issuer must be a valid XRPL account address',
      );
    }
    // Amount.value must be a positive base-10 integer string.
    if (!isXrplNumber(props.Amount.value)) {
      throw new ValidationError(
        'AMMClawback: Amount.value must be a non-negative base-10 integer string',
      );
    }
    if (props.Amount.value === '0') {
      throw new ValidationError(
        'AMMClawback: Amount must be a positive amount (got "0")',
      );
    }
  }

  // ── Flags ── only tfClawTwoAssets (+ global batch flags) are legal.
  //    (xrpl-dev-portal ammclawback.md "AMMClawback Flags" + temINVALID_FLAG row.)
  const numericFlags = flagsToNumber(props.Flags);
  const unknownBits = numericFlags & ~LEGAL_AMM_CLAWBACK_FLAGS_MASK;
  if (unknownBits !== 0) {
    throw new ValidationError(
      `AMMClawback: Flags may only set tfClawTwoAssets (0x${TF_CLAW_TWO_ASSETS.toString(16)}); unknown bit(s): 0x${unknownBits.toString(16)}`,
    );
  }

  return buildFrozenTx<AmmClawbackProps, AmmClawback>(
    'AMMClawback',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: AmmClawback) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: AmmClawback, overrides: Partial<AmmClawbackProps>) {
        return ammClawback(mergeForWith(this, overrides));
      },
    },
  );
}