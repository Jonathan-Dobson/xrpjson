/**
 * Functional NFTokenMint factory — frozen-object style.
 *
 * Creates a new NFToken (NFT) on the ledger. Validation happens at
 * construction; there is no way to construct an invalid tx.
 *
 *   import { nftokenMint } from 'xrplt/fp';
 *   const tx = nftokenMint({ Account, NFTokenTaxon: 0 });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ TransferFee: 314, Flags: { tfTransferable: true } });
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/nftokenmint
 * @see https://github.com/XRPLF/xrpl.js/blob/main/packages/xrpl/src/models/transactions/NFTokenMint.ts
 * @see XLS-0020 (Non-Fungible Tokens)
 * @see XLS-0046 (Dynamic Non-Fungible Tokens — tfMutable)
 *
 * ## Divergences
 *
 * Compared with `src/transactions/nftoken-mint.ts`, this factory adds
 * guards the class skips (or that xrpl.js / xrpl.org / XLS-20 / XLS-46
 * mandate but the class omits):
 *
 * - **`Issuer` must not equal `Account`** — when both are present and
 *   identical, the transaction cannot be authorized to mint on its own
 *   behalf. xrpl.js's `validateNFTokenMint` enforces this explicitly
 *   (lines 149–153), but our class source does not.
 *   - Source: xrpl.js
 *     `~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/NFTokenMint.ts`
 *     lines 149–153.
 *
 * - **`URI` must be hex-encoded** — XLS-20 §1.3.3 and xrpl.org both state
 *   the URI is a BLOB and must be hex-encoded in JSON. Our class accepts
 *   any string.
 *   - Source: XLS-20 §1.3.3
 *     (`~/.mavis/docs.local/xrpl-standards/repo/XLS-0020-non-fungible-tokens/README.md`
 *     line 134).
 *   - Source: xrpl.org `nftokenmint.md` ("This field must be hex-encoded")
 *     (`~/.mavis/docs.local/xrpl-dev-portal/repo/docs/references/protocol/transactions/types/nftokenmint.md`
 *     line 53).
 *
 * - **`URI` must not be an empty string** — xrpl.js's `validateNFTokenMint`
 *   rejects `''` (line 157–159); the class accepts it. XLS-20 §1.3.3 says
 *   the field is limited to 256 bytes but does not speak to empty; we
 *   follow xrpl.js here to mirror the on-ledger behavior.
 *   - Source: xrpl.js `NFTokenMint.ts` lines 157–159.
 *
 * - **`URI` length capped at 256 bytes (512 hex chars)** — XLS-20 §1.3.3
 *   states the BLOB is limited to 256 bytes. The class does not enforce
 *   this; the factory does. We also reject odd-length hex.
 *   - Source: XLS-20 §1.3.3 line 134.
 *   - Source: xrpl.org `nftokenmint.md` line 53 ("limited to a maximum
 *     length of 256 bytes").
 *
 * - **`NFTokenTaxon` is a UInt32 (0 ≤ taxon ≤ 2^32-1)** — the ledger type
 *   is `UInt32`. The class only checks `isNumber`, allowing negatives
 *   and non-integers.
 *   - Source: xrpl.org `nftokenmint.md` line 50 ("UInt32").
 *   - Source: XLS-20 §1.5.1
 *     (`~/.mavis/docs.local/xrpl-standards/repo/XLS-0020-non-fungible-tokens/README.md`
 *     line 344: "Taxons have a valid range from 0x0 to 0xFFFFFFFF").
 *
 * - **`TransferFee` requires `tfTransferable`** — XLS-20 §1.5.1 (line 367)
 *   and xrpl.org `nftokenmint.md` (line 52) both state: "If this field
 *   is provided, the transaction MUST have the `tfTransferable` flag
 *   enabled." The class does not check this coupling.
 *   - Source: XLS-20 §1.5.1 line 367: "The field MUST NOT be present if
 *     the `tfTransferable` flag is not set. If it is, the transaction
 *     should fail and a fee should be claimed."
 *   - Source: xrpl.org `nftokenmint.md` line 52.
 *
 * - **`TransferFee` must be an integer** — the class only checks range.
 *   The ledger type is `UInt16`, so fractional values must be rejected.
 *   - Source: XLS-20 §1.5.1 line 363 ("UINT16").
 *   - Source: xrpl.org `nftokenmint.md` line 52 ("UInt16").
 *
 * - **`Expiration` must be a UInt32** — the class allows any number.
 *   The ledger type is `UInt32`; we reject negatives, fractions, and
 *   values > 4294967295.
 *   - Source: xrpl.org `nftokenmint.md` line 55 ("UInt32").
 *
 * - **`tfTrustLine` flag (0x00000004) is rejected** — the
 *   `fixRemoveNFTokenAutoTrustLine` amendment makes `tfTrustLine` invalid.
 *   xrpl.org's Error Cases table flags this explicitly: "If the
 *   fixRemoveNFTokenAutoTrustLine amendment is enabled, the tfTrustLine
 *   flag causes this error (`temINVALID_FLAG`)." The class does not
 *   guard against it.
 *   - Source: xrpl.org `nftokenmint.md` line 117.
 *
 * - **Cross-field: `Expiration` AND `Destination` together require
 *   `Amount`** — xrpl.js's `validateNFTokenMint` (lines 169–175) treats
 *   `Expiration`/`Destination` as requiring `Amount` together, but the
 *   error wording is the single-message form. We enforce the same
 *   single-check rule (Presence of either ⇒ `Amount` required). The
 *   class enforces this per-field.
 *   - Source: xrpl.js `NFTokenMint.ts` lines 169–175.
 *
 * - **`Amount` for XRP allows `"0"` (gratis giveaway)** — XLS-20 §1.5.1
 *   (line 694) and xrpl.org `nftokenmint.md` (line 54) both explicitly
 *   permit zero-amount XRP NFTokenMint offers (giving the token away
 *   gratis). For IOU/MPT, the amount must be non-zero. We do not reject
 *   Amount here — the `isAmount` helper accepts the shape, and we leave
 *   the zero-vs-nonzero distinction to the ledger. (Divergence is
 *   documented for awareness; this guard is intentionally permissive so
 *   the factory works for both gratis and priced mint offers.)
 *   - Source: XLS-20 §1.5.1 line 694.
 *   - Source: xrpl.org `nftokenmint.md` line 54.
 *
 * - **`tfMutable` flag (0x00000010) accepted (XLS-46 dNFT)** — the
 *   Dynamic NFT amendment introduces this flag. The class types it but
 *   does not document it; we expose and validate it the same way as
 *   the other flags. (No extra validation is required — tfMutable is a
 *   simple boolean toggle that affects future NFTokenModify calls.)
 *   - Source: XLS-0046 §3.1
 *     (`~/.mavis/docs.local/xrpl-standards/repo/XLS-0046-dynamic-non-fungible-tokens/README.md`
 *     line 47).
 *   - Source: xrpl.org `dynamic-nfts.md`
 *     (`~/.mavis/docs.local/xrpl-dev-portal/repo/docs/concepts/tokens/nfts/dynamic-nfts.md`
 *     line 13: "enable the `tfMutable` flag (`0x00000010`) to make the NFT
 *     mutable.").
 */
import type { Amount } from '../../types/amounts.js';
import type { NFTokenMintFlagsInterface } from '../../types/flags.js';
import {
  isAccount,
  isAmount,
  isHex,
  isIssuedCurrencyAmount,
  isMPTAmount,
  isNumber,
  isString,
} from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// XLS-20 / xrpl.org: TransferFee is UInt16, max 50000 (50.000%).
const MAX_TRANSFER_FEE = 50_000;
// XLS-20 / xrpl.org: NFTokenTaxon is UInt32.
const MAX_NFTOKEN_TAXON = 0xffffffff;
// XLS-20 / xrpl.org: Expiration is UInt32.
const MAX_EXPIRATION = 0xffffffff;
// XLS-20 / xrpl.org: URI is a BLOB with max 256 bytes.
const MAX_URI_BYTES = 256;
const MAX_URI_HEX_CHARS = MAX_URI_BYTES * 2;

// ─── Public types ────────────────────────────────────────────────────

export interface NftokenMintProps {
  Account: string;
  /** Taxon for the NFToken series. UInt32 (0..2^32-1). */
  NFTokenTaxon: number;
  /** Issuer (when minting on behalf of another authorized account). */
  Issuer?: string | undefined;
  /** Secondary-sale transfer fee in 1/10 bps (0–50000). Requires tfTransferable. */
  TransferFee?: number | undefined;
  /** Arbitrary data URI, hex-encoded, ≤ 256 bytes. */
  URI?: string | undefined;
  /** Amount for an attached sell offer. Zero is permitted for XRP. */
  Amount?: Amount | undefined;
  /** Offer expiration in seconds since Ripple Epoch (UInt32). Requires Amount. */
  Expiration?: number | undefined;
  /** Restricts offer acceptance to one account. Requires Amount. */
  Destination?: string | undefined;
  /**
   * Bit-flags. Either a numeric bitmask (see `NFTokenMintFlags`) or the
   * boolean-map `NFTokenMintFlagsInterface` form (tfBurnable,
   * tfOnlyXRP, tfTransferable, tfMutable).
   */
  Flags?: number | NFTokenMintFlagsInterface | undefined;
  Fee?: string | undefined;
  Sequence?: number | undefined;
}

export interface NftokenMint extends Readonly<NftokenMintProps> {
  readonly TransactionType: 'NFTokenMint';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<NftokenMintProps>): NftokenMint;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Translate the boolean-map `NFTokenMintFlagsInterface` into a numeric
 * bitmask. Numeric `Flags` pass through unchanged.
 *
 * tfTrustLine is intentionally NOT translated — it is deprecated by the
 * `fixRemoveNFTokenAutoTrustLine` amendment. Callers passing
 * `{ tfTrustLine: true }` get the bit set anyway, and the post-translation
 * rejection guard catches it.
 */
function flagsToNumber(
  flags: number | NFTokenMintFlagsInterface | undefined,
): number {
  if (flags === undefined) return 0;
  if (typeof flags === 'number') return flags;
  let n = 0;
  if (flags.tfBurnable) n |= 0x00000001;
  if (flags.tfOnlyXRP) n |= 0x00000002;
  if (flags.tfTrustLine) n |= 0x00000004;
  if (flags.tfTransferable) n |= 0x00000008;
  if (flags.tfMutable) n |= 0x00000010;
  return n;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function nftokenMint(props: NftokenMintProps): NftokenMint {
  // ── Account ── required, must be a valid XRPL classic address.
  require(props.Account, 'NFTokenMint: Account is required', isAccount);

  // ── NFTokenTaxon ── required, integer in [0, 2^32-1].
  if (
    !isNumber(props.NFTokenTaxon) ||
    !Number.isInteger(props.NFTokenTaxon) ||
    props.NFTokenTaxon < 0 ||
    props.NFTokenTaxon > MAX_NFTOKEN_TAXON
  ) {
    throw new ValidationError(
      `NFTokenMint: NFTokenTaxon must be an integer in [0, ${MAX_NFTOKEN_TAXON}] (UInt32)`,
    );
  }

  // ── Issuer ── optional, must be a valid XRPL account, and must NOT
  //              equal Account (xrpl.js validateNFTokenMint lines 149-153).
  if (props.Issuer !== undefined) {
    if (!isAccount(props.Issuer)) {
      throw new ValidationError('NFTokenMint: Issuer must be a valid XRPL account address');
    }
    if (props.Issuer === props.Account) {
      throw new ValidationError('NFTokenMint: Issuer must not be equal to Account');
    }
  }

  // ── TransferFee ── optional, integer in [0, 50000], requires
  //                   tfTransferable flag (XLS-20 §1.5.1 line 367).
  if (props.TransferFee !== undefined) {
    if (
      !isNumber(props.TransferFee) ||
      !Number.isInteger(props.TransferFee) ||
      props.TransferFee < 0 ||
      props.TransferFee > MAX_TRANSFER_FEE
    ) {
      throw new ValidationError(
        `NFTokenMint: TransferFee must be an integer in [0, ${MAX_TRANSFER_FEE}]`,
      );
    }
  }

  // ── URI ── optional, non-empty hex, even length, ≤ 256 bytes
  //          (512 hex chars). Odd-length hex is invalid by the BLOB spec.
  if (props.URI !== undefined) {
    if (!isString(props.URI) || !isHex(props.URI)) {
      throw new ValidationError('NFTokenMint: URI must be a hex-encoded string');
    }
    if (props.URI.length === 0) {
      throw new ValidationError('NFTokenMint: URI must not be an empty string');
    }
    if (props.URI.length % 2 !== 0) {
      throw new ValidationError(
        'NFTokenMint: URI must have an even number of hex characters (BLOB is byte-aligned)',
      );
    }
    if (props.URI.length > MAX_URI_HEX_CHARS) {
      throw new ValidationError(
        `NFTokenMint: URI exceeds ${MAX_URI_BYTES} bytes (${MAX_URI_HEX_CHARS} hex chars); actual: ${props.URI.length}`,
      );
    }
  }

  // ── Amount ── optional, must be a valid Amount (XRP string / IOU / MPT).
  if (props.Amount !== undefined && !isAmount(props.Amount)) {
    throw new ValidationError(
      'NFTokenMint: Amount must be a valid Amount (XRP drops string, IOU object, or MPT object)',
    );
  }

  // ── Expiration ── optional, requires Amount, UInt32 in [0, 2^32-1].
  if (props.Expiration !== undefined) {
    if (props.Amount === undefined) {
      throw new ValidationError('NFTokenMint: Expiration requires Amount');
    }
    if (
      !isNumber(props.Expiration) ||
      !Number.isInteger(props.Expiration) ||
      props.Expiration < 0 ||
      props.Expiration > MAX_EXPIRATION
    ) {
      throw new ValidationError(
        `NFTokenMint: Expiration must be a UInt32 integer in [0, ${MAX_EXPIRATION}]`,
      );
    }
  }

  // ── Destination ── optional, requires Amount, must be valid XRPL account.
  if (props.Destination !== undefined) {
    if (props.Amount === undefined) {
      throw new ValidationError('NFTokenMint: Destination requires Amount');
    }
    if (!isAccount(props.Destination)) {
      throw new ValidationError(
        'NFTokenMint: Destination must be a valid XRPL account address',
      );
    }
  }

  // ── Flags ── translate + reject deprecated tfTrustLine.
  const numericFlags = flagsToNumber(props.Flags);
  const TF_TRUST_LINE = 0x00000004;
  if ((numericFlags & TF_TRUST_LINE) === TF_TRUST_LINE) {
    throw new ValidationError(
      'NFTokenMint: tfTrustLine (0x4) is deprecated by the fixRemoveNFTokenAutoTrustLine amendment and cannot be set',
    );
  }

  // ── TransferFee ↔ tfTransferable coupling ── XLS-20 §1.5.1 line 367.
  const TF_TRANSFERABLE = 0x00000008;
  if (
    props.TransferFee !== undefined &&
    (numericFlags & TF_TRANSFERABLE) !== TF_TRANSFERABLE
  ) {
    throw new ValidationError(
      'NFTokenMint: TransferFee requires the tfTransferable flag (0x8) to be set',
    );
  }

  // ── Amount shape sub-checks (when IOU/MPT, value must be a non-negative
  //    base-10 integer string; issuer must be a valid account for IOU).
  if (props.Amount !== undefined) {
    if (isIssuedCurrencyAmount(props.Amount)) {
      if (!isAccount(props.Amount.issuer)) {
        throw new ValidationError(
          'NFTokenMint: Amount.issuer must be a valid XRPL account address',
        );
      }
      if (
        !isString(props.Amount.value) ||
        !/^[0-9]+$/u.test(props.Amount.value)
      ) {
        throw new ValidationError(
          'NFTokenMint: Amount.value must be a non-negative base-10 integer string',
        );
      }
    } else if (isMPTAmount(props.Amount)) {
      if (
        !isString(props.Amount.value) ||
        !/^[0-9]+$/u.test(props.Amount.value)
      ) {
        throw new ValidationError(
          'NFTokenMint: Amount.value must be a non-negative base-10 integer string',
        );
      }
    }
  }

  return buildFrozenTx<NftokenMintProps, NftokenMint>(
    'NFTokenMint',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: NftokenMint) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: NftokenMint, overrides: Partial<NftokenMintProps>) {
        return nftokenMint(mergeForWith(this, overrides));
      },
    },
  );
}
