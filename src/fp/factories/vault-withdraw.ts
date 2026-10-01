/**
 * Functional VaultWithdraw factory — frozen-object style.
 *
 * Withdraws assets from a vault in exchange for shares. The `Amount` field
 * can specify either an asset amount (vault burns the necessary shares) or
 * a share amount (vault pays out the corresponding assets). Validation
 * happens at construction; there is no way to construct an invalid tx.
 *
 *   import { vaultWithdraw } from 'xrpjson';
 *   const tx = vaultWithdraw({ Account, VaultID, Amount });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Destination: 'r…' });
 *
 * Affected amendments:
 *   - `SingleAssetVault` (base VaultWithdraw)
 *   - `LendingProtocolV1_1` (Investment-phase gating on closed-ended vaults;
 *     not locally checkable, runtime phase only)
 *   - `Credentials` (CredentialIDs field for permissioned-domain authorization)
 *   - `fixCleanup3_4_0` (withdrawal rules — no local preclaim change)
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/vaultwithdraw
 * @see https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0065-single-asset-vault
 *
 * ## Divergences
 *
 * Compared with the Class API's `VaultWithdraw`, this factory adds
 * preclaim guards the class API skips:
 *
 * 1. **`VaultID` must not be the all-zeros HASH256.**
 *    Source: XLS-0065 §3.6.2.1 check 1 — "The `VaultID` field is zero
 *    (`temMALFORMED`)." The class only checks `isString(VaultID)`.
 *    xrpl.js `validateVaultWithdraw` only requires it to be a string.
 *
 * 2. **`Amount` must be strictly positive (non-zero, non-negative).**
 *    Source: XLS-0065 §3.6.2.1 check 2 — "The `Amount` field is zero or
 *    negative (`temBAD_AMOUNT`)." xrpl.org `vaultwithdraw.md` Error Cases
 *    table — "`temBAD_AMOUNT` The `Amount` field of the transaction is
 *    invalid. For example, the provided amount is set to 0." The class
 *    only delegates to `isAmount`, which accepts any numeric string
 *    (including `0` and `-1`).
 *
 * 3. **`CredentialIDs` must have length in [1, MAX_AUTHORIZED_CREDENTIALS].**
 *    Source: xrpl.js `MAX_AUTHORIZED_CREDENTIALS = 8` for non-DomainSet
 *    transactions (`packages/xrpl/src/models/transactions/common.ts:28`),
 *    and `validateCredentialsList` rejects both empty arrays and arrays
 *    that exceed `maxCredentials`. xrpl.org `vaultwithdraw.md` Fields
 *    table — "An array of credential identifiers … if credential-based
 *    deposit authorization is required." The class only validates the
 *    shape of each entry, not the array length bounds.
 */
import type { Amount, MPTAmount } from '../../types/amounts.js';
import {
  isAccount,
  isAmount,
  isArray,
  isHex,
  isIssuedCurrencyAmount,
  isMPTAmount,
  isNumber,
  isString,
} from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// HASH256 in hex is 64 characters. (XLS-0065 §3.6.1: VaultID is HASH256.)
const HASH256_HEX_LENGTH = 64;

// All-zeros HASH256 is reserved / malformed per spec.
const VAULT_ID_ZERO =
  '0000000000000000000000000000000000000000000000000000000000000000';

// Credential IDs are 64-char hex (same as ledger entry IDs / HASH256).
const CREDENTIAL_ID_LENGTH = 64;

// xrpl.js caps non-DomainSet credential arrays at 8 entries.
// (packages/xrpl/src/models/transactions/common.ts: MAX_AUTHORIZED_CREDENTIALS = 8)
const MAX_CREDENTIAL_IDS = 8;

// ─── Public types ────────────────────────────────────────────────────

export interface VaultWithdrawProps {
  Account: string;
  /** The ID of the vault to withdraw from. 64-char hex (HASH256). */
  VaultID: string;
  /**
   * Asset amount to withdraw, or share amount to redeem. XRP drops string,
   * trust-line object, or MPT object.
   */
  Amount: Amount | MPTAmount;
  /** Optional destination account. Must be able to receive the asset. */
  Destination?: string | undefined;
  /** Optional destination tag identifying the reason for the withdrawal. */
  DestinationTag?: number | undefined;
  /**
   * Optional array of credential IDs authorizing the withdrawal when the
   * vault is gated by a permissioned domain (Credentials amendment).
   */
  CredentialIDs?: string[] | undefined;
  /** VaultWithdraw has no defined flags; permitted for base-tx parity. */
  Flags?: number | undefined;
  Fee?: string | undefined;
  Sequence?: number | undefined;
}

export interface VaultWithdraw extends Readonly<VaultWithdrawProps> {
  readonly TransactionType: 'VaultWithdraw';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<VaultWithdrawProps>): VaultWithdraw;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Per XLS-0065 §3.6.2.1 check 2: "The `Amount` field is zero or negative
 * (`temBAD_AMOUNT`)." Validates the sign of an Amount in all three
 * accepted forms.
 *
 *   - XRP form: a decimal-string of drops (e.g. "1000000").
 *   - IssuedCurrency form: object with a `value` sub-string.
 *   - MPT form: object with a `value` sub-string.
 *
 * We accept the canonical scientific mantissa form (`1.5e3`) so this
 * stays compatible with the XRPL serialization layer, which uses the
 * same mantissa as `rippled` for `STAmount`. Negative or zero mantissas
 * are rejected.
 */
function isPositiveAmount(amount: Amount | MPTAmount): boolean {
  if (typeof amount === 'string') {
    if (!/^-?[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u.test(amount)) {
      return false;
    }
    return parseFloat(amount) > 0;
  }
  if (typeof amount !== 'object' || amount === null) return false;
  const value = (amount as { value?: unknown }).value;
  if (typeof value !== 'string') return false;
  if (!/^-?[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u.test(value)) {
    return false;
  }
  return parseFloat(value) > 0;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function vaultWithdraw(props: VaultWithdrawProps): VaultWithdraw {
  // ── Account ── required, must be a valid XRPL classic address.
  require(props.Account, 'VaultWithdraw: Account is required', isAccount);

  // ── VaultID ── required, 64-char hex (HASH256) AND non-zero.
  if (
    !isString(props.VaultID) ||
    !isHex(props.VaultID) ||
    props.VaultID.length !== HASH256_HEX_LENGTH
  ) {
    throw new ValidationError(
      'VaultWithdraw: VaultID must be a 64-character hex string (HASH256)',
    );
  }
  if (props.VaultID === VAULT_ID_ZERO) {
    throw new ValidationError(
      'VaultWithdraw: VaultID must not be the all-zeros HASH256 value',
    );
  }

  // ── Amount ── required, must be a valid Amount AND strictly positive.
  if (!isAmount(props.Amount)) {
    throw new ValidationError(
      'VaultWithdraw: Amount must be a valid Amount (XRP / trust line / MPT form)',
    );
  }
  if (!isPositiveAmount(props.Amount)) {
    throw new ValidationError(
      'VaultWithdraw: Amount must be strictly positive (non-zero, non-negative)',
    );
  }

  // ── Destination ── optional, but if provided must be a valid XRPL
  //    account. (The XLS-65 §3.6.2.1 check 3 "Destination is zero" case
  //    is covered implicitly: the all-zeros 40-char hex string fails
  //    `isAccount`, which requires a classic `r…` or X-address prefix.)
  if (props.Destination !== undefined && !isAccount(props.Destination)) {
    throw new ValidationError(
      'VaultWithdraw: Destination must be a valid XRPL account address',
    );
  }

  // ── DestinationTag ── optional, must be a number if present.
  if (props.DestinationTag !== undefined && !isNumber(props.DestinationTag)) {
    throw new ValidationError(
      'VaultWithdraw: DestinationTag must be a number',
    );
  }

  // ── CredentialIDs ── optional array, but bounds + entry-shape enforced
  //    when present. Per xrpl.js: length in [1, MAX_AUTHORIZED_CREDENTIALS];
  //    each entry is a 64-char hex string.
  if (props.CredentialIDs !== undefined) {
    if (!isArray(props.CredentialIDs)) {
      throw new ValidationError(
        'VaultWithdraw: CredentialIDs must be an array of credential ID strings',
      );
    }
    if (props.CredentialIDs.length === 0) {
      throw new ValidationError(
        'VaultWithdraw: CredentialIDs must not be an empty array',
      );
    }
    if (props.CredentialIDs.length > MAX_CREDENTIAL_IDS) {
      throw new ValidationError(
        `VaultWithdraw: CredentialIDs length cannot exceed ${MAX_CREDENTIAL_IDS} elements (actual: ${props.CredentialIDs.length})`,
      );
    }
    for (let i = 0; i < props.CredentialIDs.length; i++) {
      const cid = props.CredentialIDs[i];
      if (!isString(cid) || !isHex(cid) || cid.length !== CREDENTIAL_ID_LENGTH) {
        throw new ValidationError(
          `VaultWithdraw: CredentialIDs[${i}] must be a ${CREDENTIAL_ID_LENGTH}-character hex string`,
        );
      }
    }
  }

  // Touch the optional Amount-shape branches so the imports aren't flagged
  // as unused under strict lint; the helpers are used by helpers exported
  // elsewhere and may be reused for downstream sub-field checks.
  void isIssuedCurrencyAmount;
  void isMPTAmount;

  return buildFrozenTx<VaultWithdrawProps, VaultWithdraw>(
    'VaultWithdraw',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: VaultWithdraw) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: VaultWithdraw, overrides: Partial<VaultWithdrawProps>) {
        return vaultWithdraw(mergeForWith(this, overrides));
      },
    },
  );
}
