/**
 * Functional AMMVote factory — frozen-object style.
 *
 * Votes on the trading fee for an Automated Market Maker (AMM) instance.
 * Up to 8 accounts can vote in proportion to the amount of the AMM's
 * LP Tokens they hold; the new trading fee is recomputed as a weighted
 * average of the active votes. Validation happens at construction;
 * there is no way to construct an invalid tx.
 *
 *   import { ammVote } from 'xrpjson';
 *   const tx = ammVote({
 *     Account,
 *     Asset:  { currency: 'XRP' },
 *     Asset2: { currency: 'TST', issuer: 'r…' },
 *     TradingFee: 600,
 *   });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ TradingFee: 700 });
 *
 * Affected amendments:
 *   - `AMM` (base AMMVote)
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/ammvote
 * @see https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0030-automated-market-maker
 *
 * ## Divergences
 *
 * Compared with the Class API's `AMMVote`, this factory adds
 * preclaim guards the class API skips. The class only calls `isRecord`
 * on `Asset` / `Asset2` and only checks the [0, 1000] numeric range on
 * `TradingFee` — it accepts any object for the asset fields and any
 * non-integer in range for the fee. Citing the docs:
 *
 * 1. **`Asset` must be a valid `Currency` (XRP / IOU / MPT), not just
 *    a record.** Source: xrpl.org `ammvote.md` Fields table — `Asset`
 *    row, Description column: "The asset can be XRP, a token, or an
 *    MPT". Source: XLS-0030 §3.2.1, `Asset` row, Internal Type = `ISSUE`.
 *    xrpl.js `validateAMMVote` (line 50) calls `isIssuedCurrency(tx.Asset)`
 *    and throws `'AMMVote: Asset must be a Currency'`. The class API
 *    uses `isRecord(this.Asset)`, which cannot distinguish IssuedCurrency
 *    or MPT form from any other object.
 *
 * 2. **`Asset2` must be a valid `Currency` (XRP / IOU / MPT), not just
 *    a record.** Same sources and rationale as #1, applied to `Asset2`
 *    (xrpl.js line 58).
 *
 * 3. **`TradingFee` must be an integer.** Source: XLS-0030 §3.2.1,
 *    `TradingFee` row, Internal Type = `UINT16`. The class accepts any
 *    number in [0, 1000], including non-integer values like 0.5.
 *
 * 4. **`Account` must be a valid XRPL classic or X-address.** The class
 *    delegates Account validation to `validateBaseTransaction`, which
 *    only checks `isString(Account)`. The factory uses `isAccount` so
 *    a malformed Account is caught at construction rather than at
 *    `.validate()` time.
 *    Source: xrpl.js `validateBaseTransaction` calls `isAccount`
 *    on `tx.Account`. Local helper at `src/validation/helpers.ts`
 *    lines 55–60.
 */
import type { Currency } from '../../types/amounts.js';
import {
  isAccount,
  isCurrency,
  isNumber,
} from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// TradingFee is UINT16 with a ledger-enforced range of 0–1000
// (0%–1%). (XLS-0030 §3.2.1; xrpl.js AMM_MAX_TRADING_FEE.)
const AMM_MAX_TRADING_FEE = 1000;

// ─── Public types ────────────────────────────────────────────────────

export interface AmmVoteProps {
  /** The unique address of the transaction sender (an LP of the AMM). */
  Account: string;
  /** One of the two assets in the AMM's pool (XRP / IOU / MPT). */
  Asset: Currency;
  /** The other asset in the AMM's pool (XRP / IOU / MPT). */
  Asset2: Currency;
  /**
   * The proposed trading fee, in units of 1/100,000 (1 = 0.001%). Must
   * be an integer in [0, 1000] inclusive. UINT16.
   */
  TradingFee: number;
  /** Fee in XRP (drops), base-10 integer string. */
  Fee?: string | undefined;
  /** Account sequence number. */
  Sequence?: number | undefined;
  /** Bit-flags for this transaction (AMMVote defines no transaction-specific flags). */
  Flags?: number | undefined;
}

export interface AmmVote extends Readonly<AmmVoteProps> {
  readonly TransactionType: 'AMMVote';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<AmmVoteProps>): AmmVote;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function ammVote(props: AmmVoteProps): AmmVote {
  // ── Account ── required, must be a valid XRPL classic / X-address.
  require(props.Account, 'AMMVote: Account is required', isAccount);

  // ── Asset ── required, must be a valid Currency (XRP / IOU / MPT).
  if (!isCurrency(props.Asset)) {
    throw new ValidationError(
      'AMMVote: Asset must be a valid Currency (XRP, trust line, or MPT form)',
    );
  }

  // ── Asset2 ── required, must be a valid Currency (XRP / IOU / MPT).
  if (!isCurrency(props.Asset2)) {
    throw new ValidationError(
      'AMMVote: Asset2 must be a valid Currency (XRP, trust line, or MPT form)',
    );
  }

  // ── TradingFee ── required, integer, 0–1000 inclusive (UINT16).
  if (props.TradingFee === undefined || props.TradingFee === null) {
    throw new ValidationError('AMMVote: TradingFee is required');
  }
  if (!isNumber(props.TradingFee)) {
    throw new ValidationError('AMMVote: TradingFee must be a number');
  }
  if (!Number.isInteger(props.TradingFee)) {
    throw new ValidationError(
      'AMMVote: TradingFee must be an integer (UINT16)',
    );
  }
  if (props.TradingFee < 0 || props.TradingFee > AMM_MAX_TRADING_FEE) {
    throw new ValidationError(
      `AMMVote: TradingFee must be between 0 and ${AMM_MAX_TRADING_FEE} inclusive (got ${props.TradingFee})`,
    );
  }

  return buildFrozenTx<AmmVoteProps, AmmVote>(
    'AMMVote',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: AmmVote) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: AmmVote, overrides: Partial<AmmVoteProps>) {
        return ammVote(mergeForWith(this, overrides));
      },
    },
  );
}