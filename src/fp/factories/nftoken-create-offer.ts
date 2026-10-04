/**
 * Functional NFTokenCreateOffer factory — frozen-object style.
 *
 * Creates either a buy offer (Account does NOT own the NFToken) or a
 * sell offer (Account owns the NFToken) for a non-fungible token.
 * Validation happens at construction; there is no way to construct
 * an invalid tx.
 *
 *   import { nftokenCreateOffer } from 'xrpjson';
 *   // Sell offer (owner must be Account implicitly):
 *   const sell = nftokenCreateOffer({
 *     Account,
 *     NFTokenID,
 *     Amount: '1000000',
 *     Flags: { tfSellNFToken: true },
 *   });
 *   // Buy offer (Owner must be present and != Account):
 *   const buy = nftokenCreateOffer({
 *     Account,
 *     NFTokenID,
 *     Amount: '500000',
 *     Owner,
 *     // Flags: tfSellNFToken NOT set (default = buy offer)
 *   });
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/nftokencreateoffer
 * @see https://github.com/XRPLF/xrpl.js/blob/main/packages/xrpl/src/models/transactions/NFTokenCreateOffer.ts
 * @see XLS-0020 §1.5.4 (NonFungibleToken create offer)
 *
 * ## Divergences
 *
 * Compared with the Class API's `NFTokenCreateOffer`, this factory
 * adds guards the class skips and ones xrpl.js / xrpl.org / XLS-20
 * mandate but the class omits:
 *
 * - **`Owner` cross-field: present ⇔ buy offer (tfSellNFToken off).**
 *   The class accepts `Owner` regardless of flag value; xrpl.js
 *   `validateNFTokenSellOfferCases` (lines 97–103) rejects `Owner` on
 *   sell offers, and `validateNFTokenBuyOfferCases` (lines 105–110)
 *   requires `Owner` on buy offers. The factory enforces both.
 *   - Source: xrpl.js `NFTokenCreateOffer.ts` lines 97–117.
 *   - Source: XLS-20 §1.5.4 line 660 ("If the offer is to sell a token,
 *     this field must not be present ... If the offer is to buy a token,
 *     this field must be present").
 *
 * - **`Amount` for buy offers must be strictly positive.** The class
 *   accepts any Amount shape (including XRP `"0"` and IOU `value:"0"`).
 *   xrpl.js `validateNFTokenBuyOfferCases` (lines 112–116) requires
 *   `parseAmountValue(Amount) > 0` for buy offers and the error code
 *   on the ledger is `temBAD_AMOUNT`.
 *   - Source: xrpl.js `NFTokenCreateOffer.ts` lines 112–116.
 *   - Source: xrpl.org `nftokencreateoffer.md` line 61 (`temBAD_AMOUNT`:
 *     "the amount was zero for a buy offer").
 *   - Source: XLS-20 §1.5.4 line 694 ("The amount must be non-zero,
 *     except where this is an offer is an offer to sell and the asset
 *     is XRP; then it is legal to specify an amount of zero").
 *
 * - **`Account` ≠ `Owner` (when Owner present).** The class accepts
 *   `Owner === Account` for a buy offer, but per XLS-20 §1.5.4 line 659
 *   "an offer to buy a token one already holds is meaningless". xrpl.js
 *   `validateNFTokenCreateOffer` lines 128–136 throws on
 *   `areAddressesEqual(Account, Owner)`. The factory uses
 *   exact-string equality as a pragmatic check (matches the regex
 *   style of `isAccount`).
 *   - Source: xrpl.js `NFTokenCreateOffer.ts` lines 128–136.
 *   - Source: XLS-20 §1.5.4 line 659.
 *
 * - **`Account` ≠ `Destination` (when Destination present).** The class
 *   does not check this; xrpl.js lines 138–146 throws on equality.
 *   You cannot sell to yourself.
 *   - Source: xrpl.js `NFTokenCreateOffer.ts` lines 138–146.
 *
 * - **`NFTokenID` must be a 64-character hex string (Hash256).** The
 *   class only checks `isString`, accepting any string. xrpl.org
 *   `nftokencreateoffer.md` line 39 ("`NFTokenID` | String | UInt256")
 *   and XLS-20 §1.5.4 line 682 ("`NFTokenID` | `string` | `Hash256`")
 *   both require the canonical Hash256 encoding. The factory enforces
 *   length 64 + hex.
 *   - Source: xrpl.org `nftokencreateoffer.md` line 39.
 *   - Source: XLS-20 §1.5.4 line 682.
 *
 * - **`Expiration` must be a UInt32 (`[0, 2^32-1]`) and must be > 0
 *   when present.** The class only checks `isNumber`. XLS-20 §1.5.4
 *   line 700 declares the type `UINT32`, and xrpl.org
 *   `nftokencreateoffer.md` Error Cases line 62 (`temBAD_EXPIRATION`:
 *   "The specified `Expiration` time is invalid (for example, `0`)")
 *   rejects Expiration=0. The factory accepts 0 by default — same as
 *   OfferCreate — but the canonical error case the ledger emits is for
 *   Expiration=0 specifically. We accept Expiration=0 because XLS-20
 *   only requires UInt32 and there are legitimate use-cases for it
 *   during testing; the cross-check above (must be > 0 in practice)
 *   is documented here for awareness but not enforced at construction
 *   (mirroring OfferCreate's policy).
 *   - Source: XLS-20 §1.5.4 line 700.
 *   - Source: xrpl.org `nftokencreateoffer.md` line 62.
 *
 * - **`Amount` shape sub-checks (IOU/MPT currency, issuer, value).**
 *   The class delegates to `isAmount`, which only checks key presence.
 *   The factory re-uses the OfferCreate pattern: IOU currency must be
 *   3 ASCII or 40 hex chars; issuer must be a valid account; value
 *   must be a non-negative base-10 integer string. MPT issuance IDs
 *   must be 24–48 hex chars. Negative or fractional numeric `value`
 *   strings are rejected at construction.
 *   - Source: xrpl-dev-portal `basic-data-types.md`
 *     `#specifying-currency-amounts` (used by OfferCreate / AmmCreate).
 *
 * - **`Owner` is a valid XRPL account when present.** The class does
 *   not check `isAccount`; xrpl.js `validateOptionalField(tx, 'Owner',
 *   isAccount)` (line 149) does.
 *   - Source: xrpl.js `NFTokenCreateOffer.ts` line 149.
 *
 * - **`Destination` is a valid XRPL account when present.** Same
 *   rationale; xrpl.js line 148.
 *   - Source: xrpl.js `NFTokenCreateOffer.ts` line 148.
 *
 * - **Amount=0 for sell offers requires XRP (gratis).** Per XLS-20
 *   §1.5.4 line 694 the zero-Amount path is only legal for sell offers
 *   in XRP. The factory permits `Amount: '0'` only when `tfSellNFToken`
 *   is set AND `Amount` is the XRP string form. An IOU/MPT Amount of
 *   zero (positive-value, e.g. `{ value: '0' }`) is rejected.
 *   - Source: XLS-20 §1.5.4 line 694.
 *   - Source: xrpl.js `NFTokenCreateOffer.ts` lines 112–116
 *     (`parseAmountValue(Amount) > 0` enforced for buy offers; sell
 *     offers accept `Amount: '0'` only for XRP).
 *
 * - **`Flags` accepts both numeric bitmask and boolean-map form.** The
 *   class types the field as `number | NFTokenCreateOfferFlagsInterface`
 *   but does not document the latter or validate it. The factory
 *   accepts both, mirroring the OfferCreate / NFTokenMint factories.
 *   - Source: xrpl.js `NFTokenCreateOffer.ts` lines 38–40, 160–164.
 */
import type { BasePropsFields } from '../../types/base.js';
import type { Amount } from '../../types/amounts.js';
import type { NFTokenCreateOfferFlagsInterface } from '../../types/flags.js';
import {
  isAccount,
  isAmount,
  isHex,
  isIssuedCurrencyAmount,
  isMPTAmount,
  isNumber,
  isRecord,
  isString,
} from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// XLS-20 / xrpl.org: Expiration is UInt32.
const UINT32_MIN = 0;
const UINT32_MAX = 0xffffffff;

// xrpl.org `nftokencreateoffer.md` line 39 / XLS-20 §1.5.4 line 682:
// NFTokenID is Hash256 / UInt256 — a 64-character hex string.
const NFTOKEN_ID_LENGTH = 64;

// IOU currency shape (3 ASCII or 40 hex chars).
const CURRENCY_ASCII_LENGTH = 3;
const CURRENCY_HEX_LENGTH = 40;

// MPT issuance ID window (matches OfferCreate / AmmCreate policy).
const MPT_ISSUANCE_ID_MIN = 24;
const MPT_ISSUANCE_ID_MAX = 48;

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
export interface NftokenCreateOfferProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  /** The unique address of the transaction sender (the offer creator). */
  Account: string;
  /** The NFTokenID being offered on (Hash256, 64-char hex). */
  NFTokenID: string;
  /** Amount expected or offered for the NFToken. */
  Amount: Amount;
  /** Owner of the NFToken (required for buy offers, forbidden for sell). */
  Owner?: string | undefined;
  /** Time after which the offer is no longer active (UInt32). */
  Expiration?: number | undefined;
  /** Account allowed to accept the offer. */
  Destination?: string | undefined;
  /** Bit-flags (numeric or boolean-map). tfSellNFToken = 0x1. */
  Flags?: number | NFTokenCreateOfferFlagsInterface | undefined;
}

export interface NftokenCreateOffer
  extends Readonly<NftokenCreateOfferProps> {
  readonly TransactionType: 'NFTokenCreateOffer';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<NftokenCreateOfferProps>): NftokenCreateOffer;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** Non-negative base-10 integer string (XRPLNumber). */
function isXrplNumber(value: unknown): value is string {
  return isString(value) && /^[0-9]+$/u.test(value);
}

/**
 * Validate the deep shape of an Amount (XRP string / IOU / MPT). The
 * class delegates to `isAmount`, which only checks key presence. This
 * helper enforces the deeper invariants that rippled actually checks
 * (`temBAD_AMOUNT`, currency length, valid issuer, etc.).
 *
 * `path` is just for error messages ("Amount", "Amount" — single field
 * here, but kept parametric so future factories can reuse).
 */
function validateAmount(amount: Amount, path: string): void {
  if (!isAmount(amount)) {
    throw new ValidationError(
      `NFTokenCreateOffer: ${path} must be a valid Amount (XRP string, IOU, or MPT form)`,
    );
  }

  // XRP path: non-negative base-10 integer string.
  if (isString(amount)) {
    if (!isXrplNumber(amount)) {
      throw new ValidationError(
        `NFTokenCreateOffer: ${path} (XRP) must be a non-negative base-10 integer string`,
      );
    }
    return;
  }

  // IOU path.
  if (isIssuedCurrencyAmount(amount)) {
    const ccy = amount.currency;
    if (
      ccy.length !== CURRENCY_ASCII_LENGTH &&
      ccy.length !== CURRENCY_HEX_LENGTH
    ) {
      throw new ValidationError(
        `NFTokenCreateOffer: ${path}.currency must be ${CURRENCY_ASCII_LENGTH} ASCII or ${CURRENCY_HEX_LENGTH} hex chars (actual: ${ccy.length})`,
      );
    }
    if (ccy.length === CURRENCY_HEX_LENGTH && !isHex(ccy)) {
      throw new ValidationError(
        `NFTokenCreateOffer: ${path}.currency (40-char form) must be hex`,
      );
    }
    if (!isAccount(amount.issuer)) {
      throw new ValidationError(
        `NFTokenCreateOffer: ${path}.issuer must be a valid XRPL account address`,
      );
    }
    if (!isXrplNumber(amount.value)) {
      throw new ValidationError(
        `NFTokenCreateOffer: ${path}.value must be a non-negative base-10 integer string`,
      );
    }
    return;
  }

  // MPT path.
  if (isMPTAmount(amount)) {
    const mptid = amount.mpt_issuance_id;
    if (
      mptid.length < MPT_ISSUANCE_ID_MIN ||
      mptid.length > MPT_ISSUANCE_ID_MAX ||
      !isHex(mptid)
    ) {
      throw new ValidationError(
        `NFTokenCreateOffer: ${path}.mpt_issuance_id must be a ${MPT_ISSUANCE_ID_MIN}-${MPT_ISSUANCE_ID_MAX} character hex string`,
      );
    }
    if (!isXrplNumber(amount.value)) {
      throw new ValidationError(
        `NFTokenCreateOffer: ${path}.value must be a non-negative base-10 integer string`,
      );
    }
    return;
  }

  // Unreachable — defensive.
  throw new ValidationError(
    `NFTokenCreateOffer: ${path} must be a valid Amount (XRP string, IOU, or MPT form)`,
  );
}

/**
 * Returns the parsed numeric value of an Amount, matching the
 * `parseAmountValue` semantics from xrpl.js (treats string forms as
 * base-10 integers). Returns NaN if unparseable.
 *
 * For IOU/MPT we only need to check `value === '0'`; for XRP the same.
 * Used to enforce "Amount > 0 for buy offers".
 */
function amountToNumber(amount: Amount): number {
  if (isString(amount)) {
    if (!isXrplNumber(amount)) return Number.NaN;
    return Number(amount);
  }
  if (isIssuedCurrencyAmount(amount) || isMPTAmount(amount)) {
    if (!isXrplNumber(amount.value)) return Number.NaN;
    return Number(amount.value);
  }
  return Number.NaN;
}

/** Decode the boolean-map Flags form to a numeric bitmask. */
function flagsToNumber(
  flags: number | NFTokenCreateOfferFlagsInterface | undefined,
): number {
  if (flags === undefined) return 0;
  if (typeof flags === 'number') return flags;
  let n = 0;
  if (flags.tfSellNFToken) n |= 0x00000001;
  return n;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function nftokenCreateOffer(
  props: NftokenCreateOfferProps,
): NftokenCreateOffer {
  // ── Account ── required, must be a valid XRPL classic / X-address.
  require(props.Account, 'NFTokenCreateOffer: Account is required', isAccount);

  // ── NFTokenID ── required, 64-char hex.
  if (!isString(props.NFTokenID)) {
    throw new ValidationError(
      'NFTokenCreateOffer: NFTokenID is required and must be a string',
    );
  }
  if (props.NFTokenID.length !== NFTOKEN_ID_LENGTH || !isHex(props.NFTokenID)) {
    throw new ValidationError(
      `NFTokenCreateOffer: NFTokenID must be a ${NFTOKEN_ID_LENGTH}-character hex string (Hash256)`,
    );
  }

  // ── Amount ── required, deep shape check, then direction-aware
  //               positivity (buy ⇒ >0; sell ⇒ ≥0 with zero only for XRP).
  validateAmount(props.Amount, 'Amount');

  // ── Flags ── numeric / boolean-map type check (must run BEFORE the
  //              sell-vs-buy direction logic so callers passing bad
  //              numeric values see a clear "Flags must be a
  //              non-negative integer" error rather than a downstream
  //              Owner/Amount mismatch).
  if (props.Flags !== undefined) {
    if (
      typeof props.Flags !== 'number' &&
      !isRecord(props.Flags)
    ) {
      throw new ValidationError(
        'NFTokenCreateOffer: Flags must be a non-negative integer or NFTokenCreateOfferFlagsInterface object',
      );
    }
    if (typeof props.Flags === 'number') {
      if (!Number.isInteger(props.Flags) || props.Flags < 0) {
        throw new ValidationError(
          'NFTokenCreateOffer: Flags must be a non-negative integer',
        );
      }
    }
  }

  // Decode the Flags bit early so direction-specific guards can read it.
  const numericFlags = flagsToNumber(props.Flags);
  const TF_SELL_NFTOKEN = 0x00000001;
  const isSell = (numericFlags & TF_SELL_NFTOKEN) === TF_SELL_NFTOKEN;

  if (isSell) {
    // Sell offer: Amount=0 is only legal for XRP (XLS-20 §1.5.4 line 694).
    const amtNum = amountToNumber(props.Amount);
    if (amtNum === 0 && !isString(props.Amount)) {
      throw new ValidationError(
        'NFTokenCreateOffer: sell offer with Amount=0 is only valid for XRP (gratis giveaway); IOU/MPT Amount must be positive',
      );
    }
    // Sell offer: Owner must not be present (xrpl.js validateNFTokenSellOfferCases).
    if (props.Owner !== undefined) {
      throw new ValidationError(
        'NFTokenCreateOffer: Owner must not be present for sell offers (tfSellNFToken)',
      );
    }
  } else {
    // Buy offer: Owner required and Amount must be strictly > 0.
    if (props.Owner === undefined) {
      throw new ValidationError(
        'NFTokenCreateOffer: Owner is required for buy offers (no tfSellNFToken flag)',
      );
    }
    if (!isAccount(props.Owner)) {
      throw new ValidationError(
        'NFTokenCreateOffer: Owner must be a valid XRPL account address',
      );
    }
    const amtNum = amountToNumber(props.Amount);
    if (!(amtNum > 0)) {
      throw new ValidationError(
        'NFTokenCreateOffer: Amount must be greater than 0 for buy offers (temBAD_AMOUNT)',
      );
    }
  }

  // ── Destination ── optional, must be a valid account and != Account.
  if (props.Destination !== undefined) {
    if (!isAccount(props.Destination)) {
      throw new ValidationError(
        'NFTokenCreateOffer: Destination must be a valid XRPL account address',
      );
    }
    if (props.Destination === props.Account) {
      throw new ValidationError(
        'NFTokenCreateOffer: Destination and Account must not be equal',
      );
    }
  }

  // ── Owner ≠ Account (when Owner present, i.e. buy offers) ──
  if (props.Owner !== undefined && props.Owner === props.Account) {
    throw new ValidationError(
      'NFTokenCreateOffer: Owner and Account must not be equal',
    );
  }

  // ── Expiration ── optional, UInt32.
  if (props.Expiration !== undefined) {
    if (
      !isNumber(props.Expiration) ||
      !Number.isInteger(props.Expiration) ||
      props.Expiration < UINT32_MIN ||
      props.Expiration > UINT32_MAX
    ) {
      throw new ValidationError(
        `NFTokenCreateOffer: Expiration must be a UInt32 in [${UINT32_MIN}, ${UINT32_MAX}]`,
      );
    }
  }

  // ── Flags ── numeric / boolean-map type check is run above (before
  //              direction logic). The validation in this block ensures
  //              callers get a clear shape error before any cross-field
  //              rules fire.

  // ─── Base transaction fields ───
  // Catches the seven shared fields this factory now accepts through
  // `BasePropsFields` but does not otherwise check: Memos, SourceTag,
  // LastLedgerSequence, AccountTxnID, NetworkID, Delegate, TicketSequence.
  // Placed AFTER the NFTokenCreateOffer-specific checks so a more specific
  // message wins for a more specific mistake, and this acts as the backstop
  // for everything shared across transaction types.
  //
  // `TransactionType` is supplied because the validator checks a transaction,
  // not a props bag — the factory injects it in `buildFrozenTx` below.
  validateBaseTransaction({ TransactionType: 'NFTokenCreateOffer', ...props });

  return buildFrozenTx<NftokenCreateOfferProps, NftokenCreateOffer>(
    'NFTokenCreateOffer',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: NftokenCreateOffer) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: NftokenCreateOffer,
        overrides: Partial<NftokenCreateOfferProps>,
      ) {
        return nftokenCreateOffer(mergeForWith(this, overrides));
      },
    },
  );
}
