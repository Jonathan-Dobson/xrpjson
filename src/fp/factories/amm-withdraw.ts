/**
 * Functional AMMWithdraw factory — frozen-object style.
 *
 * Withdraws assets from an Automated Market Maker (AMM) instance by
 * returning the AMM's liquidity provider tokens (LP Tokens). The factory
 * enforces the seven mutually-exclusive AMM-withdraw modes at
 * construction; there is no way to construct an invalid tx.
 *
 *   import { ammWithdraw } from 'xrplt/fp';
 *   const tx = ammWithdraw({
 *     Account,
 *     Asset:  { currency: 'XRP' },
 *     Asset2: { currency: 'TST', issuer: 'r…' },
 *     Amount: '1000',
 *     Flags:  AMMWithdrawFlags.tfSingleAsset,
 *   });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Amount: '2000' });
 *
 * Affected amendments:
 *   - `AMM` (base AMMWithdraw)
 *   - `fixAMMv1_3` (LP-token precision-loss error path; runtime)
 *   - `fixCleanup3_3_0` (frozen/locked asset error path; runtime)
 *   - `fixCleanup3_4_0` (replaces `tefEXCEPTION` with `tecAMM_FAILED`;
 *     runtime)
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/ammwithdraw
 * @see https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0030-automated-market-maker
 *
 * ## Divergences
 *
 * Compared with `src/transactions/amm-withdraw.ts`, this factory adds
 * preclaim guards the class API skips. The class only calls `isRecord`
 * on `Asset` / `Asset2` and does not validate any of the optional
 * amount fields, the field-combination rules, or the
 * one-AMMWithdraw-flag rule. Citing `temMALFORMED` from
 * xrpl.org `ammwithdraw.md` Error Cases: "The transaction specified an
 * invalid combination of fields. See AMMWithdraw Modes."
 *
 * 1. **`Asset` and `Asset2` must each be a valid `Currency` (XRP / IOU /
 *    MPT), not merely a record.** Source: XLS-0030 §2.4.2.1 — both
 *    fields are typed `object` with internal type `ISSUE`, and
 *    xrpl.org `ammwithdraw.md` Fields table — "The asset can be XRP,
 *    a token, or an MPT". xrpl.js `validateAMMWithdraw` enforces
 *    `isIssuedCurrency(Asset)` and `isIssuedCurrency(Asset2)` and
 *    rejects with `'AMMWithdraw: Asset must be a Currency'`. The class
 *    accepts any object.
 *
 * 2. **`Amount2` requires `Amount` (XLS-0030 §2.4.2.3 — "Amount and
 *    Amount2" combination).** Source: xrpl.js
 *    `validateAMMWithdraw` lines 102–106 — `if (tx.Amount2 != null &&
 *    tx.Amount == null) throw 'AMMWithdraw: must set Amount with
 *    Amount2'`. The class accepts Amount2 alone.
 *
 * 3. **`EPrice` requires `Amount` (XLS-0030 §2.4.2.3 — "Amount and
 *    EPrice" combination; EPrice is only meaningful for single-sided
 *    withdrawals).** Source: xrpl.js `validateAMMWithdraw` lines
 *    104–106 — `if (tx.EPrice != null && tx.Amount == null) throw
 *    'AMMWithdraw: must set Amount with EPrice'`. The class accepts
 *    EPrice alone.
 *
 * 4. **`LPTokenIn` must be an `IssuedCurrencyAmount` (LP tokens are
 *    always an issued currency — never XRP and never an MPT).**
 *    Source: xrpl.js `validateAMMWithdraw` lines 108–112 — `if
 *    (tx.LPTokenIn != null && !isIssuedCurrencyAmount(tx.LPTokenIn))
 *    throw 'AMMWithdraw: LPTokenIn must be an IssuedCurrencyAmount'`.
 *    xrpl.js interface `AMMWithdraw.LPTokenIn` is typed
 *    `IssuedCurrencyAmount`. The class accepts anything (no
 *    validation).
 *
 * 5. **Exactly one of the seven `AMMWithdraw` mode flags must be set in
 *    `Flags`.** Source: xrpl.org `ammwithdraw.md` AMMWithdraw Flags
 *    section — "You must specify **exactly one** of these flags, plus
 *    any global flags." The seven flags (`tfLPToken = 0x00010000`,
 *    `tfWithdrawAll = 0x00020000`, `tfOneAssetWithdrawAll = 0x00040000`,
 *    `tfSingleAsset = 0x00080000`, `tfTwoAsset = 0x00100000`,
 *    `tfOneAssetLPToken = 0x00200000`, `tfLimitLPToken = 0x00400000`)
 *    are non-overlapping single-bit values defined in
 *    xrpl.js `AMMWithdrawFlags` enum. The class performs no flag-mode
 *    validation at all; an empty `Flags` is silently accepted.
 *
 * 6. **`Amount`, `Amount2`, `EPrice` must each be a valid `Amount`
 *    (string / IssuedCurrencyAmount / MPTAmount) when provided.**
 *    Source: xrpl.js `validateAMMWithdraw` lines 114–124 — each of
 *    the three amount fields is gated with `isAmount`. The class
 *    accepts anything (no validation).
 */
import type { Amount, IssuedCurrencyAmount, Currency } from '../../types/amounts.js';
import type { AMMWithdrawFlagsInterface } from '../../types/flags.js';
import {
  isAccount,
  isAmount,
  isCurrency,
  isIssuedCurrencyAmount,
  isString,
} from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// xrpl.js `AMMWithdrawFlags` enum — these seven mode flags identify
// the mutually-exclusive AMM-withdraw modes.
//   tfLPToken             = 0x00010000
//   tfWithdrawAll         = 0x00020000
//   tfOneAssetWithdrawAll = 0x00040000
//   tfSingleAsset         = 0x00080000
//   tfTwoAsset            = 0x00100000
//   tfOneAssetLPToken     = 0x00200000
//   tfLimitLPToken        = 0x00400000
//
// They are non-overlapping single bits, so a "exactly one" check
// reduces to: popcount(flags & MASK) === 1.
const AMM_WITHDRAW_FLAG_BITS = [
  0x00010000, // tfLPToken
  0x00020000, // tfWithdrawAll
  0x00040000, // tfOneAssetWithdrawAll
  0x00080000, // tfSingleAsset
  0x00100000, // tfTwoAsset
  0x00200000, // tfOneAssetLPToken
  0x00400000, // tfLimitLPToken
] as const;

const AMM_WITHDRAW_FLAGS_MASK = AMM_WITHDRAW_FLAG_BITS.reduce<number>(
  (acc, bit) => acc | bit,
  0,
);

// ─── Public types ────────────────────────────────────────────────────

export interface AmmWithdrawProps {
  /** The unique address of the transaction sender. */
  Account: string;
  /** One of the two assets in the AMM's pool (XRP / IOU / MPT). */
  Asset: Currency;
  /** The other asset in the AMM's pool (XRP / IOU / MPT). */
  Asset2: Currency;
  /**
   * Amount of one asset to withdraw. Optional — when omitted, the
   * mode flag (`tfLPToken`, `tfWithdrawAll`) specifies the
   * withdrawal amount.
   */
  Amount?: Amount | undefined;
  /**
   * Amount of the other asset to withdraw. Requires `Amount` and the
   * `tfTwoAsset` flag (XLS-0030 §2.4.2.3).
   */
  Amount2?: Amount | undefined;
  /**
   * Minimum effective price, in LP Token returned, to pay per unit of
   * the asset to withdraw. Requires `Amount` and the `tfLimitLPToken`
   * flag.
   */
  EPrice?: Amount | undefined;
  /**
   * How many of the AMM's LP Tokens to redeem. Always an
   * `IssuedCurrencyAmount` (LP tokens are never XRP or MPT).
   */
  LPTokenIn?: IssuedCurrencyAmount | undefined;
  /** AMM-withdraw mode flag bitmask + any global flags. */
  Flags?: number | AMMWithdrawFlagsInterface | undefined;
  Fee?: string | undefined;
  Sequence?: number | undefined;
}

export interface AmmWithdraw extends Readonly<AmmWithdrawProps> {
  readonly TransactionType: 'AMMWithdraw';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<AmmWithdrawProps>): AmmWithdraw;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Bit-count of a 32-bit integer (popcount). Used to verify that
 * exactly one of the seven AMM-withdraw mode flag bits is set.
 */
function popcount32(n: number): number {
  // Brian Kernighan's algorithm.
  let v = n >>> 0;
  let count = 0;
  while (v !== 0) {
    v &= v - 1;
    count++;
  }
  return count;
}

/**
 * Extract the numeric bitmask from `Flags` regardless of whether the
 * caller passed a numeric value or a boolean `AMMWithdrawFlagsInterface`.
 */
function flagsToNumber(
  flags: number | AMMWithdrawFlagsInterface | undefined,
): number {
  if (flags === undefined) return 0;
  if (typeof flags === 'number') return flags;
  let n = 0;
  if (flags.tfLPToken) n |= 0x00010000;
  if (flags.tfWithdrawAll) n |= 0x00020000;
  if (flags.tfOneAssetWithdrawAll) n |= 0x00040000;
  if (flags.tfSingleAsset) n |= 0x00080000;
  if (flags.tfTwoAsset) n |= 0x00100000;
  if (flags.tfOneAssetLPToken) n |= 0x00200000;
  if (flags.tfLimitLPToken) n |= 0x00400000;
  return n;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function ammWithdraw(props: AmmWithdrawProps): AmmWithdraw {
  // ── Account ── required, must be a valid XRPL classic address.
  if (!isString(props.Account) || !isAccount(props.Account)) {
    throw new ValidationError(
      'AMMWithdraw: Account is required and must be a valid XRPL account address',
    );
  }

  // ── Asset ── required, must be a valid Currency.
  if (!isCurrency(props.Asset)) {
    throw new ValidationError(
      'AMMWithdraw: Asset must be a valid Currency (XRP, trust line, or MPT form)',
    );
  }

  // ── Asset2 ── required, must be a valid Currency.
  if (!isCurrency(props.Asset2)) {
    throw new ValidationError(
      'AMMWithdraw: Asset2 must be a valid Currency (XRP, trust line, or MPT form)',
    );
  }

  // ── Amount ── optional; when present, must be a valid Amount.
  if (props.Amount !== undefined && !isAmount(props.Amount)) {
    throw new ValidationError(
      'AMMWithdraw: Amount must be a valid Amount (XRP drops, trust line, or MPT form)',
    );
  }

  // ── Amount2 ── optional; when present, must be a valid Amount AND
  //    Amount must also be present (XLS-0030 §2.4.2.3 — "Amount and
  //    Amount2" is the only Amount2-bearing mode).
  if (props.Amount2 !== undefined) {
    if (!isAmount(props.Amount2)) {
      throw new ValidationError(
        'AMMWithdraw: Amount2 must be a valid Amount (XRP drops, trust line, or MPT form)',
      );
    }
    if (props.Amount === undefined) {
      throw new ValidationError(
        'AMMWithdraw: Amount2 requires Amount to be set (XLS-0030 §2.4.2.3 "Amount and Amount2" mode)',
      );
    }
  }

  // ── EPrice ── optional; when present, must be a valid Amount AND
  //    Amount must also be present (XLS-0030 §2.4.2.3 — "Amount and
  //    EPrice" is the only EPrice-bearing mode).
  if (props.EPrice !== undefined) {
    if (!isAmount(props.EPrice)) {
      throw new ValidationError(
        'AMMWithdraw: EPrice must be a valid Amount (XRP drops, trust line, or MPT form)',
      );
    }
    if (props.Amount === undefined) {
      throw new ValidationError(
        'AMMWithdraw: EPrice requires Amount to be set (XLS-0030 §2.4.2.3 "Amount and EPrice" mode)',
      );
    }
  }

  // ── LPTokenIn ── optional; when present, must be an
  //    IssuedCurrencyAmount. LP tokens are always issued currencies —
  //    never XRP and never an MPT.
  if (props.LPTokenIn !== undefined && !isIssuedCurrencyAmount(props.LPTokenIn)) {
    throw new ValidationError(
      'AMMWithdraw: LPTokenIn must be an IssuedCurrencyAmount (currency + issuer + value)',
    );
  }

  // ── Flags ── exactly one AMM-withdraw mode flag bit must be set
  //    (xrpl.org `ammwithdraw.md`: "You must specify **exactly one**
  //    of these flags, plus any global flags"). We always validate —
  //    an absent `Flags`, an explicit `undefined`, and `Flags: 0` all
  //    represent "no mode flag set" and must throw.
  const numericFlags = flagsToNumber(props.Flags);
  const ammFlagBits = numericFlags & AMM_WITHDRAW_FLAGS_MASK;
  if (ammFlagBits === 0) {
    throw new ValidationError(
      'AMMWithdraw: Flags must specify exactly one AMM-withdraw mode flag (tfLPToken, tfWithdrawAll, tfOneAssetWithdrawAll, tfSingleAsset, tfTwoAsset, tfOneAssetLPToken, or tfLimitLPToken)',
    );
  }
  if (popcount32(ammFlagBits) !== 1) {
    throw new ValidationError(
      'AMMWithdraw: Flags must specify exactly one AMM-withdraw mode flag (got multiple)',
    );
  }

  return buildFrozenTx<AmmWithdrawProps, AmmWithdraw>(
    'AMMWithdraw',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: AmmWithdraw) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: AmmWithdraw, overrides: Partial<AmmWithdrawProps>) {
        return ammWithdraw(mergeForWith(this, overrides));
      },
    },
  );
}