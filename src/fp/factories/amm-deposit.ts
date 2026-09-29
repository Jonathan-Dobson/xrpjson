/**
 * Functional AMMDeposit factory — frozen-object style.
 *
 * Adds liquidity to an AMM instance and receives LP tokens in exchange.
 * Validation happens at construction; there is no way to construct an
 * invalid tx.
 *
 *   import { ammDeposit } from 'xrplt/fp';
 *   const tx = ammDeposit({
 *     Account,
 *     Asset:  { currency: 'XRP' },
 *     Asset2: { currency: 'USD', issuer: USD_ISSUER },
 *     Amount: '1000000',
 *     Flags:  AMMDepositFlags.tfSingleAsset,
 *   });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Amount: '2000000' });
 *
 * Affected amendments:
 *   - `AMM` (base AMMDeposit)
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/ammdeposit
 * @see https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0030-automated-market-maker
 *
 * ## Divergences
 * The factory enforces eight preclaim checks that the class API
 * (`src/transactions/amm-deposit.ts`) skips:
 *
 *   1. `Asset` must be an `IssuedCurrency` (XRP form OR IOU form,
 *      NOT MPT). The class only checks `isRecord`, which lets
 *      `{ mpt_issuance_id: '...' }` slip through.
 *      Source: xrpl.js `validateAMMDeposit` (lines 92–94) calls
 *      `isIssuedCurrency(tx.Asset)` and throws
 *      `'AMMDeposit: Asset must be a Currency'`. The class API
 *      uses `isRecord(this.Asset)` which cannot distinguish
 *      IssuedCurrency from MPT.
 *
 *   2. `Asset2` must be an `IssuedCurrency` (XRP form OR IOU form,
 *      NOT MPT). Same source as #1, but applied to Asset2
 *      (xrpl.js lines 100–102).
 *
 *   3. `LPTokenOut`, when present, must be an `IssuedCurrencyAmount`.
 *      Source: xrpl.js `validateAMMDeposit` lines 114–118 — throws
 *      `'AMMDeposit: LPTokenOut must be an IssuedCurrencyAmount'`.
 *      The class API does not validate the type of LPTokenOut.
 *
 *   4. `Amount`, when present, must be a valid `Amount` (XRP drops
 *      string, IOU, or MPT). The class API does not validate the
 *      type of Amount.
 *      Source: xrpl.js `validateAMMDeposit` lines 120–122.
 *
 *   5. `Amount2`, when present, must be a valid `Amount`. Same source
 *      as #4 but applied to Amount2 (xrpl.js lines 124–126).
 *
 *   6. `EPrice`, when present, must be a valid `Amount`. Same source
 *      as #4 but applied to EPrice (xrpl.js lines 128–130).
 *
 *   7. `Amount2` and `EPrice` are not allowed without `Amount`. The
 *      class API does not check that Amount2 / EPrice are paired
 *      with Amount.
 *      Source: xrpl.js `validateAMMDeposit` lines 104–112 — throws
 *      `'AMMDeposit: must set Amount with Amount2'` and
 *      `'AMMDeposit: must set Amount with EPrice'`.
 *
 *   8. At least one of `LPTokenOut` or `Amount` must be present.
 *      The class API does not enforce the minimal field set.
 *      Source: xrpl.js `validateAMMDeposit` lines 108–112 — throws
 *      `'AMMDeposit: must set at least LPTokenOut or Amount'`.
 */
import type { Amount, IssuedCurrencyAmount } from '../../types/amounts.js';
import type { AMMDepositFlagsInterface } from '../../types/flags.js';
import {
  isAccount,
  isAmount,
  isIssuedCurrency,
  isIssuedCurrencyAmount,
} from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Public types ────────────────────────────────────────────────────

export interface AmmDepositProps {
  /** The unique address of the transaction sender (the LP). */
  Account: string;
  /** One of the two pool assets (XRP form or IOU form, NOT MPT). */
  Asset: { readonly currency: 'XRP' } | { readonly currency: string; readonly issuer: string };
  /** The other pool asset (XRP form or IOU form, NOT MPT). */
  Asset2: { readonly currency: 'XRP' } | { readonly currency: string; readonly issuer: string };
  /** Amount of `Asset` to deposit. Required unless `LPTokenOut` is set. */
  Amount?: Amount | undefined;
  /** Amount of `Asset2` to deposit. Requires `Amount`. */
  Amount2?: Amount | undefined;
  /** Max effective price per LP token. Requires `Amount`. */
  EPrice?: Amount | undefined;
  /** Target LP tokens out (IssuedCurrencyAmount). */
  LPTokenOut?: IssuedCurrencyAmount | undefined;
  /** Bit-flags for this transaction. Numeric or boolean map. */
  Flags?: number | AMMDepositFlagsInterface | undefined;
  Fee?: string | undefined;
  Sequence?: number | undefined;
}

export interface AmmDeposit extends Readonly<AmmDepositProps> {
  readonly TransactionType: 'AMMDeposit';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<AmmDepositProps>): AmmDeposit;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function ammDeposit(props: AmmDepositProps): AmmDeposit {
  // ── Account ── required, must be a valid XRPL classic address.
  require(props.Account, 'AMMDeposit: Account is required', isAccount);

  // ── Asset ── required, must be an IssuedCurrency (XRP or IOU, NOT MPT).
  if (props.Asset === undefined) {
    throw new ValidationError('AMMDeposit: missing field Asset');
  }
  if (!isIssuedCurrency(props.Asset)) {
    throw new ValidationError(
      'AMMDeposit: Asset must be a Currency (XRP form or IOU form, NOT MPT)',
    );
  }

  // ── Asset2 ── required, must be an IssuedCurrency (XRP or IOU, NOT MPT).
  if (props.Asset2 === undefined) {
    throw new ValidationError('AMMDeposit: missing field Asset2');
  }
  if (!isIssuedCurrency(props.Asset2)) {
    throw new ValidationError(
      'AMMDeposit: Asset2 must be a Currency (XRP form or IOU form, NOT MPT)',
    );
  }

  // ── Combinatorial rules (xrpl.js `validateAMMDeposit` lines 104–112). ──
  if (props.Amount2 !== undefined && props.Amount === undefined) {
    throw new ValidationError('AMMDeposit: must set Amount with Amount2');
  }
  if (props.EPrice !== undefined && props.Amount === undefined) {
    throw new ValidationError('AMMDeposit: must set Amount with EPrice');
  }
  if (props.LPTokenOut === undefined && props.Amount === undefined) {
    throw new ValidationError(
      'AMMDeposit: must set at least LPTokenOut or Amount',
    );
  }

  // ── LPTokenOut ── if present, must be an IssuedCurrencyAmount.
  if (props.LPTokenOut !== undefined) {
    if (!isIssuedCurrencyAmount(props.LPTokenOut)) {
      throw new ValidationError(
        'AMMDeposit: LPTokenOut must be an IssuedCurrencyAmount',
      );
    }
  }

  // ── Amount / Amount2 / EPrice ── if present, must be a valid Amount.
  if (props.Amount !== undefined && !isAmount(props.Amount)) {
    throw new ValidationError('AMMDeposit: Amount must be an Amount');
  }
  if (props.Amount2 !== undefined && !isAmount(props.Amount2)) {
    throw new ValidationError('AMMDeposit: Amount2 must be an Amount');
  }
  if (props.EPrice !== undefined && !isAmount(props.EPrice)) {
    throw new ValidationError('AMMDeposit: EPrice must be an Amount');
  }

  return buildFrozenTx<AmmDepositProps, AmmDeposit>(
    'AMMDeposit',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: AmmDeposit) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: AmmDeposit, overrides: Partial<AmmDepositProps>) {
        return ammDeposit(mergeForWith(this, overrides));
      },
    },
  );
}