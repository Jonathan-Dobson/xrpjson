/**
 * Functional LoanBrokerCoverDeposit factory — frozen-object style.
 *
 * The Loan Broker owner deposits First-Loss Capital into a `LoanBroker`
 * ledger entry to back the vault against loan defaults. Validation happens
 * at construction; there is no way to construct an invalid tx.
 *
 *   import { loanBrokerCoverDeposit } from 'xrplt/fp';
 *   const tx = loanBrokerCoverDeposit({ Account, LoanBrokerID, Amount });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Amount: { currency: 'USD', issuer, value: '1500' } });
 *
 * LoanBrokerCoverDeposit has no flags defined by the spec.
 *
 * Affected amendments:
 *   - `LendingProtocol` (base LoanBrokerCoverDeposit)
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/loanbrokercoverdeposit
 * @see https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0066-lending-protocol
 *
 * ## Divergences
 *
 * The factory enforces two preclaim checks that the class API
 * (`src/transactions/loan-broker-cover-deposit.ts`) skips:
 *
 *   1. `LoanBrokerID` must not be the all-zeros HASH256 value.
 *      Source: XLS-66 §3.5.3.1 check 1 — "`LoanBrokerID` is zero (`temINVALID`)"
 *      (`~/.mavis/docs.local/xrpl-standards/repo/XLS-0066-lending-protocol/README.md`
 *      line 755).
 *      xrpl.js `validateLoanBrokerCoverDeposit` only checks `isLedgerEntryId`,
 *      which is satisfied by the all-zeros string
 *      (`~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/loanBrokerCoverDeposit.ts`
 *      lines 46-50).
 *
 *   2. `Amount` must be strictly positive (non-zero, non-negative) in
 *      all three forms (XRP drops string, `IssuedCurrencyAmount.value`,
 *      `MPTAmount.value`).
 *      Source: XLS-66 §3.5.3.1 check 2 — "`Amount <= 0` (`temBAD_AMOUNT`)"
 *      (`~/.mavis/docs.local/xrpl-standards/repo/XLS-0066-lending-protocol/README.md`
 *      line 756).
 *      xrpl.js `validateLoanBrokerCoverDeposit` only checks `isAmount`, which
 *      accepts any numeric string regardless of sign; the local
 *      `validation/helpers.isAmount` has the same gap.
 */
import type { Amount, MPTAmount } from '../../types/amounts.js';
import { isAccount, isAmount, isHex, isString } from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// LoanBrokerID is a HASH256 = 32 bytes = 64 hex chars.
const LOAN_BROKER_ID_LENGTH = 64;
// All-zeros HASH256 is reserved / malformed per spec.
const LOAN_BROKER_ID_ZERO =
  '0000000000000000000000000000000000000000000000000000000000000000';

// ─── Public types ────────────────────────────────────────────────────

export interface LoanBrokerCoverDepositProps {
  /** The unique address of the transaction sender (must be `LoanBroker.Owner`). */
  Account: string;
  /** The ID of the `LoanBroker` ledger entry to deposit First-Loss Capital into. 64-char hex. */
  LoanBrokerID: string;
  /** First-Loss Capital amount to deposit (XRP / trust line / MPT). */
  Amount: Amount | MPTAmount;
  /** Fee in XRP (drops), base-10 integer string. */
  Fee?: string | undefined;
  /** Account sequence number. */
  Sequence?: number | undefined;
}

export interface LoanBrokerCoverDeposit
  extends Readonly<LoanBrokerCoverDepositProps> {
  readonly TransactionType: 'LoanBrokerCoverDeposit';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<LoanBrokerCoverDepositProps>): LoanBrokerCoverDeposit;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Per XLS-66 §3.5.3.1 check 2: "`Amount <= 0` (`temBAD_AMOUNT`)".
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

export function loanBrokerCoverDeposit(
  props: LoanBrokerCoverDepositProps,
): LoanBrokerCoverDeposit {
  // ── Account ── required, must be a valid XRPL classic address.
  require(
    props.Account,
    'LoanBrokerCoverDeposit: Account is required',
    isAccount,
  );

  // ── LoanBrokerID ── required, 64-char hex AND non-zero.
  if (
    !isString(props.LoanBrokerID) ||
    !isHex(props.LoanBrokerID) ||
    props.LoanBrokerID.length !== LOAN_BROKER_ID_LENGTH
  ) {
    throw new ValidationError(
      'LoanBrokerCoverDeposit: LoanBrokerID must be a 64-character hex string',
    );
  }
  if (props.LoanBrokerID === LOAN_BROKER_ID_ZERO) {
    throw new ValidationError(
      'LoanBrokerCoverDeposit: LoanBrokerID must not be the all-zeros HASH256 value',
    );
  }

  // ── Amount ── required, must be a valid Amount AND strictly positive.
  if (!isAmount(props.Amount)) {
    throw new ValidationError(
      'LoanBrokerCoverDeposit: Amount must be a valid Amount (XRP / trust line / MPT form)',
    );
  }
  if (!isPositiveAmount(props.Amount)) {
    throw new ValidationError(
      'LoanBrokerCoverDeposit: Amount must be strictly positive (non-zero, non-negative)',
    );
  }

  return buildFrozenTx<LoanBrokerCoverDepositProps, LoanBrokerCoverDeposit>(
    'LoanBrokerCoverDeposit',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: LoanBrokerCoverDeposit) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: LoanBrokerCoverDeposit,
        overrides: Partial<LoanBrokerCoverDepositProps>,
      ) {
        return loanBrokerCoverDeposit(mergeForWith(this, overrides));
      },
    },
  );
}