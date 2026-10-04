/**
 * Functional AMMDeposit factory — frozen-object style.
 *
 * Adds liquidity to an AMM instance and receives LP tokens in exchange.
 * Validation happens at construction; there is no way to construct an
 * invalid tx.
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
 *
 *   9. `Flags` must contain exactly one AMM-deposit mode flag.
 *      The class API performs no flag validation at all: `grep -n "Flags"
 *      xrpl.js src/models/transactions/AMMDeposit.ts` returns only the
 *      enum and the interface, never a check inside
 *      `validateAMMDeposit` (lines 85–133). This factory enforces the
 *      rule the same way `ammWithdraw` does.
 *      Source: xrpl.org `ammdeposit.md` line 129 — "You must specify
 *      **exactly one** of these flags, plus any global flags."
 *      That sentence is byte-identical to `ammwithdraw.md` line 107; the
 *      two rules are the same and only the flag list differs.
 */
import type { BasePropsFields } from '../../types/base.js';
import type { Amount, IssuedCurrencyAmount } from '../../types/amounts.js';
import type { AMMDepositFlagsInterface } from '../../types/flags.js';
import {
  isAccount,
  isAmount,
  isIssuedCurrency,
  isIssuedCurrencyAmount,
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
// Note the sparse bit positions: 0x00020000 and 0x00040000 are
// AMM-*withdraw* modes (tfWithdrawAll, tfOneAssetWithdrawAll), not deposit
// modes, so they are absent above. The mask is therefore required — a
// popcount of the raw `Flags` would miscount a withdraw bit as a second
// deposit mode.
//
// They are non-overlapping single bits, so an "exactly one" check
// reduces to: popcount(flags & MASK) === 1.
const AMM_DEPOSIT_FLAG_BITS = [
  0x00010000, // tfLPToken
  0x00080000, // tfSingleAsset
  0x00100000, // tfTwoAsset
  0x00200000, // tfOneAssetLPToken
  0x00400000, // tfLimitLPToken
  0x00800000, // tfTwoAssetIfEmpty
] as const;

const AMM_DEPOSIT_FLAGS_MASK = AMM_DEPOSIT_FLAG_BITS.reduce<number>(
  (acc, bit) => acc | bit,
  0,
);

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
  if (flags.tfLPToken) n |= 0x00010000;
  if (flags.tfSingleAsset) n |= 0x00080000;
  if (flags.tfTwoAsset) n |= 0x00100000;
  if (flags.tfOneAssetLPToken) n |= 0x00200000;
  if (flags.tfLimitLPToken) n |= 0x00400000;
  if (flags.tfTwoAssetIfEmpty) n |= 0x00800000;
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