/**
 * Functional SponsorshipSet factory — frozen-object style.
 *
 * Creates, updates, or deletes a `Sponsorship` ledger entry that defines a
 * fee-and-reserve sponsorship relationship between two accounts. Validation
 * happens at construction; there is no way to construct an invalid tx.
 *
 *   import { sponsorshipSet } from 'xrpjson';
 *   // Create (sponsor allocates a 5-reserve budget to the sponsee)
 *   const tx = sponsorshipSet({
 *     Account: SPONSOR,
 *     Sponsee: SPONSEE,
 *     RemainingOwnerCountDelta: 5,
 *     FeeAmountDelta: '1000000',
 *   });
 *   // Sponsee deletes via CounterpartySponsor (only valid with tfDeleteObject)
 *   const tx2 = sponsorshipSet({
 *     Account: SPONSEE,
 *     CounterpartySponsor: SPONSOR,
 *     Flags: SponsorshipSetFlags.tfDeleteObject,
 *   });
 *   const j = tx.toJSON();
 *   const tx3 = tx.with({ MaxFee: '1000' });
 *
 * Affected amendments:
 *   - `Sponsor` (base SponsorshipSet)
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/sponsorshipset
 * @see xrpl.js `validateSponsorshipSet`
 *      (`~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/sponsorshipSet.ts`)
 *
 * ## Divergences
 *
 * The factory enforces six preclaim rules that the class API
 * (the Class API's `SponsorshipSet`) skips. Each one is mandated by
 * the Sponsor amendment / `validateSponsorshipSet`.
 *
 *   1. `CounterpartySponsor` may only be supplied with `tfDeleteObject`.
 *      Source: xrpl-dev-portal `sponsorshipset.md` Error Cases table —
 *      `temMALFORMED`: "Both `CounterpartySponsor` and `Sponsee` are
 *      specified." and the in-C++ preflight (`SponsorshipSet.cpp`) which
 *      enforces "`CounterpartySponsor` implies tfDeleteObject".
 *      xrpl.js `validateSponsorshipSet` (lines 304–308) enforces this; the
 *      class does not.
 *
 *   2. With `tfDeleteObject`, none of `FeeAmountDelta`, `MaxFee`, or
 *      `RemainingOwnerCountDelta` may be supplied.
 *      Source: xrpl-dev-portal `sponsorshipset.md` Error Cases table —
 *      `temMALFORMED`: "The `tfDeleteObject` flag is enabled and
 *      `FeeAmountDelta`, `MaxFee`, or `RemainingOwnerCountDelta` is
 *      specified."
 *      xrpl.js `validateSponsorshipSet` (lines 310–326) enforces this; the
 *      class does not.
 *
 *   3. `Account` must not equal `Sponsee` (and must not equal
 *      `CounterpartySponsor`).
 *      Source: xrpl-dev-portal `sponsorshipset.md` Error Cases table —
 *      `temMALFORMED`: "The sponsor and sponsee are the same account."
 *      xrpl.js `validateSponsorshipSet` (lines 244–248 and 266–273)
 *      enforces both via `areAddressesEqual`; the class does not.
 *
 *   4. `FeeAmountDelta` must be a strictly canonical signed integer string
 *      (no leading zeros beyond "0" itself; no whitespace; no scientific
 *      notation; no decimals). `-0` and `007` and `1.5` are all rejected.
 *      Source: xrpl.js `SIGNED_INTEGER_SANITY_CHECK` regex
 *      `^-?(?:0|[1-9][0-9]*)$/u` (`sponsorshipSet.ts` line 19). The class
 *      only checks `isString(FeeAmountDelta)`.
 *
 *   5. `MaxFee` must be a strictly canonical non-negative integer string
 *      (no leading zeros, no whitespace, no scientific notation, no
 *      decimals).
 *      Source: xrpl.js `INTEGER_SANITY_CHECK` regex
 *      `^(?:0|[1-9][0-9]*)$/u` (used at `sponsorshipSet.ts` line 358) and
 *      xrpl-dev-portal `sponsorshipset.md` Error Cases table —
 *      `temBAD_AMOUNT`: "`MaxFee` is negative or not denominated in XRP."
 *      The class only checks `isString(MaxFee)`.
 *
 *   6. `RemainingOwnerCountDelta` must be an integer in `[INT32_MIN,
 *      INT32_MAX]` (no fractional values, no overflow). A value of `0` is
 *      rejected.
 *      Source: xrpl-dev-portal `sponsorshipset.md` Error Cases table —
 *      `temINVALID`: "`RemainingOwnerCountDelta` value is zero" and
 *      `tecLIMIT_EXCEEDED`: "`Sponsorship.RemainingOwnerCount` exceeds
 *      the maximum value of an unsigned 32-bit integer." The class only
 *      checks `typeof === 'number'` and `=== 0`.
 *
 *   7. When not deleting, at least one of `FeeAmountDelta`,
 *      `RemainingOwnerCountDelta`, `MaxFee`, or a `RequireSignFor*` flag
 *      must be supplied.
 *      Source: xrpl.js `validateSponsorshipSet` (lines 398–408) and the
 *      xrpl-dev-portal sponsorshipset spec ("A sponsorship entry must keep
 *      at least some fee budget or reserve budget. … the transaction
 *      fails"). The class does not check this; passing only `Sponsee` (or
 *      only `CounterpartySponsor` plus `tfDeleteObject`) would be
 *      accepted locally and rejected by the ledger with `temMALFORMED` /
 *      `temEMPTY_DEST`.
 *
 * Note: the factory is the **only** place that validates
 * `Sponsee`/`CounterpartySponsor` against `Account` for the
 * "sponsee cannot create or modify" rule. The class lets you build a tx
 * with `Account = sponsee`, `Sponsee = sponsor` and no delete flag, which
 * the ledger will reject with `temMALFORMED`. The factory catches that at
 * construction time by combining checks 1 and 3.
 */
import type { BasePropsFields } from '../../types/base.js';
import type { SponsorshipSetFlagsInterface } from '../../types/flags.js';
import { SponsorshipSetFlags } from '../../types/flags.js';
import { isAccount, isRecord, isString } from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// Matches an optionally negative, canonical integer string (no whitespace,
// scientific notation, decimals, or leading zeros other than "0" itself).
// Mirrors xrpl.js `SIGNED_INTEGER_SANITY_CHECK`.
const SIGNED_INTEGER_SANITY_CHECK = /^-?(?:0|[1-9][0-9]*)$/u;
// Matches a non-negative canonical integer string.
const INTEGER_SANITY_CHECK = /^(?:0|[1-9][0-9]*)$/u;

// INT32 range per the SponsorshipSet spec (`tecLIMIT_EXCEEDED`).
const INT32_MIN = -2_147_483_648;
const INT32_MAX = 2_147_483_647;

// Bitmask covering every "modify" flag (RequireSignFor* set/clear). These
// conflict with tfDeleteObject per the spec (`temINVALID_FLAG`).
const SPONSORSHIP_SET_MODIFY_FLAGS =
  SponsorshipSetFlags.tfSponsorshipSetRequireSignForFee |
  SponsorshipSetFlags.tfSponsorshipClearRequireSignForFee |
  SponsorshipSetFlags.tfSponsorshipSetRequireSignForReserve |
  SponsorshipSetFlags.tfSponsorshipClearRequireSignForReserve;

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
export interface SponsorshipSetProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  /** The unique address of the transaction sender (must be the sponsor). */
  Account: string;
  /** The sponsee to sponsor. If present, Account is the sponsor. */
  Sponsee?: string | undefined;
  /**
   * The sponsor's address. Identifies the sponsor when the sponsee
   * (`Account`) is submitting the transaction. Only valid together with
   * `tfDeleteObject`; the sponsee cannot create or modify a Sponsorship,
   * only delete one.
   */
  CounterpartySponsor?: string | undefined;
  /**
   * A signed delta (in drops of XRP) to apply to the sponsorship's fee
   * allocation. Positive tops up the budget the sponsee can draw on for
   * transaction fees; negative draws it down. Must not be zero.
   */
  FeeAmountDelta?: string | undefined;
  /**
   * The maximum fee (in drops of XRP) the sponsor is willing to pay per
   * transaction on behalf of the sponsee. Replaces (not adds to) the
   * current value. Must be a non-negative integer string of drops.
   */
  MaxFee?: string | undefined;
  /**
   * A signed delta to apply to `Sponsorship.RemainingOwnerCount` (the
   * number of reserve units the sponsor agrees to cover). Positive to
   * add coverage, negative to reduce it. Must be a non-zero integer.
   */
  RemainingOwnerCountDelta?: number | undefined;
  /** Bit-flags for this transaction. */
  Flags?: number | SponsorshipSetFlagsInterface | undefined;
}

export interface SponsorshipSet extends Readonly<SponsorshipSetProps> {
  readonly TransactionType: 'SponsorshipSet';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<SponsorshipSetProps>): SponsorshipSet;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Extract flag booleans from a transaction's `Flags` field, handling both
 * the numeric bitmask form and the boolean-map form. Mirrors
 * xrpl.js `getSponsorshipSetFlags` (sponsorshipSet.ts lines 156–209) but
 * without the `isDelete` decision (we return it directly).
 */
function getFlags(
  rawFlags: unknown,
): {
  isDelete: boolean;
  hasModifyFlag: boolean;
  hasFeeSignConflict: boolean;
  hasReserveSignConflict: boolean;
} {
  let flagsValue = 0;
  let hasModifyFlag = false;
  let hasFeeSignConflict = false;
  let hasReserveSignConflict = false;

  if (typeof rawFlags === 'number') {
    flagsValue = rawFlags;
    hasModifyFlag = (rawFlags & SPONSORSHIP_SET_MODIFY_FLAGS) !== 0;
    hasFeeSignConflict =
      (rawFlags &
        SponsorshipSetFlags.tfSponsorshipSetRequireSignForFee) !==
        0 &&
      (rawFlags &
        SponsorshipSetFlags.tfSponsorshipClearRequireSignForFee) !== 0;
    hasReserveSignConflict =
      (rawFlags &
        SponsorshipSetFlags.tfSponsorshipSetRequireSignForReserve) !==
        0 &&
      (rawFlags &
        SponsorshipSetFlags.tfSponsorshipClearRequireSignForReserve) !==
        0;
  } else if (isRecord(rawFlags)) {
    if (rawFlags['tfDeleteObject'] === true) {
      flagsValue = SponsorshipSetFlags.tfDeleteObject;
    }
    hasModifyFlag = Boolean(
      rawFlags['tfSponsorshipSetRequireSignForFee'] ||
        rawFlags['tfSponsorshipClearRequireSignForFee'] ||
        rawFlags['tfSponsorshipSetRequireSignForReserve'] ||
        rawFlags['tfSponsorshipClearRequireSignForReserve'],
    );
    hasFeeSignConflict = Boolean(
      rawFlags['tfSponsorshipSetRequireSignForFee'] === true &&
        rawFlags['tfSponsorshipClearRequireSignForFee'] === true,
    );
    hasReserveSignConflict = Boolean(
      rawFlags['tfSponsorshipSetRequireSignForReserve'] === true &&
        rawFlags['tfSponsorshipClearRequireSignForReserve'] === true,
    );
  }

  const isDelete = (flagsValue & SponsorshipSetFlags.tfDeleteObject) !== 0;
  return { isDelete, hasModifyFlag, hasFeeSignConflict, hasReserveSignConflict };
}

// ─── Factory ─────────────────────────────────────────────────────────

export function sponsorshipSet(props: SponsorshipSetProps): SponsorshipSet {
  // ── Account ── required, must be a valid XRPL classic or X-address.
  require(props.Account, 'SponsorshipSet: Account is required', isAccount);

  // ── Sponsee / CounterpartySponsor ── exactly one of the two must
  //    be present.
  const hasSponsee = props.Sponsee !== undefined;
  const hasCounterpartySponsor = props.CounterpartySponsor !== undefined;

  if (!hasSponsee && !hasCounterpartySponsor) {
    throw new ValidationError(
      'SponsorshipSet: must specify either Sponsee or CounterpartySponsor',
    );
  }
  if (hasSponsee && hasCounterpartySponsor) {
    throw new ValidationError(
      'SponsorshipSet: cannot specify both Sponsee and CounterpartySponsor',
    );
  }

  // ── Sponsee ── string + valid account + identity check vs Account.
  if (hasSponsee) {
    if (!isString(props.Sponsee)) {
      throw new ValidationError('SponsorshipSet: Sponsee must be a string');
    }
    if (props.Sponsee === props.Account) {
      throw new ValidationError(
        'SponsorshipSet: Account and Sponsee cannot be the same',
      );
    }
    if (!isAccount(props.Sponsee)) {
      throw new ValidationError(
        'SponsorshipSet: Sponsee must be a valid account address',
      );
    }
  }

  // ── CounterpartySponsor ── string + valid account + identity check.
  if (hasCounterpartySponsor) {
    if (!isString(props.CounterpartySponsor)) {
      throw new ValidationError(
        'SponsorshipSet: CounterpartySponsor must be a string',
      );
    }
    if (props.CounterpartySponsor === props.Account) {
      throw new ValidationError(
        'SponsorshipSet: Account and CounterpartySponsor cannot be the same',
      );
    }
    if (!isAccount(props.CounterpartySponsor)) {
      throw new ValidationError(
        'SponsorshipSet: CounterpartySponsor must be a valid account address',
      );
    }
  }

  const {
    isDelete,
    hasModifyFlag,
    hasFeeSignConflict,
    hasReserveSignConflict,
  } = getFlags(props.Flags);

  // ── Flag pair conflicts ── both Set+Clear on the same RequireSignFor*
  //    dimension are invalid (`temINVALID_FLAG`).
  if (hasFeeSignConflict) {
    throw new ValidationError(
      'SponsorshipSet: cannot set both tfSponsorshipSetRequireSignForFee and tfSponsorshipClearRequireSignForFee',
    );
  }
  if (hasReserveSignConflict) {
    throw new ValidationError(
      'SponsorshipSet: cannot set both tfSponsorshipSetRequireSignForReserve and tfSponsorshipClearRequireSignForReserve',
    );
  }

  // ── Sponsee-only-create-or-modify rule ── a sponsee cannot
  //    create/modify a Sponsorship, only delete one. So
  //    CounterpartySponsor is only valid with tfDeleteObject.
  if (hasCounterpartySponsor && !isDelete) {
    throw new ValidationError(
      'SponsorshipSet: CounterpartySponsor can only be used with tfDeleteObject (only the sponsor can create or modify a Sponsorship)',
    );
  }

  // ── tfDeleteObject constraints ── no modify flags, no data deltas.
  if (isDelete) {
    if (hasModifyFlag) {
      throw new ValidationError(
        'SponsorshipSet: cannot set RequireSignForFee/RequireSignForReserve flags together with tfDeleteObject',
      );
    }
    if (
      props.FeeAmountDelta !== undefined ||
      props.RemainingOwnerCountDelta !== undefined ||
      props.MaxFee !== undefined
    ) {
      throw new ValidationError(
        'SponsorshipSet: cannot include FeeAmountDelta, RemainingOwnerCountDelta, or MaxFee together with tfDeleteObject',
      );
    }
  }

  // ── FeeAmountDelta ── signed delta, strict integer string, non-zero.
  if (props.FeeAmountDelta !== undefined) {
    if (!isString(props.FeeAmountDelta)) {
      throw new ValidationError(
        'SponsorshipSet: FeeAmountDelta must be a string',
      );
    }
    if (!SIGNED_INTEGER_SANITY_CHECK.test(props.FeeAmountDelta)) {
      throw new ValidationError(
        'SponsorshipSet: FeeAmountDelta must be a numeric string',
      );
    }
    // BigInt so "-0" parses to 0n and is caught here.
    if (BigInt(props.FeeAmountDelta) === BigInt(0)) {
      throw new ValidationError(
        'SponsorshipSet: FeeAmountDelta must not be zero',
      );
    }
  }

  // ── MaxFee ── unsigned, strict non-negative integer string.
  if (props.MaxFee !== undefined) {
    if (!isString(props.MaxFee)) {
      throw new ValidationError('SponsorshipSet: MaxFee must be a string');
    }
    if (!INTEGER_SANITY_CHECK.test(props.MaxFee)) {
      throw new ValidationError(
        'SponsorshipSet: MaxFee must be a non-negative numeric string',
      );
    }
  }

  // ── RemainingOwnerCountDelta ── integer, non-zero, INT32 range.
  if (props.RemainingOwnerCountDelta !== undefined) {
    if (typeof props.RemainingOwnerCountDelta !== 'number') {
      throw new ValidationError(
        'SponsorshipSet: RemainingOwnerCountDelta must be a number',
      );
    }
    if (!Number.isInteger(props.RemainingOwnerCountDelta)) {
      throw new ValidationError(
        'SponsorshipSet: RemainingOwnerCountDelta must be an integer',
      );
    }
    if (props.RemainingOwnerCountDelta === 0) {
      throw new ValidationError(
        'SponsorshipSet: RemainingOwnerCountDelta must not be zero',
      );
    }
    if (
      props.RemainingOwnerCountDelta > INT32_MAX ||
      props.RemainingOwnerCountDelta < INT32_MIN
    ) {
      throw new ValidationError(
        `SponsorshipSet: RemainingOwnerCountDelta must be between ${INT32_MIN} and ${INT32_MAX}`,
      );
    }
  }

  // ── At-least-one-mutable-field rule (when not deleting) ──
  //    "A sponsorship entry must keep at least some fee budget or
  //    reserve budget." (xrpl-dev-portal `sponsorshipset.md`).
  //    This matches xrpl.js `validateSponsorshipSet` (lines 398–408) and
  //    is the canonical preclaim check; the class skips it.
  if (!isDelete) {
    if (
      props.FeeAmountDelta === undefined &&
      props.RemainingOwnerCountDelta === undefined &&
      props.MaxFee === undefined &&
      !hasModifyFlag
    ) {
      throw new ValidationError(
        'SponsorshipSet: must specify at least one of FeeAmountDelta, RemainingOwnerCountDelta, MaxFee, or a RequireSignFor flag',
      );
    }
  }

  // ─── Base transaction fields ───
  // Catches the seven shared fields this factory now accepts through
  // `BasePropsFields` but does not otherwise check: Memos, SourceTag,
  // LastLedgerSequence, AccountTxnID, NetworkID, Delegate, TicketSequence.
  // Placed AFTER the SponsorshipSet-specific checks so a more specific
  // message wins for a more specific mistake, and this acts as the backstop
  // for everything shared across transaction types.
  //
  // `TransactionType` is supplied because the validator checks a transaction,
  // not a props bag — the factory injects it in `buildFrozenTx` below.
  validateBaseTransaction({ TransactionType: 'SponsorshipSet', ...props });

  return buildFrozenTx<SponsorshipSetProps, SponsorshipSet>(
    'SponsorshipSet',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: SponsorshipSet) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: SponsorshipSet, overrides: Partial<SponsorshipSetProps>) {
        return sponsorshipSet(mergeForWith(this, overrides));
      },
    },
  );
}