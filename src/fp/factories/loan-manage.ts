/**
 * Functional LoanManage factory — frozen-object style.
 *
 * Modifies an existing `Loan` ledger entry (default, impairment, or
 * unimpairment). Validation happens at construction; there is no way to
 * construct an invalid tx.
 *
 *   import { loanManage } from 'xrplt/fp';
 *   const tx = loanManage({ Account, LoanID });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Flags: 0x00020000 }); // tfLoanImpair
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/loanmanage
 * @see XLS-66 §3.10 (Transaction: `LoanManage`)
 *
 * ## Divergences
 *
 * What: All three `LoanManage` action flags (`tfLoanDefault`,
 * `tfLoanImpair`, `tfLoanUnimpair`) are enforced as mutually exclusive —
 * any pair raises a `ValidationError`.
 *
 * Why: XLS-66 §3.10.4.1 Data Verification states:
 *   "More than one of `tfLoanDefault`, `tfLoanImpair`, or `tfLoanUnimpair`
 *    flags are set (flags are mutually exclusive). (`temINVALID_FLAG`)"
 *
 * The class source (`src/transactions/loan-manage.ts`) and xrpl.js's
 * `validateLoanManage` both only check the `tfLoanImpair` + `tfLoanUnimpair`
 * pair, missing the `tfLoanDefault` combinations.
 *
 * Source citation:
 *   - XLS-66 §3.10.2 + §3.10.4.1 in
 *     `~/.mavis/docs.local/xrpl-standards/repo/XLS-0066-lending-protocol/README.md`
 *     (lines 1249, 1266)
 *   - xrpl.js: `~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/loanManage.ts`
 *     (lines 98-105) — only Impair+Unimpair
 *
 * What: When `Flags` is provided as the `LoanManageFlagsInterface` (object
 * form with boolean fields), the factory translates it into a numeric
 * flag bitmask before applying mutual-exclusivity checks.
 *
 * Why: xrpl.js does this translation inline (see `validateLoanManage`),
 * then enforces the same bitmask rules. We mirror that behavior so users
 * can pass either numeric or object-form flags uniformly.
 *
 * Source citation:
 *   - xrpl.js `validateLoanManage` lines 86-96.
 */
import type { LoanManageFlagsInterface } from '../../types/flags.js';
import { isAccount, isLedgerEntryId } from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

const TF_LOAN_DEFAULT = 0x00010000;
const TF_LOAN_IMPAIR = 0x00020000;
const TF_LOAN_UNIMPAIR = 0x00040000;

// ─── Public types ────────────────────────────────────────────────────

export interface LoanManageProps {
  /** The unique address of the transaction sender (must be `LoanBroker.Owner`). */
  Account: string;
  /** The ID of the `Loan` ledger entry to manage. 64-char hex. */
  LoanID: string;
  /**
   * Bit-flags for this transaction. Numeric form (any of
   * `tfLoanDefault` | `tfLoanImpair` | `tfLoanUnimpair`) or the
   * boolean-map `LoanManageFlagsInterface`.
   */
  Flags?: number | LoanManageFlagsInterface | undefined;
  /** Fee in XRP (drops), base-10 integer string. */
  Fee?: string | undefined;
  /** Account sequence number. */
  Sequence?: number | undefined;
}

export interface LoanManage extends Readonly<LoanManageProps> {
  readonly TransactionType: 'LoanManage';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<LoanManageProps>): LoanManage;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Translate the boolean-map `LoanManageFlagsInterface` into the numeric
 * bitmask form. Numeric `Flags` pass through unchanged.
 */
function flagsToNumber(
  flags: number | LoanManageFlagsInterface | undefined,
): number {
  if (flags === undefined) return 0;
  if (typeof flags === 'number') return flags;
  let n = 0;
  if (flags.tfLoanDefault) n |= TF_LOAN_DEFAULT;
  if (flags.tfLoanImpair) n |= TF_LOAN_IMPAIR;
  if (flags.tfLoanUnimpair) n |= TF_LOAN_UNIMPAIR;
  return n;
}

/**
 * Count how many of the three action flags are present.
 * `0` = no action (valid), `1` = single action (valid), `>1` = invalid.
 */
function countActionFlags(numericFlags: number): number {
  let n = 0;
  if ((numericFlags & TF_LOAN_DEFAULT) === TF_LOAN_DEFAULT) n++;
  if ((numericFlags & TF_LOAN_IMPAIR) === TF_LOAN_IMPAIR) n++;
  if ((numericFlags & TF_LOAN_UNIMPAIR) === TF_LOAN_UNIMPAIR) n++;
  return n;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function loanManage(props: LoanManageProps): LoanManage {
  // ── Account ── required, must be a valid XRPL classic address.
  require(props.Account, 'LoanManage: Account is required', isAccount);

  // ── LoanID ── required, 64-char hex (Hash256 ledger entry ID).
  if (!isLedgerEntryId(props.LoanID)) {
    throw new ValidationError(
      'LoanManage: LoanID must be a 64-character hex string',
    );
  }

  // ── Flags ── translate + enforce 3-way mutual exclusivity.
  // XLS-66 §3.10.4.1: at most one of tfLoanDefault / tfLoanImpair /
  // tfLoanUnimpair may be set. Unknown keys in object-form Flags are
  // silently ignored by `flagsToNumber`; we do not error on them so
  // future global flags remain forward-compatible.
  const numericFlags = flagsToNumber(props.Flags);
  const actionCount = countActionFlags(numericFlags);
  if (actionCount > 1) {
    throw new ValidationError(
      'LoanManage: tfLoanDefault, tfLoanImpair, and tfLoanUnimpair are mutually exclusive; only one may be set',
    );
  }

  return buildFrozenTx<LoanManageProps, LoanManage>(
    'LoanManage',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: LoanManage) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: LoanManage, overrides: Partial<LoanManageProps>) {
        return loanManage(mergeForWith(this, overrides));
      },
    },
  );
}
