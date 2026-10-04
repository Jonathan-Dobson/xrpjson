/**
 * Functional CheckCreate factory — frozen-object style.
 *
 * Creates an on-ledger Check that can be cashed by `Destination` for up to
 * `SendMax` of the source currency. Validation happens at construction;
 * there is no way to construct an invalid tx from the fields it models.
 *
 *   import { checkCreate } from 'xrpjson';
 *   const tx = checkCreate({ Account, Destination, SendMax });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Expiration: 570113521 });
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/checkcreate
 *
 * ## Divergences
 * The factory enforces five preclaim guards that the class API
 * (the Class API's `CheckCreate`) skips. The class only checks
 * type — it does not check ranges, semantic equivalence, or self-send.
 *
 *   1. `Destination` must not equal `Account` (self-send is rejected).
 *      Source: xrpl.org `checkcreate.md` Error Cases — `temREDUNDANT`
 *      "The Destination is the sender of the transaction". The class
 *      only checks `isAccount(this.Destination)` and accepts the
 *      sender's own address. (Cross-referenced: `temDST_IS_SRC` in
 *      `tem-codes.md` — "The transaction improperly specified a
 *      destination address as the Account sending the transaction".)
 *
 *   2. `SendMax` must be strictly positive in all three Amount forms
 *      (XRP drops string, `IssuedCurrencyAmount.value`,
 *      `MPTAmount.value`).
 *      Source: xrpl.org `tem-codes.md` — `temBAD_AMOUNT` — "An amount
 *      specified by the transaction (for example the destination Amount
 *      or SendMax values of a Payment) was invalid, possibly because it
 *      was a negative number." xrpl.js `validateCheckCreate` accepts any
 *      string Amount or any `IssuedCurrencyAmount` and never checks the
 *      sign of the `value` sub-field; the class inherits that gap.
 *
 *   3. `DestinationTag` must be a non-negative UInt32
 *      (0 ≤ value ≤ 0xFFFFFFFF), not just any number.
 *      Source: xrpl.org `checkcreate.md` field table — `DestinationTag |
 *      Number | UInt32`. xrpl.js `validateOptionalField(tx,
 *      'DestinationTag', isNumber)` accepts negatives and non-integers;
 *      the class uses `isNumber` too.
 *
 *   4. `Expiration` must be a non-negative UInt32
 *      (0 ≤ value ≤ 0xFFFFFFFF), not just any number.
 *      Source: xrpl.org `checkcreate.md` field table — `Expiration |
 *      Number | UInt32`. xrpl.js `typeof tx.Expiration !== 'number'`
 *      accepts any number; the class uses `isNumber`.
 *
 *   5. `InvoiceID` must be a 64-character hex string (UInt256 = 32 bytes).
 *      Source: xrpl.org `checkcreate.md` field table — `InvoiceID |
 *      String | UInt256`. xrpl.js `typeof tx.InvoiceID !== 'string'`
 *      accepts any string; the class uses `isString`.
 */
import type { BasePropsFields } from '../../types/base.js';
import type { Amount, MPTAmount } from '../../types/amounts.js';
import { isAccount, isAmount, isHex, isNumber, isString } from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// UInt32 bounds (per xrpl.org `checkcreate.md` field table).
const UINT32_MIN = 0;
const UINT32_MAX = 0xffffffff;
// UInt256 hex length: 32 bytes = 64 hex chars.
const INVOICE_ID_LENGTH = 64;

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
export interface CheckCreateProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  /** The unique address of the transaction sender (the Check writer). */
  Account: string;
  /** The account that may cash the Check. */
  Destination: string;
  /** Maximum source-currency amount the Check may debit the sender. */
  SendMax: Amount | MPTAmount;
  /** Arbitrary destination tag for the recipient (UInt32). */
  DestinationTag?: number | undefined;
  /** Expiration time in seconds since the Ripple Epoch (UInt32). */
  Expiration?: number | undefined;
  /** Arbitrary 256-bit hash identifying the purpose of this Check. */
  InvoiceID?: string | undefined;
  /** Bit-flags for this transaction. CheckCreate has no defined flags. */
  Flags?: number | undefined;
}

export interface CheckCreate extends Readonly<CheckCreateProps> {
  readonly TransactionType: 'CheckCreate';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<CheckCreateProps>): CheckCreate;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Per xrpl.org `tem-codes.md` `temBAD_AMOUNT`: SendMax that is zero or
 * negative is rejected. Validates the sign of an Amount in all three
 * accepted forms:
 *   - XRP drops — a decimal or scientific-mantissa string.
 *   - IssuedCurrency — object with a `value` sub-string.
 *   - MPT — object with a `value` sub-string.
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

export function checkCreate(props: CheckCreateProps): CheckCreate {
  // ── Account ── required, must be a valid XRPL classic/X-address.
  require(props.Account, 'CheckCreate: missing or invalid Account', isAccount);

  // ── Destination ── required, must be a valid XRPL classic/X-address
  //    AND must not equal the sender (xrpl.org `temREDUNDANT`).
  if (!isAccount(props.Destination)) {
    throw new ValidationError(
      'CheckCreate: missing or invalid Destination',
    );
  }
  if (props.Destination === props.Account) {
    throw new ValidationError(
      'CheckCreate: Destination must not equal Account (sender cannot write a Check to themselves)',
    );
  }

  // ── SendMax ── required, must be a valid Amount AND strictly positive.
  if (!isAmount(props.SendMax)) {
    throw new ValidationError(
      'CheckCreate: missing or invalid SendMax',
    );
  }
  if (!isPositiveAmount(props.SendMax)) {
    throw new ValidationError(
      'CheckCreate: SendMax must be strictly positive (non-zero, non-negative)',
    );
  }

  // ── DestinationTag ── optional UInt32 (xrpl.org field table).
  if (props.DestinationTag !== undefined) {
    if (
      !isNumber(props.DestinationTag) ||
      !Number.isInteger(props.DestinationTag) ||
      props.DestinationTag < UINT32_MIN ||
      props.DestinationTag > UINT32_MAX
    ) {
      throw new ValidationError(
        `CheckCreate: DestinationTag must be a UInt32 in [${UINT32_MIN}, ${UINT32_MAX}]`,
      );
    }
  }

  // ── Expiration ── optional UInt32 (xrpl.org field table).
  if (props.Expiration !== undefined) {
    if (
      !isNumber(props.Expiration) ||
      !Number.isInteger(props.Expiration) ||
      props.Expiration < UINT32_MIN ||
      props.Expiration > UINT32_MAX
    ) {
      throw new ValidationError(
        `CheckCreate: Expiration must be a UInt32 in [${UINT32_MIN}, ${UINT32_MAX}] (seconds since the Ripple Epoch)`,
      );
    }
  }

  // ── InvoiceID ── optional 64-char hex (UInt256, xrpl.org field table).
  if (props.InvoiceID !== undefined) {
    if (
      !isString(props.InvoiceID) ||
      !isHex(props.InvoiceID) ||
      props.InvoiceID.length !== INVOICE_ID_LENGTH
    ) {
      throw new ValidationError(
        `CheckCreate: InvoiceID must be a ${INVOICE_ID_LENGTH}-character hex string (UInt256)`,
      );
    }
  }

  // ─── Base transaction fields ───
  // Validates the fields this factory inherits from BaseTransactionFields
  // but does not otherwise check. Placed AFTER the CheckCreate-specific
  // checks so a more specific mistake gets a more specific message.
  // `TransactionType` is supplied because the validator checks a built
  // transaction, not a props bag — the factory injects it below.
  validateBaseTransaction({ TransactionType: 'CheckCreate', ...props });

  return buildFrozenTx<CheckCreateProps, CheckCreate>(
    'CheckCreate',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: CheckCreate) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: CheckCreate, overrides: Partial<CheckCreateProps>) {
        return checkCreate(mergeForWith(this, overrides));
      },
    },
  );
}