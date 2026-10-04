/**
 * Functional DIDDelete factory — frozen-object style.
 *
 * Deletes the sender's Decentralized Identifier (DID) ledger entry.
 * Per XLS-40 §5.3 the only required field is `Account`; the transaction
 * otherwise uses only the common base transaction fields. The ledger
 * rejects the deletion with `tecNO_ENTRY` if the account does not own a
 * DID, but that is a runtime check (not locally checkable here).
 * Validation happens at construction; there is no way to construct an
 * invalid tx from the fields it models.
 *
 *   import { didDelete } from 'xrpjson';
 *   const tx = didDelete({ Account });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Fee: '12' });
 *
 * Affected amendments:
 *   - `DID` — base DIDDelete (XLS-40).
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/diddelete
 * @see XLS-0040 §5.3 (DIDDelete Transaction)
 *      in `~/.mavis/docs.local/xrpl-standards/repo/XLS-0040-decentralized-identity/README.md`
 *
 * ## Divergences
 *
 * The class-based API at the Class API's `DIDDelete` and xrpl.js's
 * `validateDIDDelete` both skip three rules that the canonical sources
 * require. The factory fills them:
 *
 *   1. `Account` is validated as a classic/X-address via `isAccount`.
 *      The class inherits its `validate()` from `Transaction.validate()`
 *      and adds no check of its own — a malformed Account passes class
 *      validation and only fails at the ledger with `temINVALID_ACCOUNT`.
 *      The factory validates Account at construction time, consistent
 *      with every other fp factory (`oracle-delete`, `loan-delete`,
 *      `account-delete`).
 *      Source: xrpl.js `validateBaseTransaction`
 *              (`~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/common.ts:987`)
 *              — only checks `isString(Account)`, no format check.
 *      Source: local `isAccount` at `src/validation/helpers.ts:55–60`.
 *      Source: XLS-0040 §5.3.2 (`Account` Internal Type: `AccountID`).
 *
 *   2. `Flags` is exposed and validated.
 *      The class has `ASSIGNABLE_FIELDS = []`, so callers using the
 *      class API cannot set `Flags` at all. xrpl.js's
 *      `validateDIDDelete` delegates to `validateBaseTransaction`,
 *      which does NOT validate `Flags` at all — meaning any
 *      non-negative integer, NaN, fractional value, or out-of-range
 *      value passes xrpl.js's runtime check (see
 *      `~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/common.ts:964`
 *      — Flags is absent from the optional-field list).
 *      XLS-40 §5.3 defines no per-transaction flags for DIDDelete.
 *      The only valid flag bits are the two global / "universal" flags
 *      declared in ripple-binary-codec:
 *        - `tfFullyCanonicalSig` = 0x80000000 (2147483648)
 *        - `tfInnerBatchTxn`     = 0x40000000 (1073741824)
 *      The factory accepts `Flags` as an optional `number`, requires
 *      it to be a non-negative integer, and rejects any value with
 *      bits set outside that valid mask.
 *      Source: ripple-binary-codec `definitions.json`
 *              (`~/.mavis/docs.local/xrpl.js/repo/packages/ripple-binary-codec/src/enums/definitions.json`)
 *              lines 5318–5321 — universal flag namespace
 *              (`tfFullyCanonicalSig`, `tfInnerBatchTxn`).
 *      Source: xrpl.js `validateBaseTransaction`
 *              (`~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/common.ts:964–1037`)
 *              — Flags is not validated.
 *      Source: XLS-0040 §5.3.2 — DIDDelete defines no per-tx flags.
 *
 *   3. `Flags` integer-ness is enforced.
 *      Even where xrpl.js or the class lets a numeric `Flags` through,
 *      neither rejects NaN, ±Infinity, fractional values, or negatives.
 *      `Object.isFrozen` of a frozen tx would still let a poisoned
 *      numeric propagate to the ledger, where it would be serialized
 *      as 0 (silent data loss). The factory rejects non-finite or
 *      non-integer values up front.
 *      Source: xrpl.js `isNumber` (`common.ts:209`) — `typeof === 'number'`
 *              with no integer / finite check.
 */
import type { BasePropsFields } from '../../types/base.js';
import { isAccount, isNumber } from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// Universal / global flag bits defined in ripple-binary-codec. DIDDelete
// defines no per-tx flags (XLS-40 §5.3.2), so the only bits it may set
// are these two.
const TF_FULLY_CANONICAL_SIG = 0x80000000; // 2147483648
const TF_INNER_BATCH_TXN = 0x40000000; // 1073741824
const VALID_DID_DELETE_FLAGS = TF_FULLY_CANONICAL_SIG | TF_INNER_BATCH_TXN;

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
export interface DIDDeleteProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  /** The unique address of the transaction sender. Must own a DID. */
  Account: string;
  /**
   * Optional bit-flags. DIDDelete defines no per-tx flags; only the
   * two global flags `tfFullyCanonicalSig` (0x80000000) and
   * `tfInnerBatchTxn` (0x40000000) are valid.
   */
  Flags?: number | undefined;
}

export interface DIDDelete extends Readonly<DIDDeleteProps> {
  readonly TransactionType: 'DIDDelete';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<DIDDeleteProps>): DIDDelete;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function didDelete(props: DIDDeleteProps): DIDDelete {
  // ── Account ── required, must be a valid XRPL classic or X-address.
  require(props.Account, 'DIDDelete: Account is required', isAccount);

  // ── Flags ── optional, but if present must be a non-negative integer
  //   whose only set bits are in the universal flag mask.
  if (props.Flags !== undefined) {
    if (
      !isNumber(props.Flags) ||
      !Number.isFinite(props.Flags) ||
      !Number.isInteger(props.Flags) ||
      props.Flags < 0
    ) {
      throw new ValidationError(
        'DIDDelete: Flags must be a non-negative integer (tfFullyCanonicalSig | tfInnerBatchTxn)',
      );
    }
    if ((props.Flags & ~VALID_DID_DELETE_FLAGS) !== 0) {
      throw new ValidationError(
        `DIDDelete: Flags contains invalid bits (only tfFullyCanonicalSig=0x${TF_FULLY_CANONICAL_SIG.toString(16)} and tfInnerBatchTxn=0x${TF_INNER_BATCH_TXN.toString(16)} are allowed)`,
      );
    }
  }

  // ── Base transaction fields ──
  // Catches the seven shared fields this factory now accepts through
  // `BasePropsFields` but does not otherwise check: Memos, SourceTag,
  // LastLedgerSequence, AccountTxnID, NetworkID, Delegate, TicketSequence.
  // Placed AFTER the DIDDelete-specific checks so a more specific message
  // wins for a more specific mistake.
  validateBaseTransaction({ TransactionType: 'DIDDelete', ...props });

  return buildFrozenTx<DIDDeleteProps, DIDDelete>(
    'DIDDelete',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: DIDDelete) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: DIDDelete, overrides: Partial<DIDDeleteProps>) {
        return didDelete(mergeForWith(this, overrides));
      },
    },
  );
}