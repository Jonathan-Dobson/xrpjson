/**
 * Functional MPTokenIssuanceCreate factory — frozen-object style.
 *
 * Creates a new Multi-Purpose Token (MPT) issuance on the ledger.
 * Validation happens at construction; there is no way to construct an
 * invalid tx.
 *
 *   import { mptokenIssuanceCreate } from 'xrpjson';
 *   const tx = mptokenIssuanceCreate({ Account, AssetScale: 2, MaximumAmount: '1000000' });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ TransferFee: 100 });
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/mptokenissuancecreate
 */
import type { BasePropsFields } from '../../types/base.js';
import type { MPTokenIssuanceCreateFlagsInterface } from '../../types/flags.js';
import { isAccount, isHex, isNumber, isString } from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// Maximum allowed transfer fee in basis points (0.000% — 50.000%).
const MAX_TRANSFER_FEE = 50_000;
// Maximum amount per the current spec (2^63 - 1, encoded as a base-10 string).
const MAX_ISSUANCE_AMOUNT = '9223372036854775807';
// Maximum encoded metadata length in bytes.
const MAX_METADATA_BYTES = 1024;

// Bitmask of all known `tif*` bits (used to validate `ImmutableFlags`).
// Mirrors the values defined in `MPTokenImmutableFlags` (src/types/flags.ts).
const KNOWN_IMMUTABLE_FLAG_BITS =
  0x00000002 | // tifMPTCanLock
  0x00000004 | // tifMPTRequireAuth
  0x00000008 | // tifMPTCanEscrow
  0x00000010 | // tifMPTCanTrade
  0x00000020 | // tifMPTCanTransfer
  0x00000040 | // tifMPTCanClawback
  0x00000080 | // tifMPTCanHoldConfidentialBalance
  0x00010000 | // tifMPTMetadata
  0x00020000; // tifMPTTransferFee

// Capable-flag bitmask for `tfMPTCanTransfer` (gates non-zero TransferFee).
const TF_MPT_CAN_TRANSFER = 0x00000020;
// Capable-flag bitmask for `tfMPTRequireAuth` (gates DomainID).
const TF_MPT_REQUIRE_AUTH = 0x00000004;

// Closed set of keys accepted by the boolean-map form of `Flags`, with
// their numeric bit values. Mirrors xrpl.js's `convertTxFlagsToNumber`
// (`packages/xrpl/src/models/utils/flags.ts:174–201`), localized here so
// the factory has no cross-transaction dependency. The key set mirrors
// `MPTokenIssuanceCreateFlagsInterface` (src/types/flags.ts:224–233).
//
// A boolean-map `Flags` is a first-class, documented input form: the
// library's own props type declares it, so its bits are real bits and
// must be honoured by the cross-field gates below. Collapsing it to `0`
// made `{ tfMPTCanTransfer: true }` invisible to the TransferFee gate.
const VALID_FLAGS_INTERFACE_KEYS: ReadonlyMap<string, number> = new Map([
  ['tfMPTCanLock', 0x00000002],
  ['tfMPTRequireAuth', TF_MPT_REQUIRE_AUTH],
  ['tfMPTCanEscrow', 0x00000008],
  ['tfMPTCanTrade', 0x00000010],
  ['tfMPTCanTransfer', TF_MPT_CAN_TRANSFER],
  ['tfMPTCanClawback', 0x00000040],
  ['tfMPTCanHoldConfidentialBalance', 0x00000080],
]);

/**
 * Resolve a possibly-boolean-map `Flags` value to its numeric bitmask.
 * Unknown keys are ignored rather than rejected, matching the
 * forward-compatible policy used by `loan-manage.ts` — a future global
 * flag must not break an existing caller.
 */
function flagsToNumber(flags: unknown): number {
  if (typeof flags === 'number') return flags;
  if (typeof flags !== 'object' || flags === null) return 0;
  let n = 0;
  for (const [k, v] of Object.entries(flags as Record<string, unknown>)) {
    const bit = VALID_FLAGS_INTERFACE_KEYS.get(k);
    if (bit !== undefined && v === true) n |= bit;
  }
  return n;
}

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
export interface MptokenIssuanceCreateProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  /** The unique address of the transaction sender (the MPT issuer). */
  Account: string;
  /** Decimal precision for the MPT (0–15). Determines share conversion scale. */
  AssetScale?: number | undefined;
  /**
   * Ledger entry ID of a permissioned domain restricting access. Requires
   * `tfMPTRequireAuth` to be set. Requires both `PermissionedDomains`
   * and `SingleAssetVault` amendments enabled on the ledger.
   */
  DomainID?: string | undefined;
  /**
   * Secondary-sale transfer fee in basis points (0–50,000). Non-zero
   * values require the `tfMPTCanTransfer` flag.
   */
  TransferFee?: number | undefined;
  /**
   * Maximum amount of this MPT that can ever be issued, encoded as a
   * base-10 number string. Current spec allows up to 2^63-1.
   */
  MaximumAmount?: string | undefined;
  /**
   * Arbitrary metadata about this issuance. Hex-encoded; 0 < length <= 1024
   * bytes after decoding.
   */
  MPTokenMetadata?: string | undefined;
  /**
   * Bitmask of flags declaring which fields and capability flags are
   * immutable from issuance onward. Requires the `DynamicMPT` amendment.
   */
  ImmutableFlags?: number | undefined;
  /** Bit-flags for this transaction. */
  Flags?: number | MPTokenIssuanceCreateFlagsInterface | undefined;
}

export interface MptokenIssuanceCreate
  extends Readonly<MptokenIssuanceCreateProps> {
  readonly TransactionType: 'MPTokenIssuanceCreate';
  /** No-op: validation already happened at construction. */
  validate(): void;
  /** Serialize to a plain object matching `xrpl.js` input shape. */
  toJSON(): Record<string, unknown>;
  /** Derive a new MptokenIssuanceCreate with overrides applied; re-validates. */
  with(overrides: Partial<MptokenIssuanceCreateProps>): MptokenIssuanceCreate;
}

// ─── Factory ─────────────────────────────────────────────────────────

/**
 * Build a frozen MPTokenIssuanceCreate. Throws ValidationError on
 * construction if fields are missing or malformed.
 *
 * The class-based version validates lazily (caller must invoke
 * `.validate()`); this functional version validates at construction.
 * There is no way to build an invalid tx — `with()` re-runs the factory,
 * so overrides are re-validated too.
 */
export function mptokenIssuanceCreate(
  props: MptokenIssuanceCreateProps,
): MptokenIssuanceCreate {
  // ─── Account ─── required, must be a valid XRPL address (empty
  // strings and invalid formats fail the regex inside isAccount).
  require(
    props.Account,
    'MPTokenIssuanceCreate: Account is required',
    isAccount,
  );

  // Numeric flags for cross-field gating. A boolean-map `Flags` is
  // resolved to its real bits via `flagsToNumber` — it is a
  // first-class input form declared by `MptokenIssuanceCreateProps`, so
  // treating it as "no bits set" made `{ tfMPTCanTransfer: true }` fail
  // the TransferFee gate below and rejected a transaction rippled
  // accepts. `mptoken-issuance-set.ts` already resolved it correctly.
  const flags = flagsToNumber(props.Flags);

  // ─── TransferFee ───
  if (props.TransferFee !== undefined) {
    if (!isNumber(props.TransferFee)) {
      throw new ValidationError(
        'MPTokenIssuanceCreate: TransferFee must be a number',
      );
    }
    if (props.TransferFee < 0 || props.TransferFee > MAX_TRANSFER_FEE) {
      throw new ValidationError(
        `MPTokenIssuanceCreate: TransferFee must be in [0, ${MAX_TRANSFER_FEE}]`,
      );
    }
    if (props.TransferFee !== 0 && (flags & TF_MPT_CAN_TRANSFER) === 0) {
      throw new ValidationError(
        'MPTokenIssuanceCreate: non-zero TransferFee requires tfMPTCanTransfer flag',
      );
    }
  }

  // ─── MaximumAmount ───
  if (props.MaximumAmount !== undefined) {
    if (!isString(props.MaximumAmount)) {
      throw new ValidationError(
        'MPTokenIssuanceCreate: MaximumAmount must be a string',
      );
    }
    if (props.MaximumAmount === '0') {
      throw new ValidationError(
        'MPTokenIssuanceCreate: MaximumAmount must be > 0',
      );
    }
    // BigInt throws SyntaxError on invalid integer strings; we wrap that
    // in ValidationError but DO NOT swallow our own out-of-range errors.
    let n: bigint;
    try {
      n = BigInt(props.MaximumAmount);
    } catch (e) {
      if (e instanceof SyntaxError) {
        throw new ValidationError(
          'MPTokenIssuanceCreate: MaximumAmount must be a base-10 integer string',
        );
      }
      throw e;
    }
    const max = BigInt(MAX_ISSUANCE_AMOUNT);
    if (n > max) {
      throw new ValidationError(
        `MPTokenIssuanceCreate: MaximumAmount must be <= ${MAX_ISSUANCE_AMOUNT}`,
      );
    }
  }

  // ─── MPTokenMetadata ───
  if (props.MPTokenMetadata !== undefined) {
    if (!isString(props.MPTokenMetadata) || !isHex(props.MPTokenMetadata)) {
      throw new ValidationError(
        'MPTokenIssuanceCreate: MPTokenMetadata must be a hex string',
      );
    }
    const lenBytes = props.MPTokenMetadata.length / 2;
    if (lenBytes === 0 || lenBytes > MAX_METADATA_BYTES) {
      throw new ValidationError(
        `MPTokenIssuanceCreate: MPTokenMetadata length must be in (0, ${MAX_METADATA_BYTES}] bytes`,
      );
    }
  }

  // ─── DomainID ───
  // The class treats empty string and "0" as "not set" and skips the
  // flag check in those cases. Mirror that behavior exactly.
  if (
    props.DomainID !== undefined &&
    props.DomainID !== '' &&
    props.DomainID !== '0'
  ) {
    if ((flags & TF_MPT_REQUIRE_AUTH) === 0) {
      throw new ValidationError(
        'MPTokenIssuanceCreate: DomainID requires tfMPTRequireAuth flag',
      );
    }
  }

  // ─── ImmutableFlags ───
  if (props.ImmutableFlags !== undefined) {
    if (!isNumber(props.ImmutableFlags)) {
      throw new ValidationError(
        'MPTokenIssuanceCreate: ImmutableFlags must be a number',
      );
    }
    if (props.ImmutableFlags === 0) {
      throw new ValidationError(
        'MPTokenIssuanceCreate: ImmutableFlags must be non-zero when present',
      );
    }
    if ((props.ImmutableFlags & ~KNOWN_IMMUTABLE_FLAG_BITS) !== 0) {
      throw new ValidationError(
        'MPTokenIssuanceCreate: ImmutableFlags contains undefined bits',
      );
    }
  }

  // ─── Base transaction fields ───
  // Runtime backstop for the seven shared fields: Memos, SourceTag,
  // LastLedgerSequence, AccountTxnID, NetworkID, Delegate, TicketSequence.
  // `MptokenIssuanceCreateProps` now extends `BasePropsFields`: the seven shared
  // fields are type-checked at compile time, and this call is the
  // runtime backstop. Without it they reached `buildFrozenTx` unchecked. Placed AFTER the MPTokenIssuanceCreate-specific checks so a
  // more specific message wins for a more specific mistake.
  //
  // `TransactionType` is supplied because the validator checks a transaction,
  // not a props bag — the factory injects it in `buildFrozenTx` below.
  validateBaseTransaction({
    TransactionType: 'MPTokenIssuanceCreate',
    ...props,
  });

  // ─── Build frozen shape ───
  return buildFrozenTx<MptokenIssuanceCreateProps, MptokenIssuanceCreate>(
    'MPTokenIssuanceCreate',
    props,
    {
      validate() {
        // Construction-time validation is the contract.
      },
      toJSON(this: MptokenIssuanceCreate) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: MptokenIssuanceCreate,
        overrides: Partial<MptokenIssuanceCreateProps>,
      ) {
        return mptokenIssuanceCreate(mergeForWith(this, overrides));
      },
    },
  );
}