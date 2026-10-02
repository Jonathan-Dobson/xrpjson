/**
 * Functional CheckCancel factory — frozen-object style.
 *
 * Cancels an unredeemed Check, removing it from the ledger without
 * sending any money. The source or the destination of the Check can
 * cancel it at any time; once expired, any address can cancel it.
 * Validation happens at construction; there is no way to construct
 * an invalid tx.
 *
 *   import { checkCancel } from 'xrpjson';
 *   const tx = checkCancel({ Account, CheckID });
 *   const j = tx.toJSON();
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/checkcancel
 * @see https://github.com/XRPLF/xrpl.js/blob/main/packages/xrpl/src/models/transactions/CheckCancel.ts
 *
 * Affected amendments:
 *   - `Checks`           — base CheckCancel.
 *   - `fixCleanup3_3_0`  — moves the all-zeros CheckID rejection from
 *                          `tecNO_ENTRY` (a post-ledger lookup failure)
 *                          to `temMALFORMED` (a preclaim rejection).
 *                          The factory enforces this preclaim form.
 *
 * ## Divergences
 *
 * Compared with the Class API's `CheckCancel`, this factory adds
 * two preclaim guards the class skips (or that xrpl.js / xrpl.org
 * mandate but the class omits):
 *
 * - **`CheckID` must be a 64-character hexadecimal string (UInt256).**
 *   xrpl.org `checkcancel.md` line 34 explicitly states
 *   "`CheckID` | String | UInt256 … as a 64-character hexadecimal
 *   string." A UInt256 in hex is exactly 64 characters. xrpl.js's
 *   `validateCheckCancel` (lines 31–33) only checks
 *   `typeof tx.CheckID !== 'string'`, accepting any non-string value
 *   and any string of any length. The class inherits the same laxness
 *   (`isString(this.CheckID)`). The factory enforces 64-char hex.
 *   - Source: xrpl.org `checkcancel.md` line 34 (`UInt256`,
 *     "64-character hexadecimal string").
 *   - Source: xrpl.js `checkCancel.ts` lines 31–33 (lax `typeof`
 *     check; no length or hex validation).
 *   - Cross-ref: rippled parses `CheckID` as `uint256` in
 *     `CheckCancel.cpp`; uint256 is 32 bytes = 64 hex chars.
 *
 * - **All-zeros `CheckID` is rejected (`fixCleanup3_3_0` amendment).**
 *   xrpl.org `checkcancel.md` Error Cases line 38 states: "If the
 *   `CheckID` is an all-zero value, the transaction fails with the
 *   result `temMALFORMED`. Previously, the transaction would fail
 *   with the result `tecNO_ENTRY`." This is a preclaim (malformed)
 *   failure, not a post-ledger lookup failure — the factory catches
 *   it at construction. The class does not guard against this case at
 *   all (any 64-char hex passes `isString`).
 *   - Source: xrpl.org `checkcancel.md` line 38 (`temMALFORMED` for
 *     all-zero CheckID; `fixCleanup3_3_0`).
 *   - Source: rippled `CheckCancel.cpp` `preflight` (gates the
 *     zero-check on the `fixCleanup3_3_0` amendment; preclaim
 *     rejection).
 *   - Cross-ref: same HASH256 zero-rejection pattern is used by
 *     `check-cash.ts`, `nftoken-burn.ts`, `nftoken-modify.ts` for
 *     their respective IDs.
 *
 * - **`Flags` accepted for parity with the base transaction shape.**
 *   CheckCancel itself defines no transaction-specific flags; only
 *   `tfFullyCanonicalSig` (global) is normally meaningful. The class
 *   does not declare a `Flags` field at all. We accept a numeric
 *   bitmask for parity with `check-cash.ts` and `nftoken-burn.ts`.
 *   This is a permissive addition, not a tightening — callers who
 *   pass a non-zero Flags get the value stored verbatim.
 */
import type { BaseTransactionFields } from '../../types/base.js';
import { isAccount, isHex, isString } from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// UInt256 hex length: 32 bytes = 64 hex chars.
// (xrpl.org checkcancel.md line 34: "as a 64-character hexadecimal
// string".)
const CHECK_ID_HEX_LENGTH = 64;

// All-zeros HASH256 is reserved / malformed per `fixCleanup3_3_0`.
// (xrpl.org checkcancel.md line 38: temMALFORMED for the zero
// CheckID.)
const CHECK_ID_ZERO =
  '0000000000000000000000000000000000000000000000000000000000000000';

// ─── Public types ────────────────────────────────────────────────────

export interface CheckCancelProps extends Omit<
  BaseTransactionFields,
  'TransactionType' | 'Flags'
> {
  /** The transaction submitter (the Check source, destination, or any
   *  address if the Check has expired). */
  Account: string;
  /** The ID of the Check ledger object to cancel (UInt256, 64-char hex,
   *  must not be all-zeros). */
  CheckID: string;
  /** Bit-flags for this transaction. CheckCancel has no defined
   *  flags; only `tfFullyCanonicalSig` (global) is meaningful. Accepted
   *  for parity with the base tx shape. */
  Flags?: number | undefined;
}

export interface CheckCancel extends Readonly<CheckCancelProps> {
  readonly TransactionType: 'CheckCancel';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<CheckCancelProps>): CheckCancel;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function checkCancel(props: CheckCancelProps): CheckCancel {
  // ── Account ── required, must be a valid XRPL classic or X-address.
  require(props.Account, 'CheckCancel: Account is required', isAccount);

  // ── CheckID ── required, 64-char hex (UInt256) AND non-zero.
  if (!isString(props.CheckID)) {
    throw new ValidationError(
      'CheckCancel: CheckID is required and must be a string',
    );
  }
  if (!isHex(props.CheckID)) {
    throw new ValidationError(
      'CheckCancel: CheckID must be a hex-encoded string',
    );
  }
  if (props.CheckID.length !== CHECK_ID_HEX_LENGTH) {
    throw new ValidationError(
      `CheckCancel: CheckID must be exactly ${CHECK_ID_HEX_LENGTH} hex characters (UInt256)`,
    );
  }
  if (props.CheckID === CHECK_ID_ZERO) {
    throw new ValidationError(
      'CheckCancel: CheckID must not be the all-zeros HASH256 value (xrpl.org fixCleanup3_3_0: temMALFORMED)',
    );
  }

  // ─── Base transaction fields ───
  // Validates the fields this factory inherits from BaseTransactionFields
  // but does not otherwise check. Placed AFTER the CheckCancel-specific
  // checks so a more specific mistake gets a more specific message.
  // `TransactionType` is supplied because the validator checks a built
  // transaction, not a props bag — the factory injects it below.
  validateBaseTransaction({ TransactionType: 'CheckCancel', ...props });

  return buildFrozenTx<CheckCancelProps, CheckCancel>(
    'CheckCancel',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: CheckCancel) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: CheckCancel, overrides: Partial<CheckCancelProps>) {
        return checkCancel(mergeForWith(this, overrides));
      },
    },
  );
}