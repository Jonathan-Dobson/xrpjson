/**
 * Functional LoanPay factory — frozen-object style.
 *
 * The Borrower submits a `LoanPay` to make a payment on a Loan. Validation
 * happens at construction; there is no way to construct an invalid tx.
 *
 *   import { loanPay } from 'xrpjson';
 *   const tx = loanPay({ Account, LoanID, Amount: '1000000' });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Flags: 0x00010000 });
 *
 * Three mutually-exclusive payment-type flags (at most one per tx):
 *   - `tfLoanOverpayment` (0x00010000) — excess payment treated as overpayment
 *   - `tfLoanFullPayment` (0x00020000) — early full repayment
 *   - `tfLoanLatePayment` (0x00040000) — late loan payment
 *
 * Affected amendments:
 *   - `LendingProtocol` (base LoanPay)
 *   - `LendingProtocolV1_1` (LendingProtocolV1_1-specific changes;
 *     per XLS-66.2 §3.2, the late-payment boundary check uses an
 *     exclusive `currentTime > NextPaymentDueDate` comparison —
 *     not locally checkable here.)
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/loanpay
 * @see https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0066-lending-protocol
 *
 * ## Divergences
 * The factory enforces three preclaim checks that the class API
 * (the Class API's `LoanPay`) skips:
 *
 *   1. `LoanID` must not be the all-zeros HASH256 value.
 *      Source: XLS-66 §3.11.4.1 check 1 — "`LoanID` is zero (`temINVALID`)".
 *      xrpl.js `validateLoanPay` only checks `isLedgerEntryId(tx.LoanID)`,
 *      which is satisfied by the all-zeros string.
 *
 *   2. `Amount` must be strictly positive (non-zero, non-negative) in
 *      all three forms (XRP drops string, `IssuedCurrencyAmount.value`,
 *      `MPTAmount.value`).
 *      Source: XLS-66 §3.11.4.1 check 2 — "`Amount <= 0` (`temBAD_AMOUNT`)".
 *      xrpl.js `isAmount` accepts any numeric string and does not check
 *      the sign of the `value` sub-field of object amounts.
 *
 *   3. Payment-type flag exclusivity is also enforced when `Flags` is
 *      provided as an object (`LoanPayFlagsInterface`).
 *      Source: xrpl.js `validateLoanPay` (object branch).
 *      The class API only checks numeric `Flags` and silently accepts
 *      `{ tfLoanOverpayment: true, tfLoanFullPayment: true }`.
 */
import type { BasePropsFields } from '../../types/base.js';
import type { Amount, MPTAmount } from '../../types/amounts.js';
import type { LoanPayFlagsInterface } from '../../types/flags.js';
import {
  isAccount,
  isAmount,
  isFlagEnabled,
  isHex,
  isString,
} from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

const TF_LOAN_OVERPAYMENT = 0x00010000;
const TF_LOAN_FULL_PAYMENT = 0x00020000;
const TF_LOAN_LATE_PAYMENT = 0x00040000;

// LoanID is a HASH256 = 32 bytes = 64 hex chars.
const LOAN_ID_LENGTH = 64;
// All-zeros HASH256 is reserved / malformed per spec.
const LOAN_ID_ZERO =
  '0000000000000000000000000000000000000000000000000000000000000000';

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
export interface LoanPayProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  /** The unique address of the transaction sender (the Borrower). */
  Account: string;
  /** The ID of the `Loan` ledger entry to repay. 64-char hex. */
  LoanID: string;
  /** Amount of funds to pay (XRP / trust line / MPT). */
  Amount: Amount | MPTAmount;
  /** Bit-flags for this transaction. Numeric or boolean map. */
  Flags?: number | LoanPayFlagsInterface | undefined;
}

export interface LoanPay extends Readonly<LoanPayProps> {
  readonly TransactionType: 'LoanPay';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<LoanPayProps>): LoanPay;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Per XLS-66 §3.11.4.1 check 2: "`Amount <= 0` (`temBAD_AMOUNT`)".
 * Validates the sign of an Amount in all three accepted forms.
 *
 *   - XRP form: a decimal-string of drops (e.g. "1000000").
 *   - IssuedCurrency form: object with a `value` sub-string.
 *   - MPT form: object with a `value` sub-string.
 *
 * Accepts the canonical scientific mantissa form (`1.5e3`) so this
 * stays compatible with the XRPL serialization layer. Negative or
 * zero mantissas are rejected.
 */
function isPositiveAmount(amount: Amount | MPTAmount): boolean {
  // XRP drops — a decimal or scientific-mantissa string.
  if (typeof amount === 'string') {
    if (!/^-?[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u.test(amount)) {
      return false;
    }
    return parseFloat(amount) > 0;
  }
  // Object form (IssuedCurrency or MPT).
  if (typeof amount !== 'object' || amount === null) return false;
  const value = (amount as { value?: unknown }).value;
  if (typeof value !== 'string') return false;
  if (!/^-?[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u.test(value)) {
    return false;
  }
  return parseFloat(value) > 0;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function loanPay(props: LoanPayProps): LoanPay {
  // ── Account ── required, must be a valid XRPL classic address.
  require(props.Account, 'LoanPay: Account is required', isAccount);

  // ── LoanID ── required, 64-char hex AND non-zero.
  if (
    !isString(props.LoanID) ||
    !isHex(props.LoanID) ||
    props.LoanID.length !== LOAN_ID_LENGTH
  ) {
    throw new ValidationError(
      'LoanPay: LoanID must be a 64-character hex string',
    );
  }
  if (props.LoanID === LOAN_ID_ZERO) {
    throw new ValidationError(
      'LoanPay: LoanID must not be the all-zeros HASH256 value',
    );
  }

  // ── Amount ── required, must be a valid Amount AND strictly positive.
  if (!isAmount(props.Amount)) {
    throw new ValidationError(
      'LoanPay: Amount must be a valid Amount (XRP / trust line / MPT form)',
    );
  }
  if (!isPositiveAmount(props.Amount)) {
    throw new ValidationError(
      'LoanPay: Amount must be strictly positive (non-zero, non-negative)',
    );
  }

  // ── Flags ── at most one of the 3 payment-type flags.
  if (props.Flags !== undefined) {
    if (typeof props.Flags === 'number') {
      const set: string[] = [];
      if (isFlagEnabled(props.Flags, TF_LOAN_OVERPAYMENT))
        set.push('tfLoanOverpayment');
      if (isFlagEnabled(props.Flags, TF_LOAN_FULL_PAYMENT))
        set.push('tfLoanFullPayment');
      if (isFlagEnabled(props.Flags, TF_LOAN_LATE_PAYMENT))
        set.push('tfLoanLatePayment');
      if (set.length > 1) {
        throw new ValidationError(
          `LoanPay: Only one of tfLoanLatePayment, tfLoanFullPayment, or tfLoanOverpayment flags can be set (got: ${set.join(', ')})`,
        );
      }
    } else if (typeof props.Flags === 'object' && props.Flags !== null) {
      const f = props.Flags as Record<string, unknown>;
      const set: string[] = [];
      if (f.tfLoanOverpayment === true) set.push('tfLoanOverpayment');
      if (f.tfLoanFullPayment === true) set.push('tfLoanFullPayment');
      if (f.tfLoanLatePayment === true) set.push('tfLoanLatePayment');
      if (set.length > 1) {
        throw new ValidationError(
          `LoanPay: Only one of tfLoanLatePayment, tfLoanFullPayment, or tfLoanOverpayment flags can be set (got: ${set.join(', ')})`,
        );
      }
    } else {
      throw new ValidationError(
        'LoanPay: Flags must be a number or LoanPayFlagsInterface object',
      );
    }
  }

  // ─── Base transaction fields ───
  // Catches the seven shared base fields this factory does not otherwise
  // check: Memos, SourceTag, LastLedgerSequence, AccountTxnID, NetworkID,
  // Delegate, TicketSequence.
  //
  // Placed AFTER the LoanPay-specific checks so a more specific message
  // wins for a more specific mistake, and this acts as the backstop for
  // everything shared across transaction types.
  //
  // `TransactionType` is supplied because the validator checks a transaction,
  // not a props bag — the factory injects it in `buildFrozenTx` below.
  validateBaseTransaction({ TransactionType: 'LoanPay', ...props });

  return buildFrozenTx<LoanPayProps, LoanPay>(
    'LoanPay',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: LoanPay) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: LoanPay, overrides: Partial<LoanPayProps>) {
        return loanPay(mergeForWith(this, overrides));
      },
    },
  );
}