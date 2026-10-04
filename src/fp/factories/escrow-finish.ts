/**
 * Functional EscrowFinish factory — frozen-object style.
 *
 * Deliver XRP (or, under the TokenEscrow amendment, IOU/MPT tokens) from
 * a held escrow to the recipient. The original `EscrowCreate` may have
 * specified a `Condition` (in which case the matching `Fulfillment` is
 * required to unlock the funds) and/or a `FinishAfter` time. Validation
 * happens at construction; there is no way to construct an invalid tx from the
 * fields it models.
 *
 *   import { escrowFinish } from 'xrpjson';
 *   const tx = escrowFinish({
 *     Account, Owner, OfferSequence,
 *     Condition: 'A0258020…', Fulfillment: 'A0028000',
 *   });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Fulfillment: 'A0028001' });
 *
 * Affected amendments:
 *   - `Escrow` (base EscrowFinish)
 *   - `TokenEscrow` (XLS-85: IOU/MPT tokens in addition to XRP)
 *   - `Credentials` (CredentialIDs field for permissioned-domain auth)
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/escrowfinish
 * @see https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0085-token-escrow
 *
 * ## Divergences
 *
 * Compared with the Class API's `EscrowFinish`, this factory adds
 * preclaim guards the class API skips:
 *
 * 1. **`CredentialIDs` field is supported.**
 *    Source: xrpl.js
 *    (`repo/packages/xrpl/src/models/transactions/escrowFinish.ts:40`) —
 *    "`CredentialIDs?: string[]` — Credentials associated with the
 *    sender of this transaction. The credentials included must not be
 *    expired." xrpl.org `escrowfinish.md` Fields table also lists
 *    `CredentialIDs` as a Vector256 field. The local class predates
 *    the Credentials amendment and silently drops the field.
 *
 * 2. **`CredentialIDs` length must be in [1, MAX_AUTHORIZED_CREDENTIALS].**
 *    Source: xrpl.js `validateCredentialsList`
 *    (`packages/xrpl/src/models/transactions/common.ts:1106–1148`) —
 *    "Credentials length cannot exceed 8 elements" / "Credentials
 *    cannot be an empty array." `MAX_AUTHORIZED_CREDENTIALS = 8`
 *    (`common.ts:28`) is the cap for non-DomainSet transactions. The
 *    class does not model the field.
 *
 * 3. **`CredentialIDs[i]` must be a 64-character hex string.**
 *    Source: xrpl.org `escrowfinish.md` — "Each member of the array
 *    must be the ledger entry ID of a Credential entry in the ledger"
 *    (HASH256, 64 hex chars). The class does not model the field.
 *
 * 4. **`Condition` must be a hex string.**
 *    Source: xrpl.org `escrowfinish.md` fields table — "`Condition`
 *    … String - Hexadecimal, Internal Type: Blob." The class only
 *    checks `isString(Condition)` and accepts arbitrary text.
 *
 * 5. **`Fulfillment` must be a hex string.**
 *    Source: xrpl.org `escrowfinish.md` fields table — "`Fulfillment`
 *    … String - Hexadecmial, Internal Type: Blob." The class only
 *    checks `isString(Fulfillment)`. Note: a hex validation here is
 *    a preclaim-style guard — the actual fulfillment is parsed by
 *    rippled, which can still reject a syntactically-hex but
 *    cryptographically-invalid string at apply time.
 *
 * 6. **`OfferSequence` must be a UInt32 (non-negative integer).**
 *    Source: xrpl.org `escrowfinish.md` fields table — "`OfferSequence`
 *    … Number, Internal Type: UInt32." xrpl.js `validateEscrowFinish`
 *    (`escrowFinish.ts:61–71`) rejects `NaN` and non-numeric inputs.
 *    The class uses `isNumber`, which accepts negatives and floats.
 *
 * 7. **`CredentialIDs` must not contain duplicates.**
 *    Source: xrpl.js `validateCredentialsList`
 *    (`packages/xrpl/src/models/transactions/common.ts:1142–1147`) —
 *    "`Credentials` cannot contain duplicate elements." The class
 *    does not model the field.
 */
import type { BasePropsFields } from '../../types/base.js';
import {
  isAccount,
  isArray,
  isHex,
  isNumber,
  isString,
} from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// xrpl.js caps non-DomainSet credential arrays at 8 entries.
// (packages/xrpl/src/models/transactions/common.ts:
//   MAX_AUTHORIZED_CREDENTIALS = 8)
const MAX_CREDENTIAL_IDS = 8;

// Credential IDs are 64-char hex (same as ledger entry IDs / HASH256).
const CREDENTIAL_ID_LENGTH = 64;

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
export interface EscrowFinishProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  /** The unique address of the transaction sender (the finisher). */
  Account: string;
  /** Address of the source account that funded the escrow. */
  Owner: string;
  /**
   * Transaction sequence of the `EscrowCreate` transaction that created
   * the held payment to finish. `UInt32`.
   */
  OfferSequence: number;
  /**
   * Hex PREIMAGE-SHA-256 crypto-condition matching the escrow's
   * `Condition` (as set in the original `EscrowCreate`).
   */
  Condition?: string | undefined;
  /**
   * Hex PREIMAGE-SHA-256 crypto-condition fulfillment matching the
   * escrow's `Condition`. Required when the original escrow had a
   * `Condition`.
   */
  Fulfillment?: string | undefined;
  /**
   * Optional credentials authorizing this finish. Each entry is a
   * 64-char hex ledger entry ID. Length must be in [1, 8].
   */
  CredentialIDs?: string[] | undefined;
  /** Bit-flags for this transaction. EscrowFinish has no defined flags. */
  Flags?: number | undefined;
}

export interface EscrowFinish extends Readonly<EscrowFinishProps> {
  readonly TransactionType: 'EscrowFinish';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<EscrowFinishProps>): EscrowFinish;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Validate a `UInt32` field (any unsigned 32-bit integer). The ledger
 * rejects negative values and non-integers. Used for `OfferSequence`.
 */
function isUInt32(value: unknown): boolean {
  return (
    isNumber(value) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 0xffffffff
  );
}

// ─── Factory ─────────────────────────────────────────────────────────

export function escrowFinish(props: EscrowFinishProps): EscrowFinish {
  // ── Account ── required, must be a valid XRPL classic or X-address.
  require(props.Account, 'EscrowFinish: Account is required', isAccount);

  // ── Owner ── required, must be a valid XRPL classic or X-address.
  //    `Owner` is the source account that funded the escrow; it need
  //    not equal `Account` (anyone can finish an escrow).
  if (!isAccount(props.Owner)) {
    throw new ValidationError(
      'EscrowFinish: Owner must be a valid XRPL account address',
    );
  }

  // ── OfferSequence ── required, UInt32 (non-negative integer).
  if (props.OfferSequence === undefined || props.OfferSequence === null) {
    throw new ValidationError('EscrowFinish: OfferSequence is required');
  }
  if (!isUInt32(props.OfferSequence)) {
    throw new ValidationError(
      'EscrowFinish: OfferSequence must be a non-negative integer (UInt32)',
    );
  }

  // ── Condition ── optional, hex string when present.
  if (props.Condition !== undefined) {
    if (!isString(props.Condition) || !isHex(props.Condition)) {
      throw new ValidationError(
        'EscrowFinish: Condition must be a hex string (PREIMAGE-SHA-256 crypto-condition)',
      );
    }
  }

  // ── Fulfillment ── optional, hex string when present.
  if (props.Fulfillment !== undefined) {
    if (!isString(props.Fulfillment) || !isHex(props.Fulfillment)) {
      throw new ValidationError(
        'EscrowFinish: Fulfillment must be a hex string (PREIMAGE-SHA-256 crypto-condition fulfillment)',
      );
    }
  }

  // ── CredentialIDs ── optional array, but bounds + entry-shape enforced
  //    when present. Per xrpl.js: length in [1, MAX_AUTHORIZED_CREDENTIALS];
  //    each entry is a 64-char hex string; no duplicates.
  if (props.CredentialIDs !== undefined) {
    if (!isArray(props.CredentialIDs)) {
      throw new ValidationError(
        'EscrowFinish: CredentialIDs must be an array of credential ID strings',
      );
    }
    if (props.CredentialIDs.length === 0) {
      throw new ValidationError(
        'EscrowFinish: CredentialIDs must not be an empty array',
      );
    }
    if (props.CredentialIDs.length > MAX_CREDENTIAL_IDS) {
      throw new ValidationError(
        `EscrowFinish: CredentialIDs length cannot exceed ${MAX_CREDENTIAL_IDS} elements (actual: ${props.CredentialIDs.length})`,
      );
    }
    const seen = new Set<string>();
    for (let i = 0; i < props.CredentialIDs.length; i++) {
      const cid = props.CredentialIDs[i];
      if (!isString(cid) || !isHex(cid) || cid.length !== CREDENTIAL_ID_LENGTH) {
        throw new ValidationError(
          `EscrowFinish: CredentialIDs[${i}] must be a ${CREDENTIAL_ID_LENGTH}-character hex string`,
        );
      }
      if (seen.has(cid)) {
        throw new ValidationError(
          `EscrowFinish: CredentialIDs[${i}] is a duplicate of an earlier entry`,
        );
      }
      seen.add(cid);
    }
  }

  // ─── Base transaction fields ───
  // Validates the fields this factory inherits from BaseTransactionFields
  // but does not otherwise check. Placed AFTER the EscrowFinish-specific
  // checks so a more specific mistake gets a more specific message.
  // `TransactionType` is supplied because the validator checks a built
  // transaction, not a props bag — the factory injects it below.
  validateBaseTransaction({ TransactionType: 'EscrowFinish', ...props });

  return buildFrozenTx<EscrowFinishProps, EscrowFinish>(
    'EscrowFinish',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: EscrowFinish) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: EscrowFinish, overrides: Partial<EscrowFinishProps>) {
        return escrowFinish(mergeForWith(this, overrides));
      },
    },
  );
}
