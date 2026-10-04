/**
 * Functional EscrowCancel factory — frozen-object style.
 *
 * Return escrowed funds from an expired escrow back to the original
 * sender. The escrow must have a `CancelAfter` time that has already
 * passed; that runtime check is enforced by rippled, not the factory.
 * Validation here happens at construction; there is no way to construct
 * an invalid tx from the fields it models.
 *
 *   import { escrowCancel } from 'xrpjson';
 *   const tx = escrowCancel({ Account, Owner, OfferSequence: 7 });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Fee: '12' });
 *
 * Affected amendments:
 *   - `Escrow` (base EscrowCancel)
 *   - `TokenEscrow` (XLS-85: IOU/MPT tokens in addition to XRP)
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/escrowcancel
 * @see https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0085-token-escrow
 *
 * ## Divergences
 *
 * The class-based API at the Class API's `EscrowCancel` and xrpl.js's
 * `validateEscrowCancel` both skip three preclaim guards that the
 * canonical sources require. The factory fills them:
 *
 *   1. **`OfferSequence` must be a UInt32 (non-negative integer in
 *      `[0, 0xffffffff]`).**
 *      The class only checks `isNumber(this.OfferSequence)`, which accepts
 *      any JS number — including `NaN`, `Infinity`, negatives, non-integers,
 *      and values larger than `2^32 - 1`. xrpl.js is nearly identical:
 *      `validateEscrowCancel` (`escrowCancel.ts:42–48`) only rejects
 *      `NaN` / non-numeric strings.
 *      Source: xrpl-dev-portal `escrowcancel.md` Fields table —
 *        "`OfferSequence` | Number | UInt32".
 *      Source: xrpl.js `escrowCancel.ts` — only checks
 *        `typeof OfferSequence === 'number' || 'string'` and `!Number.isNaN(Number(...))`.
 *
 *   2. **`Account` must be a valid XRPL classic or X-address.**
 *      The class does not validate `Account` at all (it inherits only
 *      `Transaction.validate()` and never checks the address format).
 *      The factory uses `isAccount` so a typo in the sender address is
 *      caught at construction.
 *      Source: xrpl-dev-portal basic-data-types.md — `AccountID` is a
 *        classic address or X-address.
 *
 *   3. **Cross-field invariant — `OfferSequence` may not equal the
 *      transaction's own `Sequence` (temBAD_SEQUENCE).**
 *      A cancel that targets its own slot is meaningless and is
 *      rejected by rippled with `temBAD_SEQUENCE`. The class does not
 *      check this; the factory does so the same way it does for
 *      `OfferCancel` (see `src/fp/factories/offer-cancel.ts`).
 *      Source: xrpl-dev-portal `tem-codes.md` row `temBAD_SEQUENCE`
 *        ("trying to cancel an offer that would have to be placed after
 *        the transaction that cancels it") — applied symmetrically to
 *        any previous-tx reference.
 *
 * Note: the factory does NOT enforce the ledger-time rules "the
 * original EscrowCreate must have specified a CancelAfter time" or
 * "the CancelAfter time must be in the past" — those are runtime
 * `tec`-class results, not preclaim malformations. Per xrpl-dev-portal
 * `escrowcancel.md` (Description section) they belong to rippled's
 * apply-time checks.
 */
import type { BasePropsFields } from '../../types/base.js';
import { isAccount, isNumber } from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// UInt32 bounds (per xrpl-dev-portal escrowcancel.md Fields table).
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
export interface EscrowCancelProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  /** The unique address of the transaction sender. Any account may cancel. */
  Account: string;
  /**
   * Address of the source account that funded the escrow payment.
   * The sender of the original `EscrowCreate` transaction.
   */
  Owner: string;
  /**
   * Transaction sequence (or Ticket number) of the `EscrowCreate`
   * transaction that created the escrow to cancel. `UInt32`.
   */
  OfferSequence: number;
  /** Bit-flags for this transaction. The spec defines none — must be 0. */
  Flags?: number | undefined;
}

export interface EscrowCancel extends Readonly<EscrowCancelProps> {
  readonly TransactionType: 'EscrowCancel';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<EscrowCancelProps>): EscrowCancel;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function escrowCancel(props: EscrowCancelProps): EscrowCancel {
  // ── Account ── required, must be a valid XRPL classic / X-address.
  //    The class API does not check Account format at all.
  require(props.Account, 'EscrowCancel: Account is required', isAccount);

  // ── Owner ── required, must be a valid XRPL classic / X-address.
  //    `Owner` is the original `EscrowCreate` sender; need not equal
  //    `Account` (any account may submit an EscrowCancel per
  //    xrpl-dev-portal escrowcancel.md).
  if (!isAccount(props.Owner)) {
    throw new ValidationError(
      'EscrowCancel: Owner must be a valid XRPL account address',
    );
  }

  // ── OfferSequence ── required, must be an integer in [0, 0xffffffff].
  //    The class uses `isNumber`, which accepts any JS number (negatives,
  //    floats, NaN, Infinity, > UInt32). The factory tightens to UInt32.
  if (!isNumber(props.OfferSequence)) {
    throw new ValidationError(
      'EscrowCancel: missing or invalid OfferSequence',
    );
  }
  if (
    !Number.isInteger(props.OfferSequence) ||
    props.OfferSequence < UINT32_MIN ||
    props.OfferSequence > UINT32_MAX
  ) {
    throw new ValidationError(
      `EscrowCancel: OfferSequence must be a UInt32 in [${UINT32_MIN}, ${UINT32_MAX}]`,
    );
  }

  // ── Cross-field: OfferSequence may not equal the tx's own Sequence.
  //    xrpl-dev-portal tem-codes.md: "temBAD_SEQUENCE — trying to
  //    cancel an offer that would have to be placed after the
  //    transaction that cancels it." Applied symmetrically to any
  //    previous-tx reference (EscrowCancel's OfferSequence is one).
  if (
    props.Sequence !== undefined &&
    isNumber(props.Sequence) &&
    Number.isInteger(props.Sequence) &&
    props.OfferSequence === props.Sequence
  ) {
    throw new ValidationError(
      'EscrowCancel: OfferSequence must not equal the transaction Sequence (temBAD_SEQUENCE)',
    );
  }

  // ─── Base transaction fields ───
  // Validates the fields this factory inherits from BaseTransactionFields
  // but does not otherwise check. Placed AFTER the EscrowCancel-specific
  // checks so a more specific mistake gets a more specific message.
  // `TransactionType` is supplied because the validator checks a built
  // transaction, not a props bag — the factory injects it below.
  validateBaseTransaction({ TransactionType: 'EscrowCancel', ...props });

  return buildFrozenTx<EscrowCancelProps, EscrowCancel>(
    'EscrowCancel',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: EscrowCancel) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: EscrowCancel, overrides: Partial<EscrowCancelProps>) {
        return escrowCancel(mergeForWith(this, overrides));
      },
    },
  );
}