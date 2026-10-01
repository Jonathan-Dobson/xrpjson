/**
 * Functional NFTokenAcceptOffer factory — frozen-object style.
 *
 * Accepts an existing buy or sell offer for an NFToken, or matches two
 * complementary offers in brokered mode. Validation happens at
 * construction; there is no way to construct an invalid tx.
 *
 *   import { nftokenAcceptOffer } from 'xrpjson';
 *   // Direct mode — accept a sell offer:
 *   const tx = nftokenAcceptOffer({ Account, NFTokenSellOffer });
 *   // Brokered mode — match buy + sell with broker fee:
 *   const tx2 = nftokenAcceptOffer({
 *     Account, NFTokenSellOffer, NFTokenBuyOffer, NFTokenBrokerFee: '100',
 *   });
 *   const j = tx.toJSON();
 *   const tx3 = tx.with({ NFTokenBuyOffer: '...' });
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/nftokenacceptoffer
 * @see https://github.com/XRPLF/xrpl.js/blob/main/packages/xrpl/src/models/transactions/NFTokenAcceptOffer.ts
 * @see XLS-0020 §1.5.6
 *     (`~/.mavis/docs.local/xrpl-standards/repo/XLS-0020-non-fungible-tokens/README.md`
 *     lines 800–834)
 *
 * ## Divergences
 *
 * Compared with the Class API's `NFTokenAcceptOffer`, this factory
 * adds guards the class skips (or that xrpl.js / xrpl.org / XLS-20
 * mandate but the class omits):
 *
 * - **`NFTokenSellOffer` and `NFTokenBuyOffer` are Hash256** — XLS-20
 *   §1.5.6 (lines 810, 818) declares both fields as `string` with
 *   internal type `UINT256`. xrpl.org's `nftokenacceptoffer.md` (lines
 *   81–82) labels them "String - Hash". A Hash256 is a 64-character
 *   hexadecimal string. The class accepts any non-empty string via
 *   `isString`; the factory enforces 64-char hex.
 *   - Source: XLS-20 §1.5.6 lines 810, 818.
 *   - Source: xrpl.org `nftokenacceptoffer.md` lines 81–82.
 *
 * - **`NFTokenBrokerFee` must be strictly positive (> 0)** — xrpl.js
 *   `validateNFTokenBrokerFee` (lines 79–83) rejects `value <= 0`. xrpl.org
 *   error cases (line 100) also call out "it specified a negative
 *   `NFTokenBrokerFee`" as a `temMALFORMED`. Our class only checks
 *   `isAmount`, which permits `"0"` and `"-1"`.
 *   - Source: xrpl.js `NFTokenAcceptOffer.ts` lines 79–83.
 *   - Source: xrpl.org `nftokenacceptoffer.md` line 100.
 *
 * - **`NFTokenBrokerFee` requires brokered mode (both SellOffer AND
 *   BuyOffer)** — xrpl.js `validateNFTokenBrokerFee` (lines 85–89)
 *   rejects NFTokenBrokerFee when either SellOffer or BuyOffer is
 *   missing. XLS-20 §1.5.6 (line 828) explicitly states
 *   "`NFTokenBrokerFee` ... is only valid in brokered mode." The class
 *   accepts BrokerFee in direct mode without complaint.
 *   - Source: xrpl.js `NFTokenAcceptOffer.ts` lines 85–89.
 *   - Source: XLS-20 §1.5.6 line 828.
 *
 * - **IssuedCurrencyAmount `NFTokenBrokerFee` must have a valid issuer
 *   and a positive base-10 integer value** — our `isAmount` helper
 *   accepts the structural shape but does not verify the issuer is a
 *   valid XRPL account or that `value` is a positive base-10 string.
 *   The factory validates both sub-fields, matching the strictness used
 *   in `nftokenMint`. We also reject `"XRP"`-currency issued amounts
 *   (reserved currency code).
 *   - Source: same hardening applied in `nftoken-mint.ts` Amount
 *     sub-checks; cf. xrpl.org `nftokenacceptoffer.md` line 101
 *     (`temBAD_CURRENCY` for reserved `XRP`).
 *
 * - **MPTAmount `NFTokenBrokerFee` must have a positive base-10 integer
 *   value** — same rationale as the IOU branch.
 *
 * - **Mode table is encoded as `if/else if` over the 3 valid states**
 *   (brokered, direct-sell, direct-buy) — XLS-20 §1.5.6 (lines 810–822)
 *   and xrpl.org `nftokenacceptoffer.md` (lines 47–51) define exactly
 *   these three modes. The "neither" case is rejected by both xrpl.js
 *   and the class; the factory adds the positive assertion here for
 *   clarity in the error message.
 *   - Source: xrpl.org `nftokenacceptoffer.md` lines 47–51.
 *   - Source: XLS-20 §1.5.6 lines 810–822.
 */
import type { Amount } from '../../types/amounts.js';
import {
  isAccount,
  isAmount,
  isIssuedCurrencyAmount,
  isMPTAmount,
  isString,
} from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// XLS-20 §1.5.6 / xrpl.org: NFTokenSellOffer and NFTokenBuyOffer are Hash256.
const HASH256_LENGTH = 64;

// ─── Public types ────────────────────────────────────────────────────

export interface NftokenAcceptOfferProps {
  /** The transaction submitter (classic or X-address). */
  Account: string;
  /**
   * Direct mode: identifies an existing NFTokenOffer to sell.
   * Brokered mode: required (XLS-20 §1.5.6).
   */
  NFTokenSellOffer?: string | undefined;
  /**
   * Direct mode: identifies an existing NFTokenOffer to buy.
   * Brokered mode: required (XLS-20 §1.5.6).
   */
  NFTokenBuyOffer?: string | undefined;
  /**
   * Brokered mode only: fee the broker keeps from the buyer's payment.
   * Must be strictly positive. Requires both SellOffer and BuyOffer.
   */
  NFTokenBrokerFee?: Amount | undefined;
  Fee?: string | undefined;
  Sequence?: number | undefined;
}

export interface NftokenAcceptOffer
  extends Readonly<NftokenAcceptOfferProps> {
  readonly TransactionType: 'NFTokenAcceptOffer';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<NftokenAcceptOfferProps>): NftokenAcceptOffer;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Check that a value is a positive (> 0) base-10 integer string.
 * The xrpl Amount convention: `value` for IOU/MPT is a non-negative
 * base-10 string of drops/atomic units; we additionally require > 0 for
 * NFTokenBrokerFee per xrpl.js's `value <= 0` rejection.
 */
function isPositiveAmountString(v: unknown): boolean {
  return isString(v) && /^[0-9]+$/u.test(v) && v !== '0';
}

/**
 * Validate NFTokenBrokerFee shape + strict positive value. Used by the
 * Amount sub-check guards below.
 */
function assertValidBrokerFee(brokerFee: Amount): void {
  if (isIssuedCurrencyAmount(brokerFee)) {
    if (!isAccount(brokerFee.issuer)) {
      throw new ValidationError(
        'NFTokenAcceptOffer: NFTokenBrokerFee.issuer must be a valid XRPL account address',
      );
    }
    if (brokerFee.currency === 'XRP') {
      throw new ValidationError(
        'NFTokenAcceptOffer: NFTokenBrokerFee must not use the reserved currency code "XRP" (temBAD_CURRENCY)',
      );
    }
    if (!isPositiveAmountString(brokerFee.value)) {
      throw new ValidationError(
        'NFTokenAcceptOffer: NFTokenBrokerFee IssuedCurrencyAmount.value must be a positive base-10 integer string',
      );
    }
  } else if (isMPTAmount(brokerFee)) {
    if (!isPositiveAmountString(brokerFee.value)) {
      throw new ValidationError(
        'NFTokenAcceptOffer: NFTokenBrokerFee MPTAmount.value must be a positive base-10 integer string',
      );
    }
  } else if (typeof brokerFee === 'string') {
    if (!isPositiveAmountString(brokerFee)) {
      throw new ValidationError(
        'NFTokenAcceptOffer: NFTokenBrokerFee (XRP drops) must be a positive base-10 integer string',
      );
    }
  } else {
    throw new ValidationError(
      'NFTokenAcceptOffer: NFTokenBrokerFee must be a positive Amount (XRP drops string, IOU object, or MPT object)',
    );
  }
}

/**
 * Validate an offer hash field (NFTokenSellOffer / NFTokenBuyOffer):
 * 64-character hex (Hash256 / UInt256).
 */
function assertValidOfferHash(
  field: 'NFTokenSellOffer' | 'NFTokenBuyOffer',
  value: string,
): void {
  if (!isString(value) || value.length !== HASH256_LENGTH || !/^[0-9A-Fa-f]+$/u.test(value)) {
    throw new ValidationError(
      `NFTokenAcceptOffer: ${field} must be a 64-character hexadecimal string (Hash256)`,
    );
  }
}

// ─── Factory ─────────────────────────────────────────────────────────

export function nftokenAcceptOffer(
  props: NftokenAcceptOfferProps,
): NftokenAcceptOffer {
  // ── Account ── required, must be a valid XRPL classic address.
  require(
    props.Account,
    'NFTokenAcceptOffer: Account is required',
    isAccount,
  );

  // ── Offer fields ── optional, but at least one is required.
  //    Each, when present, must be a Hash256 (64-char hex).
  const hasSell = props.NFTokenSellOffer !== undefined;
  const hasBuy = props.NFTokenBuyOffer !== undefined;

  if (!hasSell && !hasBuy) {
    throw new ValidationError(
      'NFTokenAcceptOffer: must have NFTokenSellOffer or NFTokenBuyOffer (direct or brokered mode)',
    );
  }

  if (hasSell) {
    assertValidOfferHash('NFTokenSellOffer', props.NFTokenSellOffer as string);
  }
  if (hasBuy) {
    assertValidOfferHash('NFTokenBuyOffer', props.NFTokenBuyOffer as string);
  }

  // ── NFTokenBrokerFee ── optional, but brokered-mode-only.
  //    Must be a positive Amount when present, AND both SellOffer and
  //    BuyOffer must be set (XLS-20 §1.5.6 line 828).
  if (props.NFTokenBrokerFee !== undefined) {
    if (!hasSell || !hasBuy) {
      throw new ValidationError(
        'NFTokenAcceptOffer: NFTokenBrokerFee requires both NFTokenSellOffer and NFTokenBuyOffer (brokered mode only)',
      );
    }
    if (!isAmount(props.NFTokenBrokerFee)) {
      throw new ValidationError(
        'NFTokenAcceptOffer: NFTokenBrokerFee must be a valid Amount (XRP drops string, IOU object, or MPT object)',
      );
    }
    assertValidBrokerFee(props.NFTokenBrokerFee);
  }

  return buildFrozenTx<NftokenAcceptOfferProps, NftokenAcceptOffer>(
    'NFTokenAcceptOffer',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: NftokenAcceptOffer) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: NftokenAcceptOffer, overrides: Partial<NftokenAcceptOfferProps>) {
        return nftokenAcceptOffer(mergeForWith(this, overrides));
      },
    },
  );
}
