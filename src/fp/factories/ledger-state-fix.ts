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
 * Note: `BookDirectory` appears in the xrpl.js binary definitions
 * (`{"name": "BookDirectory", "optionality": 1}`) but is not part of
 * the user-facing transaction reference for any documented
 * `LedgerFixType`. It is reserved for future fix types and is not
 * exposed on the factory interface.
 */
import { isAccount, isNumber, isString } from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

/** Minimum `Fee` for a LedgerStateFix per the Special Transaction Cost rule. */
const MIN_FEE_DROPS = 2_000_000; // 2 XRP = owner reserve for one item
/** `LedgerFixType` is a UInt16 per the binary serialization. */
const LEDGER_FIX_TYPE_MAX = 0xffff;
/** The only documented fix type (NFToken-page-links). */
const LEDGER_FIX_TYPE_NFTOKEN_PAGE_LINKS = 1;

// ─── Public types ────────────────────────────────────────────────────

export interface LedgerStateFixProps {
  /** Sender. Classic or X-address. */
  Account: string;
  /**
   * The type of fix to apply. UInt16 (0..65535). Currently only `1` is
   * defined (NFToken-page-links fix); other values yield
   * `tefINVALID_LEDGER_FIX_TYPE` at apply time.
   */
  LedgerFixType: number;
  /**
   * The account whose ledger entry needs fixing. Required when
   * `LedgerFixType === 1` (the NFToken-page-links fix); optional
   * otherwise. Classic or X-address. Does not need to match `Account`.
   */
  Owner?: string | undefined;
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

  // ── Owner ── required iff LedgerFixType === 1.
  if (props.LedgerFixType === LEDGER_FIX_TYPE_NFTOKEN_PAGE_LINKS) {
    if (props.Owner === undefined) {
      throw new ValidationError(
        'LedgerStateFix: Owner is required when LedgerFixType === 1 (NFToken-page-links fix)',
      );
    }
  }
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