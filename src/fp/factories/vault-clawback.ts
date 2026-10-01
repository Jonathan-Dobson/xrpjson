/**
 * Functional VaultClawback factory — frozen-object style.
 *
 * Performs a clawback from a Single-asset vault on behalf of a Holder,
 * exchanging the Holder's vault shares for the underlying asset and
 * sending the funds to the asset's Issuer. If `Amount` is omitted (or
 * zero in serialized form) the tx claws back all funds up to the total
 * shares the Holder owns.
 *
 * Validation happens at construction; there is no way to construct an
 * invalid tx. Compare to the class-based equivalent, which exposes a
 * separate `.validate()` method you must remember to call.
 *
 *   import { vaultClawback } from 'xrpjson';
 *   const tx = vaultClawback({ Account, VaultID, Holder, Amount: IOU_AMT });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Holder: 'r…' });
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/vaultclawback
 * @see https://github.com/XRPLF/xrpl.js/blob/main/packages/xrpl/src/models/transactions/vaultClawback.ts
 * @see XLS-0065 §3.7 (https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0065-single-asset-vault)
 *
 * ## Divergences
 *
 * Compared with the Class API's `VaultClawback`, this factory adds
 * guards the class skips:
 *
 * - **VaultID must be a 64-character hex string** (XLS-0065 §3.7.1 declares
 *   `VaultID` as `HASH256`; the class only checks `isString(VaultID)`).
 *   - Source: XLS-0065 §3.7.1 Fields table, Internal Type = `HASH256`.
 *   - Source: xrpl-dev-portal vaultclawback.md, Fields table row for `VaultID`.
 *
 * - **Amount `value` must be a non-negative base-10 integer string**
 *   (the canonical XRPL Number representation; matches the policy used
 *   by `loanSet`, `vaultCreate`, etc.). The class only checks shape via
 *   `isClawbackAmount`, which does not check numeric well-formedness.
 *   - Source: xrpl.org generic Amount spec
 *     (https://xrpl.org/docs/references/protocol/data-types/basic-data-types#specifying-currency-amounts).
 *
 * - **IssuedCurrencyAmount `currency` and `issuer` shape are validated**
 *   (3-char ASCII or 40-char hex `currency`; `issuer` must be a valid
 *   XRPL account). The class only delegates to `isClawbackAmount`, which
 *   does not enforce those sub-fields.
 *   - Source: xrpl-dev-portal basic-data-types#specifying-currency-amounts.
 *
 * - **MPTAmount `mpt_issuance_id` must be a non-empty hex string** with
 *   reasonable length (24-48). The class only checks key presence.
 *   - Source: XLS-0033 Multi-Purpose Tokens (mpt_issuance_id is 96-bit
 *     uint, hex-encoded to ≤ 24 hex chars; we accept a slightly wider
 *     range to avoid breaking on future widenings).
 *
 * - **No `Flags` validation**: per XLS-0065 §3.7 and xrpl.org, VaultClawback
 *   defines no transaction flags; the factory does not require `Flags`,
 *   but does accept it as `0` if supplied (BaseTransactionFields
 *   compatibility). The class inherits `Flags` from its parent and never
 *   checks it either.
 *   - Source: xrpl-dev-portal vaultclawback.md "VaultClawback Flags" section.
 */
import type { ClawbackAmount } from '../../types/amounts.js';
import {
  isAccount,
  isClawbackAmount,
  isHex,
  isIssuedCurrencyAmount,
  isMPTAmount,
  isString,
} from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// HASH256 in hex is 64 characters. (XLS-0065 §3.7.1: VaultID is HASH256.)
const HASH256_HEX_LENGTH = 64;

// Currency codes are either 3 ASCII characters or 40 hex characters.
const CURRENCY_ASCII_LENGTH = 3;
const CURRENCY_HEX_LENGTH = 40;

// MPT issuance IDs are 192-bit, hex-encoded (≤ 48 chars).
// We accept 24..48 to leave slack for future widenings / leading-zero
// encoders. Empty strings are rejected.
const MPT_ISSUANCE_ID_MIN = 24;
const MPT_ISSUANCE_ID_MAX = 48;

// ─── Public types ────────────────────────────────────────────────────

export interface VaultClawbackProps {
  Account: string;
  /** The ID of the vault from which assets are withdrawn. 64-char hex (HASH256). */
  VaultID: string;
  /** The account ID from which to clawback assets. */
  Holder: string;
  /**
   * Optional clawback amount. When omitted, the asset is inferred from the
   * vault. **NOT** an XRP amount string — only IssuedCurrency or MPT form.
   */
  Amount?: ClawbackAmount | undefined;
  /** No flags defined for VaultClawback; permitted for base-tx parity. */
  Flags?: number | undefined;
  Fee?: string | undefined;
  Sequence?: number | undefined;
}

export interface VaultClawback
  extends Readonly<VaultClawbackProps> {
  readonly TransactionType: 'VaultClawback';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<VaultClawbackProps>): VaultClawback;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * XRPLNumber: a non-negative base-10 integer string. Matches the policy
 * used across other factories (loanSet, vaultCreate).
 */
function isXrplNumber(value: unknown): value is string {
  return isString(value) && /^[0-9]+$/u.test(value);
}

// ─── Factory ─────────────────────────────────────────────────────────

export function vaultClawback(props: VaultClawbackProps): VaultClawback {
  // ── Account ── required, must be a valid XRPL classic address.
  require(props.Account, 'VaultClawback: Account is required', isAccount);

  // ── VaultID ── required, 64-char hex (HASH256).
  if (
    !isString(props.VaultID) ||
    !isHex(props.VaultID) ||
    props.VaultID.length !== HASH256_HEX_LENGTH
  ) {
    throw new ValidationError(
      'VaultClawback: VaultID must be a 64-character hex string (HASH256)',
    );
  }

  // ── Holder ── required, valid XRPL account address.
  require(props.Holder, 'VaultClawback: Holder is required', isAccount);

  // ── Amount ── optional, must be a valid ClawbackAmount (IOU/MPT, NOT XRP).
  if (props.Amount !== undefined) {
    if (!isClawbackAmount(props.Amount)) {
      throw new ValidationError(
        'VaultClawback: Amount must be a valid ClawbackAmount (trust line / MPT form, NOT XRP)',
      );
    }

    if (isIssuedCurrencyAmount(props.Amount)) {
      // Currency: 3 ASCII or 40 hex characters.
      const ccy = props.Amount.currency;
      if (
        ccy.length !== CURRENCY_ASCII_LENGTH &&
        ccy.length !== CURRENCY_HEX_LENGTH
      ) {
        throw new ValidationError(
          `VaultClawback: Amount.currency must be ${CURRENCY_ASCII_LENGTH} ASCII characters or ${CURRENCY_HEX_LENGTH} hex characters (actual: ${ccy.length})`,
        );
      }
      if (ccy.length === CURRENCY_HEX_LENGTH && !isHex(ccy)) {
        throw new ValidationError(
          'VaultClawback: Amount.currency (40-char form) must be hex',
        );
      }
      // Issuer must be a valid XRPL account.
      if (!isAccount(props.Amount.issuer)) {
        throw new ValidationError(
          'VaultClawback: Amount.issuer must be a valid XRPL account address',
        );
      }
      // Value: non-negative base-10 integer string.
      if (!isXrplNumber(props.Amount.value)) {
        throw new ValidationError(
          'VaultClawback: Amount.value must be a non-negative base-10 integer string',
        );
      }
    } else if (isMPTAmount(props.Amount)) {
      const mptid = props.Amount.mpt_issuance_id;
      if (
        mptid.length < MPT_ISSUANCE_ID_MIN ||
        mptid.length > MPT_ISSUANCE_ID_MAX ||
        !isHex(mptid)
      ) {
        throw new ValidationError(
          `VaultClawback: Amount.mpt_issuance_id must be a ${MPT_ISSUANCE_ID_MIN}-${MPT_ISSUANCE_ID_MAX} character hex string`,
        );
      }
      if (!isXrplNumber(props.Amount.value)) {
        throw new ValidationError(
          'VaultClawback: Amount.value must be a non-negative base-10 integer string',
        );
      }
    }
  }

  return buildFrozenTx<VaultClawbackProps, VaultClawback>(
    'VaultClawback',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: VaultClawback) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: VaultClawback, overrides: Partial<VaultClawbackProps>) {
        return vaultClawback(mergeForWith(this, overrides));
      },
    },
  );
}