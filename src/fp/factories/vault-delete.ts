/**
 * Functional VaultDelete factory — frozen-object style.
 *
 * Deletes an existing vault ledger entry. Validation happens at
 * construction; there is no way to construct an invalid tx.
 *
 *   import { vaultDelete } from 'xrplt/fp';
 *   const tx = vaultDelete({ Account, VaultID });
 *   const j = tx.toJSON();
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/vaultdelete
 * @see https://xrpl.org/docs/concepts/tokens/single-asset-vaults
 *
 * Affected amendments:
 *   - `SingleAssetVault`         — base VaultDelete.
 *   - `LendingProtocolV1_1`     — introduces the optional `MemoData`
 *                                 field for documenting the deletion reason.
 *
 * ## Divergences
 *
 * The class-based API at `src/transactions/vault-delete.ts` is missing
 * two rules that the canonical sources require. The factory fills them:
 *
 *   1. Empty `MemoData` is rejected.
 *      The class treats `""` as a valid `MemoData` because `"" !== undefined`
 *      and `""` is a valid (empty) hex string. The spec mandates that when
 *      present the decoded value must be 1–256 bytes.
 *      Source: XLS-0065 §3.4.2.1 #3 (LendingProtocolV1_1, `temMALFORMED`);
 *              xrpl-dev-portal `vaultdelete.md` (Error Cases table).
 *
 *   2. All-zero `VaultID` is rejected.
 *      The class only checks that `VaultID` is a 64-char hex string, so a
 *      64-char string of zeros (`'00…00'`) passes. The spec mandates that
 *      `VaultID == 0` is malformed.
 *      Source: XLS-0065 §3.4.2.1 #1 (`temMALFORMED`);
 *              xrpl-dev-portal `vaultdelete.md` (Error Cases table);
 *              XLS-0065 §3.4.1 (`HASH256` internal type).
 */
import { isHex, isString } from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// Maximum decoded MemoData length in bytes (hex is 2 chars per byte).
const MAX_MEMO_DATA_BYTES = 256;
// HASH256 serialized length in hex characters.
const VAULT_ID_LENGTH = 64;

// ─── Public types ────────────────────────────────────────────────────

export interface VaultDeleteProps {
  Account: string;
  /** The ID of the vault to delete. 64-char hex; must not be all-zero. */
  VaultID: string;
  /**
   * (LendingProtocolV1_1) Optional hex-encoded reason for the deletion.
   * If present, the decoded value must be 1–256 bytes.
   */
  MemoData?: string | undefined;
  Fee?: string | undefined;
  Sequence?: number | undefined;
}

export interface VaultDelete
  extends Readonly<VaultDeleteProps> {
  readonly TransactionType: 'VaultDelete';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<VaultDeleteProps>): VaultDelete;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function vaultDelete(props: VaultDeleteProps): VaultDelete {
  // ── Account ── required, must be a valid XRPL classic or X-address.
  require(props.Account, 'VaultDelete: Account is required', isString);

  // ── VaultID ── required, 64-char hex, and not all-zero.
  if (
    !isString(props.VaultID) ||
    !isHex(props.VaultID) ||
    props.VaultID.length !== VAULT_ID_LENGTH
  ) {
    throw new ValidationError(
      'VaultDelete: VaultID must be a 64-character hex string',
    );
  }
  // All-zero VaultID is a separate malformation per XLS-0065 §3.4.2.1 #1.
  if (/^0+$/u.test(props.VaultID)) {
    throw new ValidationError('VaultDelete: VaultID must not be zero');
  }

  // ── MemoData ── hex, non-empty (≥ 1 byte), even-length, ≤ 256 bytes.
  if (props.MemoData !== undefined) {
    if (!isString(props.MemoData)) {
      throw new ValidationError(
        'VaultDelete: MemoData must be a hex string',
      );
    }
    // Empty MemoData is rejected per spec — the decoded value must be
    // 1–256 bytes when present. Check this before the hex regex so the
    // error message is specific to the empty case.
    if (props.MemoData.length === 0) {
      throw new ValidationError(
        'VaultDelete: MemoData must not be empty (decoded value must be 1–256 bytes)',
      );
    }
    if (!isHex(props.MemoData)) {
      throw new ValidationError(
        'VaultDelete: MemoData must be a hex string',
      );
    }
    if (props.MemoData.length % 2 !== 0) {
      throw new ValidationError(
        'VaultDelete: MemoData must be a hex string with an even number of characters',
      );
    }
    const bytes = props.MemoData.length / 2;
    if (bytes > MAX_MEMO_DATA_BYTES) {
      throw new ValidationError(
        `VaultDelete: MemoData exceeds ${MAX_MEMO_DATA_BYTES} bytes (actual: ${bytes})`,
      );
    }
  }

  return buildFrozenTx<VaultDeleteProps, VaultDelete>(
    'VaultDelete',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: VaultDelete) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: VaultDelete, overrides: Partial<VaultDeleteProps>) {
        return vaultDelete(mergeForWith(this, overrides));
      },
    },
  );
}