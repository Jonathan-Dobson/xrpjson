/**
 * Functional MPTokenIssuanceSet factory — frozen-object style.
 *
 * Updates the mutable properties of an existing Multi-Purpose Token
 * (MPT) issuance. Supports per-holder or global lock/unlock, capability
 * flag enabling (`tfMPTSet*`), field updates (TransferFee,
 * MPTokenMetadata, ImmutableFlags, encryption keys), and DomainID
 * binding. Validation happens at construction; there is no way to
 * construct an invalid tx.
 *
 *   import { mptokenIssuanceSet } from 'xrpjson';
 *   const tx = mptokenIssuanceSet({
 *     Account: ISSUER,
 *     MPTokenIssuanceID,
 *     Flags: { tfMPTLock: true },
 *   });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ TransferFee: 50 });
 *
 * Affected amendments:
 *   - `MPTokensV1`        — base transaction.
 *   - `DynamicMPT`        — adds TransferFee / MPTokenMetadata /
 *                            ImmutableFlags / `tfMPTSet*` capability flags.
 *   - `PermissionedDomains + SingleAssetVault` — adds `DomainID`.
 *   - `ConfidentialTransfer` — adds encryption keys +
 *                              `tfMPTSetCanHoldConfidentialBalance`.
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/mptokenissuanceset
 * @see XLS-0033 §3.3 (MPTokenIssuanceSet Transaction)
 *      in `~/.mavis/docs.local/xrpl-standards/repo/XLS-0033-multi-purpose-tokens/README.md`
 *
 * ## Divergences
 *
 * The class-based API at the Class API's `MPTokenIssuanceSet` and
 * xrpl.js's `validateMPTokenIssuanceSet` are missing seven rules that
 * the canonical sources require. The factory fills them:
 *
 *   1. `Account` is validated as a classic/X-address via `isAccount`.
 *      The class delegates Account validation to its `Transaction`
 *      base, which only requires `typeof === 'string'`. A malformed
 *      Account passes class validation and only fails at submit time
 *      with `temINVALID_ACCOUNT`. The factory validates the format at
 *      construction.
 *      Source: xrpl.js `validateBaseTransaction`
 *              (`~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/common.ts:987`)
 *              — only `isString(Account)`.
 *      Source: local `isAccount` at `src/validation/helpers.ts:55–60`.
 *
 *   2. `MPTokenIssuanceID` must be a 48-character hex `UInt192`, and
 *      must not be all-zero. xrpl.js only checks `isString`; the class
 *      only checks `isString`. Wrong-length, non-hex, and all-zero
 *      values all pass.
 *      Source: XLS-0033 §3.3.1 (`MPTokenIssuanceID` Internal Type:
 *              `UINT192`); ripple-binary-codec `definitions.json`
 *              (`~/.mavis/docs.local/xrpl.js/repo/packages/ripple-binary-codec/src/enums/definitions.json`)
 *              line 6093–6125 (`MPTokenIssuanceID` declared required
 *              for `MPTokenIssuanceSet`).
 *
 *   3. `Holder` must differ from `Account`.
 *      xrpl.js `validateMPTokenIssuanceSet` (lines 245–249) throws on
 *      this; the class does not. The spec Error Cases table lists
 *      `temMALFORMED` — "You specified the same account for both
 *      `Account` and `Holder`" — so we treat this as a hard guard.
 *      Source: xrpl-dev-portal `mptokenissuanceset.md`
 *              (`~/.mavis/docs.local/xrpl-dev-portal/repo/docs/references/protocol/transactions/types/mptokenissuanceset.md`)
 *              Error Cases — `temMALFORMED` clause "same account for
 *              both `Account` and `Holder`".
 *
 *   4. `tfMPTLock` and `tfMPTUnlock` cannot coexist with non-zero
 *      `TransferFee` combined with `tfMPTSetCanHoldConfidentialBalance`.
 *      The class only checks Lock/Unlock mutual exclusivity plus a
 *      loose field-update incompatibility; it does NOT enforce the
 *      `temBAD_TRANSFER_FEE` pairing "non-zero TransferFee together
 *      with `tfMPTSetCanHoldConfidentialBalance`".
 *      Source: xrpl-dev-portal `mptokenissuanceset.md` Error Cases —
 *              `temBAD_TRANSFER_FEE` clause "A non-zero `TransferFee`
 *              is set in the same transaction that enables
 *              confidential balances with
 *              `tfMPTSetCanHoldConfidentialBalance`".
 *      Source: xrpl.js `validateMPTokenIssuanceSet` (lines 299–311) —
 *              throws `MPTokenIssuanceSet: TransferFee cannot be
 *              provided together with the
 *              tfMPTSetCanHoldConfidentialBalance flag`.
 *
 *   5. The transaction must actually mutate state.
 *      If no flags are set AND `DomainID` is absent AND no mutation
 *      field is present AND no encryption keys are set, the tx is a
 *      no-op and should be rejected with `temMALFORMED` per the spec.
 *      The class does not enforce this — the empty `MPTokenIssuanceSet`
 *      passes class validation.
 *      Source: xrpl-dev-portal `mptokenissuanceset.md` Error Cases —
 *              `temMALFORMED` clause "The transaction isn't changing
 *              anything; it must either update a flag or modify the
 *              DomainID."
 *      Source: xrpl.js `validateMPTokenIssuanceSet` (lines 261–270) —
 *              throws when `flagsNum === 0 && DomainID == null &&
 *              !isMutate && !isSetConfidentialKeys`.
 *
 *   6. Encryption key field-pairing with `IssuerEncryptionKey`.
 *      The class checks "Auditor requires Issuer" but does NOT enforce
 *      that both encryption keys are 33-byte (66 hex-char) compressed
 *      EC points. xrpl.js uses `isHexWithByteLength(CONFIDENTIAL_EC_POINT_BYTES)`
 *      (lines 195–203). Malformed keys would only fail at submit time.
 *      The factory enforces both the pair rule AND the byte-length
 *      shape.
 *      Source: xrpl.js `validateMPTokenIssuanceSet` (lines 195–208);
 *              xrpl.js `common.ts:35` — `CONFIDENTIAL_EC_POINT_BYTES = 33`;
 *              xrpl-dev-portal `mptokenissuanceset.md` Error Cases —
 *              `temMALFORMED` clause "The `IssuerEncryptionKey` or
 *              `AuditorEncryptionKey` is not a valid 33-byte compressed
 *              public key".
 *
 *   7. The `Flags` boolean-map shape is validated.
 *      The class's `MPTokenIssuanceSetFlagsInterface` documents the
 *      allowed set, but neither the class nor xrpl.js's
 *      `validateMPTokenIssuanceSet` rejects unknown boolean keys (e.g.
 *      `tfNotARealFlag: true`). The factory checks every key on a
 *      boolean-map `Flags` against the closed set of known flags.
 *      Source: xrpl.js `MPTokenIssuanceSetFlagsInterface`
 *              (`~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/MPTokenIssuanceSet.ts`)
 *              lines 100–123.
 */
import type { MPTokenIssuanceSetFlagsInterface } from '../../types/flags.js';
import { isAccount, isHex, isNumber, isRecord, isString } from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// Maximum allowed `TransferFee` in basis points (0.000% — 50.000%).
// xrpl.js `MPTokenIssuanceCreate.ts:22` exports MAX_TRANSFER_FEE = 50000.
const MAX_TRANSFER_FEE = 50_000;

// Maximum MPTokenMetadata length in bytes (after hex decoding).
// xrpl.js `utils/mptokenMetadata.ts:12` exports MAX_MPT_META_BYTE_LENGTH = 1024.
const MAX_METADATA_BYTES = 1024;

// MPTokenIssuanceID is a UINT192 — 24 bytes = 48 hex chars.
const MP_TOKEN_ISSUANCE_ID_LENGTH = 48;

// Encryption keys are 33-byte compressed EC-ElGamal public keys — 66 hex chars.
const CONFIDENTIAL_EC_POINT_BYTES = 33;
const CONFIDENTIAL_EC_POINT_HEX_LENGTH = CONFIDENTIAL_EC_POINT_BYTES * 2;

// Per-tx flag bits (XLS-0033 §3.3.1.1 + DynamicMPT + ConfidentialTransfer).
// Mirrors ripple-binary-codec definitions.json
//   packages/ripple-binary-codec/src/enums/definitions.json:5253–5262
// and xrpl.js MPTokenIssuanceSet.ts:37–76.
const TF_MPT_LOCK = 0x00000001;
const TF_MPT_UNLOCK = 0x00000002;
const TF_MPT_SET_CAN_LOCK = 0x00000004;
const TF_MPT_SET_REQUIRE_AUTH = 0x00000008;
const TF_MPT_SET_CAN_ESCROW = 0x00000010;
const TF_MPT_SET_CAN_TRADE = 0x00000020;
const TF_MPT_SET_CAN_TRANSFER = 0x00000040;
const TF_MPT_SET_CAN_CLAWBACK = 0x00000080;
const TF_MPT_SET_CAN_HOLD_CONFIDENTIAL_BALANCE = 0x00000100;

// Bitmask of all per-tx flags, plus the two global flags inherited
// from the base transaction (GlobalFlagsInterface in ripple-binary-codec
// `definitions.json:5318–5321`). The factory accepts the global bits
// because they are valid on every transaction; the `0x7fffffff` mask
// below only excludes the sign bit (0x80000000), which is
// `tfFullyCanonicalSig` and IS a defined global flag.
const KNOWN_PER_TX_FLAG_BITS =
  TF_MPT_LOCK |
  TF_MPT_UNLOCK |
  TF_MPT_SET_CAN_LOCK |
  TF_MPT_SET_REQUIRE_AUTH |
  TF_MPT_SET_CAN_ESCROW |
  TF_MPT_SET_CAN_TRADE |
  TF_MPT_SET_CAN_TRANSFER |
  TF_MPT_SET_CAN_CLAWBACK |
  TF_MPT_SET_CAN_HOLD_CONFIDENTIAL_BALANCE |
  0x40000000 | // tfInnerBatchTxn (global)
  0x80000000;  // tfFullyCanonicalSig (global)

// Bitmask of the seven `tfMPTSet*` capability-setting flags. Any of
// these triggers a "mutation" per the spec.
const TF_MPT_SET_CAPABILITY_MASK =
  TF_MPT_SET_CAN_LOCK |
  TF_MPT_SET_REQUIRE_AUTH |
  TF_MPT_SET_CAN_ESCROW |
  TF_MPT_SET_CAN_TRADE |
  TF_MPT_SET_CAN_TRANSFER |
  TF_MPT_SET_CAN_CLAWBACK |
  TF_MPT_SET_CAN_HOLD_CONFIDENTIAL_BALANCE;

// Known `tif*` bits (declare fields/capabilities immutable). Mirrors
// `src/types/flags.ts:271–281` and xrpl.js
// MPTokenIssuanceCreate.ts:77–113.
const KNOWN_IMMUTABLE_FLAG_BITS =
  0x00000002 | // tifMPTCanLock
  0x00000004 | // tifMPTRequireAuth
  0x00000008 | // tifMPTCanEscrow
  0x00000010 | // tifMPTCanTrade
  0x00000020 | // tifMPTCanTransfer
  0x00000040 | // tifMPTCanClawback
  0x00000080 | // tifMPTCanHoldConfidentialBalance
  0x00010000 | // tifMPTMetadata
  0x00020000;  // tifMPTTransferFee

// Closed set of valid boolean keys for the `Flags` map, with their
// numeric bit values. Mirrors xrpl.js's `convertTxFlagsToNumber`
// (packages/xrpl/src/models/utils/flags.ts:174–201), but localized for
// MPTokenIssuanceSet so the factory has no cross-tx dependency.
const VALID_FLAGS_INTERFACE_KEYS: ReadonlyMap<string, number> = new Map([
  ['tfMPTLock', TF_MPT_LOCK],
  ['tfMPTUnlock', TF_MPT_UNLOCK],
  ['tfMPTSetCanLock', TF_MPT_SET_CAN_LOCK],
  ['tfMPTSetRequireAuth', TF_MPT_SET_REQUIRE_AUTH],
  ['tfMPTSetCanEscrow', TF_MPT_SET_CAN_ESCROW],
  ['tfMPTSetCanTrade', TF_MPT_SET_CAN_TRADE],
  ['tfMPTSetCanTransfer', TF_MPT_SET_CAN_TRANSFER],
  ['tfMPTSetCanClawback', TF_MPT_SET_CAN_CLAWBACK],
  [
    'tfMPTSetCanHoldConfidentialBalance',
    TF_MPT_SET_CAN_HOLD_CONFIDENTIAL_BALANCE,
  ],
  // Inherited from GlobalFlagsInterface.
  ['tfInnerBatchTxn', 0x40000000],
]);

// ─── Public types ────────────────────────────────────────────────────

export interface MptokenIssuanceSetProps {
  /** The issuer of the MPT issuance (the transaction sender). */
  Account: string;
  /** The ID of the MPTokenIssuance to update. UINT192 (24 bytes / 48 hex chars). */
  MPTokenIssuanceID: string;
  /**
   * Optional holder address. If omitted, the operation applies globally
   * to all holders of the issuance. Cannot be the same as `Account`.
   */
  Holder?: string | undefined;
  /**
   * Optional 64-char hex permissioned domain ID. Empty string / '0'
   * clears the domain. Requires `tfMPTRequireAuth` flag on this tx
   * (a local proxy for the issuance's existing flag state).
   */
  DomainID?: string | undefined;
  /**
   * Issuer's 33-byte compressed EC-ElGamal public key (66 hex chars).
   * Required (when `ConfidentialTransfer` is active) to register the
   * issuer for confidential transfers.
   */
  IssuerEncryptionKey?: string | undefined;
  /**
   * Optional auditor's 33-byte compressed EC-ElGamal public key (66 hex
   * chars). Requires `IssuerEncryptionKey` to be set in the same tx.
   */
  AuditorEncryptionKey?: string | undefined;
  /**
   * New metadata in hex format. Replaces the existing value. Setting an
   * empty string (`''`) clears the field; otherwise 0 < length/2 ≤ 1024.
   */
  MPTokenMetadata?: string | undefined;
  /**
   * New transfer fee in basis points. UInt16 per spec (0..50000).
   * Setting to zero clears the field.
   */
  TransferFee?: number | undefined;
  /**
   * Bitmask declaring which fields / capability flags become immutable.
   * Non-zero when present; uses only known `tif*` bits.
   */
  ImmutableFlags?: number | undefined;
  /**
   * Optional bit-flags. Either a numeric bitmask or a boolean-map
   * shape. When a map is supplied, keys must be a member of the closed
   * set defined by `MPTokenIssuanceSetFlagsInterface`.
   */
  Flags?: number | MPTokenIssuanceSetFlagsInterface | undefined;
  /** Fee in XRP (drops), base-10 integer string. */
  Fee?: string | undefined;
  /** Account sequence number. */
  Sequence?: number | undefined;
}

export interface MptokenIssuanceSet
  extends Readonly<MptokenIssuanceSetProps> {
  readonly TransactionType: 'MPTokenIssuanceSet';
  /** No-op: validation already happened at construction. */
  validate(): void;
  /** Serialize to a plain object matching `xrpl.js` input shape. */
  toJSON(): Record<string, unknown>;
  /** Derive a new MptokenIssuanceSet with overrides applied; re-validates. */
  with(
    overrides: Partial<MptokenIssuanceSetProps>,
  ): MptokenIssuanceSet;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Validate that a boolean-map `Flags` object only contains known keys,
 * and convert the map into a numeric bitmask for downstream
 * cross-field gating. Mirrors xrpl.js's `convertTxFlagsToNumber`
 * (`packages/xrpl/src/models/utils/flags.ts:174–201`) but localized
 * for MPTokenIssuanceSet.
 */
function flagsInterfaceToNumber(
  flags: MPTokenIssuanceSetFlagsInterface,
): number {
  let result = 0;
  for (const k of Object.keys(flags)) {
    const bit = VALID_FLAGS_INTERFACE_KEYS.get(k);
    if (bit === undefined) {
      throw new ValidationError(
        `MPTokenIssuanceSet: Flags contains unknown key "${k}"`,
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the key set is closed; we narrow per key
    const v = (flags as any)[k];
    if (v !== undefined && typeof v !== 'boolean') {
      throw new ValidationError(
        `MPTokenIssuanceSet: Flags.${k} must be a boolean when present`,
      );
    }
    if (v === true) {
      result |= bit;
    }
  }
  return result;
}

/**
 * Whether the tx is a "field-update" mutation: it sets a mutation
 * field (TransferFee / MPTokenMetadata / ImmutableFlags / encryption
 * keys) OR enables a `tfMPTSet*` capability flag.
 */
function isMutation(
  props: Readonly<MptokenIssuanceSetProps>,
  flags: number,
): boolean {
  return (
    props.TransferFee !== undefined ||
    props.MPTokenMetadata !== undefined ||
    props.ImmutableFlags !== undefined ||
    props.IssuerEncryptionKey !== undefined ||
    props.AuditorEncryptionKey !== undefined ||
    (flags & TF_MPT_SET_CAPABILITY_MASK) !== 0
  );
}

/**
 * Whether the tx is registering confidential encryption keys.
 */
function isSetConfidentialKeys(
  props: Readonly<MptokenIssuanceSetProps>,
): boolean {
  return (
    props.IssuerEncryptionKey !== undefined ||
    props.AuditorEncryptionKey !== undefined
  );
}

// ─── Factory ─────────────────────────────────────────────────────────

/**
 * Build a frozen MPTokenIssuanceSet. Throws ValidationError on
 * construction if fields are missing or malformed.
 *
 * The class-based version validates lazily (caller must invoke
 * `.validate()`); this functional version validates at construction.
 * There is no way to build an invalid tx — `with()` re-runs the
 * factory, so overrides are re-validated too.
 */
export function mptokenIssuanceSet(
  props: MptokenIssuanceSetProps,
): MptokenIssuanceSet {
  // ─── Account ─── required, must be a valid XRPL classic/X-address.
  require(
    props.Account,
    'MPTokenIssuanceSet: Account is required',
    isAccount,
  );

  // ─── MPTokenIssuanceID ─── required, 48-char hex (UINT192), non-zero.
  if (
    !isString(props.MPTokenIssuanceID) ||
    !isHex(props.MPTokenIssuanceID) ||
    props.MPTokenIssuanceID.length !== MP_TOKEN_ISSUANCE_ID_LENGTH
  ) {
    throw new ValidationError(
      `MPTokenIssuanceSet: MPTokenIssuanceID must be a ${MP_TOKEN_ISSUANCE_ID_LENGTH}-character hex string (UINT192)`,
    );
  }
  if (/^0+$/u.test(props.MPTokenIssuanceID)) {
    throw new ValidationError(
      'MPTokenIssuanceSet: MPTokenIssuanceID must not be zero',
    );
  }

  // ─── Holder ─── optional, but if present must be a valid XRPL
  // address AND must differ from `Account` (spec `temMALFORMED`).
  if (props.Holder !== undefined) {
    if (!isAccount(props.Holder)) {
      throw new ValidationError('MPTokenIssuanceSet: Holder is not a valid XRPL address');
    }
    if (props.Holder === props.Account) {
      throw new ValidationError(
        'MPTokenIssuanceSet: Holder must not equal Account (temMALFORMED)',
      );
    }
  }

  // ─── Flags ─── optional, numeric or boolean-map. If boolean-map,
  // validate the key set AND convert to numeric bits for cross-field
  // gating.
  let flags = 0;
  if (props.Flags !== undefined) {
    if (isNumber(props.Flags)) {
      flags = props.Flags;
    } else if (isRecord(props.Flags)) {
      flags = flagsInterfaceToNumber(
        props.Flags as MPTokenIssuanceSetFlagsInterface,
      );
    } else {
      throw new ValidationError(
        'MPTokenIssuanceSet: Flags must be a number or a boolean-map',
      );
    }
  }

  // Per-tx flag bit-mask sanity check (only meaningful for numeric Flags).
  // The mask already includes the two global flags, so any bit outside
  // KNOWN_PER_TX_FLAG_BITS is undefined per the spec.
  if (typeof props.Flags === 'number') {
    const unknownPerTxBits =
      props.Flags & ~KNOWN_PER_TX_FLAG_BITS & 0x7fffffff;
    if (unknownPerTxBits !== 0) {
      throw new ValidationError(
        `MPTokenIssuanceSet: Flags contains undefined per-tx bits (0x${unknownPerTxBits.toString(16)})`,
      );
    }
  }

  // ─── DomainID ─── optional 64-char hex; if non-empty and non-"0",
  // requires tfMPTRequireAuth flag (local proxy for issuance state).
  if (props.DomainID !== undefined) {
    if (props.DomainID !== '' && props.DomainID !== '0') {
      // 64-char hex — the same shape as isDomainID / isLedgerEntryId.
      if (
        !isHex(props.DomainID) ||
        props.DomainID.length !== 64
      ) {
        throw new ValidationError(
          'MPTokenIssuanceSet: DomainID must be a 64-character hex string (or "" / "0" to clear)',
        );
      }
      if ((flags & TF_MPT_SET_REQUIRE_AUTH) === 0) {
        throw new ValidationError(
          'MPTokenIssuanceSet: DomainID requires tfMPTSetRequireAuth flag (set tfMPTSetRequireAuth in Flags, or enable Require Auth on the issuance first)',
        );
      }
    }
  }

  // ─── IssuerEncryptionKey / AuditorEncryptionKey ─── optional,
  // 33-byte compressed EC point (66 hex chars).
  if (props.IssuerEncryptionKey !== undefined) {
    if (
      !isHex(props.IssuerEncryptionKey) ||
      props.IssuerEncryptionKey.length !== CONFIDENTIAL_EC_POINT_HEX_LENGTH
    ) {
      throw new ValidationError(
        `MPTokenIssuanceSet: IssuerEncryptionKey must be a ${CONFIDENTIAL_EC_POINT_HEX_LENGTH}-character hex string (compressed EC point)`,
      );
    }
  }
  if (props.AuditorEncryptionKey !== undefined) {
    if (
      !isHex(props.AuditorEncryptionKey) ||
      props.AuditorEncryptionKey.length !== CONFIDENTIAL_EC_POINT_HEX_LENGTH
    ) {
      throw new ValidationError(
        `MPTokenIssuanceSet: AuditorEncryptionKey must be a ${CONFIDENTIAL_EC_POINT_HEX_LENGTH}-character hex string (compressed EC point)`,
      );
    }
    if (props.IssuerEncryptionKey === undefined) {
      throw new ValidationError(
        'MPTokenIssuanceSet: AuditorEncryptionKey requires IssuerEncryptionKey',
      );
    }
  }

  // ─── MPTokenMetadata ─── optional hex. Empty string clears the
  // field per spec; otherwise 0 < length/2 ≤ MAX_METADATA_BYTES.
  if (props.MPTokenMetadata !== undefined) {
    if (!isString(props.MPTokenMetadata)) {
      throw new ValidationError(
        'MPTokenIssuanceSet: MPTokenMetadata must be a hex string',
      );
    }
    if (props.MPTokenMetadata !== '') {
      if (
        !isHex(props.MPTokenMetadata) ||
        props.MPTokenMetadata.length % 2 !== 0
      ) {
        throw new ValidationError(
          'MPTokenIssuanceSet: MPTokenMetadata must be a hex string (even length when non-empty)',
        );
      }
      const lenBytes = props.MPTokenMetadata.length / 2;
      if (lenBytes > MAX_METADATA_BYTES) {
        throw new ValidationError(
          `MPTokenIssuanceSet: MPTokenMetadata length must be ≤ ${MAX_METADATA_BYTES} bytes`,
        );
      }
    }
  }

  // ─── TransferFee ─── optional UInt16, 0..MAX_TRANSFER_FEE.
  if (props.TransferFee !== undefined) {
    if (
      !isNumber(props.TransferFee) ||
      !Number.isInteger(props.TransferFee) ||
      props.TransferFee < 0 ||
      props.TransferFee > MAX_TRANSFER_FEE
    ) {
      throw new ValidationError(
        `MPTokenIssuanceSet: TransferFee must be an integer in [0, ${MAX_TRANSFER_FEE}]`,
      );
    }
    // spec temBAD_TRANSFER_FEE: non-zero TransferFee cannot coexist with
    // tfMPTSetCanHoldConfidentialBalance.
    if (
      props.TransferFee > 0 &&
      (flags & TF_MPT_SET_CAN_HOLD_CONFIDENTIAL_BALANCE) !== 0
    ) {
      throw new ValidationError(
        'MPTokenIssuanceSet: non-zero TransferFee cannot combine with tfMPTSetCanHoldConfidentialBalance (temBAD_TRANSFER_FEE)',
      );
    }
  }

  // ─── ImmutableFlags ─── optional, non-zero, known bits only.
  if (props.ImmutableFlags !== undefined) {
    if (
      !isNumber(props.ImmutableFlags) ||
      !Number.isInteger(props.ImmutableFlags) ||
      props.ImmutableFlags < 0
    ) {
      throw new ValidationError(
        'MPTokenIssuanceSet: ImmutableFlags must be a non-negative integer',
      );
    }
    if (props.ImmutableFlags === 0) {
      throw new ValidationError(
        'MPTokenIssuanceSet: ImmutableFlags must be non-zero when present',
      );
    }
    if ((props.ImmutableFlags & ~KNOWN_IMMUTABLE_FLAG_BITS) !== 0) {
      throw new ValidationError(
        'MPTokenIssuanceSet: ImmutableFlags contains undefined bits',
      );
    }
  }

  // ─── Cross-field rules ───
  // tfMPTLock and tfMPTUnlock are mutually exclusive.
  const hasLock = (flags & TF_MPT_LOCK) !== 0;
  const hasUnlock = (flags & TF_MPT_UNLOCK) !== 0;
  if (hasLock && hasUnlock) {
    throw new ValidationError(
      'MPTokenIssuanceSet: tfMPTLock and tfMPTUnlock are mutually exclusive',
    );
  }

  const mutating = isMutation(props, flags);
  const setConfidentialKeys = isSetConfidentialKeys(props);

  // Lock/Unlock cannot combine with field updates or capability-set flags.
  if ((hasLock || hasUnlock) && mutating) {
    throw new ValidationError(
      'MPTokenIssuanceSet: lock/unlock flags cannot combine with field updates or capability-setting flags',
    );
  }

  // DomainID cannot combine with Holder. Checked first because it is a
  // specific pairing — surfacing the more specific error helps debugging.
  if (
    props.DomainID !== undefined &&
    props.DomainID !== '' &&
    props.DomainID !== '0' &&
    props.Holder !== undefined
  ) {
    throw new ValidationError(
      'MPTokenIssuanceSet: DomainID and Holder cannot both be set',
    );
  }

  // Holder cannot combine with encryption-key registration. Checked
  // BEFORE the generic "Holder + mutation" rule because it is more
  // specific — surfacing the more specific error helps debugging.
  if (props.Holder !== undefined && setConfidentialKeys) {
    throw new ValidationError(
      'MPTokenIssuanceSet: Holder field is not allowed when registering confidential encryption keys',
    );
  }

  // Holder cannot combine with tfMPTSetCanHoldConfidentialBalance
  // (capability-set flag). Checked BEFORE the generic "Holder +
  // mutation" rule for the same specificity reason above.
  if (
    props.Holder !== undefined &&
    (flags & TF_MPT_SET_CAN_HOLD_CONFIDENTIAL_BALANCE) !== 0
  ) {
    throw new ValidationError(
      'MPTokenIssuanceSet: tfMPTSetCanHoldConfidentialBalance cannot combine with Holder',
    );
  }

  // Holder cannot combine with mutations.
  if (props.Holder !== undefined && mutating) {
    throw new ValidationError(
      'MPTokenIssuanceSet: Holder field is not allowed when mutating MPTokenIssuance',
    );
  }

  // ─── Must mutate state ───
  if (
    flags === 0 &&
    (props.DomainID === undefined ||
      props.DomainID === '' ||
      props.DomainID === '0') &&
    !mutating &&
    !setConfidentialKeys
  ) {
    throw new ValidationError(
      'MPTokenIssuanceSet: Transaction does not change the state of the MPTokenIssuance ledger object (temMALFORMED)',
    );
  }

  return buildFrozenTx<MptokenIssuanceSetProps, MptokenIssuanceSet>(
    'MPTokenIssuanceSet',
    props,
    {
      validate() {
        // Construction-time validation is the contract.
      },
      toJSON(this: MptokenIssuanceSet) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: MptokenIssuanceSet,
        overrides: Partial<MptokenIssuanceSetProps>,
      ) {
        return mptokenIssuanceSet(mergeForWith(this, overrides));
      },
    },
  );
}