/**
 * Functional VaultSet factory — frozen-object style.
 *
 * Updates `Data`, `AssetsMaximum`, and/or `DomainID` on a vault identified
 * by `VaultID`. Validation happens at construction; there is no way to
 * construct an invalid tx.
 *
 *   import { vaultSet } from 'xrpjson';
 *   const tx = vaultSet({ Account, VaultID, Data: '5661756C74' });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ AssetsMaximum: '1000000' });
 *
 * Affected amendments:
 *   - `SingleAssetVault` (base VaultSet)
 *   - `PermissionedDomains` (DomainID field)
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/vaultset
 * @see https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0065-single-asset-vault
 *
 * ## Divergences
 * The factory enforces two preclaim checks that the class API
 * (the Class API's `VaultSet`) skips:
 *
 *   1. `VaultID` must not be the all-zeros HASH256 value.
 *      Source: XLS-65 §3.3.2.1 check 1 — "The `VaultID` field is zero
 *      (`temMALFORMED`)". The class only requires it to be a 64-char
 *      hex string and accepts the all-zeros value.
 *
 *   2. At least one of `Data`, `AssetsMaximum`, `DomainID` must be supplied.
 *      Source: XLS-65 §3.3.2.1 check 4 — "None of `Data`, `AssetsMaximum`,
 *      or `DomainID` are provided (nothing to update) (`temMALFORMED`).
 *      The class does not check this; passing an empty set of mutable
 *      fields would be accepted locally but rejected by the ledger.
 *
 *   3. `DomainID` is accepted in the all-zeros HASH256 form to represent
 *      "remove the current DomainID from the share MPTokenIssuance".
 *      Source: XLS-65 §3.3.3 state changes 2 and 3 — "If `DomainID` is
 *      provided and non-zero: set `MPTokenIssuance(Vault.ShareMPTID).DomainID
 *      = DomainID`" / "If `DomainID` is provided and is zero: remove
 *      `DomainID` from `MPTokenIssuance(Vault.ShareMPTID)`". The class
 *      rejects the all-zeros form via `isDomainID` (which requires 64-char
 *      hex — already satisfied by zero, but the helper is not invoked
 *      for the all-zeros value because `isDomainID` is a length+hex
 *      format check that passes zero too; the class simply forbids any
 *      update if zero via `isDomainID`'s regex). The factory accepts zero
 *      to support the documented removal semantic.
 */
import type { BasePropsFields } from '../../types/base.js';
import { isDomainID, isHex, isString } from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// Maximum encoded Data length in bytes (hex is 2 chars per byte).
const MAX_DATA_BYTES = 256;
// HASH256 is 32 bytes = 64 hex chars.
const HASH256_LENGTH = 64;
// All-zeros HASH256 is reserved / malformed per spec.
const HASH256_ZERO =
  '0000000000000000000000000000000000000000000000000000000000000000';

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
export interface VaultSetProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  /** The unique address of the transaction sender (the Vault owner). */
  Account: string;
  /** The ID of the vault to modify. 64-char hex. */
  VaultID: string;
  /** Arbitrary vault metadata, hex-encoded, 1–256 bytes (non-empty). */
  Data?: string | undefined;
  /**
   * The maximum asset amount the vault can hold. Cannot be lowered below
   * the current `AssetsTotal` (unless 0); that rule is ledger-enforced
   * (`tecLIMIT_EXCEEDED`).
   */
  AssetsMaximum?: string | undefined;
  /**
   * The PermissionedDomain object ID associated with the vault's shares.
   * 64-char hex. The all-zeros value is valid and means "remove any
   * existing DomainID from the share MPTokenIssuance" (XLS-65 §3.3.3).
   */
  DomainID?: string | undefined;
  /** Bit-flags for this transaction. VaultSet has no defined flags. */
  Flags?: number | undefined;
}

export interface VaultSet extends Readonly<VaultSetProps> {
  readonly TransactionType: 'VaultSet';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<VaultSetProps>): VaultSet;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function vaultSet(props: VaultSetProps): VaultSet {
  // ── Account ── required, must be a non-empty string.
  require(props.Account, 'VaultSet: Account is required', isString);
  if (props.Account.length === 0) {
    throw new ValidationError('VaultSet: Account is required');
  }

  // ── VaultID ── required, 64-char hex AND non-zero.
  if (
    !isString(props.VaultID) ||
    !isHex(props.VaultID) ||
    props.VaultID.length !== HASH256_LENGTH
  ) {
    throw new ValidationError(
      'VaultSet: VaultID must be a 64-character hex string',
    );
  }
  if (props.VaultID === HASH256_ZERO) {
    throw new ValidationError(
      'VaultSet: VaultID must not be the all-zeros HASH256 value',
    );
  }

  // ── At least one mutable field must be supplied ──
  // XLS-65 §3.3.2.1 check 4.
  if (
    props.Data === undefined &&
    props.AssetsMaximum === undefined &&
    props.DomainID === undefined
  ) {
    throw new ValidationError(
      'VaultSet: at least one of Data, AssetsMaximum, or DomainID must be provided',
    );
  }

  // ── Data ── hex, even-length, 1–256 bytes.
  if (props.Data !== undefined) {
    if (!isString(props.Data) || !isHex(props.Data)) {
      throw new ValidationError('VaultSet: Data must be a hex string');
    }
    if (props.Data.length === 0) {
      throw new ValidationError('VaultSet: Data must not be empty');
    }
    if (props.Data.length % 2 !== 0) {
      throw new ValidationError(
        'VaultSet: Data must be a hex string with an even number of characters',
      );
    }
    const bytes = props.Data.length / 2;
    if (bytes > MAX_DATA_BYTES) {
      throw new ValidationError(
        `VaultSet: Data exceeds ${MAX_DATA_BYTES} bytes (actual: ${bytes})`,
      );
    }
  }

  // ── AssetsMaximum ── non-negative base-10 integer string.
  if (props.AssetsMaximum !== undefined) {
    if (
      !isString(props.AssetsMaximum) ||
      !/^[0-9]+$/u.test(props.AssetsMaximum)
    ) {
      throw new ValidationError(
        'VaultSet: AssetsMaximum must be a non-negative base-10 integer string',
      );
    }
  }

  // ── DomainID ── 64-char hex. The all-zeros value is accepted to
  //    represent "remove DomainID from share MPTokenIssuance"
  //    (XLS-65 §3.3.3 state change 3).
  if (props.DomainID !== undefined) {
    if (!isString(props.DomainID)) {
      throw new ValidationError(
        'VaultSet: DomainID must be a 64-character hex string',
      );
    }
    if (props.DomainID !== HASH256_ZERO && !isDomainID(props.DomainID)) {
      throw new ValidationError(
        'VaultSet: DomainID must be a 64-character hex string',
      );
    }
  }

  // ─── Base transaction fields ───
  // Runtime backstop for the seven shared fields: Memos, SourceTag,
  // LastLedgerSequence, AccountTxnID, NetworkID, Delegate, TicketSequence.
  // `VaultSetProps` now extends `BasePropsFields`: the seven shared
  // fields are type-checked at compile time, and this call is the
  // runtime backstop. Without it they reached `buildFrozenTx` unchecked. Placed AFTER the VaultSet-specific checks so a more specific
  // message wins for a more specific mistake.
  //
  // `TransactionType` is supplied because the validator checks a transaction,
  // not a props bag — the factory injects it in `buildFrozenTx` below.
  validateBaseTransaction({ TransactionType: 'VaultSet', ...props });

  return buildFrozenTx<VaultSetProps, VaultSet>(
    'VaultSet',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: VaultSet) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: VaultSet, overrides: Partial<VaultSetProps>) {
        return vaultSet(mergeForWith(this, overrides));
      },
    },
  );
}