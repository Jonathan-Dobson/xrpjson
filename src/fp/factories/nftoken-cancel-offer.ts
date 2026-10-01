/**
 * Functional NFTokenCancelOffer factory — frozen-object style.
 *
 * Cancels one or more existing NFTokenOffer ledger entries. Validation
 * happens at construction; there is no way to construct an invalid tx.
 *
 *   import { nftokenCancelOffer } from 'xrpjson';
 *   const tx = nftokenCancelOffer({ Account, NFTokenOffers: [offerId1] });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ NFTokenOffers: [offerId1, offerId2] });
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/nftokencanceloffer
 * @see https://github.com/XRPLF/xrpl.js/blob/main/packages/xrpl/src/models/transactions/NFTokenCancelOffer.ts
 * @see XLS-0020 §1.5.5 (Non-Fungible Tokens)
 *
 * ## Divergences
 *
 * Compared with the Class API's `NFTokenCancelOffer`, this factory
 * adds guards that the class skips but the canonical sources (rippled
 * C++ source, xrpl.org Error Cases, XLS-20) mandate:
 *
 * - **`NFTokenOffers` is a non-empty array of Vector256 (64-char hex)
 *   offer IDs.** The class only checks `isArray` and `length === 0`; it
 *   does not check that each entry is a 64-character hex string. The
 *   ledger type is `Vector256`, i.e. an array of 256-bit hashes
 *   hex-encoded.
 *   - Source: XLS-20 §1.5.5 (`NFTokenOffers` is `VECTOR256`)
 *     `~/.mavis/docs.local/xrpl-standards/repo/XLS-0020-non-fungible-tokens/README.md`
 *     line 738.
 *   - Source: xrpl.org `nftokencanceloffer.md` line 46 ("Each entry must
 *     be a different object ID of an NFTokenOffer").
 *   - Source: xrpl.org `common-fields.md` `Hash256` (64-char hex).
 *
 * - **All-zero offer IDs are rejected** (`fixCleanup3_2_0` amendment).
 *   rippled's `NFTokenCancelOffer::preflight` rejects a list that
 *   contains any zero offer ID; the class does not guard against this.
 *   - Source: rippled
 *     `src/libxrpl/tx/transactors/nft/NFTokenCancelOffer.cpp` lines 23–24
 *     (the `id.isZero()` check gated on `fixCleanup3_2_0`).
 *   - Source: xrpl.org `nftokencanceloffer.md` line 61
 *     (`temMALFORMED` … "contained an all-zero offer ID").
 *
 * - **Duplicate offer IDs are rejected.** rippled always sorts the list
 *   and rejects adjacent duplicates via `std::ranges::adjacent_find`.
 *   xrpl.org explicitly says "the transaction is invalid if the array
 *   contains duplicate entries". The class does not check duplicates.
 *   - Source: rippled `NFTokenCancelOffer.cpp` lines 28–31.
 *   - Source: xrpl.org `nftokencanceloffer.md` line 46 ("the transaction
 *     is invalid if the array contains duplicate entries").
 *
 * - **Maximum of 500 offer IDs.** rippled enforces
 *   `kMaxTokenOfferCancelCount = 500`; xrpl.org's Error Cases table
 *   mentions "more than the maximum number of offers that can be
 *   canceled at one time" as a `temMALFORMED` cause. The class has no
 *   upper bound.
 *   - Source: rippled `Protocol.h` (`constexpr std::size_t
 *     kMaxTokenOfferCancelCount = 500;`).
 *   - Source: rippled `NFTokenCancelOffer.cpp` line 22
 *     (`offerIds.size() > kMaxTokenOfferCancelCount`).
 *   - Source: xrpl.org `nftokencanceloffer.md` line 61 (`temMALFORMED`).
 *
 * - **Account must be a valid XRPL address.** The class accepts any
 *   non-empty string. xrpl.js's `validateBaseTransaction` (which
 *   `validateNFTokenCancelOffer` delegates to) enforces a valid classic
 *   address; we mirror that check at construction.
 *   - Source: xrpl.js
 *     `~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/common.ts`
 *     `validateBaseTransaction`.
 */
import {
  isAccount,
  isArray,
  isLedgerEntryId,
} from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// rippled `Protocol.h` `kMaxTokenOfferCancelCount`.
const MAX_NFTOKEN_OFFERS = 500;

// ─── Public types ────────────────────────────────────────────────────

export interface NftokenCancelOfferProps {
  Account: string;
  /**
   * NFTokenOffer object IDs to cancel. Each entry is a 256-bit hash
   * hex-encoded (64 chars). 1–500 entries; no duplicates; no all-zero
   * IDs.
   */
  NFTokenOffers: string[];
  Fee?: string | undefined;
  Sequence?: number | undefined;
}

export interface NftokenCancelOffer
  extends Readonly<NftokenCancelOfferProps> {
  readonly TransactionType: 'NFTokenCancelOffer';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<NftokenCancelOfferProps>): NftokenCancelOffer;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Validate a single NFTokenOffer entry: must be a 64-char hex string,
 * and must not be all-zero (the `fixCleanup3_2_0` rule). Throws with
 * a message that includes the index so callers know which entry
 * failed.
 */
function assertValidOfferId(id: unknown, index: number): void {
  if (!isLedgerEntryId(id)) {
    throw new ValidationError(
      `NFTokenCancelOffer: NFTokenOffers[${index}] must be a 64-character hex string (Hash256)`,
    );
  }
  // All-zero offer ID is malformed under fixCleanup3_2_0.
  if (/^0+$/u.test(id)) {
    throw new ValidationError(
      `NFTokenCancelOffer: NFTokenOffers[${index}] must not be zero (fixCleanup3_2_0)`,
    );
  }
}

// ─── Factory ─────────────────────────────────────────────────────────

export function nftokenCancelOffer(
  props: NftokenCancelOfferProps,
): NftokenCancelOffer {
  // ── Account ── required, must be a valid XRPL classic address.
  require(props.Account, 'NFTokenCancelOffer: Account is required', isAccount);

  // ── NFTokenOffers ── required, non-empty array of 64-char hex IDs.
  if (!isArray<string>(props.NFTokenOffers)) {
    throw new ValidationError(
      'NFTokenCancelOffer: NFTokenOffers must be an array',
    );
  }
  if (props.NFTokenOffers.length === 0) {
    throw new ValidationError(
      'NFTokenCancelOffer: NFTokenOffers must not be empty',
    );
  }
  // Upper bound per rippled `kMaxTokenOfferCancelCount = 500`.
  if (props.NFTokenOffers.length > MAX_NFTOKEN_OFFERS) {
    throw new ValidationError(
      `NFTokenCancelOffer: NFTokenOffers must contain at most ${MAX_NFTOKEN_OFFERS} entries (actual: ${props.NFTokenOffers.length})`,
    );
  }

  // Per-entry validation. Walk once: shape + zero check. Then walk
  // again for duplicate detection (cheaper than building a Set since
  // the array is bounded to 500).
  for (let i = 0; i < props.NFTokenOffers.length; i++) {
    assertValidOfferId(props.NFTokenOffers[i], i);
  }
  const seen = new Set<string>();
  for (let i = 0; i < props.NFTokenOffers.length; i++) {
    const id = props.NFTokenOffers[i];
    if (id === undefined) continue; // unreachable: length check + shape check above.
    if (seen.has(id)) {
      throw new ValidationError(
        `NFTokenCancelOffer: NFTokenOffers contains duplicate entry at index ${i} (${id})`,
      );
    }
    seen.add(id);
  }

  return buildFrozenTx<NftokenCancelOfferProps, NftokenCancelOffer>(
    'NFTokenCancelOffer',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: NftokenCancelOffer) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: NftokenCancelOffer, overrides: Partial<NftokenCancelOfferProps>) {
        return nftokenCancelOffer(mergeForWith(this, overrides));
      },
    },
  );
}
