/**
 * Functional AMMDeposit factory — frozen-object style.
 *
 * Adds liquidity to an AMM instance and receives LP tokens in exchange.
 * Validation happens at construction; there is no way to construct an
 * invalid tx from the fields it models.
 *
 *   import { ammDeposit } from 'xrpjson';
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
 * (the Class API's `AMMDeposit`) skips:
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
 *   7. The per-deposit-mode field set is enforced.
 *      The class API does not enforce the minimal field set for a deposit
 *      mode at all — it accepts any combination of `Amount`, `Amount2`,
 *      `EPrice`, `LPTokenOut` and `TradingFee`. xrpl.js enforces a weaker
 *      generic subset (`Amount` with `Amount2`, `Amount` with `EPrice`, and
 *      at least one of `LPTokenOut` or `Amount`). rippled enforces the full
 *      per-mode matrix, which the factory follows:
 *
 *        tfLPToken         — LPTokenOut, [Amount, Amount2]   (both or neither)
 *        tfSingleAsset     — Amount, [LPTokenOut]
 *        tfTwoAsset        — Amount, Amount2, [LPTokenOut]
 *        tfOneAssetLPToken — Amount and LPTokenOut
 *        tfLimitLPToken    — Amount and EPrice
 *        tfTwoAssetIfEmpty — Amount, Amount2, [TradingFee]
 *
 *      The matrix subsumes the generic rules: every combination they
 *      rejected is rejected here too, and the message names the mode.
 *      Source: rippled `src/libxrpl/tx/transactors/dex/AMMDeposit.cpp:66–112`
 *              (the per-mode branches);
 *              xrpl.js `validateAMMDeposit` lines 104–112 (the weaker
 *              generic subset).
 *
 *   8. `Flags` must contain exactly one AMM-deposit mode flag.
 *      The class API performs no flag validation at all: `grep -n "Flags"
 *      xrpl.js src/models/transactions/AMMDeposit.ts` returns only the
 *      enum and the interface, never a check inside
 *      `validateAMMDeposit` (lines 85–133). This factory enforces the
 *      rule the same way `ammWithdraw` does.
 *      Source: xrpl.org `ammdeposit.md` line 129 — "You must specify
 *      **exactly one** of these flags, plus any global flags."
 *      That sentence is byte-identical to `ammwithdraw.md` line 107; the
 *      two rules are the same and only the flag list differs.
 *
 *   9. `Account` must be a well-formed XRPL classic or X-address.
 *       The class API's base validator checks `Account` with `isString`
 *       only, so `"not-an-address"` passes. The factory requires a
 *       well-formed address — a format check, not a checksum verification.
 *       rippled parses `Account` as an `AccountID` and rejects anything
 *       that is neither hex nor valid base58, so the rule is the ledger's
 *       own; xrpl.js checks the field with `isString` and ignores it.
 *       Source: rippled `src/libxrpl/protocol/STParsedJSON.cpp:919`
 *               (`case STI_ACCOUNT:`);
 *               xrpl.js `models/transactions/common.ts:987`
 *               (`validateRequiredField(common, 'Account', isString)`);
 *               Class API `src/validation/base.ts:40–41`.
 *
 *   10. `TradingFee` is not declared by the class.
 *       The class exposes no `TradingFee` field, so callers using the class
 *       API cannot set the AMM's trading fee when depositing into an empty
 *       two-asset AMM. The factory adds the field with the protocol's
 *       rules: it is permitted only with the `tfTwoAssetIfEmpty` deposit
 *       mode, and must be an integer in `[0, 1000]`.
 *       Source: rippled `include/xrpl/protocol/detail/transactions.macro`
 *               (the `ttAMM_DEPOSIT` block lists `{sfTradingFee,
 *               SoeOptional}`);
 *               rippled `src/libxrpl/tx/transactors/dex/AMMDeposit.cpp:64`
 *               (`auto const tradingFee = ctx.tx[~sfTradingFee];`) and
 *               lines 78–112 (every mode except `tfTwoAssetIfEmpty`
 *               rejects it with `temMALFORMED`);
 *               rippled `include/xrpl/protocol/AMMCore.h:16`
 *               (`kTradingFeeThreshold = 1000`).
 */
import type { BasePropsFields } from '../../types/base.js';
import type { Amount, IssuedCurrencyAmount } from '../../types/amounts.js';
import type { AMMDepositFlagsInterface } from '../../types/flags.js';
import {
  isAccount,
  isAmount,
  isIssuedCurrency,
  isIssuedCurrencyAmount,
  isNumber,
} from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// xrpl.js `AMMDepositFlags` enum — these six mode flags identify the
// mutually-exclusive AMM-deposit modes.
//   tfLPToken         = 0x00010000
//   tfSingleAsset     = 0x00080000
//   tfTwoAsset        = 0x00100000
//   tfOneAssetLPToken = 0x00200000
//   tfLimitLPToken    = 0x00400000
//   tfTwoAssetIfEmpty = 0x00800000
//
// rippled `include/xrpl/protocol/TxFlags.h:170–175` — the same six bits,
// and `tfDepositSubTx` (line 409) is exactly their union.
//
// Note the sparse bit positions: 0x00020000 and 0x00040000 are
// AMM-*withdraw* modes (tfWithdrawAll, tfOneAssetWithdrawAll), not deposit
// modes, so they are absent above. The mask is therefore required — a
// popcount of the raw `Flags` would miscount a withdraw bit as a second
// deposit mode.
//
// They are non-overlapping single bits, so an "exactly one" check
// reduces to: popcount(flags & MASK) === 1.
//
// Named rather than inlined because the same six values appear in three
// places that must agree — the mask below, `flagsToNumber`, and the
// per-mode field matrix — and a literal repeated three times is how they
// drift apart.
const TF_LP_TOKEN = 0x00010000;
const TF_SINGLE_ASSET = 0x00080000;
const TF_TWO_ASSET = 0x00100000;
const TF_ONE_ASSET_LP_TOKEN = 0x00200000;
const TF_LIMIT_LP_TOKEN = 0x00400000;
const TF_TWO_ASSET_IF_EMPTY = 0x00800000;

const AMM_DEPOSIT_FLAG_BITS = [
  TF_LP_TOKEN,
  TF_SINGLE_ASSET,
  TF_TWO_ASSET,
  TF_ONE_ASSET_LP_TOKEN,
  TF_LIMIT_LP_TOKEN,
  TF_TWO_ASSET_IF_EMPTY,
] as const;

/**
 * rippled `include/xrpl/protocol/AMMCore.h:16` —
 * `constexpr std::uint16_t kTradingFeeThreshold = 1000;`
 */
const AMM_MAX_TRADING_FEE = 1000;

const AMM_DEPOSIT_FLAGS_MASK = AMM_DEPOSIT_FLAG_BITS.reduce<number>(
  (acc, bit) => acc | bit,
  0,
);

/**
 * The per-deposit-mode field matrix.
 *
 * rippled `AMMDeposit::preflight`
 * (`src/libxrpl/tx/transactors/dex/AMMDeposit.cpp:66–112`) fixes which of
 * `Amount`, `Amount2`, `EPrice`, `LPTokenOut` and `TradingFee` may accompany
 * each deposit mode:
 *
 *   tfLPToken         — LPTokenOut, [Amount, Amount2]   (both or neither)
 *   tfSingleAsset     — Amount, [LPTokenOut]
 *   tfTwoAsset        — Amount, Amount2, [LPTokenOut]
 *   tfOneAssetLPToken — Amount and LPTokenOut
 *   tfLimitLPToken    — Amount and EPrice
 *   tfTwoAssetIfEmpty — Amount, Amount2, [TradingFee]
 *
 * `required` are the fields the mode must carry, `forbidden` the ones it
 * must not, and `amountPair` is rippled's extra rule for tfLPToken, where
 * `Amount` and `Amount2` must both be present or both absent.
 *
 * This table is the single place that decides *placement*. `TradingFee`'s
 * value rules live with the field; where the field may appear is decided
 * here, so there is one answer per question.
 */
interface DepositModeSpec {
  /** The mode's name, for the error message. */
  readonly label: string;
  /** Fields the mode requires. */
  readonly required: readonly string[];
  /** Fields the mode forbids. */
  readonly forbidden: readonly string[];
  /** Whether `Amount` and `Amount2` must both be present or both absent. */
  readonly amountPair: boolean;
}

const DEPOSIT_MODE_SPECS: Readonly<Record<number, DepositModeSpec>> = {
  [TF_LP_TOKEN]: {
    label: 'tfLPToken',
    required: ['LPTokenOut'],
    forbidden: ['EPrice', 'TradingFee'],
    amountPair: true,
  },
  [TF_SINGLE_ASSET]: {
    label: 'tfSingleAsset',
    required: ['Amount'],
    forbidden: ['Amount2', 'EPrice', 'TradingFee'],
    amountPair: false,
  },
  [TF_TWO_ASSET]: {
    label: 'tfTwoAsset',
    required: ['Amount', 'Amount2'],
    forbidden: ['EPrice', 'TradingFee'],
    amountPair: false,
  },
  [TF_ONE_ASSET_LP_TOKEN]: {
    label: 'tfOneAssetLPToken',
    required: ['Amount', 'LPTokenOut'],
    forbidden: ['Amount2', 'EPrice', 'TradingFee'],
    amountPair: false,
  },
  [TF_LIMIT_LP_TOKEN]: {
    label: 'tfLimitLPToken',
    required: ['Amount', 'EPrice'],
    forbidden: ['LPTokenOut', 'Amount2', 'TradingFee'],
    amountPair: false,
  },
  [TF_TWO_ASSET_IF_EMPTY]: {
    label: 'tfTwoAssetIfEmpty',
    required: ['Amount', 'Amount2'],
    forbidden: ['EPrice', 'LPTokenOut'],
    amountPair: false,
  },
};

// rippled `TxFlags.h:43-46` — `tfUniversal = tfFullyCanonicalSig |
// tfInnerBatchTxn`. These are the only two bits legal on every transaction
// type, and `tfAMMDepositMask` subtracts them, so they are legal here too.
const UNIVERSAL_FLAGS = 0x80000000 | 0x40000000;

// rippled builds `tfAMMDepositMask` as `~(tfUniversal | <the six deposit
// flags>)` via the `TO_MASK` macro (`TxFlags.h:264-266`). That mask is the set
// of INVALID bits; its complement is the set of valid ones. The ledger checks
// this *before* the exactly-one rule and answers `temINVALID_FLAG`.
//
// Counting modes alone is not enough: `tfWithdrawAll` (0x00020000) is not a
// deposit mode, so `tfSingleAsset | tfWithdrawAll` still contains exactly one
// deposit mode — but the ledger refuses the whole transaction, because that
// bit is not legal on an AMMDeposit at all.
const AMM_DEPOSIT_VALID_FLAGS = UNIVERSAL_FLAGS | AMM_DEPOSIT_FLAGS_MASK;

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
export interface AmmDepositProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
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
  /**
   * The AMM's trading fee, in tenths of a basis point.
   *
   * Optional, and only permitted with the `tfTwoAssetIfEmpty` deposit mode —
   * rippled rejects it in every other mode. When present it must be an
   * integer in `[0, 1000]`.
   */
  TradingFee?: number | undefined;
  /** Bit-flags for this transaction. Numeric or boolean map. */
  Flags?: number | AMMDepositFlagsInterface | undefined;
}

export interface AmmDeposit extends Readonly<AmmDepositProps> {
  readonly TransactionType: 'AMMDeposit';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<AmmDepositProps>): AmmDeposit;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Bit-count of a 32-bit integer (popcount). Used to verify that
 * exactly one of the six AMM-deposit mode flag bits is set.
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
 * caller passed a numeric value or a boolean `AMMDepositFlagsInterface`.
 */
function flagsToNumber(
  flags: number | AMMDepositFlagsInterface | undefined,
): number {
  if (flags === undefined) return 0;
  if (typeof flags === 'number') return flags;
  let n = 0;
  if (flags.tfLPToken) n |= TF_LP_TOKEN;
  if (flags.tfSingleAsset) n |= TF_SINGLE_ASSET;
  if (flags.tfTwoAsset) n |= TF_TWO_ASSET;
  if (flags.tfOneAssetLPToken) n |= TF_ONE_ASSET_LP_TOKEN;
  if (flags.tfLimitLPToken) n |= TF_LIMIT_LP_TOKEN;
  if (flags.tfTwoAssetIfEmpty) n |= TF_TWO_ASSET_IF_EMPTY;
  return n;
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

  // ── Flags ── two checks, in rippled's order. ──
  //
  //    (a) MEMBERSHIP — every bit set must be legal on an AMMDeposit, i.e.
  //        within `(~(tfUniversal | the six deposit flags))`. rippled answers
  //        `temINVALID_FLAG` here (TxFlags.h:264-266, 169-176, 43-46).
  //    (b) CARDINALITY — exactly one deposit-mode bit. rippled answers
  //        `temMALFORMED` here (AMMDeposit.cpp:72; xrpl.org `ammdeposit.md`
  //        line 129: "You must specify **exactly one** of these flags, plus
  //        any global flags").
  //
  //    Both run unconditionally: an absent `Flags`, an explicit `undefined`,
  //    and `Flags: 0` all mean "no mode flag set" and must throw.
  //
  //    Placed last so that field-level errors still surface first, which
  //    keeps the more specific message for the more specific mistake.
  const numericFlags = flagsToNumber(props.Flags);

  // `>>> 0` is required. JS bitwise operators are signed 32-bit, so `~mask` is
  // negative and composing a value that includes tfFullyCanonicalSig
  // (0x80000000) overflows to a negative number unless coerced. Without it the
  // comparison is wrong and the test values built in the suite are not the
  // numbers they look like.
  if (((numericFlags & ~AMM_DEPOSIT_VALID_FLAGS) >>> 0) !== 0) {
    throw new ValidationError(
      'AMMDeposit: Flags contains a bit that is not valid for this transaction type (only tfFullyCanonicalSig, tfInnerBatchTxn, and the six AMM-deposit mode flags are allowed)',
    );
  }

  const ammFlagBits = numericFlags & AMM_DEPOSIT_FLAGS_MASK;
  if (ammFlagBits === 0) {
    throw new ValidationError(
      'AMMDeposit: Flags must specify exactly one AMM-deposit mode flag (tfLPToken, tfSingleAsset, tfTwoAsset, tfOneAssetLPToken, tfLimitLPToken, or tfTwoAssetIfEmpty)',
    );
  }
  if (popcount32(ammFlagBits) !== 1) {
    throw new ValidationError(
      'AMMDeposit: Flags must specify exactly one AMM-deposit mode flag (got multiple)',
    );
  }

  // ── Deposit-mode field matrix ──
  //
  //   rippled `AMMDeposit::preflight` fixes which fields may accompany each
  //   deposit mode (lines 66–112). The mode flag says which shape the
  //   deposit has; these rules say which fields that shape may carry.
  //
  //   Placed right after the Flags block, because the mode is what selects
  //   the row, and before the `TradingFee` value check, because rippled
  //   answers the placement question first (`temMALFORMED`) and the value
  //   question second (`temBAD_FEE`).
  const modeSpec = DEPOSIT_MODE_SPECS[ammFlagBits];
  if (modeSpec === undefined) {
    // Unreachable in practice: the cardinality check above guarantees
    // exactly one of the six mode bits, and every one of them has a row
    // here. If a seventh deposit mode is ever added to
    // `AMM_DEPOSIT_FLAG_BITS` without a matching row, this fails loudly
    // rather than silently accepting any field combination.
    throw new ValidationError('AMMDeposit: unknown deposit mode');
  }
  const present: Readonly<Record<string, boolean>> = {
    Amount: props.Amount !== undefined,
    Amount2: props.Amount2 !== undefined,
    EPrice: props.EPrice !== undefined,
    LPTokenOut: props.LPTokenOut !== undefined,
    TradingFee: props.TradingFee !== undefined,
  };
  // The forbidden check runs FIRST, on purpose. A field the mode forbids
  // has to be removed no matter what else is wrong, whereas a missing
  // required field might be satisfied by a different valid shape — and
  // telling the caller to add `Amount` when `Amount2` is also present
  // would only lead them to a second error. rippled combines both into
  // one condition (`!amount || amount2 || ePrice || tradingFee`) and so
  // does not answer the question; the library can, and should.
  for (const field of modeSpec.forbidden) {
    if (present[field]) {
      throw new ValidationError(
        `AMMDeposit: ${field} is not allowed with the ${modeSpec.label} deposit mode`,
      );
    }
  }
  for (const field of modeSpec.required) {
    if (!present[field]) {
      throw new ValidationError(
        `AMMDeposit: ${modeSpec.label} requires ${field}`,
      );
    }
  }
  if (modeSpec.amountPair && present['Amount'] !== present['Amount2']) {
    throw new ValidationError(
      `AMMDeposit: ${modeSpec.label} requires Amount and Amount2 to both be present or both absent`,
    );
  }

  // ── TradingFee ── its VALUE rules. Where the field may appear is the
  //   matrix's job above; rippled checks placement (temMALFORMED) before
  //   value (temBAD_FEE), and so does this.
  //
  //   rippled `AMMDeposit.cpp:168`:
  //     `if (tradingFee > kTradingFeeThreshold) return temBAD_FEE;`
  //   with `kTradingFeeThreshold = 1000`
  //   (`include/xrpl/protocol/AMMCore.h:16`).
  if (props.TradingFee !== undefined) {
    if (!isNumber(props.TradingFee) || !Number.isInteger(props.TradingFee)) {
      throw new ValidationError(
        'AMMDeposit: TradingFee must be an integer (UINT16)',
      );
    }
    if (props.TradingFee < 0 || props.TradingFee > AMM_MAX_TRADING_FEE) {
      throw new ValidationError(
        `AMMDeposit: TradingFee must be in [0, ${AMM_MAX_TRADING_FEE}]`,
      );
    }
  }

  // ─── Base transaction fields ───
  // Catches the seven shared base fields this factory does not otherwise
  // check: Memos, SourceTag, LastLedgerSequence, AccountTxnID, NetworkID,
  // Delegate, TicketSequence.
  //
  // Placed AFTER the AMMDeposit-specific checks so a more specific message
  // wins for a more specific mistake, and this acts as the backstop for
  // everything shared across transaction types.
  //
  // `TransactionType` is supplied because the validator checks a transaction,
  // not a props bag — the factory injects it in `buildFrozenTx` below.
  validateBaseTransaction({ TransactionType: 'AMMDeposit', ...props });

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