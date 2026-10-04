/**
 * Functional Clawback factory — frozen-object style.
 *
 * Reclaim issued tokens or MPTs from a holder's account. The submitter
 * (`Account`) must be the issuer of the asset being clawed back. The
 * `Amount` shape determines which ledger code path executes:
 *
 * - `IssuedCurrencyAmount` (`{ currency, issuer, value }`) — claws back
 *   trust-line tokens. The `issuer` sub-field here names the **holder**
 *   (XLS-39 §3.3.1, "the sub-field `issuer` within `Amount` represents
 *   the token holder's address instead of the issuer's"). `Holder` MUST
 *   be omitted.
 * - `MPTAmount` (`{ mpt_issuance_id, value }`) — claws back MPTs.
 *   `Holder` MUST be present and must be a valid XRPL account distinct
 *   from `Account`.
 *
 * XRP can never be clawed back — XLS-39 explicitly forbids it ("This
 * proposal deals only with issued assets. The proposed clawback support
 * cannot be used to claw back XRP.").
 *
 * Validation happens at construction; there is no way to construct an
 * invalid tx.
 *
 *   import { clawback } from 'xrpjson';
 *   // IOU clawback — the holder is encoded inside Amount.issuer:
 *   const iouTx = clawback({
 *     Account:        'rIssuer…',
 *     Amount: { currency: 'USD', issuer: 'rHolder…', value: '100' },
 *   });
 *   // MPT clawback — the holder is encoded in Holder:
 *   const mptTx = clawback({
 *     Account: 'rIssuer…',
 *     Amount:  { mpt_issuance_id: '00000001', value: '100' },
 *     Holder:  'rHolder…',
 *   });
 *   const j   = iouTx.toJSON();
 *   const tx2 = iouTx.with({ 'Amount.value': '50' });   // type-safe via with()
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/clawback
 * @see https://github.com/XRPLF/xrpl.js/blob/main/packages/xrpl/src/models/transactions/clawback.ts
 * @see XLS-39 §3.3.1 (https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0039-clawback)
 *
 * ## Divergences
 *
 * Compared with the Class API's `Clawback`, this factory adds
 * preclaim guards the class API skips. Each is cited to the canonical
 * source.
 *
 * - **`Amount` is typed as `ClawbackAmount` (IOU or MPT only), not the
 *   wider `Amount`.** The class declares `Amount: Amount` (which
 *   includes the XRP drops `string` variant) and only filters strings
 *   out via `typeof this.Amount === 'string'`. Typing the parameter
 *   as `ClawbackAmount` makes the no-XRP rule a compile-time guarantee;
 *   the runtime guard below also rejects malformed amounts.
 *   - Source: xrpl-dev-portal clawback.md, `Amount` row, JSON Type
 *     "Currency Amount" with `issuer` sub-field semantics, and the
 *     document body: "When clawing back trust line tokens, you must
 *     omit the `Holder` field. When clawing back MPTs, you must provide
 *     the `Holder` field."
 *   - Source: XLS-39 §1: "This proposal deals only with issued assets.
 *     The proposed clawback support cannot be used to claw back XRP."
 *
 * - **`Account` must be a valid XRPL classic or X-address.** The class
 *   inherits only `validateBaseTransaction`'s `isString(Account)` check
 *   and never enforces address format.
 *   - Source: xrpl-dev-portal clawback.md, `Account` row, Internal
 *     Type = `AccountID`.
 *
 * - **`Account` and `Amount.issuer` must be distinct (IOU form).**
 *   The class delegates to `isAmount` only; it never compares Account
 *   to Amount.issuer. The ledger rejects this with `temBAD_AMOUNT`
 *   ("the specified holder is the issuer" — docs use "holder" to mean
 *   the counterparty, here `Amount.issuer`).
 *   - Source: xrpl-dev-portal clawback.md "Error Cases" table,
 *     `temBAD_AMOUNT` row.
 *   - Source: xrpl.js `validateClawback` lines 54–56, message
 *     `'Clawback: invalid holder Account'`.
 *   - Source: XLS-39 §3.3.1 "Amount": "It is an error if the
 *     counterparty listed in `Amount` is the same as the `Account`
 *     issuing this transaction; the transaction should fail execution
 *     with `temBAD_AMOUNT`."
 *
 * - **`Account` and `Holder` must be distinct (MPT form).** Same
 *   rationale as above.
 *   - Source: xrpl.js `validateClawback` lines 58–60, message
 *     `'Clawback: invalid holder Account'`.
 *   - Source: xrpl-dev-portal clawback.md, `Holder` row: "The holder
 *     must have a non-zero balance of the MPT issuance indicated in
 *     the `Amount` field" (you cannot claw back from yourself).
 *
 * - **Holder must be omitted for IOU clawback and required for MPT
 *   clawback.** The class never enforces this asymmetry.
 *   - Source: xrpl.js `validateClawback` lines 62–68, messages
 *     `'Clawback: cannot have Holder for currency'` and
 *     `'Clawback: missing Holder'`.
 *   - Source: xrpl-dev-portal clawback.md body: "When clawing back
 *     trust line tokens, you must omit the `Holder` field. When
 *     clawing back MPTs, you must provide the `Holder` field."
 *
 * - **`Holder` must be a valid XRPL address** (MPT form). The class
 *   delegates to `isAccount` which is fine — kept identical.
 *   - Source: xrpl.js `validateClawback` line 48
 *     (`validateOptionalField(tx, 'Holder', isAccount)`).
 *
 * - **IssuedCurrencyAmount sub-fields are validated** (3-char ASCII or
 *   40-char hex `currency`; `issuer` must be a valid XRPL account;
 *   `value` must be a positive non-zero base-10 integer string).
 *   The class only checks shape via `isAmount`, which does not enforce
 *   those sub-fields.
 *   - Source: xrpl-dev-portal basic-data-types#specifying-currency-amounts.
 *   - Source: xrpl-dev-portal clawback.md, `Amount` row, Description:
 *     "The quantity in the `value` sub-field must not be zero."
 *   - Source: XLS-39 §3.3.1 "Amount": "It returns `temBAD_AMOUNT` is
 *     the amount is zero."
 *
 * - **MPTAmount sub-fields are validated** (`mpt_issuance_id` is a
 *   24–48 char hex string; `value` is a positive non-zero base-10
 *   integer string). The class only checks shape via `isAmount`.
 *   - Source: xrpl-dev-portal clawback.md "Error Cases" table,
 *     `temBAD_AMOUNT` row.
 *   - Source: XLS-0033 Multi-Purpose Tokens
 *     (`mpt_issuance_id` is a 192-bit uint hex-encoded).
 *
 * - **`Flags` is pass-through** (no per-tx flag defined by XLS-39).
 *   The class never inspects Flags either. Per XLS-39 §3.3.1, "The
 *   universal transaction flags that are applicable to all
 *   transactions (e.g., `tfFullyCanonicalSig`) are valid. This
 *   proposal introduces no new transaction-specific flags." We
 *   therefore do not validate Flags beyond type acceptance.
 *   - Source: XLS-39 §3.3.1 "Flags" row.
 */
import type { ClawbackAmount } from '../../types/amounts.js';
import type { BasePropsFields } from '../../types/base.js';
import type { GlobalFlagsInterface } from '../../types/flags.js';
import {
  isAccount,
  isHex,
  isIssuedCurrencyAmount,
  isMPTAmount,
  isString,
} from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// Currency codes are either 3 ASCII characters or 40 hex characters.
const CURRENCY_ASCII_LENGTH = 3;
const CURRENCY_HEX_LENGTH = 40;

// MPT issuance IDs are 192-bit, hex-encoded (≤ 48 chars).
// We accept 24..48 to leave slack for future widenings / leading-zero
// encoders. Empty strings are rejected.
const MPT_ISSUANCE_ID_MIN = 24;
const MPT_ISSUANCE_ID_MAX = 48;

// ─── Public types ────────────────────────────────────────────────────

// Why the two keys are omitted — do not "simplify" this away:
//  TransactionType: buildFrozenTx spreads props AFTER setting it, so a
//    caller-supplied value would win. See payment.ts:36-40.
//  Flags: re-declared per transaction with that type's narrower flag
//    interface, which is assignable to the base's.
//
// The base is `BasePropsFields`, not `BaseTransactionFields`: the latter
// carries a trailing `[key: string]: unknown` that widens `keyof` to
// `string | number`, so `Omit<BaseTransactionFields, ...>` would collapse to
// a bare index signature and silently drop all fourteen named members.
// See the doc comment on BasePropsFields in src/types/base.ts.
export interface ClawbackProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  /** The issuer submitting the clawback. Must equal the asset's issuer. */
  Account: string;
  /**
   * The amount to claw back. For IOU clawbacks, the `issuer` sub-field
   * names the **holder**. For MPT clawbacks, the holder is named in
   * the separate `Holder` field.
   */
  Amount: ClawbackAmount;
  /**
   * Required for MPT clawbacks; MUST be omitted for IOU clawbacks.
   * Must be distinct from `Account`.
   */
  Holder?: string | undefined;
  /** No per-tx flags defined; pass-through (universal flags only). */
  Flags?: number | GlobalFlagsInterface | undefined;
}

export interface Clawback extends Readonly<ClawbackProps> {
  readonly TransactionType: 'Clawback';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<ClawbackProps>): Clawback;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * XRPLNumber: a non-negative base-10 integer string. Matches the policy
 * used across other factories (vaultClawback, ammClawback, vaultCreate).
 */
function isXrplNumber(value: unknown): value is string {
  return isString(value) && /^[0-9]+$/u.test(value);
}

// ─── Factory ─────────────────────────────────────────────────────────

export function clawback(props: ClawbackProps): Clawback {
  // ── Account ── required, valid XRPL classic / X-address.
  require(props.Account, 'Clawback: Account is required', isAccount);

  // ── Amount ── required, must be a ClawbackAmount (NOT XRP drops).
  if (props.Amount === undefined) {
    throw new ValidationError('Clawback: Amount is required');
  }
  if (!isIssuedCurrencyAmount(props.Amount) && !isMPTAmount(props.Amount)) {
    throw new ValidationError(
      'Clawback: Amount must be an IssuedCurrency or MPT, not XRP drops',
    );
  }

  // ── IOU clawback path ───────────────────────────────────────────────
  // xrpl-dev-portal clawback.md body: "When clawing back trust line
  // tokens, you must omit the `Holder` field."
  if (isIssuedCurrencyAmount(props.Amount)) {
    if (props.Holder !== undefined) {
      throw new ValidationError(
        'Clawback: Holder must not be provided when clawing back a currency (IOU); the holder is named in Amount.issuer',
      );
    }

    // currency: 3 ASCII or 40 hex characters.
    const ccy = props.Amount.currency;
    if (
      ccy.length !== CURRENCY_ASCII_LENGTH &&
      ccy.length !== CURRENCY_HEX_LENGTH
    ) {
      throw new ValidationError(
        `Clawback: Amount.currency must be ${CURRENCY_ASCII_LENGTH} ASCII characters or ${CURRENCY_HEX_LENGTH} hex characters (actual: ${ccy.length})`,
      );
    }
    if (ccy.length === CURRENCY_HEX_LENGTH && !isHex(ccy)) {
      throw new ValidationError(
        'Clawback: Amount.currency (40-char form) must be hex',
      );
    }

    // issuer: must be a valid XRPL classic / X-address.
    // XLS-39 §3.3.1: "the sub-field `issuer` within `Amount` represents
    // the token holder's address instead of the issuer's."
    if (!isAccount(props.Amount.issuer)) {
      throw new ValidationError(
        'Clawback: Amount.issuer must be a valid XRPL account address',
      );
    }

    // Account != Amount.issuer (you cannot claw back from yourself).
    if (props.Account === props.Amount.issuer) {
      throw new ValidationError(
        'Clawback: Account and Amount.issuer must be distinct (cannot claw back from yourself)',
      );
    }

    // value: positive non-zero base-10 integer string.
    if (!isXrplNumber(props.Amount.value)) {
      throw new ValidationError(
        'Clawback: Amount.value must be a non-negative base-10 integer string',
      );
    }
    if (props.Amount.value === '0') {
      throw new ValidationError(
        'Clawback: Amount.value must not be zero (temBAD_AMOUNT)',
      );
    }

    // ── MPT clawback path ─────────────────────────────────────────────
    // xrpl-dev-portal clawback.md body: "When clawing back MPTs, you
    // must provide the `Holder` field."
  } else {
    // Holder is required for MPT clawback.
    require(
      props.Holder,
      'Clawback: Holder is required when clawing back an MPT',
      isAccount,
    );

    // mpt_issuance_id: 24..48 char hex string.
    const mptid = props.Amount.mpt_issuance_id;
    if (
      mptid.length < MPT_ISSUANCE_ID_MIN ||
      mptid.length > MPT_ISSUANCE_ID_MAX ||
      !isHex(mptid)
    ) {
      throw new ValidationError(
        `Clawback: Amount.mpt_issuance_id must be a ${MPT_ISSUANCE_ID_MIN}-${MPT_ISSUANCE_ID_MAX} character hex string`,
      );
    }

    // value: positive non-zero base-10 integer string.
    if (!isXrplNumber(props.Amount.value)) {
      throw new ValidationError(
        'Clawback: Amount.value must be a non-negative base-10 integer string',
      );
    }
    if (props.Amount.value === '0') {
      throw new ValidationError(
        'Clawback: Amount.value must not be zero (temBAD_AMOUNT)',
      );
    }

    // Account != Holder (you cannot claw back from yourself).
    if (props.Account === props.Holder) {
      throw new ValidationError(
        'Clawback: Account and Holder must be distinct (cannot claw back from yourself)',
      );
    }
  }

  // ─── Base transaction fields ───
  // Catches the seven shared base fields this factory does not otherwise
  // check: Memos, SourceTag, LastLedgerSequence, AccountTxnID, NetworkID,
  // Delegate, TicketSequence.
  //
  // Placed AFTER the Clawback-specific checks so a more specific message
  // wins for a more specific mistake, and this acts as the backstop for
  // everything shared across transaction types.
  //
  // `TransactionType` is supplied because the validator checks a transaction,
  // not a props bag — the factory injects it in `buildFrozenTx` below.
  validateBaseTransaction({ TransactionType: 'Clawback', ...props });

  return buildFrozenTx<ClawbackProps, Clawback>(
    'Clawback',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: Clawback) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: Clawback, overrides: Partial<ClawbackProps>) {
        return clawback(mergeForWith(this, overrides));
      },
    },
  );
}
