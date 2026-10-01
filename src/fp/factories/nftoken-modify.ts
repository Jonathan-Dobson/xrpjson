/**
 * Functional NFTokenModify factory — frozen-object style.
 *
 * Modifies an existing dynamic NFToken (one minted with the `tfMutable`
 * flag enabled, per XLS-46). Currently the only mutable field is `URI`.
 * Validation happens at construction; there is no way to construct an
 * invalid tx.
 *
 *   import { nftokenModify } from 'xrpjson';
 *   const tx = nftokenModify({ Account, NFTokenID });
 *   const tx2 = nftokenModify({
 *     Account, NFTokenID,
 *     URI: '697066733A2F2F62616679',
 *     Owner: 'rogue5HnPRSszD9CWGSUz8UGHMVwSSKF6',
 *   });
 *   const j = tx2.toJSON();
 *   const tx3 = tx2.with({ URI: '6F746865726D657461' });
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/nftokenmodify
 * @see https://github.com/XRPLF/xrpl.js/blob/main/packages/xrpl/src/models/transactions/NFTokenModify.ts
 * @see XLS-0046 (Dynamic Non-Fungible Tokens) §3.2
 *     (`~/.mavis/docs.local/xrpl-standards/repo/XLS-0046-dynamic-non-fungible-tokens/README.md`
 *     lines 49–95)
 *
 * Affected amendments:
 *   - `DynamicNFT` — required for the transaction to be accepted.
 *   - `NonFungibleTokensV1` (XLS-20) — base NFToken support.
 *   - `NonFungibleTokensV1_1` — adds the optional `Owner` field.
 *
 * ## Divergences
 *
 * Compared with the Class API's `NFTokenModify`, this factory adds
 * guards the class skips (or that xrpl.js / xrpl.org / XLS-46 mandate
 * but the class omits):
 *
 * - **`NFTokenID` must be a 64-character hexadecimal string** — XLS-46
 *   §3.2 line 69 declares `NFTokenID` as `UINT256`. xrpl.org
 *   `nftokenmodify.md` line 37 labels it "String - Hexadecimal" with
 *   internal type `UInt256`. A UInt256 in hex is 64 characters.
 *   xrpl.js's `validateNFTokenModify` (line 55) only checks `isString`,
 *   and the class inherits the same laxness. The factory enforces the
 *   on-ledger shape.
 *   - Source: XLS-46 §3.2 line 69 (`UINT256`).
 *   - Source: xrpl.org `nftokenmodify.md` line 37 (UInt256, String -
 *     Hexadecimal).
 *   - Cross-ref: rippled parses `NFTokenID` as `HASH256` via
 *     `NFTokenModify.cpp`; HASH256 is 32 bytes = 64 hex chars.
 *
 * - **All-zero `NFTokenID` is rejected** — HASH256 zero is malformed
 *   by general convention. The class permits `'00…00'` because any
 *   64-char hex passes `isString` + length check. The decoded
 *   NFTokenID contains a 160-bit account ID in bytes [8, 48); an
 *   all-zero ID cannot encode a valid account, so a real modify
 *   against the zero NFTokenID would be rejected on-ledger as
 *   `temMALFORMED`. We catch it at construction.
 *   - Source: HASH256 convention (analogous to VaultID, LoanID,
 *     LoanBrokerID, NFTokenBurn.NFTokenID all-zeros rejection across
 *     this codebase; see `src/fp/factories/nftoken-burn.ts`).
 *
 * - **`URI` must be hex-encoded** — XLS-46 §3.2 line 76 declares `URI`
 *   as `BLOB`. xrpl.js's `validateNFTokenModify` (lines 59–65) checks
 *   `isHex` when URI is a non-empty string. The class accepts any
 *   string. We enforce hex at construction.
 *   - Source: XLS-46 §3.2 line 76 (`BLOB`).
 *   - Source: xrpl.js `NFTokenModify.ts` lines 59–65.
 *   - Source: xrpl.org `nftokenmodify.md` line 38 ("In JSON, this
 *     should be encoded as a string of hexadecimal").
 *
 * - **`URI` must not be an empty string** — xrpl.js
 *   `validateNFTokenModify` (lines 60–62) rejects `''`. xrpl.org
 *   `nftokenmodify.md` line 38 documents that omitting the field
 *   deletes any existing URI, but setting it to `""` is distinct from
 *   omitting it. The class accepts `''`. We mirror xrpl.js.
 *   - Source: xrpl.js `NFTokenModify.ts` lines 60–62.
 *   - Source: xrpl.org `nftokenmodify.md` line 38 ("Omit it from the
 *     transaction… if you do not use it" — i.e., `""` ≠ omitted).
 *
 * - **`URI` length capped at 256 bytes (512 hex chars)** — xrpl.org
 *   `nftokenmodify.md` line 38 states "Up to 256 bytes of arbitrary
 *   data." XLS-46 §3.2 line 76 declares the type as `BLOB` with no
 *   explicit limit, but the on-ledger cap matches XLS-20 §1.3.3
 *   (`NFTokenMint.URI` is also limited to 256 bytes). The class does
 *   not enforce this. The factory enforces 256 bytes (512 hex chars)
 *   and also rejects odd-length hex so byte-alignment is preserved.
 *   - Source: xrpl.org `nftokenmodify.md` line 38 ("limited to a
 *     maximum length of 256 bytes" — same wording as nftokenmint.md
 *     line 53).
 *   - Cross-ref: XLS-20 §1.3.3 line 134 (256-byte BLOB cap applied to
 *     NFTokenMint.URI; NFTokenModify reuses the same wire field).
 *
 * - **`Owner` must not equal `Account`** — XLS-46 §3.2 line 59 says
 *   "in case of `Owner` not specified, it's implied that the
 *   submitting `account` is also the `Owner` of the NFT." xrpl.org
 *   `nftokenmodify.md` line 36 says "If the `Account` and `Owner` are
 *   the same address, omit this field." Including `Owner: Account` is
 *   therefore redundant and confusing; xrpl.js does not enforce it
 *   (passes through `validateOptionalField(tx, 'Owner', isAccount)`),
 *   and the class does not enforce it either. We reject it for
 *   clarity — this also catches the common "I forgot to omit Owner"
 *   bug at construction time.
 *   - Source: xrpl.org `nftokenmodify.md` line 36 ("If the `Account`
 *     and `Owner` are the same address, omit this field").
 *   - Source: XLS-46 §3.2 line 59.
 *
 * - **`URI` omitted is permitted (deletes existing URI)** — xrpl.org
 *   `nftokenmodify.md` line 38 documents that omitting URI deletes any
 *   existing URI on the token. The class permits this by leaving
 *   `this.URI` undefined. We mirror the permissive behavior — there is
 *   no cross-field rule binding URI to other fields, and the field is
 *   genuinely optional in the protocol sense.
 *   - Source: xrpl.org `nftokenmodify.md` line 38 ("If you do not
 *     specify a URI, the existing URI is deleted").
 *
 * - **`Flags` accepted for parity with the base transaction shape** —
 *   NFTokenModify itself defines no transaction-specific flags; only
 *   `tfFullyCanonicalSig` (global) is normally meaningful. The class
 *   does not declare a Flags field. We accept a numeric bitmask for
 *   parity with the base tx shape (matches `nftoken-burn.ts` pattern).
 *   This is a permissive addition, not a tightening; callers who pass
 *   a non-zero Flags get the value stored verbatim. (Divergence is
 *   documented for awareness; no spec source requires flag rejection
 *   for NFTokenModify.)
 */
import { isAccount, isHex, isString } from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// HASH256 (UInt256) in hex is 64 characters. XLS-46 §3.2 line 69:
// NFTokenID internal type is UINT256; xrpl.org nftokenmodify.md
// confirms UInt256.
const NFTOKEN_ID_HEX_LENGTH = 64;
// All-zero HASH256 is reserved / malformed by general convention.
const NFTOKEN_ID_ZERO = '0'.repeat(NFTOKEN_ID_HEX_LENGTH);
// XLS-46 §3.2 line 76 / xrpl.org nftokenmodify.md line 38: URI is a BLOB
// with max 256 bytes.
const MAX_URI_BYTES = 256;
const MAX_URI_HEX_CHARS = MAX_URI_BYTES * 2;

// ─── Public types ────────────────────────────────────────────────────

export interface NftokenModifyProps {
  Account: string;
  /** The 64-char hex (UInt256) identifier of the dynamic NFToken to
   *  modify. */
  NFTokenID: string;
  /** New URI (hex-encoded, ≤ 256 bytes). Omit to delete the existing
   *  URI on the token. */
  URI?: string | undefined;
  /** Current owner of the NFToken, if different from Account. Used by
   *  the issuer / authorized minter to modify a token held by another
   *  account. */
  Owner?: string | undefined;
  Fee?: string | undefined;
  Sequence?: number | undefined;
  /** Bit-flags (numeric bitmask). NFTokenModify itself defines no
   *  transaction-specific flags; only `tfFullyCanonicalSig` (global)
   *  is normally meaningful. Accepted for parity with the base
   *  transaction shape. */
  Flags?: number | undefined;
}

export interface NftokenModify
  extends Readonly<NftokenModifyProps> {
  readonly TransactionType: 'NFTokenModify';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<NftokenModifyProps>): NftokenModify;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function nftokenModify(props: NftokenModifyProps): NftokenModify {
  // ── Account ── required, must be a valid XRPL account.
  require(props.Account, 'NFTokenModify: Account is required', isAccount);

  // ── NFTokenID ── required, 64-char hex (HASH256 / UInt256),
  //                 and not all-zero.
  if (!isString(props.NFTokenID)) {
    throw new ValidationError(
      'NFTokenModify: NFTokenID is required and must be a string',
    );
  }
  if (!isHex(props.NFTokenID)) {
    throw new ValidationError(
      'NFTokenModify: NFTokenID must be a hex-encoded string',
    );
  }
  if (props.NFTokenID.length !== NFTOKEN_ID_HEX_LENGTH) {
    throw new ValidationError(
      `NFTokenModify: NFTokenID must be exactly ${NFTOKEN_ID_HEX_LENGTH} hex characters (HASH256)`,
    );
  }
  if (props.NFTokenID === NFTOKEN_ID_ZERO) {
    throw new ValidationError(
      'NFTokenModify: NFTokenID must not be the all-zero HASH256 value',
    );
  }

  // ── URI ── optional, non-empty hex, even length, ≤ 256 bytes
  //          (512 hex chars). Odd-length hex is invalid by the BLOB
  //          spec; omitting URI is permitted (deletes existing URI on
  //          the token).
  if (props.URI !== undefined) {
    if (!isString(props.URI)) {
      throw new ValidationError(
        'NFTokenModify: URI must be a hex-encoded string',
      );
    }
    if (props.URI.length === 0) {
      throw new ValidationError(
        'NFTokenModify: URI must not be an empty string',
      );
    }
    if (!isHex(props.URI)) {
      throw new ValidationError(
        'NFTokenModify: URI must be a hex-encoded string',
      );
    }
    if (props.URI.length % 2 !== 0) {
      throw new ValidationError(
        'NFTokenModify: URI must have an even number of hex characters (BLOB is byte-aligned)',
      );
    }
    if (props.URI.length > MAX_URI_HEX_CHARS) {
      throw new ValidationError(
        `NFTokenModify: URI exceeds ${MAX_URI_BYTES} bytes (${MAX_URI_HEX_CHARS} hex chars); actual: ${props.URI.length}`,
      );
    }
  }

  // ── Owner ── optional, must be a valid XRPL account when present,
  //             and must NOT equal Account (xrpl.org nftokenmodify.md
  //             line 36: "If the `Account` and `Owner` are the same
  //             address, omit this field").
  if (props.Owner !== undefined) {
    if (!isAccount(props.Owner)) {
      throw new ValidationError(
        'NFTokenModify: Owner must be a valid XRPL account address',
      );
    }
    if (props.Owner === props.Account) {
      throw new ValidationError(
        'NFTokenModify: Owner must not equal Account (omit Owner instead; xrpl.org nftokenmodify.md)',
      );
    }
  }

  return buildFrozenTx<NftokenModifyProps, NftokenModify>(
    'NFTokenModify',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: NftokenModify) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: NftokenModify, overrides: Partial<NftokenModifyProps>) {
        return nftokenModify(mergeForWith(this, overrides));
      },
    },
  );
}