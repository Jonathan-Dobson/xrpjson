/**
 * Functional CheckCash factory — frozen-object style.
 *
 * Cashes an existing Check that was created by `checkCreate`. Validation
 * happens at construction; there is no way to construct an invalid tx from the
 * fields it models.
 *
 *   import { checkCash } from 'xrpjson';
 *   const tx = checkCash({ Account, CheckID, Amount: '100000000' });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Amount: '200000000' });
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/checkcash
 *
 * ## Divergences
 *
 * Compared with the Class API's `CheckCash`, this factory enforces
 * five preclaim guards that the class API omits. The class only checks
 * that `CheckID` is a string, that `Amount`/`DeliverMin` are not both
 * present, and that at least one is present — it does no shape, range,
 * semantic-equivalence, or zero-check on those fields.
 *
 *   1. **`CheckID` must be a 64-character hex string (UInt256).**
 *      Source: xrpl.org `checkcash.md` field table — `CheckID | String |
 *      UInt256`. xrpl.js `validateCheckCash` accepts any string for
 *      `CheckID` (`packages/xrpl/src/models/transactions/checkCash.ts:69`
 *      `typeof tx.CheckID !== 'string'`). The class only calls
 *      `isString(this.CheckID)`.
 *
 *   2. **`CheckID` must not be the all-zeros HASH256.**
 *      Source: xrpl.org `checkcash.md` Error Cases — "If the `CheckID`
 *      is an all-zero value, the transaction fails with the result
 *      `temMALFORMED`. Previously, the transaction would fail with the
 *      result `tecNO_ENTRY`." (Amended by `fixCleanup3_3_0`.) The class
 *      does not reject the zero CheckID; xrpl.js only checks it is a
 *      string. The runtime check has moved from `tecNO_ENTRY` to
 *      `temMALFORMED` (preclaim) — a guard the factory must enforce.
 *
 *   3. **`Amount` must be a valid `Amount` shape (XRP drops string,
 *      `IssuedCurrencyAmount`, or `MPTAmount`).**
 *      Source: xrpl.js `validateCheckCash` (lines 56–58) calls
 *      `isAmount(tx.Amount)`; xrpl.org `checkcash.md` field table —
 *      `Amount | Currency Amount | Amount`. The class only enforces
 *      presence ("must have either Amount or DeliverMin") and never
 *      checks the shape of `Amount` when present — a malformed `Amount`
 *      would slip through the Class API's `CheckCash` (lines 42–48).
 *
 *   4. **`Amount` must be strictly positive (non-zero, non-negative).**
 *      Source: xrpl.org `tem-codes.md` — `temBAD_AMOUNT` — "An amount
 *      specified by the transaction … was invalid, possibly because it
 *      was a negative number." xrpl.js does NOT check the sign of
 *      `Amount` or `DeliverMin`; the class inherits that gap.
 *
 *   5. **`DeliverMin` must be a valid `Amount` shape AND strictly
 *      positive.** Same sources as items 3 and 4.
 */
import type { BasePropsFields } from '../../types/base.js';
import type { Amount, MPTAmount } from '../../types/amounts.js';
import { isAccount, isAmount, isHex, isString } from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// UInt256 hex length: 32 bytes = 64 hex chars.
// (xrpl.org `checkcash.md` field table: CheckID | String | UInt256.)
const CHECK_ID_HEX_LENGTH = 64;

// All-zeros HASH256 is reserved / malformed per `fixCleanup3_3_0`.
// (xrpl.org `checkcash.md` Error Cases: temMALFORMED for the zero CheckID.)
const CHECK_ID_ZERO =
  '0000000000000000000000000000000000000000000000000000000000000000';

// ─── Public types ────────────────────────────────────────────────────

export interface CheckCashProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  /** The unique address of the transaction sender (the Check cashier). */
  Account: string;
  /** The ID of the Check ledger object to cash (UInt256, 64-char hex). */
  CheckID: string;
  /**
   * Redeem the Check for exactly this amount, if possible. Must be a valid
   * `Amount` and strictly positive. Required XOR `DeliverMin`.
   */
  Amount?: Amount | MPTAmount | undefined;
  /**
   * Redeem the Check for at least this amount and as much as possible.
   * Must be a valid `Amount` and strictly positive. Required XOR `Amount`.
   */
  DeliverMin?: Amount | MPTAmount | undefined;
  /** Bit-flags for this transaction. CheckCash has no defined flags. */
  Flags?: number | undefined;
}

export interface CheckCash extends Readonly<CheckCashProps> {
  readonly TransactionType: 'CheckCash';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<CheckCashProps>): CheckCash;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Per xrpl.org `tem-codes.md` `temBAD_AMOUNT`: Amount or DeliverMin that
 * is zero or negative is rejected. Validates the sign of an Amount in
 * all three accepted forms (XRP drops string, `IssuedCurrencyAmount`,
 * `MPTAmount`).
 */
function isPositiveAmount(amount: Amount | MPTAmount): boolean {
  if (typeof amount === 'string') {
    if (!/^-?[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u.test(amount)) {
      return false;
    }
    return parseFloat(amount) > 0;
  }
  if (typeof amount !== 'object' || amount === null) return false;
  const value = (amount as { value?: unknown }).value;
  if (typeof value !== 'string') return false;
  if (!/^-?[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u.test(value)) {
    return false;
  }
  return parseFloat(value) > 0;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function checkCash(props: CheckCashProps): CheckCash {
  // ── Account ── required, must be a valid XRPL classic/X-address.
  require(props.Account, 'CheckCash: missing or invalid Account', isAccount);

  // ── CheckID ── required, 64-char hex (UInt256) AND non-zero.
  if (
    !isString(props.CheckID) ||
    !isHex(props.CheckID) ||
    props.CheckID.length !== CHECK_ID_HEX_LENGTH
  ) {
    throw new ValidationError(
      `CheckCash: CheckID must be a ${CHECK_ID_HEX_LENGTH}-character hex string (UInt256)`,
    );
  }
  if (props.CheckID === CHECK_ID_ZERO) {
    throw new ValidationError(
      'CheckCash: CheckID must not be the all-zeros HASH256 value (xrpl.org fixCleanup3_3_0: temMALFORMED)',
    );
  }

  // ── Amount / DeliverMin ── exactly one of the two is required.
  const hasAmount = props.Amount !== undefined;
  const hasDeliverMin = props.DeliverMin !== undefined;
  if (hasAmount && hasDeliverMin) {
    throw new ValidationError(
      'CheckCash: cannot have both Amount and DeliverMin',
    );
  }
  if (!hasAmount && !hasDeliverMin) {
    throw new ValidationError(
      'CheckCash: must have either Amount or DeliverMin',
    );
  }

  // ── Amount ── shape check + positivity.
  if (hasAmount) {
    if (!isAmount(props.Amount)) {
      throw new ValidationError(
        'CheckCash: Amount must be a valid Amount (XRP drops / IssuedCurrencyAmount / MPTAmount)',
      );
    }
    if (!isPositiveAmount(props.Amount)) {
      throw new ValidationError(
        'CheckCash: Amount must be strictly positive (non-zero, non-negative)',
      );
    }
  }

  // ── DeliverMin ── shape check + positivity (mirrors Amount).
  if (hasDeliverMin) {
    if (!isAmount(props.DeliverMin)) {
      throw new ValidationError(
        'CheckCash: DeliverMin must be a valid Amount (XRP drops / IssuedCurrencyAmount / MPTAmount)',
      );
    }
    if (!isPositiveAmount(props.DeliverMin)) {
      throw new ValidationError(
        'CheckCash: DeliverMin must be strictly positive (non-zero, non-negative)',
      );
    }
  }

  // ─── Base transaction fields ───
  // Validates the fields this factory inherits from BaseTransactionFields
  // but does not otherwise check. Placed AFTER the CheckCash-specific
  // checks so a more specific mistake gets a more specific message.
  // `TransactionType` is supplied because the validator checks a built
  // transaction, not a props bag — the factory injects it below.
  validateBaseTransaction({ TransactionType: 'CheckCash', ...props });

  return buildFrozenTx<CheckCashProps, CheckCash>(
    'CheckCash',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: CheckCash) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: CheckCash, overrides: Partial<CheckCashProps>) {
        return checkCash(mergeForWith(this, overrides));
      },
    },
  );
}