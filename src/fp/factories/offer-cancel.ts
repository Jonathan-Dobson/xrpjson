/**
 * Functional OfferCancel factory — frozen-object style.
 *
 * Cancels an existing offer on the DEX. Validation happens at
 * construction; there is no way to construct an invalid tx from the fields it
 * models.
 *
 *   import { offerCancel } from 'xrpjson';
 *   const tx = offerCancel({ Account, OfferSequence: 6 });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ OfferSequence: 7 });
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/offercancel
 * @see https://github.com/XRPLF/xrpl.js/blob/main/packages/xrpl/src/models/transactions/offerCancel.ts
 *
 * ## Divergences
 *
 * Compared with the Class API's `OfferCancel`, this factory adds
 * guards the class skips and tightens the spec compliance:
 *
 * - **`OfferSequence` must be a UInt32.** The class only checks
 *   `isNumber(this.OfferSequence)`, which accepts any JS number —
 *   including negative numbers, NaN, Infinity, and non-integers, and
 *   values larger than `2^32 - 1`. rippled rejects these with
 *   `temMALFORMED` ("Unspecified problem with the format of the
 *   transaction"). The factory additionally requires an integer in
 *   `[0, 0xffffffff]`.
 *   - Source: xrpl-dev-portal `offercancel.md` Fields table
 *     `OfferSequence | Number | UInt32`.
 *   - Source: xrpl.js `validateOfferCancel` (`offerCancel.ts` line 34)
 *     checks `typeof tx.OfferSequence === 'number'` only.
 *
 * - **`OfferSequence` may not equal the transaction's own `Sequence`.**
 *   rippled rejects this with `temBAD_SEQUENCE` ("The transaction is
 *   references a sequence number that is higher than its own `Sequence`
 *   number"). A cancel that targets its own slot is meaningless and
 *   spec-illegal. The class skips this cross-field invariant entirely.
 *   - Source: xrpl-dev-portal `offercancel.md` (implicit via
 *     OfferSequence's role as a previous-tx reference).
 *   - Source: xrpl-dev-portal `tem-codes.md` row `temBAD_SEQUENCE`
 *     ("trying to cancel an offer that would have to be placed after
 *     the transaction that cancels it").
 *
 * - **`Account` must be a valid XRPL classic or X-address.** The class
 *   inherits only `validateBaseTransaction`'s `isString(Account)` check
 *   (or none at all, since `OfferTransaction` itself is empty). The
 *   factory uses `isAccount` so an obvious typo (e.g. `"r…"`) is caught
 *   at construction.
 *   - Source: xrpl-dev-portal basic-data-types.md (`AccountID` is a
 *     classic address or X-address).
 */
import type { BasePropsFields } from '../../types/base.js';
import { isAccount, isNumber } from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// UInt32 bounds (per xrpl-dev-portal offercancel.md Fields table).
const UINT32_MIN = 0;
const UINT32_MAX = 0xffffffff;

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
export interface OfferCancelProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  /** The unique address of the transaction sender (the offer owner). */
  Account: string;
  /**
   * The sequence number (or Ticket number) of a previous OfferCreate
   * transaction. If specified, cancel any offer object in the ledger
   * that was created by that transaction. It is not considered an
   * error if the offer specified does not exist.
   */
  OfferSequence: number;
}

export interface OfferCancel
  extends Readonly<OfferCancelProps> {
  readonly TransactionType: 'OfferCancel';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<OfferCancelProps>): OfferCancel;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function offerCancel(props: OfferCancelProps): OfferCancel {
  // ── Account ── required, must be a valid XRPL classic / X-address.
  require(props.Account, 'OfferCancel: Account is required', isAccount);

  // ── OfferSequence ── required, must be an integer in [0, 0xffffffff].
  if (!isNumber(props.OfferSequence)) {
    throw new ValidationError(
      'OfferCancel: missing or invalid OfferSequence',
    );
  }
  if (
    !Number.isInteger(props.OfferSequence) ||
    props.OfferSequence < UINT32_MIN ||
    props.OfferSequence > UINT32_MAX
  ) {
    throw new ValidationError(
      `OfferCancel: OfferSequence must be a UInt32 in [${UINT32_MIN}, ${UINT32_MAX}]`,
    );
  }

  // ── Cross-field: OfferSequence may not equal the tx's own Sequence.
  // (xrpl-dev-portal tem-codes.md temBAD_SEQUENCE row.)
  if (
    props.Sequence !== undefined &&
    isNumber(props.Sequence) &&
    Number.isInteger(props.Sequence) &&
    props.OfferSequence === props.Sequence
  ) {
    throw new ValidationError(
      'OfferCancel: OfferSequence must not equal the transaction Sequence (temBAD_SEQUENCE)',
    );
  }

  // ── Base transaction fields ──
  // Catches the seven shared fields this factory now accepts through
  // `BasePropsFields` but does not otherwise check: Memos, SourceTag,
  // LastLedgerSequence, AccountTxnID, NetworkID, Delegate, TicketSequence.
  // Placed AFTER the OfferCancel-specific checks so a more specific message
  // wins for a more specific mistake.
  validateBaseTransaction({ TransactionType: 'OfferCancel', ...props });

  return buildFrozenTx<OfferCancelProps, OfferCancel>(
    'OfferCancel',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: OfferCancel) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: OfferCancel, overrides: Partial<OfferCancelProps>) {
        return offerCancel(mergeForWith(this, overrides));
      },
    },
  );
}