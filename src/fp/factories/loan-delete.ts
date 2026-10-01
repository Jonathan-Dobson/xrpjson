/**
 * Functional LoanDelete factory — frozen-object style.
 *
 * Deletes an existing `Loan` ledger entry. Only the LoanBroker owner or
 * the Borrower can submit a LoanDelete (the ledger enforces this; not
 * locally checkable here). Validation happens at construction; there is
 * no way to construct an invalid tx.
 *
 *   import { loanDelete } from 'xrpjson';
 *   const tx = loanDelete({ Account, LoanID });
 *   const j = tx.toJSON();
 *
 * LoanDelete defines NO per-transaction Flags per XLS-66 §3.9; this
 * factory therefore omits a `Flags` field entirely.
 *
 * Affected amendments:
 *   - `LendingProtocol` (base LoanDelete)
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/loandelete
 * @see XLS-66 §3.9 (Transaction: `LoanDelete`)
 *
 * ## Divergences
 *
 * What: `LoanID` is rejected when it is the all-zeros HASH256 value.
 *
 * Why: XLS-66 §3.9.3.1 check 1: "`LoanID` is zero. (`temINVALID`)".
 *      xrpl-dev-portal `loandelete.md` error table: "`temINVALID` — The
 *      `LoanID` is missing or set to zero."
 *
 * The class API (the Class API's `LoanDelete`) only checks
 * `isHex` + 64-char length, which the all-zeros string satisfies.
 * xrpl.js's `validateLoanDelete` (in `packages/xrpl/src/models/
 * transactions/loanDelete.ts`) likewise only calls `isLedgerEntryId`,
 * which also accepts the all-zeros string.
 *
 * Source citation:
 *   - XLS-66 §3.9.3.1 in
 *     `~/.mavis/docs.local/xrpl-standards/repo/XLS-0066-lending-protocol/README.md`
 *     (line 1203)
 *   - xrpl-dev-portal: `~/.mavis/docs.local/xrpl-dev-portal/repo/docs/
 *     references/protocol/transactions/types/loandelete.md` (line 48)
 *   - xrpl.js: `~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/
 *     models/transactions/loanDelete.ts` (lines 36–40 — only checks
 *     `isLedgerEntryId`, no zero guard)
 *
 * What: `Account` is validated as a well-formed XRPL classic/X-address.
 *
 * Why: The class API delegates Account validation to its `LoanTransaction`
 * base class. We re-implement it explicitly here so the factory is
 * self-contained and a malformed Account is caught at construction time
 * rather than during a separate `.validate()` step.
 *
 * Source citation:
 *   - xrpl.js `validateBaseTransaction` (called transitively by
 *     `validateLoanDelete`) — checks Account via `isAccount`.
 *   - Local helper `isAccount` at `src/validation/helpers.ts` lines 55–60.
 */
import { isAccount, isLedgerEntryId } from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// All-zeros HASH256 is reserved / malformed per spec.
const LOAN_ID_ZERO =
  '0000000000000000000000000000000000000000000000000000000000000000';

// ─── Public types ────────────────────────────────────────────────────

export interface LoanDeleteProps {
  /** The unique address of the transaction sender. */
  Account: string;
  /** The ID of the `Loan` ledger entry to delete. 64-char hex. */
  LoanID: string;
  /** Fee in XRP (drops), base-10 integer string. */
  Fee?: string | undefined;
  /** Account sequence number. */
  Sequence?: number | undefined;
}

export interface LoanDelete extends Readonly<LoanDeleteProps> {
  readonly TransactionType: 'LoanDelete';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<LoanDeleteProps>): LoanDelete;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function loanDelete(props: LoanDeleteProps): LoanDelete {
  // ── Account ── required, must be a valid XRPL classic/X-address.
  require(props.Account, 'LoanDelete: Account is required', isAccount);

  // ── LoanID ── required, 64-char hex AND non-zero.
  if (!isLedgerEntryId(props.LoanID)) {
    throw new ValidationError(
      'LoanDelete: LoanID must be a 64-character hex string',
    );
  }
  if (props.LoanID === LOAN_ID_ZERO) {
    throw new ValidationError(
      'LoanDelete: LoanID must not be the all-zeros HASH256 value',
    );
  }

  return buildFrozenTx<LoanDeleteProps, LoanDelete>(
    'LoanDelete',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: LoanDelete) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: LoanDelete, overrides: Partial<LoanDeleteProps>) {
        return loanDelete(mergeForWith(this, overrides));
      },
    },
  );
}
