/**
 * Functional AMMDelete factory — frozen-object style.
 *
 * Deletes an Automated Market Maker (AMM) instance that could not be
 * fully deleted automatically (e.g. more than 512 empty trust lines
 * remain after an AMMWithdraw). Anyone can call `AMMDelete`; the ledger
 * enforces that the AMM is in an empty (`LPTokens == 0`) state.
 *
 * Validation happens at construction; there is no way to construct an
 * invalid tx from the fields it models.
 *
 *   import { ammDelete } from 'xrpjson';
 *   const tx = ammDelete({
 *     Account,
 *     Asset:  { currency: 'XRP' },
 *     Asset2: { currency: 'TST', issuer: 'r…' },
 *   });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Fee: '10' });
 *
 * Affected amendments:
 *   - `AMM` (base AMMDelete)
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/ammdelete
 * @see https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0030-automated-market-maker
 *
 * ## Divergences
 *
 * The class-based API at the Class API's `AMMDelete` validates
 * `Asset` and `Asset2` with `isRecord`, which accepts any object —
 * including the wrong kind of object (e.g. a `Memo`, a `Signer`, or an
 * empty `{}`). The factory fills three guards the class skips:
 *
 *   1. **`Asset` must be a valid `Currency` (XRP / IOU / MPT).** The
 *      class accepts any object; the factory rejects with
 *      `'AMMDelete: Asset must be a valid Currency'` when Asset is
 *      missing, null, or not a recognized currency shape.
 *      Source: xrpl.org `ammdelete.md` Fields table — `Asset` row,
 *      Description column: "The asset can be XRP, a token, or an MPT".
 *      Source: XLS-0030 §2.3.1, `Asset` row, JSON Type = `object`,
 *      Internal Type = `ISSUE`. xrpl.js `validateAMMDelete` calls
 *      `isIssuedCurrency(tx.Asset)` (line 48) and throws
 *      `'AMMDelete: Asset must be a Currency'`.
 *      (`isIssuedCurrency` rejects MPT form; `isCurrency` accepts it
 *      to match the more recent xrpl.org docs. Either is stricter
 *      than `isRecord`.)
 *
 *   2. **`Asset2` must be a valid `Currency` (XRP / IOU / MPT).** Same
 *      rationale and sources as #1, applied to `Asset2`. The class
 *      accepts any object; xrpl.js line 56 calls `isIssuedCurrency`
 *      on `Asset2`; the factory uses `isCurrency` for the same
 *      docs-aligned coverage as `Asset`.
 *
 *   3. **`Account` is validated as a well-formed XRPL classic or
 *      X-address.** The class delegates Account validation to
 *      `validateBaseTransaction`, which only checks `isString(Account)`
 *      and skips `isAccount`. The factory uses `isAccount` so a
 *      malformed Account is caught at construction rather than at
 *      `.validate()` time.
 *      Source: xrpl.js `validateBaseTransaction` calls `isAccount`
 *      on `tx.Account`. Local helper at `src/validation/helpers.ts`
 *      lines 55–60.
 */
import type { Currency } from '../../types/amounts.js';
import type { BasePropsFields } from '../../types/base.js';
import { isAccount, isCurrency } from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

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
export interface AmmDeleteProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  /** The unique address of the transaction sender (anyone may delete). */
  Account: string;
  /** One of the two assets in the AMM's pool (XRP / IOU / MPT). */
  Asset: Currency;
  /** The other asset in the AMM's pool (XRP / IOU / MPT). */
  Asset2: Currency;
}

export interface AmmDelete extends Readonly<AmmDeleteProps> {
  readonly TransactionType: 'AMMDelete';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<AmmDeleteProps>): AmmDelete;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function ammDelete(props: AmmDeleteProps): AmmDelete {
  // ── Account ── required, must be a valid XRPL classic / X-address.
  require(props.Account, 'AMMDelete: Account is required', isAccount);

  // ── Asset ── required, must be a valid Currency (XRP / IOU / MPT).
  if (!isCurrency(props.Asset)) {
    throw new ValidationError(
      'AMMDelete: Asset must be a valid Currency (XRP, trust line, or MPT form)',
    );
  }

  // ── Asset2 ── required, must be a valid Currency (XRP / IOU / MPT).
  if (!isCurrency(props.Asset2)) {
    throw new ValidationError(
      'AMMDelete: Asset2 must be a valid Currency (XRP, trust line, or MPT form)',
    );
  }

  // ─── Base transaction fields ───
  // Catches the seven shared fields this factory now accepts through
  // `BasePropsFields` but does not otherwise check: Memos, SourceTag,
  // LastLedgerSequence, AccountTxnID, NetworkID, Delegate, TicketSequence.
  // Placed AFTER the AMMDelete-specific checks so a more specific message
  // wins for a more specific mistake.
  //
  // `TransactionType` is supplied because the validator checks a transaction,
  // not a props bag — the factory injects it in `buildFrozenTx` below.
  validateBaseTransaction({ TransactionType: 'AMMDelete', ...props });

  return buildFrozenTx<AmmDeleteProps, AmmDelete>(
    'AMMDelete',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: AmmDelete) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: AmmDelete, overrides: Partial<AmmDeleteProps>) {
        return ammDelete(mergeForWith(this, overrides));
      },
    },
  );
}
