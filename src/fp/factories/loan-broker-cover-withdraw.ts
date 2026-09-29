/**
 * Functional LoanBrokerCoverWithdraw factory — frozen-object style.
 *
 * Withdraws First-Loss Capital from a `LoanBroker` ledger entry. Validation
 * happens at construction; there is no way to construct an invalid tx.
 *
 *   import { loanBrokerCoverWithdraw } from 'xrplt/fp';
 *   const tx = loanBrokerCoverWithdraw({
 *     Account: 'rMX...',          // LoanBroker.Owner
 *     LoanBrokerID: 'A947...614',
 *     Amount: '5000000',
 *     Destination: 'rPT1...',     // optional
 *     DestinationTag: 42,         // optional
 *     CredentialIDs: ['A7B7...'], // optional
 *   });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Destination: 'rXY...' });
 *
 * Affected amendments:
 *   - `LendingProtocolV1_1` (base LoanBrokerCoverWithdraw)
 *   - `Credentials` (CredentialIDs for permissioned-domain authorization)
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/loanbrokercoverwithdraw
 * @see https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0066-lending-protocol
 *
 * ## Divergences
 *
 * Compared with `src/transactions/loan-broker-cover-withdraw.ts`, this
 * factory enforces preclaim guards the class API skips:
 *
 * 1. **`LoanBrokerID` must not be the all-zeros HASH256 value.**
 *    Source: XLS-66 §3.6.3.1 check 1 — "`LoanBrokerID` is zero
 *    (`temINVALID`)" (`~/.mavis/docs.local/xrpl-standards/repo/
 *    XLS-0066-lending-protocol/README.md` line 827). The class only
 *    checks `isString && isHex && length === 64`, which the all-zeros
 *    string satisfies. xrpl.js `validateLoanBrokerCoverWithdraw` only
 *    checks `isLedgerEntryId`, which also accepts the all-zeros string
 *    (`~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/
 *    transactions/loanBrokerCoverWithdraw.ts` lines 77–81).
 *
 * 2. **`Amount` must be strictly positive (non-zero, non-negative).**
 *    Source: XLS-66 §3.6.3.1 check 2 — "`Amount <= 0` (`temBAD_AMOUNT`)"
 *    (line 828). The class only delegates to `isAmount`, which accepts
 *    any numeric string including `'0'` and `'-1'`. The local helper
 *    `validation/helpers.isAmount` has the same gap. xrpl.js `isAmount`
 *    likewise does not check sign. The factory adds an
 *    `isPositiveAmount` helper covering all three Amount forms
 *    (XRP drops, IssuedCurrency `value`, MPT `value`).
 *
 * 3. **`Destination` must not be the all-zeros AccountID.**
 *    Source: XLS-66 §3.6.3.1 check 3 — "`Destination` is specified and is
 *    zero (`temMALFORMED`)" (line 829). The class calls `isAccount` on
 *    `Destination`, which would reject the all-zeros 40-char hex string
 *    because it lacks the `r…` / `X…` prefix. The factory relies on the
 *    same implicit gate but documents it as a divergence so the behaviour
 *    is auditable.
 *
 * 4. **`CredentialIDs` must have length in [1, MAX_AUTHORIZED_CREDENTIALS].**
 *    Source: xrpl.js `MAX_AUTHORIZED_CREDENTIALS = 8` for non-DomainSet
 *    transactions (`~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/
 *    models/transactions/common.ts:28`), and `validateCredentialsList`
 *    rejects both empty arrays and arrays that exceed `maxCredentials`
 *    (`loanBrokerCoverWithdraw.ts` lines 70–75; `common.ts:1120-1128`).
 *    The class only validates the shape of each entry, not the array
 *    length bounds.
 */
import type { Amount, MPTAmount } from '../../types/amounts.js';
import {
  isAccount,
  isAmount,
  isArray,
  isHex,
  isNumber,
  isString,
} from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// HASH256 in hex is 64 characters. (XLS-66 §3.6.1: LoanBrokerID is HASH256.)
const HASH256_HEX_LENGTH = 64;

// All-zeros HASH256 is reserved / malformed per spec.
const LOAN_BROKER_ID_ZERO =
  '0000000000000000000000000000000000000000000000000000000000000000';

// Credential IDs are 64-char hex (same as ledger entry IDs / HASH256).
const CREDENTIAL_ID_LENGTH = 64;

// xrpl.js caps non-DomainSet credential arrays at 8 entries.
const MAX_CREDENTIAL_IDS = 8;

// ─── Public types ────────────────────────────────────────────────────

export interface LoanBrokerCoverWithdrawProps {
  /** The unique address of the transaction sender (`LoanBroker.Owner`). */
  Account: string;
  /** The ID of the `LoanBroker` to withdraw First-Loss Capital from. 64-char hex. */
  LoanBrokerID: string;
  /** First-Loss Capital amount to withdraw. XRP drops / trust line / MPT. */
  Amount: Amount | MPTAmount;
  /** Optional destination account. Must be able to receive the asset. */
  Destination?: string | undefined;
  /** Optional destination tag. UINT32. */
  DestinationTag?: number | undefined;
  /**
   * Optional array of credential IDs authorizing the withdrawal when the
   * destination is gated by a permissioned domain (Credentials amendment).
   */
  CredentialIDs?: string[] | undefined;
  /** LoanBrokerCoverWithdraw has no defined flags; permitted for base-tx parity. */
  Flags?: number | undefined;
  Fee?: string | undefined;
  Sequence?: number | undefined;
}

export interface LoanBrokerCoverWithdraw
  extends Readonly<LoanBrokerCoverWithdrawProps> {
  readonly TransactionType: 'LoanBrokerCoverWithdraw';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(
    overrides: Partial<LoanBrokerCoverWithdrawProps>,
  ): LoanBrokerCoverWithdraw;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Per XLS-66 §3.6.3.1 check 2: "`Amount <= 0` (`temBAD_AMOUNT`)".
 * Validates the sign of an Amount in all three accepted forms.
 *
 *   - XRP form: a decimal-string of drops (e.g. "1000000").
 *   - IssuedCurrency form: object with a `value` sub-string.
 *   - MPT form: object with a `value` sub-string.
 *
 * Accepts the canonical scientific mantissa form (`1.5e3`) so this stays
 * compatible with the XRPL serialization layer. Negative or zero
 * mantissas are rejected.
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

export function loanBrokerCoverWithdraw(
  props: LoanBrokerCoverWithdrawProps,
): LoanBrokerCoverWithdraw {
  // ── Account ── required, must be a valid XRPL classic / X-address.
  require(
    props.Account,
    'LoanBrokerCoverWithdraw: Account is required',
    isAccount,
  );

  // ── LoanBrokerID ── required, 64-char hex (HASH256) AND non-zero.
  if (
    !isString(props.LoanBrokerID) ||
    !isHex(props.LoanBrokerID) ||
    props.LoanBrokerID.length !== HASH256_HEX_LENGTH
  ) {
    throw new ValidationError(
      'LoanBrokerCoverWithdraw: LoanBrokerID must be a 64-character hex string (HASH256)',
    );
  }
  if (props.LoanBrokerID === LOAN_BROKER_ID_ZERO) {
    throw new ValidationError(
      'LoanBrokerCoverWithdraw: LoanBrokerID must not be the all-zeros HASH256 value',
    );
  }

  // ── Amount ── required, must be a valid Amount AND strictly positive.
  if (!isAmount(props.Amount)) {
    throw new ValidationError(
      'LoanBrokerCoverWithdraw: Amount must be a valid Amount (XRP / trust line / MPT form)',
    );
  }
  if (!isPositiveAmount(props.Amount)) {
    throw new ValidationError(
      'LoanBrokerCoverWithdraw: Amount must be strictly positive (non-zero, non-negative)',
    );
  }

  // ── Destination ── optional, but if provided must be a valid XRPL
  //    account. The XLS-66 §3.6.3.1 check 3 "Destination is zero" case is
  //    covered implicitly: the all-zeros 40-char hex string fails
  //    `isAccount`, which requires a classic `r…` or X-address prefix.
  if (props.Destination !== undefined && !isAccount(props.Destination)) {
    throw new ValidationError(
      'LoanBrokerCoverWithdraw: Destination must be a valid XRPL account address',
    );
  }

  // ── DestinationTag ── optional, must be a number if present.
  if (props.DestinationTag !== undefined && !isNumber(props.DestinationTag)) {
    throw new ValidationError(
      'LoanBrokerCoverWithdraw: DestinationTag must be a number',
    );
  }

  // ── CredentialIDs ── optional array, but bounds + entry-shape enforced
  //    when present. Per xrpl.js: length in [1, MAX_AUTHORIZED_CREDENTIALS];
  //    each entry is a 64-char hex string.
  if (props.CredentialIDs !== undefined) {
    if (!isArray(props.CredentialIDs)) {
      throw new ValidationError(
        'LoanBrokerCoverWithdraw: CredentialIDs must be an array of credential ID strings',
      );
    }
    if (props.CredentialIDs.length === 0) {
      throw new ValidationError(
        'LoanBrokerCoverWithdraw: CredentialIDs must not be an empty array',
      );
    }
    if (props.CredentialIDs.length > MAX_CREDENTIAL_IDS) {
      throw new ValidationError(
        `LoanBrokerCoverWithdraw: CredentialIDs length cannot exceed ${MAX_CREDENTIAL_IDS} elements (actual: ${props.CredentialIDs.length})`,
      );
    }
    for (let i = 0; i < props.CredentialIDs.length; i++) {
      const cid = props.CredentialIDs[i];
      if (
        !isString(cid) ||
        !isHex(cid) ||
        cid.length !== CREDENTIAL_ID_LENGTH
      ) {
        throw new ValidationError(
          `LoanBrokerCoverWithdraw: CredentialIDs[${i}] must be a ${CREDENTIAL_ID_LENGTH}-character hex string`,
        );
      }
    }
  }

  return buildFrozenTx<
    LoanBrokerCoverWithdrawProps,
    LoanBrokerCoverWithdraw
  >(
    'LoanBrokerCoverWithdraw',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: LoanBrokerCoverWithdraw) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: LoanBrokerCoverWithdraw,
        overrides: Partial<LoanBrokerCoverWithdrawProps>,
      ) {
        return loanBrokerCoverWithdraw(mergeForWith(this, overrides));
      },
    },
  );
}
