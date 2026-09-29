/**
 * Functional LoanBrokerCoverClawback factory — frozen-object style.
 *
 * Claws back First-Loss Capital from a `LoanBroker` ledger entry. Only the
 * Issuer of the Loan asset can submit this. Clawback is limited to the
 * minimum cover required for current loans.
 *
 *   import { loanBrokerCoverClawback } from 'xrplt/fp';
 *   const tx = loanBrokerCoverClawback({ Account, LoanBrokerID, Amount });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Amount: { currency: 'USD', issuer, value: '50' } });
 *
 * LoanBrokerCoverClawback has no flags defined by the spec.
 *
 * Affected amendments:
 *   - `LendingProtocol` (base LoanBrokerCoverClawback)
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/loanbrokercoverclawback
 * @see XLS-66 §3.7 (Transaction: `LoanBrokerCoverClawback`)
 *      in `~/.mavis/docs.local/xrpl-standards/repo/XLS-0066-lending-protocol/README.md`
 *
 * ## Divergences
 *
 * The factory enforces five preclaim checks the class API
 * (`src/transactions/loan-broker-cover-clawback.ts`) skips:
 *
 *   1. `LoanBrokerID` must NOT be the all-zeros HASH256 value when present.
 *      Source: XLS-66 §3.7.3.1 check 2 — "`LoanBrokerID` is specified and is
 *      zero. (`temINVALID`)"
 *      The class only validates `isString` + `isHex` + length 64 (i.e.
 *      `isLedgerEntryId`), which is satisfied by the all-zeros string.
 *      xrpl.js `validateLoanBrokerCoverClawback` has the same gap.
 *      (`~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/loanBrokerCoverClawback.ts`
 *      lines 53-57.)
 *
 *   2. `LoanBrokerID` is required when `Amount` is an MPT, and required
 *      when `Amount` is an IOU whose `issuer` matches the submitter
 *      `Account`.
 *      Source: XLS-66 §3.7.3.1 checks 6 and 7:
 *        - "`LoanBrokerID` is not specified and `Amount` specifies an MPT.
 *          (`temINVALID`)"
 *        - "`LoanBrokerID` is not specified, `Amount` specifies an IOU, and
 *          `Amount.issuer` is the submitter `Account` or zero. (`temINVALID`)"
 *      The class does not enforce either cross-field dependency; it only
 *      requires that at least one of `LoanBrokerID`/`Amount` be present.
 *      xrpl.js `validateLoanBrokerCoverClawback` also skips these.
 *      (`~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/loanBrokerCoverClawback.ts`
 *      lines 45-67.)
 *
 *   3. `Amount.value` must be a well-formed non-negative XRPL Number
 *      (matches the spec's "legal net amount" requirement of §3.7.3.1
 *      check 5). The class uses `Number(value)` and only checks
 *      `Number.isNaN` / `< 0`, which silently accepts malformed input
 *      like `""`, `"   "`, or `"1.2.3"`. The factory accepts the
 *      canonical XRPL Number form: decimal strings or scientific
 *      mantissa (`1.5e3`), and rejects anything else.
 *      Source: xrpl.org generic Amount spec
 *      (https://xrpl.org/docs/references/protocol/data-types/basic-data-types#specifying-currency-amounts).
 *
 *   4. `Amount` sub-field shape (`currency`/`issuer` for IOU;
 *      `mpt_issuance_id` for MPT) is validated, mirroring the strict
 *      policy used by the `vaultClawback` factory. The class only
 *      delegates to `isIssuedCurrencyAmount` / `isMPTAmount`, which
 *      verify key presence but not the well-formedness of the values.
 *      Source: xrpl-dev-portal basic-data-types (currency must be 3 ASCII
 *      or 40 hex characters; MPT issuance ID is a 192-bit hex string).
 *
 *   5. `Account` is validated as a classic or X-address. The class does
 *      not check `Account` here — this divergence is identical across
 *      the loan factories and is documented per-factory.
 *
 * Note: the factory accepts `Amount.value === '0'` because the spec
 * explicitly defines zero as the "clawback down to minimum cover" signal
 * (XLS-66 §3.7.4 state change 2). xrpl.js and the class agree.
 */
import type { ClawbackAmount } from '../../types/amounts.js';
import {
  isAccount,
  isHex,
  isIssuedCurrencyAmount,
  isMPTAmount,
  isString,
} from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// LoanBrokerID is a HASH256 = 32 bytes = 64 hex chars.
const LOAN_BROKER_ID_LENGTH = 64;
// All-zeros HASH256 is reserved / malformed per XLS-66 §3.7.3.1 check 2.
const LOAN_BROKER_ID_ZERO =
  '0000000000000000000000000000000000000000000000000000000000000000';

// Currency codes are either 3 ASCII characters or 40 hex characters.
const CURRENCY_ASCII_LENGTH = 3;
const CURRENCY_HEX_LENGTH = 40;

// MPT issuance IDs are 192-bit, hex-encoded (≤ 48 chars).
// We accept 24..48 to leave slack for future widenings / leading-zero
// encoders. Empty strings are rejected.
const MPT_ISSUANCE_ID_MIN = 24;
const MPT_ISSUANCE_ID_MAX = 48;

// ─── Public types ────────────────────────────────────────────────────

export interface LoanBrokerCoverClawbackProps {
  /** The unique address of the transaction sender (must be the Loan asset's Issuer). */
  Account: string;
  /**
   * Optional. The ID of the `LoanBroker` ledger entry to claw back from.
   * 64-char hex. Required if Amount is MPT or Amount is IOU and
   * `Amount.issuer === Account`.
   */
  LoanBrokerID?: string | undefined;
  /**
   * Optional First-Loss Capital amount to claw back. IOU or MPT form
   * (NOT XRP). If `0` or omitted, claws back up to
   * `LoanBroker.DebtTotal * LoanBroker.CoverRateMinimum`.
   */
  Amount?: ClawbackAmount | undefined;
  /** No flags defined by the spec; permitted for base-tx parity. */
  Flags?: number | undefined;
  /** Fee in XRP (drops), base-10 integer string. */
  Fee?: string | undefined;
  /** Account sequence number. */
  Sequence?: number | undefined;
}

export interface LoanBrokerCoverClawback
  extends Readonly<LoanBrokerCoverClawbackProps> {
  readonly TransactionType: 'LoanBrokerCoverClawback';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(
    overrides: Partial<LoanBrokerCoverClawbackProps>,
  ): LoanBrokerCoverClawback;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Per XLS-66 §3.7.3.1 check 3 (`Amount < 0` rejected, `Amount >= 0`
 * accepted) and check 5 ("legal net amount"). Accepts the canonical
 * XRPL Number form: decimal strings or scientific mantissa (`1.5e3`).
 *
 * Zero is explicitly allowed per §3.7.4 state change 2 (clawback down
 * to minimum cover).
 */
function isNonNegativeAmountValue(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!/^-?[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u.test(value)) return false;
  return parseFloat(value) >= 0;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function loanBrokerCoverClawback(
  props: LoanBrokerCoverClawbackProps,
): LoanBrokerCoverClawback {
  // ── Account ── required, must be a valid XRPL classic or X-address.
  require(
    props.Account,
    'LoanBrokerCoverClawback: Account is required',
    isAccount,
  );

  // ── LoanBrokerID ── optional, but if present: 64-char hex AND non-zero.
  if (props.LoanBrokerID !== undefined) {
    if (
      !isString(props.LoanBrokerID) ||
      !isHex(props.LoanBrokerID) ||
      props.LoanBrokerID.length !== LOAN_BROKER_ID_LENGTH
    ) {
      throw new ValidationError(
        'LoanBrokerCoverClawback: LoanBrokerID must be a 64-character hex string',
      );
    }
    if (props.LoanBrokerID === LOAN_BROKER_ID_ZERO) {
      throw new ValidationError(
        'LoanBrokerCoverClawback: LoanBrokerID must not be the all-zeros HASH256 value',
      );
    }
  }

  // ── Amount ── optional, but if present: must be a valid ClawbackAmount
  // (IOU/MPT, NOT XRP), with well-formed sub-fields and value >= 0.
  if (props.Amount !== undefined) {
    if (
      !isIssuedCurrencyAmount(props.Amount) &&
      !isMPTAmount(props.Amount)
    ) {
      throw new ValidationError(
        'LoanBrokerCoverClawback: Amount must be a valid ClawbackAmount (trust line / MPT form, NOT XRP)',
      );
    }

    if (isIssuedCurrencyAmount(props.Amount)) {
      // Currency: 3 ASCII or 40 hex characters.
      const ccy = props.Amount.currency;
      if (
        ccy.length !== CURRENCY_ASCII_LENGTH &&
        ccy.length !== CURRENCY_HEX_LENGTH
      ) {
        throw new ValidationError(
          `LoanBrokerCoverClawback: Amount.currency must be ${CURRENCY_ASCII_LENGTH} ASCII characters or ${CURRENCY_HEX_LENGTH} hex characters (actual: ${ccy.length})`,
        );
      }
      if (ccy.length === CURRENCY_HEX_LENGTH && !isHex(ccy)) {
        throw new ValidationError(
          'LoanBrokerCoverClawback: Amount.currency (40-char form) must be hex',
        );
      }
      // Issuer must be a valid XRPL account.
      if (!isAccount(props.Amount.issuer)) {
        throw new ValidationError(
          'LoanBrokerCoverClawback: Amount.issuer must be a valid XRPL account address',
        );
      }
      // Value: legal non-negative XRPL Number.
      if (!isNonNegativeAmountValue(props.Amount.value)) {
        throw new ValidationError(
          'LoanBrokerCoverClawback: Amount.value must be a non-negative numeric string (decimal or scientific mantissa)',
        );
      }
    } else {
      // MPT amount.
      const mptid = props.Amount.mpt_issuance_id;
      if (
        mptid.length < MPT_ISSUANCE_ID_MIN ||
        mptid.length > MPT_ISSUANCE_ID_MAX ||
        !isHex(mptid)
      ) {
        throw new ValidationError(
          `LoanBrokerCoverClawback: Amount.mpt_issuance_id must be a ${MPT_ISSUANCE_ID_MIN}-${MPT_ISSUANCE_ID_MAX} character hex string`,
        );
      }
      if (!isNonNegativeAmountValue(props.Amount.value)) {
        throw new ValidationError(
          'LoanBrokerCoverClawback: Amount.value must be a non-negative numeric string (decimal or scientific mantissa)',
        );
      }
    }
  }

  // ── At-least-one rule ── XLS-66 §3.7.3.1 check 1.
  if (props.LoanBrokerID === undefined && props.Amount === undefined) {
    throw new ValidationError(
      'LoanBrokerCoverClawback: Either LoanBrokerID or Amount is required',
    );
  }

  // ── Cross-field rule: LoanBrokerID missing + MPT Amount ── §3.7.3.1 check 6.
  if (props.LoanBrokerID === undefined && props.Amount !== undefined) {
    if (isMPTAmount(props.Amount)) {
      throw new ValidationError(
        'LoanBrokerCoverClawback: LoanBrokerID is required when Amount is an MPT',
      );
    }
    // ── Cross-field rule: LoanBrokerID missing + IOU issuer == Account ── §3.7.3.1 check 7.
    if (
      isIssuedCurrencyAmount(props.Amount) &&
      props.Amount.issuer === props.Account
    ) {
      throw new ValidationError(
        'LoanBrokerCoverClawback: LoanBrokerID is required when Amount is an IOU whose issuer is the submitter Account',
      );
    }
  }

  return buildFrozenTx<LoanBrokerCoverClawbackProps, LoanBrokerCoverClawback>(
    'LoanBrokerCoverClawback',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: LoanBrokerCoverClawback) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: LoanBrokerCoverClawback,
        overrides: Partial<LoanBrokerCoverClawbackProps>,
      ) {
        return loanBrokerCoverClawback(mergeForWith(this, overrides));
      },
    },
  );
}
