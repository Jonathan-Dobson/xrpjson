/**
 * Functional TrustSet factory — frozen-object style.
 *
 * Creates, modifies, or deletes a trust line linking `Account` to a peer
 * for an issued (IOU) currency. Validation happens at construction;
 * there is no way to construct an invalid tx.
 *
 *   import { trustSet } from 'xrpjson';
 *   const tx = trustSet({
 *     Account,
 *     LimitAmount: { currency: 'USD', issuer: GATEWAY, value: '100' },
 *   });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Flags: 0x00020000 }); // tfSetNoRipple
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/trustset
 *
 * ## Divergences
 * The factory enforces six preclaim guards the class API
 * (the Class API's `TrustSet`) skips. The class only checks that
 * `LimitAmount` passes `isAmount`, which accepts all three Amount forms
 * (XRP drops, IssuedCurrency, MPT) — none of which is the shape the spec
 * actually mandates for a trustline.
 *
 *   1. `LimitAmount` must be an `IssuedCurrencyAmount` (currency +
 *      issuer + value), not a generic `Amount`.
 *      Source: xrpl-dev-portal
 *      `docs/references/protocol/transactions/types/trustset.md` line 38:
 *      "`LimitAmount`.`currency` ... 'XRP' is invalid". XRP amounts are
 *      rejected as well as MPT amounts (`docs/concepts/tokens/fungible-tokens/trust-line-tokens.md`:
 *      "Trust lines tokens ... are tracked in trust lines ... in contrast
 *      to [Multi-Purpose Tokens]"). xrpl.js `validateTrustSet` calls
 *      `isAmount(LimitAmount)` which accepts XRP drops strings and
 *      `MPTAmount` objects; the class inherits that gap.
 *
 *   2. `LimitAmount.currency` must not be the literal `"XRP"`.
 *      Source: xrpl-dev-portal
 *      `docs/references/protocol/transactions/types/trustset.md` line 38:
 *      "`LimitAmount`.`currency` ... 'XRP' is invalid". The class does
 *      not distinguish the rejected `"XRP"` case from any other valid
 *      currency code.
 *
 *   3. `LimitAmount.issuer` must be a valid XRPL classic or X-address.
 *      Source: xrpl-dev-portal
 *      `docs/references/protocol/transactions/types/trustset.md` line 40:
 *      "`LimitAmount`.`issuer` | String | (Amount.issuer) | The address
 *      of the account to extend trust to". The class validates the
 *      issuer as a free-form string; xrpl.js's `isIssuedCurrencyAmount`
 *      checks only that the field is a string.
 *
 *   4. `LimitAmount.value` must be a non-negative XRPL string-number
 *      (decimal or scientific).
 *      Source: xrpl-dev-portal
 *      `docs/references/protocol/data-types/currency-formats.md` line 63
 *      (`value` column of the issued-currency amount table) — "Quoted
 *      decimal representation of the amount of the token. This can
 *      include scientific notation". Line 27 — "Minimum value: `0`.
 *      (Cannot be negative.)" The class accepts any string and does
 *      not parse or sign-check the value.
 *
 *   5. `Account` must be a valid XRPL classic or X-address.
 *      Source: xrpl-dev-portal
 *      `docs/references/protocol/transactions/types/trustset.md` line 18
 *      — example `"Account": "ra5nK24KXen9AHvsdFTKHSANinZseWnPcX"`.
 *      The class only checks `typeof === 'string'` via the base
 *      validator; the factory uses `isAccount`.
 *
 *   6. `QualityIn` and `QualityOut` must be non-negative integers in the
 *      UInt32 range [0, 0xFFFFFFFF].
 *      Source: xrpl-dev-portal
 *      `docs/references/protocol/transactions/types/trustset.md`
 *      lines 41–42 — `QualityIn | Number | UInt32` and `QualityOut |
 *      Number | UInt32`. xrpl.js `validateTrustSet` checks only
 *      `typeof === 'number'`; the class inherits that gap and accepts
 *      negatives, non-integers, and out-of-range values.
 */
import type { IssuedCurrencyAmount } from '../../types/amounts.js';
import type { TrustSetFlagsInterface } from '../../types/flags.js';
import { isAccount, isNumber } from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// UInt32 bounds — per xrpl-dev-portal `trustset.md` field table.
const UINT32_MIN = 0;
const UINT32_MAX = 0xffffffff;
// ISO 4217 standard currency codes are 3 ASCII chars; non-standard codes
// are 160-bit hex = 40 chars (per xrpl-dev-portal `currency-formats.md`).
const CURRENCY_CODE_STD_LENGTH = 3;
const CURRENCY_CODE_NONSTD_LENGTH = 40;

// ─── Public types ────────────────────────────────────────────────────

export interface TrustSetProps {
  /** The unique address of the transaction sender (the trustor). */
  Account: string;
  /** The limit and currency for the trust line. */
  LimitAmount: IssuedCurrencyAmount;
  /** Quality of incoming liquidity (UInt32; 0 = 100%). */
  QualityIn?: number | undefined;
  /** Quality of outgoing liquidity (UInt32; 0 = 100%). */
  QualityOut?: number | undefined;
  /** Bit-flags for this transaction. */
  Flags?: number | TrustSetFlagsInterface | undefined;
  Fee?: string | undefined;
  Sequence?: number | undefined;
}

export interface TrustSet extends Readonly<TrustSetProps> {
  readonly TransactionType: 'TrustSet';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<TrustSetProps>): TrustSet;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Per xrpl-dev-portal `currency-formats.md` "String Numbers" section,
 * a valid XRPL string-number is decimal (`123`, `1.5`, `0.5`) or
 * scientific (`1.23e11`, `1.5E-3`), and may not contain leading `+` or
 * whitespace. Negative values are disallowed in TrustSet contexts.
 */
const STRING_NUMBER_REGEX =
  /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u;

interface RawLimit {
  currency?: unknown;
  issuer?: unknown;
  value?: unknown;
  mpt_issuance_id?: unknown;
  [key: string]: unknown;
}

/**
 * Validate the structural shape of an `IssuedCurrencyAmount` and the
 * contents of each field against the TrustSet spec:
 *   - `currency` is either a 3-char ISO 4217 code or a 40-char hex code.
 *     The literal `"XRP"` is explicitly forbidden.
 *   - `issuer` is a valid XRPL account address.
 *   - `value` is a non-negative XRPL string-number.
 *
 * Returns null on success, or a human-readable error message describing
 * the first failure encountered.
 */
function checkTrustLimit(amount: unknown): string | null {
  if (amount === undefined || amount === null) {
    return 'missing field LimitAmount';
  }
  if (typeof amount !== 'object' || Array.isArray(amount)) {
    return 'LimitAmount must be an IssuedCurrencyAmount object';
  }
  const a = amount as RawLimit;
  if (a.mpt_issuance_id !== undefined) {
    return 'LimitAmount must be an IssuedCurrencyAmount, not an MPTAmount';
  }
  if (typeof a.currency !== 'string') {
    return 'LimitAmount.currency must be a string';
  }
  if (a.currency === 'XRP') {
    return 'LimitAmount.currency must not be "XRP"';
  }
  if (
    a.currency.length !== CURRENCY_CODE_STD_LENGTH &&
    a.currency.length !== CURRENCY_CODE_NONSTD_LENGTH
  ) {
    return `LimitAmount.currency must be a ${CURRENCY_CODE_STD_LENGTH}-character ISO 4217 code or ${CURRENCY_CODE_NONSTD_LENGTH}-character hex string`;
  }
  if (typeof a.issuer !== 'string' || !isAccount(a.issuer)) {
    return 'LimitAmount.issuer must be a valid XRPL account address';
  }
  if (typeof a.value !== 'string') {
    return 'LimitAmount.value must be a string';
  }
  if (!STRING_NUMBER_REGEX.test(a.value)) {
    return 'LimitAmount.value must be a non-negative XRPL string-number (decimal or scientific)';
  }
  return null;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function trustSet(props: TrustSetProps): TrustSet {
  // ── Account ── required, must be a valid XRPL classic/X-address.
  require(props.Account, 'TrustSet: missing or invalid Account', isAccount);

  // ── LimitAmount ── required, must be a spec-conformant
  //    IssuedCurrencyAmount (no XRP, no MPT, non-negative value).
  const limitError = checkTrustLimit(props.LimitAmount);
  if (limitError !== null) {
    throw new ValidationError(`TrustSet: ${limitError}`);
  }

  // ── QualityIn ── optional UInt32.
  if (props.QualityIn !== undefined) {
    if (
      !isNumber(props.QualityIn) ||
      !Number.isInteger(props.QualityIn) ||
      props.QualityIn < UINT32_MIN ||
      props.QualityIn > UINT32_MAX
    ) {
      throw new ValidationError(
        `TrustSet: QualityIn must be a UInt32 in [${UINT32_MIN}, ${UINT32_MAX}]`,
      );
    }
  }

  // ── QualityOut ── optional UInt32.
  if (props.QualityOut !== undefined) {
    if (
      !isNumber(props.QualityOut) ||
      !Number.isInteger(props.QualityOut) ||
      props.QualityOut < UINT32_MIN ||
      props.QualityOut > UINT32_MAX
    ) {
      throw new ValidationError(
        `TrustSet: QualityOut must be a UInt32 in [${UINT32_MIN}, ${UINT32_MAX}]`,
      );
    }
  }

  return buildFrozenTx<TrustSetProps, TrustSet>(
    'TrustSet',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: TrustSet) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: TrustSet, overrides: Partial<TrustSetProps>) {
        return trustSet(mergeForWith(this, overrides));
      },
    },
  );
}