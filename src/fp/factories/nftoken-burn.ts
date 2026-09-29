/**
 * Functional NFTokenBurn factory — frozen-object style.
 *
 * Permanently removes an NFToken object from its NFTokenPage. Validation
 * happens at construction; there is no way to construct an invalid tx.
 *
 *   import { nftokenBurn } from 'xrplt/fp';
 *   const tx = nftokenBurn({ Account, NFTokenID });
 *   const j = tx.toJSON();
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/nftokenburn
 * @see https://github.com/XRPLF/xrpl.js/blob/main/packages/xrpl/src/models/transactions/NFTokenBurn.ts
 * @see XLS-0020 (Non-Fungible Tokens) §1.5.5
 *
 * Affected amendments:
 *   - `NonFungibleTokensV1`   — base NFTokenBurn.
 *   - `NonFungibleTokensV1_1` — adds the optional `Owner` field for
 *                               issuer/authorized-minter burns.
 *
 * ## Divergences
 *
 * Compared with `src/transactions/nftoken-burn.ts`, this factory adds
 * guards the class skips (or that xrpl.js / xrpl.org / XLS-20 mandate
 * but the class omits):
 *
 * - **`NFTokenID` must be a 64-character hex string** — XLS-20 §1.5.5
 *   lists the internal type as `UINT256`, which is 32 bytes = 64 hex
 *   characters. The class only checks `isString(NFTokenID)`, accepting
 *   any string. xrpl.js's `validateNFTokenBurn` likewise only uses
 *   `isString`. The factory enforces the on-ledger shape.
 *   - Source: XLS-20 §1.5.5
 *     (`~/.mavis/docs.local/xrpl-standards/repo/XLS-0020-non-fungible-tokens/README.md`
 *     line 437, `NFTokenID` `Internal Type` `UINT256`).
 *   - Source: xrpl.org `nftokenburn.md` ("String" JSON type, UInt256
 *     internal type).
 *   - Cross-ref: rippled parses `NFTokenID` as `HASH256` via
 *     `NFTokenBurn.cpp`; HASH256 is 32 bytes = 64 hex chars.
 *
 * - **All-zero `NFTokenID` is rejected** — HASH256 zero is malformed by
 *   general convention. The class permits `'00…00'` because any
 *   64-char hex passes `isString` + length check. The decoded NFTokenID
 *   contains a 160-bit account ID in bytes [8, 48) and an all-zero ID
 *   cannot encode a valid account, so a real burn against the zero
 *   NFTokenID would be rejected on-ledger as `temMALFORMED`. We catch
 *   it at construction.
 *   - Source: HASH256 convention (analogous to VaultID, LoanID,
 *     LoanBrokerID all-zeros rejection across this codebase).
 *   - Cross-ref: xrpl.js `parseNFTokenID` requires `length === 64`
 *     (`~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/utils/parseNFTokenID.ts`
 *     line 73) but does not reject zero.
 *
 * - **`Owner` cross-checked against `Account`** — xrpl.org's
 *   `nftokenburn.md` states Owner is "Only used if that owner is
 *   different than the account sending this transaction." xrpl.js's
 *   `validateNFTokenBurn` does not enforce this; the class does not
 *   either. We do not enforce it as a hard error (the spec leaves the
 *   ledger to apply the permission check via `tecNO_PERMISSION`),
 *   but we leave the field undefined by default rather than mirroring
 *   the class's `this.Owner = undefined`. (Behavior is identical;
 *   documented for awareness.)
 *   - Source: xrpl.org `nftokenburn.md` (Owner field description).
 *
 * - **`Owner` defaults to `undefined`, NOT a class-property
 * `this.Owner?: string = undefined`** — The class declares
 * `readonly Owner?: string | undefined = undefined`, which is a
 * no-op accessor that always shows up as `undefined`. The factory
 * relies on `mergeForWith` to omit unspecified fields from the frozen
 * object so `Object.keys(tx)` reflects only what the caller provided.
 * This is the same divergence pattern used by every other fp factory.
 *   - Source: `src/fp/shape.ts` `mergeForWith` (lines 76–89).
 */
import { isAccount, isHex, isString } from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// HASH256 (UInt256) in hex is 64 characters. XLS-20 §1.5.5: NFTokenID
// internal type is UINT256; xrpl.org nftokenburn.md confirms UInt256.
const NFTOKEN_ID_HEX_LENGTH = 64;
// All-zero HASH256 is reserved / malformed by general convention.
const NFTOKEN_ID_ZERO = '0'.repeat(NFTOKEN_ID_HEX_LENGTH);

// ─── Public types ────────────────────────────────────────────────────

export interface NftokenBurnProps {
  Account: string;
  /** The 64-char hex (UInt256) identifier of the NFToken to burn. */
  NFTokenID: string;
  /**
   * (NonFungibleTokensV1_1) The account that currently owns the token,
   * if different from Account. Used by the issuer / authorized minter
   * to burn tokens with the `lsfBurnable` flag enabled that are not
   * owned by the signing account.
   */
  Owner?: string | undefined;
  Fee?: string | undefined;
  Sequence?: number | undefined;
  /** Bit-flags (numeric bitmask). NFTokenBurn itself defines no
   *  transaction-specific flags; only `tfFullyCanonicalSig` (global)
   *  is normally meaningful. Accepted for parity with the base
   *  transaction shape. */
  Flags?: number | undefined;
}

export interface NftokenBurn
  extends Readonly<NftokenBurnProps> {
  readonly TransactionType: 'NFTokenBurn';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<NftokenBurnProps>): NftokenBurn;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function nftokenBurn(props: NftokenBurnProps): NftokenBurn {
  // ── Account ── required, must be a valid XRPL account.
  require(props.Account, 'NFTokenBurn: Account is required', isAccount);

  // ── NFTokenID ── required, 64-char hex (HASH256 / UInt256),
  //                 and not all-zero.
  if (!isString(props.NFTokenID)) {
    throw new ValidationError(
      'NFTokenBurn: NFTokenID is required and must be a string',
    );
  }
  if (!isHex(props.NFTokenID)) {
    throw new ValidationError(
      'NFTokenBurn: NFTokenID must be a hex-encoded string',
    );
  }
  if (props.NFTokenID.length !== NFTOKEN_ID_HEX_LENGTH) {
    throw new ValidationError(
      `NFTokenBurn: NFTokenID must be exactly ${NFTOKEN_ID_HEX_LENGTH} hex characters (HASH256)`,
    );
  }
  if (props.NFTokenID === NFTOKEN_ID_ZERO) {
    throw new ValidationError(
      'NFTokenBurn: NFTokenID must not be the all-zero HASH256 value',
    );
  }

  // ── Owner ── optional, must be a valid XRPL account when present.
  if (props.Owner !== undefined) {
    if (!isAccount(props.Owner)) {
      throw new ValidationError(
        'NFTokenBurn: Owner must be a valid XRPL account address',
      );
    }
  }

  return buildFrozenTx<NftokenBurnProps, NftokenBurn>(
    'NFTokenBurn',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: NftokenBurn) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: NftokenBurn, overrides: Partial<NftokenBurnProps>) {
        return nftokenBurn(mergeForWith(this, overrides));
      },
    },
  );
}