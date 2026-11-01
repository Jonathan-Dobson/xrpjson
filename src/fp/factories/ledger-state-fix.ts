/**
 * Functional LedgerStateFix factory — frozen-object style.
 *
 * `LedgerStateFix` is an internal, amendment-gated transaction used by
 * the network itself to repair corruptions to ledger state. It was
 * introduced by the `fixNFTokenPageLinks` amendment to repair broken
 * links in NFToken directories; the type is extensible so that future
 * fixes can be added with new `LedgerFixType` values.
 *
 * Users rarely submit these, but the factory validates the shape so any
 * tooling that emits one cannot produce a malformed wire format.
 *
 *   import { ledgerStateFix } from 'xrpjson';
 *   const tx = ledgerStateFix({
 *     Account,
 *     LedgerFixType: 1,
 *     Owner,        // the account whose NFToken directory needs fixing
 *     Fee: '2000000',
 *     Sequence: 2,
 *   });
 *   const j = tx.toJSON();
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/ledgerstatefix
 * @see https://xrpl.org/resources/known-amendments#fixnftokenpagelinks
 *
 * Affected amendment:
 *   - `fixNFTokenPageLinks` — introduces `LedgerStateFix` and the only
 *     currently-defined `LedgerFixType` (value `1`, fix an NFToken
 *     directory's missing page link).
 *
 * ## Divergences
 *
 * The class-based API at the Class API's `LedgerStateFix` has an
 * empty `ASSIGNABLE_FIELDS` list and accepts any props blindly through
 * `applyManifest`. It does not validate any field, so the factory fills
 * every spec guard here:
 *
 *   1. `LedgerFixType` is a `UInt16` (0..65535).
 *      The class accepts any value (including strings, negative numbers,
 *      out-of-range numbers). The binary serialization rejects
 *      `LedgerFixType` outside UInt16 with `temMALFORMED`, and an
 *      undefined value triggers `tefINVALID_LEDGER_FIX_TYPE`.
 *      Source: xrpl-dev-portal `docs/references/protocol/transactions/
 *              types/ledgerstatefix.md` (Field table: UInt16;
 *              Error Cases: `tefINVALID_LEDGER_FIX_TYPE`);
 *              xrpl.js `ripple-binary-codec/src/enums/definitions.json`
 *              (`"LedgerStateFix": [{ "name": "LedgerFixType",
 *              "optionality": 0 }]`).
 *
 *   2. `Owner` is required when `LedgerFixType === 1`.
 *      The class has no field for `Owner` and skips this check. The
 *      spec mandates `Owner` for type 1 (the NFToken-page-links fix);
 *      missing it yields `temMALFORMED`.
 *      Source: xrpl-dev-portal `docs/references/protocol/transactions/
 *              types/ledgerstatefix.md` (Field table row for `Owner`:
 *              "_Required if LedgerFixType is 1._").
 *
 *   3. `Fee` must meet the special transaction cost (≥ owner reserve).
 *      The class has no fee guard. The docs explicitly state that this
 *      transaction type "must pay a special transaction cost equal to
 *      at least the owner reserve for one item (currently 2,000,000
 *      drops)". The fee is charged even when the transaction fails, so
 *      submitting with a too-low fee wastes the included transactions
 *      that run alongside (e.g. in a Batch).
 *      Source: xrpl-dev-portal `docs/references/protocol/transactions/
 *              types/ledgerstatefix.md` (Special Transaction Cost
 *              section; example JSON shows `Fee: "2000000"`);
 *              xrpl-dev-portal `docs/references/protocol/data-types/
 *              basic-data-types.md` (owner reserve: 2 XRP = 2,000,000
 *              drops).
 *
 *   4. `Account` must be a valid XRPL classic address.
 *      The class passes any string through. The binary codec rejects
 *      malformed addresses with `temMALFORMED`.
 *      Source: xrpl-dev-portal `docs/references/protocol/transactions/
 *              types/ledgerstatefix.md` (Example JSON uses
 *              `rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn` — classic address
 *              form).
 *
 *   5. `LedgerFixType` must be a known fix type: `1` (NFToken-page-links) or
 *      `2` (book exchange rate). The class has no field for `LedgerFixType`
 *      and skips this check. rippled's `preflight` switches on the value and
 *      returns `tefINVALID_LEDGER_FIX_TYPE` for anything else — the UInt16
 *      range the binary serialization allows is wider than the set of fix
 *      types the ledger implements.
 *      Source: rippled `src/libxrpl/tx/transactors/system/LedgerStateFix.cpp:58–74`
 *      (the `switch (fixType)` with `default: return tefINVALID_LEDGER_FIX_TYPE;`)
 *      and `include/xrpl/tx/transactors/system/LedgerStateFix.h:19–22`
 *      (`enum class FixType : std::uint16_t { NfTokenPageLink = 1, BookExchangeRate = 2 }`).
 *      Note that the xrpl-dev-portal reference page still documents only type
 *      `1` — it trails the ledger, which has shipped `2` since.
 *
 *   6. Each fix type allows exactly ONE fix-specific field, and requires it.
 *      The class has no field for either, so it skips this check entirely.
 *      rippled maps each fix type to its field and rejects the transaction
 *      unless that field is present and no other fix-specific field is
 *      ("Each fix type allows exactly one fix-specific field" →
 *      `temINVALID`). Type `1` requires `Owner` and forbids `BookDirectory`;
 *      type `2` requires `BookDirectory` and forbids `Owner`.
 *      Source: rippled `src/libxrpl/tx/transactors/system/LedgerStateFix.cpp:27–30`
 *      (`kLedgerFixFields` = `{{NfTokenPageLink, &sfOwner}, {BookExchangeRate, &sfBookDirectory}}`),
 *      `:44–53` (`hasUnexpectedFixField`), and `:76–79` (the `temINVALID`).
 *
 *   7. `BookDirectory` must be a 256-bit hex value. rippled reads it as a
 *      `uint256` — the key of the book directory whose exchange rate is
 *      wrong — and the class does not model the field at all.
 *      Source: rippled `src/libxrpl/tx/transactors/system/LedgerStateFix.cpp:107`
 *      (`ctx.tx.getFieldH256(sfBookDirectory)`);
 *      `include/xrpl/protocol/detail/sfields.macro:189`
 *      (`TYPED_SFIELD(sfBookDirectory, UINT256, 16)`).
 *
 * Note: the xrpl-dev-portal reference page for this transaction still
 * documents only fix type `1` and does not mention `BookDirectory`. rippled
 * has shipped type `2` (`BookExchangeRate`), gated on the `fixCleanup3_2_0`
 * amendment — so the library follows the ledger, not the page. A network
 * without that amendment enabled returns `temDISABLED` for type `2`, which
 * is network state the factory cannot see.
 */
import type { BasePropsFields } from '../../types/base.js';
import {
  isAccount,
  isLedgerEntryId,
  isNumber,
  isString,
} from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

/** Minimum `Fee` for a LedgerStateFix per the Special Transaction Cost rule. */
const MIN_FEE_DROPS = 2_000_000; // 2 XRP = owner reserve for one item
/** `LedgerFixType` is a UInt16 per the binary serialization. */
const LEDGER_FIX_TYPE_MAX = 0xffff;
/**
 * The fix types the ledger implements. rippled's `preflight` switches on this
 * value and returns `tefINVALID_LEDGER_FIX_TYPE` for anything outside the set.
 * Source: rippled `include/xrpl/tx/transactors/system/LedgerStateFix.h:19–22`.
 */
const LEDGER_FIX_TYPE_NFTOKEN_PAGE_LINKS = 1;
const LEDGER_FIX_TYPE_BOOK_EXCHANGE_RATE = 2;

// ─── Public types ────────────────────────────────────────────────────

// Why the two keys are omitted — do not "simplify" this away:
//  TransactionType: buildFrozenTx spreads props AFTER setting it, so a
//    caller-supplied value would win. See payment.ts:36-40.
//  Flags: this transaction defines no flags of its own, so the key is
//    dropped rather than inherited as a loose `number`.
//
// The base is `BasePropsFields`, not `BaseTransactionFields`: the latter
// carries a trailing `[key: string]: unknown` that widens `keyof` to
// `string | number`, so `Omit<BaseTransactionFields, ...>` would collapse to
// a bare index signature and silently drop all fourteen named members.
// See the doc comment on BasePropsFields in src/types/base.ts.
export interface LedgerStateFixProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  /** Sender. Classic or X-address. */
  Account: string;
  /**
   * The type of fix to apply. UInt16 (0..65535), and one of the two fix
   * types the ledger implements: `1` (NFToken-page-links) or `2` (book
   * exchange rate). Any other value yields `tefINVALID_LEDGER_FIX_TYPE`.
   */
  LedgerFixType: number;
  /**
   * The account whose ledger entry needs fixing. Required when
   * `LedgerFixType === 1` (the NFToken-page-links fix); must be absent when
   * `LedgerFixType === 2`. Classic or X-address. Does not need to match
   * `Account`.
   */
  Owner?: string | undefined;
  /**
   * The key of the book directory whose exchange rate needs fixing, as 64 hex
   * characters. Required when `LedgerFixType === 2` (the book-exchange-rate
   * fix); must be absent when `LedgerFixType === 1`.
   */
  BookDirectory?: string | undefined;
  /**
   * Fee in drops. Must be ≥ 2,000,000 (owner reserve for one item)
   * per the Special Transaction Cost rule. Required for submission.
   */
  Fee?: string | undefined;
  /** Account sequence. Required for submission. */
  Sequence?: number | undefined;
}

export interface LedgerStateFix
  extends Readonly<LedgerStateFixProps> {
  readonly TransactionType: 'LedgerStateFix';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<LedgerStateFixProps>): LedgerStateFix;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function ledgerStateFix(
  props: LedgerStateFixProps,
): LedgerStateFix {
  // ── Account ── required, must be a valid XRPL classic or X-address.
  require(props.Account, 'LedgerStateFix: Account is required', isString);
  if (!isAccount(props.Account)) {
    throw new ValidationError(
      'LedgerStateFix: Account must be a valid XRPL classic or X-address',
    );
  }

  // ── LedgerFixType ── required, UInt16.
  require(
    props.LedgerFixType,
    'LedgerStateFix: LedgerFixType is required (UInt16, currently only 1 is defined)',
    isNumber,
  );
  if (
    !Number.isInteger(props.LedgerFixType) ||
    props.LedgerFixType < 0 ||
    props.LedgerFixType > LEDGER_FIX_TYPE_MAX
  ) {
    throw new ValidationError(
      `LedgerStateFix: LedgerFixType must be an integer in [0, ${LEDGER_FIX_TYPE_MAX}] (UInt16)`,
    );
  }

  // ── LedgerFixType ── must be one of the fix types the ledger implements.
  // The UInt16 range is wider than that set: rippled switches on the value
  // and rejects anything else with `tefINVALID_LEDGER_FIX_TYPE`.
  if (
    props.LedgerFixType !== LEDGER_FIX_TYPE_NFTOKEN_PAGE_LINKS &&
    props.LedgerFixType !== LEDGER_FIX_TYPE_BOOK_EXCHANGE_RATE
  ) {
    throw new ValidationError(
      'LedgerStateFix: LedgerFixType must be 1 (NFToken-page-links) or 2 (book exchange rate)',
    );
  }

  // ── Owner / BookDirectory ── each fix type allows exactly ONE fix-specific
  // field, and requires it. rippled rejects a missing or an extra one with
  // `temINVALID`.
  if (props.LedgerFixType === LEDGER_FIX_TYPE_NFTOKEN_PAGE_LINKS) {
    if (props.Owner === undefined) {
      throw new ValidationError(
        'LedgerStateFix: Owner is required when LedgerFixType === 1 (NFToken-page-links fix)',
      );
    }
    if (props.BookDirectory !== undefined) {
      throw new ValidationError(
        'LedgerStateFix: BookDirectory is not allowed when LedgerFixType === 1 (NFToken-page-links fix)',
      );
    }
  } else {
    if (props.BookDirectory === undefined) {
      throw new ValidationError(
        'LedgerStateFix: BookDirectory is required when LedgerFixType === 2 (book exchange rate fix)',
      );
    }
    if (props.Owner !== undefined) {
      throw new ValidationError(
        'LedgerStateFix: Owner is not allowed when LedgerFixType === 2 (book exchange rate fix)',
      );
    }
  }

  // ── Owner ── shape.
  if (props.Owner !== undefined) {
    if (!isString(props.Owner)) {
      throw new ValidationError(
        'LedgerStateFix: Owner must be a string address',
      );
    }
    if (!isAccount(props.Owner)) {
      throw new ValidationError(
        'LedgerStateFix: Owner must be a valid XRPL classic or X-address',
      );
    }
  }

  // ── BookDirectory ── a 256-bit value: the key of the book directory.
  if (props.BookDirectory !== undefined) {
    if (!isLedgerEntryId(props.BookDirectory)) {
      throw new ValidationError(
        'LedgerStateFix: BookDirectory must be a 64-character hex string',
      );
    }
  }

  // ── Fee ── Special Transaction Cost: ≥ owner reserve.
  // The fee is charged even on failure, so an under-funded submit burns
  // its place in any containing Batch.
  if (props.Fee !== undefined) {
    if (!isString(props.Fee) || !/^[0-9]+$/u.test(props.Fee)) {
      throw new ValidationError(
        'LedgerStateFix: Fee must be a base-10 string of drops',
      );
    }
    if (BigInt(props.Fee) < BigInt(MIN_FEE_DROPS)) {
      throw new ValidationError(
        `LedgerStateFix: Fee must be ≥ ${MIN_FEE_DROPS} drops (Special Transaction Cost = owner reserve for one item)`,
      );
    }
  }

  // ── Sequence ── integer ≥ 0.
  if (props.Sequence !== undefined) {
    if (
      !isNumber(props.Sequence) ||
      !Number.isInteger(props.Sequence) ||
      props.Sequence < 0
    ) {
      throw new ValidationError(
        'LedgerStateFix: Sequence must be a non-negative integer',
      );
    }
  }

  // ─── Base transaction fields ───
  // Catches the seven shared fields this factory now accepts through
  // `BasePropsFields` but does not otherwise check: Memos, SourceTag,
  // LastLedgerSequence, AccountTxnID, NetworkID, Delegate, TicketSequence.
  // Placed AFTER the LedgerStateFix-specific checks so a more specific message
  // wins for a more specific mistake, and this acts as the backstop for
  // everything shared across transaction types.
  //
  // `TransactionType` is supplied because the validator checks a transaction,
  // not a props bag — the factory injects it in `buildFrozenTx` below.
  validateBaseTransaction({ TransactionType: 'LedgerStateFix', ...props });

  return buildFrozenTx<LedgerStateFixProps, LedgerStateFix>(
    'LedgerStateFix',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: LedgerStateFix) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: LedgerStateFix, overrides: Partial<LedgerStateFixProps>) {
        return ledgerStateFix(mergeForWith(this, overrides));
      },
    },
  );
}