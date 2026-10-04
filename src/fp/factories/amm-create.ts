/**
 * Functional AMMCreate factory — frozen-object style.
 *
 * Creates a new Automated Market Maker (AMM) instance for trading a pair
 * of assets (XRP, IOU, or MPT). The class-based equivalent requires a
 * separate `.validate()` call after construction; this factory validates
 * at construction so an invalid tx can never exist.
 *
 *   import { ammCreate } from 'xrpjson';
 *   const tx = ammCreate({ Account, Amount, Amount2, TradingFee });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ TradingFee: 250 });
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/ammcreate
 * @see https://github.com/XRPLF/xrpl.js/blob/main/packages/xrpl/src/models/transactions/AMMCreate.ts
 * @see XLS-0030 §2.2 (https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0030-automated-market-maker)
 *
 * ## Divergences
 *
 * Compared with the Class API's `AMMCreate`, this factory adds
 * guards the class skips:
 *
 * - **Account must be a valid XRPL classic (or X-) address**. The class
 *   inherits only `validateBaseTransaction`'s `isString(Account)` check.
 *   - Source: xrpl-dev-portal basic-data-types (AccountID is a classic
 *     address or X-address).
 *
 * - **Each Amount must be strictly positive** (per the docs: "This must
 *   be a positive amount"). The class only checks shape via `isAmount`,
 *   which does not check numeric well-formedness or sign.
 *   - Source: xrpl-dev-portal ammcreate.md, Fields table — `Amount` and
 *     `Amount2` rows, both Description columns end with "This must be a
 *     positive amount."
 *   - Source: XLS-0030 §2.2.1 (both Amount and Amount2 are required
 *     currency amounts that must be positive).
 *
 * - **Amount `value` must be a non-negative base-10 integer string** (the
 *   canonical XRPL Number representation). The class does not check this.
 *   - Source: xrpl.org generic Amount spec
 *     (https://xrpl.org/docs/references/protocol/data-types/basic-data-types#specifying-currency-amounts).
 *
 * - **IssuedCurrencyAmount `currency` and `issuer` shape are validated**
 *   (3-char ASCII or 40-char hex `currency`; `issuer` must be a valid
 *   XRPL account). The class delegates to `isAmount`, which only checks
 *   that the keys exist as strings.
 *   - Source: xrpl-dev-portal basic-data-types#specifying-currency-amounts.
 *
 * - **MPTAmount `mpt_issuance_id` must be a 24–48-character hex string**
 *   (192-bit issuance ID, hex-encoded). The class only checks key
 *   presence.
 *   - Source: XLS-0033 Multi-Purpose Tokens (mpt_issuance_id is a 192-bit
 *     uint; we accept 24–48 hex chars to leave slack for future
 *     widenings / leading-zero encoders).
 *
 * - **TradingFee must be an integer** (XLS-0030 §2.2.1 declares the
 *   internal type as `UINT16`). The class accepts any number ≤ 1000,
 *   including 1.5, etc.
 *   - Source: XLS-0030 §2.2.1, Fields table, `TradingFee` row, Internal
 *     Type = `UINT16`.
 *
 * - **At most one of Amount and Amount2 can be XRP**. The class does not
 *   enforce this cross-field invariant.
 *   - Source: xrpl-dev-portal ammcreate.md prose line immediately after
 *     the Fields table: "at most one of them can be XRP."
 */
import type { Amount } from '../../types/amounts.js';
import type { BasePropsFields } from '../../types/base.js';
import {
  isAccount,
  isAmount,
  isHex,
  isIssuedCurrencyAmount,
  isMPTAmount,
  isNumber,
  isString,
} from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// TradingFee is a UINT16 with a ledger-enforced range of 0–1000
// (0%–1%). (XLS-0030 §2.2.1; xrpl.js AMM_MAX_TRADING_FEE.)
const AMM_MAX_TRADING_FEE = 1000;

// Currency codes are either 3 ASCII characters or 40 hex characters.
const CURRENCY_ASCII_LENGTH = 3;
const CURRENCY_HEX_LENGTH = 40;

// MPT issuance IDs are 192-bit, hex-encoded (≤ 48 chars). We accept
// 24–48 to leave slack for future widenings / leading-zero encoders.
// (XLS-0033; matches the policy used by vaultClawback.)
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
export interface AmmCreateProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  /** The unique address of the transaction sender (LP / pool creator). */
  Account: string;
  /** The first of the two assets to fund this AMM with (positive). */
  Amount: Amount;
  /** The second of the two assets to fund this AMM with (positive). */
  Amount2: Amount;
  /**
   * The fee to charge for trades against this AMM, in 1/100,000 units
   * (1 = 0.001%). Must be in [0, 1000] inclusive. UINT16 integer.
   */
  TradingFee: number;
  /** Bit-flags for this transaction (AMMCreate defines no flags). */
  Flags?: number | undefined;
}

export interface AmmCreate extends Readonly<AmmCreateProps> {
  readonly TransactionType: 'AMMCreate';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<AmmCreateProps>): AmmCreate;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * XRPLNumber: a non-negative base-10 integer string. Matches the policy
 * used across other factories (loanSet, vaultCreate, vaultClawback).
 */
function isXrplNumber(value: unknown): value is string {
  return isString(value) && /^[0-9]+$/u.test(value);
}

/**
 * Deep-validate an Amount that must be strictly > 0 (used for
 * AMMCreate.Amount and Amount2).
 *
 * Performs:
 *  - shape check via `isAmount`
 *  - for IOU: currency length / hex check, issuer is a valid account,
 *    value is a positive base-10 integer string (rejects 0 and "-1")
 *  - for MPT: mpt_issuance_id length / hex check, value is a positive
 *    base-10 integer string
 *  - for XRP string: must be a positive base-10 integer string
 */
function validatePositiveAmount(amount: Amount, path: string): void {
  if (!isAmount(amount)) {
    throw new ValidationError(
      `AMMCreate: ${path} must be a valid Amount (XRP string, IOU, or MPT form)`,
    );
  }

  // XRP path: positive base-10 integer string.
  if (isString(amount)) {
    if (!isXrplNumber(amount)) {
      throw new ValidationError(
        `AMMCreate: ${path} (XRP) must be a non-negative base-10 integer string`,
      );
    }
    if (amount === '0') {
      throw new ValidationError(
        `AMMCreate: ${path} must be a positive amount (got "0")`,
      );
    }
    return;
  }

  // IOU path.
  if (isIssuedCurrencyAmount(amount)) {
    // currency length
    const ccy = amount.currency;
    if (
      ccy.length !== CURRENCY_ASCII_LENGTH &&
      ccy.length !== CURRENCY_HEX_LENGTH
    ) {
      throw new ValidationError(
        `AMMCreate: ${path}.currency must be ${CURRENCY_ASCII_LENGTH} ASCII characters or ${CURRENCY_HEX_LENGTH} hex characters (actual: ${ccy.length})`,
      );
    }
    if (ccy.length === CURRENCY_HEX_LENGTH && !isHex(ccy)) {
      throw new ValidationError(
        `AMMCreate: ${path}.currency (40-char form) must be hex`,
      );
    }
    // issuer
    if (!isAccount(amount.issuer)) {
      throw new ValidationError(
        `AMMCreate: ${path}.issuer must be a valid XRPL account address`,
      );
    }
    // value: positive base-10 integer string
    if (!isXrplNumber(amount.value)) {
      throw new ValidationError(
        `AMMCreate: ${path}.value must be a non-negative base-10 integer string`,
      );
    }
    if (amount.value === '0') {
      throw new ValidationError(
        `AMMCreate: ${path} must be a positive amount (got "0")`,
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
        `AMMCreate: ${path}.mpt_issuance_id must be a ${MPT_ISSUANCE_ID_MIN}-${MPT_ISSUANCE_ID_MAX} character hex string`,
      );
    }
    if (!isXrplNumber(amount.value)) {
      throw new ValidationError(
        `AMMCreate: ${path}.value must be a non-negative base-10 integer string`,
      );
    }
    if (amount.value === '0') {
      throw new ValidationError(
        `AMMCreate: ${path} must be a positive amount (got "0")`,
      );
    }
    return;
  }

  // isAmount returned true but we didn't classify it — defensive.
  throw new ValidationError(
    `AMMCreate: ${path} must be a valid Amount (XRP string, IOU, or MPT form)`,
  );
}

// ─── Factory ─────────────────────────────────────────────────────────

export function ammCreate(props: AmmCreateProps): AmmCreate {
  // ── Account ── required, must be a valid XRPL classic / X-address.
  require(props.Account, 'AMMCreate: Account is required', isAccount);

  // ── Amount / Amount2 ── required, must be a strictly positive Amount.
  validatePositiveAmount(props.Amount, 'Amount');
  validatePositiveAmount(props.Amount2, 'Amount2');

  // ── TradingFee ── required, integer, 0–1000 inclusive.
  if (props.TradingFee === undefined || props.TradingFee === null) {
    throw new ValidationError('AMMCreate: TradingFee is required');
  }
  if (!isNumber(props.TradingFee)) {
    throw new ValidationError('AMMCreate: TradingFee must be a number');
  }
  if (!Number.isInteger(props.TradingFee)) {
    throw new ValidationError(
      'AMMCreate: TradingFee must be an integer (UINT16)',
    );
  }
  if (props.TradingFee < 0 || props.TradingFee > AMM_MAX_TRADING_FEE) {
    throw new ValidationError(
      `AMMCreate: TradingFee must be between 0 and ${AMM_MAX_TRADING_FEE} inclusive (got ${props.TradingFee})`,
    );
  }

  // ── Cross-field: at most one of Amount / Amount2 may be XRP.
  // (xrpl-dev-portal ammcreate.md prose line: "at most one of them can be XRP.")
  const a1IsXrp = isString(props.Amount);
  const a2IsXrp = isString(props.Amount2);
  if (a1IsXrp && a2IsXrp) {
    throw new ValidationError(
      'AMMCreate: at most one of Amount and Amount2 can be XRP',
    );
  }

  // ─── Base transaction fields ───
  // Catches the seven shared fields this factory now accepts through
  // `BasePropsFields` but does not otherwise check: Memos, SourceTag,
  // LastLedgerSequence, AccountTxnID, NetworkID, Delegate, TicketSequence.
  // Placed AFTER the AMMCreate-specific checks so a more specific message
  // wins for a more specific mistake, and this acts as the backstop for
  // everything shared across transaction types.
  //
  // `TransactionType` is supplied because the validator checks a transaction,
  // not a props bag — the factory injects it in `buildFrozenTx` below.
  validateBaseTransaction({ TransactionType: 'AMMCreate', ...props });

  return buildFrozenTx<AmmCreateProps, AmmCreate>(
    'AMMCreate',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: AmmCreate) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: AmmCreate, overrides: Partial<AmmCreateProps>) {
        return ammCreate(mergeForWith(this, overrides));
      },
    },
  );
}