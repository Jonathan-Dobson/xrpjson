/**
 * Functional LoanSet factory — frozen-object style.
 *
 * Creates a new Loan ledger entry between a Loan Broker and a Borrower.
 * The class-based equivalent requires a separate `.validate()` call
 * after construction; this factory validates at construction so an
 * invalid tx can never exist.
 *
 *   import { loanSet } from 'xrplt/fp';
 *   const tx = loanSet({ Account, LoanBrokerID, PrincipalRequested });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ InterestRate: 250 });
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/loanset
 */
import type { CounterpartySignature } from '../../types/common.js';
import type { LoanSetFlagsInterface } from '../../types/flags.js';
import {
  isAccount,
  isHex,
  isNumber,
  isString,
} from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// All fees/rates are in units of 1/10 basis point (0–100000 = 0%–100%).
const MAX_RATE_1_10BP = 100_000;
// Minimum allowed PaymentInterval (seconds) — spec requires >= 60s.
const MIN_PAYMENT_INTERVAL_SECONDS = 60;
// Maximum Data field length in **characters** (hex-encoded).
const MAX_DATA_LENGTH_CHARS = 512;
// LoanBrokerID is a 64-char hex ledger entry ID.
const LOAN_BROKER_ID_LENGTH = 64;

// ─── Public types ────────────────────────────────────────────────────

export interface LoanSetProps {
  /** The unique address of the transaction sender. */
  Account: string;
  /** The ID of the `LoanBroker` ledger entry. 64-char hex. */
  LoanBrokerID: string;
  /** Principal loan amount requested by the Borrower (XRPLNumber). */
  PrincipalRequested: string;
  /** Counterparty of the loan (the Borrower when sender is Loan Broker). */
  Counterparty?: string | undefined;
  /** Counterparty's signature (added by the second signer). */
  CounterpartySignature?: CounterpartySignature | undefined;
  /** Arbitrary metadata in hex format, 1–512 characters. */
  Data?: string | undefined;
  /** Nominal fee paid to LoanBroker.Owner at loan creation (XRPLNumber). */
  LoanOriginationFee?: string | undefined;
  /** Nominal fee paid with every loan payment (XRPLNumber). */
  LoanServiceFee?: string | undefined;
  /** Nominal fee for late payments (XRPLNumber). */
  LatePaymentFee?: string | undefined;
  /** Nominal fee for early full repayment (XRPLNumber). */
  ClosePaymentFee?: string | undefined;
  /** Overpayment fee in 1/10 bp units, 0–100000 (0%–100%). */
  OverpaymentFee?: number | undefined;
  /** Annualized interest rate in 1/10 bp units, 0–100000 (0%–100%). */
  InterestRate?: number | undefined;
  /** Premium for late payments, 1/10 bp units, 0–100000. */
  LateInterestRate?: number | undefined;
  /** Early-repayment fee rate, 1/10 bp units, 0–100000. */
  CloseInterestRate?: number | undefined;
  /** Interest rate on overpayments, 1/10 bp units, 0–100000. */
  OverpaymentInterestRate?: number | undefined;
  /** Total number of payments to be made against the loan. */
  PaymentTotal?: number | undefined;
  /** Number of seconds between loan payments (≥ 60). */
  PaymentInterval?: number | undefined;
  /** Seconds after payment due date when loan can be defaulted (≤ PaymentInterval). */
  GracePeriod?: number | undefined;
  /** Bit-flags for this transaction. */
  Flags?: number | LoanSetFlagsInterface | undefined;
  Fee?: string | undefined;
  Sequence?: number | undefined;
}

export interface LoanSet extends Readonly<LoanSetProps> {
  readonly TransactionType: 'LoanSet';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<LoanSetProps>): LoanSet;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Rate/fee values must be integers within the 1/10 bp range.
 * Shared by all 5 rate fields (OverpaymentFee, InterestRate, etc.).
 */
function rateOutOfRange(value: number): boolean {
  return (
    !isNumber(value) ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_RATE_1_10BP
  );
}

// ─── Factory ─────────────────────────────────────────────────────────

export function loanSet(props: LoanSetProps): LoanSet {
  // ── Account ── required, must be a valid XRPL classic address.
  require(props.Account, 'LoanSet: Account is required', isAccount);

  // ── LoanBrokerID ── required, 64-char hex.
  if (
    !isString(props.LoanBrokerID) ||
    !isHex(props.LoanBrokerID) ||
    props.LoanBrokerID.length !== LOAN_BROKER_ID_LENGTH
  ) {
    throw new ValidationError(
      'LoanSet: LoanBrokerID must be a 64-character hex string',
    );
  }

  // ── PrincipalRequested ── required, non-negative base-10 integer string.
  if (
    !isString(props.PrincipalRequested) ||
    !/^[0-9]+$/u.test(props.PrincipalRequested)
  ) {
    throw new ValidationError(
      'LoanSet: PrincipalRequested must be a non-negative base-10 integer string',
    );
  }

  // ── Counterparty ── valid XRPL account if present.
  if (props.Counterparty !== undefined && !isAccount(props.Counterparty)) {
    throw new ValidationError(
      'LoanSet: Counterparty must be a valid XRPL account address',
    );
  }

  // ── Data ── hex, 1–512 characters.
  if (props.Data !== undefined) {
    if (!isString(props.Data) || !isHex(props.Data)) {
      throw new ValidationError(
        'LoanSet: Data must be a valid non-empty hex string',
      );
    }
    if (props.Data.length === 0 || props.Data.length > MAX_DATA_LENGTH_CHARS) {
      throw new ValidationError(
        `LoanSet: Data must be 1 to ${MAX_DATA_LENGTH_CHARS} hex characters (actual: ${props.Data.length})`,
      );
    }
  }

  // ── Rate / fee ranges (all 1/10 bp units, 0–100000).
  if (props.OverpaymentFee !== undefined && rateOutOfRange(props.OverpaymentFee)) {
    throw new ValidationError(
      `LoanSet: OverpaymentFee must be between 0 and ${MAX_RATE_1_10BP} inclusive`,
    );
  }
  if (props.InterestRate !== undefined && rateOutOfRange(props.InterestRate)) {
    throw new ValidationError(
      `LoanSet: InterestRate must be between 0 and ${MAX_RATE_1_10BP} inclusive`,
    );
  }
  if (props.LateInterestRate !== undefined && rateOutOfRange(props.LateInterestRate)) {
    throw new ValidationError(
      `LoanSet: LateInterestRate must be between 0 and ${MAX_RATE_1_10BP} inclusive`,
    );
  }
  if (props.CloseInterestRate !== undefined && rateOutOfRange(props.CloseInterestRate)) {
    throw new ValidationError(
      `LoanSet: CloseInterestRate must be between 0 and ${MAX_RATE_1_10BP} inclusive`,
    );
  }
  if (props.OverpaymentInterestRate !== undefined && rateOutOfRange(props.OverpaymentInterestRate)) {
    throw new ValidationError(
      `LoanSet: OverpaymentInterestRate must be between 0 and ${MAX_RATE_1_10BP} inclusive`,
    );
  }

  // ── PaymentInterval ── ≥ 60 seconds.
  if (props.PaymentInterval !== undefined) {
    if (
      !isNumber(props.PaymentInterval) ||
      !Number.isInteger(props.PaymentInterval) ||
      props.PaymentInterval < MIN_PAYMENT_INTERVAL_SECONDS
    ) {
      throw new ValidationError(
        `LoanSet: PaymentInterval must be an integer ≥ ${MIN_PAYMENT_INTERVAL_SECONDS} seconds`,
      );
    }

    // GracePeriod ≤ PaymentInterval when both present.
    if (
      props.GracePeriod !== undefined &&
      isNumber(props.GracePeriod) &&
      props.GracePeriod > props.PaymentInterval
    ) {
      throw new ValidationError(
        'LoanSet: GracePeriod must not be greater than PaymentInterval',
      );
    }
  }

  return buildFrozenTx<LoanSetProps, LoanSet>(
    'LoanSet',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: LoanSet) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: LoanSet, overrides: Partial<LoanSetProps>) {
        return loanSet(mergeForWith(this, overrides));
      },
    },
  );
}