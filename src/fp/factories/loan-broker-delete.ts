/**
 * Functional LoanBrokerDelete factory — frozen-object style.
 *
 * Deletes an existing `LoanBroker` ledger entry. Only the owner of the
 * `LoanBroker` can delete it. Validation happens at construction; there
 * is no way to construct an invalid tx.
 *
 *   import { loanBrokerDelete } from 'xrpjson';
 *   const tx = loanBrokerDelete({ Account, LoanBrokerID });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Fee: '15' });
 *
 * Affected amendments:
 *   - `LendingProtocol` (base LoanBrokerDelete)
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/loanbrokerdelete
 * @see XLS-66 §3.4 (Transaction: `LoanBrokerDelete`)
 *      in `~/.mavis/docs.local/xrpl-standards/repo/XLS-0066-lending-protocol/README.md`
 *
 * ## Divergences
 *
 * The factory enforces one preclaim check that the class API
 * (the Class API's `LoanBrokerDelete`) and xrpl.js both skip:
 *
 *   What: `LoanBrokerID` must NOT be the all-zeros HASH256 value.
 *
 *   Why: XLS-66 §3.4.3.1 (Data Verification) check 1:
 *     "`LoanBrokerID` is zero. (`temINVALID`)"
 *
 *   The class API and xrpl.js's `validateLoanBrokerDelete` only call
 *   `isLedgerEntryId(tx.LoanBrokerID)`, which is satisfied by the
 *   all-zeros string (64 hex chars). The factory rejects it explicitly
 *   so an obviously bad input fails locally before submission.
 *
 *   Source citation:
 *     - XLS-66 §3.4.3.1 in
 *       `~/.mavis/docs.local/xrpl-standards/repo/XLS-0066-lending-protocol/README.md`
 *       (line 688)
 *     - xrpl.js `validateLoanBrokerDelete` in
 *       `~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/loanBrokerDelete.ts`
 *       (lines 31–41) — only `isLedgerEntryId`, no zero check.
 *
 * Note: The factory also validates `Account` as a classic/X-address
 * (consistent with other fp factories). The class API does not check
 * `Account` here, only `LoanBrokerID` — this divergence is identical
 * across all four loan factories and is documented per-factory.
 */
import type { BasePropsFields } from '../../types/base.js';
import { isAccount, isHex, isString } from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// LoanBrokerID is a HASH256 = 32 bytes = 64 hex chars.
const LOAN_BROKER_ID_LENGTH = 64;
// All-zeros HASH256 is reserved / malformed per XLS-66 §3.4.3.1.
const LOAN_BROKER_ID_ZERO =
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
export interface LoanBrokerDeleteProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  /** The unique address of the transaction sender (must be `LoanBroker.Owner`). */
  Account: string;
  /** The ID of the `LoanBroker` ledger entry to delete. 64-char hex, non-zero. */
  LoanBrokerID: string;
  /** Bit-flags for this transaction. The spec defines none — must be 0. */
  Flags?: number | undefined;
}

export interface LoanBrokerDelete extends Readonly<LoanBrokerDeleteProps> {
  readonly TransactionType: 'LoanBrokerDelete';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<LoanBrokerDeleteProps>): LoanBrokerDelete;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function loanBrokerDelete(props: LoanBrokerDeleteProps): LoanBrokerDelete {
  // ── Account ── required, must be a valid XRPL classic or X-address.
  require(
    props.Account,
    'LoanBrokerDelete: Account is required',
    isAccount,
  );

  // ── LoanBrokerID ── required, 64-char hex AND non-zero.
  if (
    !isString(props.LoanBrokerID) ||
    !isHex(props.LoanBrokerID) ||
    props.LoanBrokerID.length !== LOAN_BROKER_ID_LENGTH
  ) {
    throw new ValidationError(
      'LoanBrokerDelete: LoanBrokerID must be a 64-character hex string',
    );
  }
  if (props.LoanBrokerID === LOAN_BROKER_ID_ZERO) {
    throw new ValidationError(
      'LoanBrokerDelete: LoanBrokerID must not be the all-zeros HASH256 value',
    );
  }

  // ── Flags ── spec defines no flags for LoanBrokerDelete. The example
  // JSON sets 0, and rippled has no tfLoanBrokerDelete* bitmask. Pass-
  // through only; we don't reject non-zero because the spec leaves the
  // field open-ended and callers may pass bit-flags reserved for future
  // amendments.
  // ─── Base transaction fields ───
  // Catches the seven shared fields this factory now accepts through
  // `BasePropsFields` but does not otherwise check: Memos, SourceTag,
  // LastLedgerSequence, AccountTxnID, NetworkID, Delegate, TicketSequence.
  // Placed AFTER the LoanBrokerDelete-specific checks so a more specific
  // message wins for a more specific mistake, and this acts as the backstop for
  // everything shared across transaction types.
  //
  // `TransactionType` is supplied because the validator checks a transaction,
  // not a props bag — the factory injects it in `buildFrozenTx` below.
  validateBaseTransaction({ TransactionType: 'LoanBrokerDelete', ...props });

  return buildFrozenTx<LoanBrokerDeleteProps, LoanBrokerDelete>(
    'LoanBrokerDelete',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: LoanBrokerDelete) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: LoanBrokerDelete,
        overrides: Partial<LoanBrokerDeleteProps>,
      ) {
        return loanBrokerDelete(mergeForWith(this, overrides));
      },
    },
  );
}