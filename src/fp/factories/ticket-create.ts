/**
 * Functional TicketCreate factory — frozen-object style.
 *
 * Sets aside one or more sequence numbers as Tickets so the account can
 * submit later transactions without worrying about ordering or
 * cancellation races. The class-based equivalent at
 * the Class API's `TicketCreate` requires a separate `.validate()`
 * call after construction; this factory validates at construction so an
 * invalid tx can never exist.
 *
 *   import { ticketCreate } from 'xrpjson';
 *   const tx = ticketCreate({ Account, TicketCount: 10 });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ TicketCount: 25 });
 *
 * Required amendment: `TicketBatch` (XLS-0013). The per-account cap of
 * 250 simultaneous Tickets also comes from XLS-0013.
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/ticketcreate
 * @see https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0013-tickets
 *
 * ## Divergences
 *
 * Compared with the Class API's `TicketCreate`, this factory adds
 * preclaim guards the class API skips and emits more specific error
 * messages than the class's single-message range check.
 *
 * 1. **`TicketCount` must be an integer.** The class accepts any number
 *    via `!isNumber(TicketCount) || TicketCount < 1 || TicketCount > 250`
 *    (ticket-create.ts:34), so `12.5`, `-0`, and `NaN`-adjacent values
 *    silently pass. xrpl.js explicitly enforces `Number.isInteger` and
 *    maps the failure to `temINVALID_COUNT` ("must be an integer from
 *    1 to 250").
 *    - Source: xrpl.js
 *      `repo/packages/xrpl/src/models/transactions/ticketCreate.ts:41-49`
 *      — `!Number.isInteger(TicketCount) || TicketCount < 1 ||
 *      TicketCount > MAX_TICKETS` ⇒ "TicketCreate: TicketCount must be
 *      an integer from 1 to 250".
 *
 * 2. **Distinct error messages for missing-vs-wrong-type-vs-out-of-range.**
 *    The class collapses every failure into `"TicketCount must be
 *    between 1 and 250"`, which makes debugging ambiguous (is `undefined`
 *    a "missing field" or "out of range"?). xrpl.js emits three
 *    separate messages — `"missing field TicketCount"`,
 *    `"TicketCount must be a number"`, and
 *    `"TicketCount must be an integer from 1 to 250"`. The factory
 *    mirrors that ordering for parity with the canonical validator.
 *    - Source: xrpl.js `ticketCreate.ts:33-49`.
 *
 * 3. **`Account` must be a valid XRPL classic or X-address.** The class
 *    inherits `validateBaseTransaction`'s `isString(Account)` check
 *    (transactions/common.ts validateBaseTransaction: `validateRequiredField(common, 'Account', isString)`),
 *    which accepts any string — typos like `"r…"` slip through. The
 *    factory uses `isAccount` so an obvious typo is caught at
 *    construction.
 *    - Source: xrpl-dev-portal basic-data-types.md (`AccountID` is a
 *      classic address or X-address).
 *
 * 4. **`TicketCount` upper bound is per-tx, not per-account.** The
 *    factory enforces only the per-transaction maximum of 250 (XLS-0013
 *    §"TicketBatch" / `temINVALID_COUNT`). The cross-field invariant
 *    "account already owns ≥ (250 − TicketCount) Tickets ⇒ `tecDIR_FULL`"
 *    requires querying the ledger and is out of scope for a stateless
 *    constructor. The factory documents this so callers know to use
 *    `account_info` to pre-check `account_data.TicketCount` before
 *    submitting a large batch.
 *    - Source: XLS-0013 §"New Transactions: TicketBatch" line 561-563
 *      and xrpl-dev-portal `ticketcreate.md` Error Cases row
 *      `tecDIR_FULL`.
 */
import { isAccount, isNumber } from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import type { BaseTransactionFields } from '../../types/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

/**
 * Maximum number of Tickets a single `TicketCreate` transaction can
 * create. From XLS-0013 §"New Transactions: TicketBatch" line 561: "A
 * `TicketCreate` transaction can create up to 250 `Ticket`s in a single
 * transaction." Also exported as the canonical `MAX_TICKETS` constant
 * in xrpl.js `ticketCreate.ts:21`.
 */
const MAX_TICKETS_PER_TX = 250;

// ─── Public types ────────────────────────────────────────────────────

// See `payment.ts` for why `TransactionType` is omitted. `Flags` is re-declared
// rather than inherited only because TicketCreate has no defined flags of its
// own, and the narrower `number` type is worth stating explicitly here.
type TicketCreateBaseFields = Omit<
  BaseTransactionFields,
  'TransactionType' | 'Flags'
>;

export interface TicketCreateProps extends TicketCreateBaseFields {
  /** How many Tickets to create. Must be an integer in [1, 250]. */
  TicketCount: number;
  /** Bit-flags for this transaction. TicketCreate has no defined flags. */
  Flags?: number | undefined;
}

export interface TicketCreate extends Readonly<TicketCreateProps> {
  readonly TransactionType: 'TicketCreate';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<TicketCreateProps>): TicketCreate;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function ticketCreate(props: TicketCreateProps): TicketCreate {
  // ── Account ── required, must be a valid XRPL classic or X-address.
  require(
    props.Account,
    'TicketCreate: Account is required and must be a valid XRPL address',
    isAccount,
  );

  // ── TicketCount ── required. Three distinct errors (xrpl.js parity):
  //    "missing field", "must be a number", "must be an integer from 1 to 250".
  if (props.TicketCount === undefined) {
    throw new ValidationError('TicketCreate: missing field TicketCount');
  }
  if (!isNumber(props.TicketCount)) {
    throw new ValidationError('TicketCreate: TicketCount must be a number');
  }
  if (
    !Number.isInteger(props.TicketCount) ||
    props.TicketCount < 1 ||
    props.TicketCount > MAX_TICKETS_PER_TX
  ) {
    throw new ValidationError(
      `TicketCreate: TicketCount must be an integer from 1 to ${MAX_TICKETS_PER_TX}`,
    );
  }

  // ─── Base transaction fields ───
  // See the equivalent block in `payment.ts` for the placement rationale: after
  // the TicketCreate-specific checks, as a backstop for the shared fields.
  validateBaseTransaction({ TransactionType: 'TicketCreate', ...props });

  return buildFrozenTx<TicketCreateProps, TicketCreate>(
    'TicketCreate',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: TicketCreate) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: TicketCreate, overrides: Partial<TicketCreateProps>) {
        return ticketCreate(mergeForWith(this, overrides));
      },
    },
  );
}