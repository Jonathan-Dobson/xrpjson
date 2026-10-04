/**
 * Functional ConfidentialMPTConvert factory — frozen-object style.
 *
 * Converts a holder's public MPT balance to a confidential balance (credited
 * to the holder's inbox; merge via `ConfidentialMPTMergeInbox` to make it
 * spendable). Also serves as the **opt-in mechanism** for confidential
 * transfer participation: a zero-amount conversion registers the holder's
 * `HolderEncryptionKey` on their `MPToken` object.
 *
 * Validation happens at construction; there is no way to construct an
 * invalid tx. Compare to the class-based equivalent, which exposes a
 * separate `.validate()` method you must remember to call.
 *
 *   import { confidentialMptConvert } from 'xrpjson';
 *   const tx = confidentialMptConvert({
 *     Account, MPTokenIssuanceID, MPTAmount: '0',
 *     HolderEncryptionKey, HolderEncryptedAmount, IssuerEncryptedAmount,
 *     BlindingFactor, ZKProof,
 *   });
 *
 * Requires the `ConfidentialTransfer` amendment.
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/confidentialmptconvert
 * @see XLS-0096 §8 — Transaction: `ConfidentialMPTConvert`
 *   (https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0096-confidential-mpt)
 * @see xrpl.js — packages/xrpl/src/models/transactions/ConfidentialMPTConvert.ts
 *
 * ## Divergences
 *
 * Compared with the Class API's `ConfidentialMPTConvert`, this
 * factory adds guards the class skips — and documents the canonical
 * guard that cannot be added in a zero-dependency package.
 *
 * - **`Account` is validated as a well-formed XRPL classic or X-address**
 *   at construction time, with `isAccount` (`src/validation/helpers.ts`
 *   lines 55–60). The class API delegates Account validation to its
 *   `TokenTransaction` → `Transaction` parent chain via
 *   `super.validate()`; failures therefore surface as a separate
 *   `.validate()` step rather than at `new`. We re-implement the
 *   guard inline so a malformed Account is caught at construction.
 *   - Source: xrpl.js `validateBaseTransaction` (called transitively by
 *     `validateConfidentialMPTConvert`).
 *   - Source: xrpl-dev-portal `confidentialmptconvert.md` JSON-Type
 *     column for `Account` (`ACCOUNTID`).
 *
 * - **`MPTAmount` is validated as a non-negative base-10 uint64 string
 *   ≤ 2⁶³−1, with `0` permitted** (XLS-0096 §8.4.1.8 declares
 *   over-max as `temBAD_AMOUNT`; a zero-amount convert is explicitly
 *   used to register the holder key per §8.1). The class accepts the
 *   field as-is with no range or well-formedness check.
 *   - Source: XLS-0096 §8.2 Fields table, Internal Type = `UINT64`.
 *   - Source: XLS-0096 §8.4.1.8 Failure Conditions, `temBAD_AMOUNT`.
 *   - Source: xrpl.js `validateConfidentialMPTAmount(tx, true)`
 *     (`packages/xrpl/src/models/transactions/common.ts` lines 596–608)
 *     which uses `MAX_MPT_AMOUNT = 2^63 − 1` and `INTEGER_SANITY_CHECK`.
 *   - Source: xrpl-dev-portal `confidentialmptconvert.md` Error Cases,
 *     `temBAD_AMOUNT` row.
 *
 * - **`HolderEncryptionKey` length is enforced to exactly 33 bytes
 *   (66 hex chars)** when present (XLS-0096 §8.4.1.5 declares
 *   `temMALFORMED` for any other length). The class only verifies
 *   `isHex` and that the length is non-zero, so a 64-char Schnorr-like
 *   blob or a 32-char short pubkey would pass the class and be rejected
 *   by rippled with `temMALFORMED`.
 *   - Source: XLS-0096 §8.4.1.5 Failure Conditions, `temMALFORMED`.
 *   - Source: xrpl.js `isHexWithByteLength(CONFIDENTIAL_EC_POINT_BYTES)`
 *     where `CONFIDENTIAL_EC_POINT_BYTES = 33`
 *     (`packages/xrpl/src/models/transactions/common.ts` lines 35–43).
 *   - Source: xrpl-dev-portal `confidentialmptconvert.md` Error Cases,
 *     `temMALFORMED` row "The length of `HolderEncryptionKey` is not
 *     exactly 33 bytes."
 *
 * - **`ZKProof` without `HolderEncryptionKey` is rejected** (XLS-0096
 *   §8.4.1.4 — `temMALFORMED`). The class only enforces the forward
 *   direction ("if HolderEncryptionKey is present, ZKProof must be
 *   present"); the reverse case slips through the class and is rejected
 *   by rippled.
 *   - Source: XLS-0096 §8.4.1.4 Failure Conditions, `temMALFORMED`.
 *   - Source: xrpl.js `validateHolderKeyProofPairing`
 *     (`packages/xrpl/src/models/transactions/ConfidentialMPTConvert.ts`
 *     lines 73–79) checks both directions symmetrically with
 *     `(tx.HolderEncryptionKey == null) !== (tx.ZKProof == null)`.
 *
 * - **`Account` must NOT be the issuer of `MPTokenIssuanceID`
 *   (KNOWN LIMITATION — NOT IMPLEMENTED)**. XLS-0096 §8.4.1.2 mandates
 *   this as `temMALFORMED`:
 *
 *     > "The `Account` is the Issuer of the `MPTokenIssuanceID`."
 *
 *   xrpl.js enforces this via `isMPTIssuer(account, mptIssuanceID)`
 *   (`packages/xrpl/src/models/transactions/common.ts` lines 632–646),
 *   which calls `decodeAccountID` (base58 + double-SHA-256 checksum
 *   decoding of the classic address) and compares the resulting
 *   20-byte AccountID against `mptIssuanceID.slice(8)` (the 40-hex-char
 *   issuer portion after the 8-hex-char sequence prefix).
 *
 *   This factory cannot add this guard because the package is
 *   **zero-dependency** — base58 + checksum decoding would require
 *   either inlining a ~50-line codec or pulling in
 *   `ripple-address-codec`, neither of which fits the scope of a
 *   single-tx factory. The class API also skips this guard (it
 *   relies on `super.validate()` which does not perform the
 *   issuer check), so this is not a coverage regression relative
 *   to the class — but it remains a documented gap that consumers
 *   must validate at the integration layer (e.g. via the ledger
 *   submission result).
 *   - Source: XLS-0096 §8.4.1.2 Failure Conditions (Data Verification),
 *     item 2: `temMALFORMED` when `Account` is the Issuer.
 *   - Source: xrpl-dev-portal `confidentialmptconvert.md` Error
 *     Cases table, `temMALFORMED` row.
 *   - Source: xrpl.js `ConfidentialMPTConvert.ts` lines 94–98
 *     (`isMPTIssuer` guard).
 */
import type { BasePropsFields } from '../../types/base.js';
import { isAccount, isHex, isString } from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// `MPTokenIssuanceID` is a `UINT192`, hex-encoded to exactly 48 chars
// (192 / 8 = 24 bytes = 48 hex chars). XLS-0096 §8.2; xrpl-dev-portal
// `confidentialmptconvert.md` Fields table.
const MPT_ISSUANCE_ID_HEX_LEN = 48;

// `HolderEncryptedAmount` / `IssuerEncryptedAmount` / `AuditorEncryptedAmount`
// are 66-byte ElGamal ciphertexts. XLS-0096 §8.2; xrpl.js
// `CONFIDENTIAL_ELGAMAL_CIPHERTEXT_BYTES = 66`.
const ELGAMAL_CIPHERTEXT_HEX_LEN = 132;

// `HolderEncryptionKey` is a 33-byte compressed ElGamal EC point.
// XLS-0096 §8.4.1.5; xrpl.js `CONFIDENTIAL_EC_POINT_BYTES = 33`.
const HOLDER_ENCRYPTION_KEY_HEX_LEN = 66;

// `BlindingFactor` is a `UINT256` (32 bytes = 64 hex chars). XLS-0096 §8.2;
// xrpl.js `CONFIDENTIAL_BLINDING_FACTOR_BYTES = 32`.
const BLINDING_FACTOR_HEX_LEN = 64;

// `ZKProof` is a 64-byte Schnorr Proof of Knowledge. XLS-0096 §8.4.1.6;
// xrpl.js `CONFIDENTIAL_CONVERT_PROOF_BYTES = 64`.
const ZK_PROOF_HEX_LEN = 128;

// `MPTAmount` is `UINT64`; per XLS-0096 §8.4.1.8 over-max returns
// `temBAD_AMOUNT`. Per XLS-0096 §8.1 a zero-amount convert is explicitly
// permitted to register the holder key. xrpl.js `MAX_MPT_AMOUNT` =
// 2^63 − 1 = 9_223_372_036_854_775_807.
const MAX_MPT_AMOUNT = BigInt('9223372036854775807');
const INTEGER_SANITY_CHECK = /^[0-9]+$/u;

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
export interface ConfidentialMptConvertProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  /** The account performing the conversion. Must be a valid XRPL classic/X-address. */
  Account: string;
  /** UInt192 — MPT issuance identifier (48-char hex). */
  MPTokenIssuanceID: string;
  /** UInt64 — plaintext public amount to convert (base-10 integer string, ≤ 2⁶³−1). */
  MPTAmount: string;
  /** 33-byte compressed ElGamal EC point (66 hex chars). Optional; required on first opt-in. */
  HolderEncryptionKey?: string | undefined;
  /** 66-byte ElGamal ciphertext credited to the holder's inbox (132 hex chars). */
  HolderEncryptedAmount: string;
  /** 66-byte ElGamal ciphertext credited to the issuer mirror balance (132 hex chars). */
  IssuerEncryptedAmount: string;
  /** 66-byte ElGamal ciphertext for the auditor (132 hex chars). Required when issuance has AuditorEncryptionKey. */
  AuditorEncryptedAmount?: string | undefined;
  /** UInt256 — 32-byte scalar blinding factor (64 hex chars). */
  BlindingFactor: string;
  /** 64-byte Schnorr proof of knowledge (128 hex chars). Required iff HolderEncryptionKey is present. */
  ZKProof?: string | undefined;
}

export interface ConfidentialMptConvert
  extends Readonly<ConfidentialMptConvertProps> {
  readonly TransactionType: 'ConfidentialMPTConvert';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<ConfidentialMptConvertProps>): ConfidentialMptConvert;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function requireHexOfLength(
  value: unknown,
  fieldName: string,
  hexLength: number,
): void {
  if (!isString(value) || !isHex(value) || value.length !== hexLength) {
    throw new ValidationError(
      `ConfidentialMPTConvert: ${fieldName} must be a ${hexLength}-character hex string`,
    );
  }
}

// ─── Factory ─────────────────────────────────────────────────────────

export function confidentialMptConvert(
  props: ConfidentialMptConvertProps,
): ConfidentialMptConvert {
  // ── Account ── required, must be a valid XRPL classic/X-address.
  require(
    props.Account,
    'ConfidentialMPTConvert: Account is required',
    isAccount,
  );

  // ── MPTokenIssuanceID ── required, exactly 48-char hex (UINT192).
  requireHexOfLength(
    props.MPTokenIssuanceID,
    'MPTokenIssuanceID',
    MPT_ISSUANCE_ID_HEX_LEN,
  );

  // NOTE: `Account` must NOT be the issuer of `MPTokenIssuanceID`
  // (XLS-0096 §8.4.1.2 / xrpl.js `isMPTIssuer` guard). Not enforced
  // here — see `## Divergences` header for why.

  // ── MPTAmount ── required, non-negative uint64 ≤ 2⁶³−1; zero is allowed.
  if (!isString(props.MPTAmount) || !INTEGER_SANITY_CHECK.test(props.MPTAmount)) {
    throw new ValidationError(
      'ConfidentialMPTConvert: MPTAmount must be a non-negative base-10 integer string',
    );
  }
  if (BigInt(props.MPTAmount) > MAX_MPT_AMOUNT) {
    throw new ValidationError(
      `ConfidentialMPTConvert: MPTAmount exceeds maximum ${MAX_MPT_AMOUNT.toString()}`,
    );
  }

  // ── HolderEncryptedAmount ── required, 66-byte ElGamal ciphertext.
  requireHexOfLength(
    props.HolderEncryptedAmount,
    'HolderEncryptedAmount',
    ELGAMAL_CIPHERTEXT_HEX_LEN,
  );

  // ── IssuerEncryptedAmount ── required, 66-byte ElGamal ciphertext.
  requireHexOfLength(
    props.IssuerEncryptedAmount,
    'IssuerEncryptedAmount',
    ELGAMAL_CIPHERTEXT_HEX_LEN,
  );

  // ── BlindingFactor ── required, 32-byte scalar (UINT256).
  requireHexOfLength(
    props.BlindingFactor,
    'BlindingFactor',
    BLINDING_FACTOR_HEX_LEN,
  );

  // ── HolderEncryptionKey / ZKProof pairing ──
  //
  // XLS-0096 §8.4.1.3–§8.4.1.6 mandates: the pair must be set together
  // or not at all, and each must be exactly its declared byte length.
  // Symmetric guard via `xor`-style presence check.
  const hasHolderKey = props.HolderEncryptionKey !== undefined;
  const hasZkProof = props.ZKProof !== undefined;
  if (hasHolderKey !== hasZkProof) {
    throw new ValidationError(
      'ConfidentialMPTConvert: set HolderEncryptionKey and ZKProof together (both required when either is present)',
    );
  }
  if (hasHolderKey) {
    // 33-byte compressed ElGamal EC point.
    requireHexOfLength(
      props.HolderEncryptionKey as string,
      'HolderEncryptionKey',
      HOLDER_ENCRYPTION_KEY_HEX_LEN,
    );
    // 64-byte Schnorr Proof of Knowledge.
    requireHexOfLength(
      props.ZKProof as string,
      'ZKProof',
      ZK_PROOF_HEX_LEN,
    );
  }

  // ── AuditorEncryptedAmount ── optional; 66-byte ElGamal ciphertext.
  if (props.AuditorEncryptedAmount !== undefined) {
    requireHexOfLength(
      props.AuditorEncryptedAmount,
      'AuditorEncryptedAmount',
      ELGAMAL_CIPHERTEXT_HEX_LEN,
    );
  }

  // ─── Base transaction fields ───
  // Catches the seven shared fields this factory now accepts through
  // `BasePropsFields` but does not otherwise check: Memos, SourceTag,
  // LastLedgerSequence, AccountTxnID, NetworkID, Delegate, TicketSequence.
  // Placed AFTER the ConfidentialMPTConvert-specific checks so a more specific
  // message wins for a more specific mistake.
  //
  // `TransactionType` is supplied because the validator checks a transaction,
  // not a props bag — the factory injects it in `buildFrozenTx` below.
  validateBaseTransaction({
    TransactionType: 'ConfidentialMPTConvert',
    ...props,
  });

  return buildFrozenTx<ConfidentialMptConvertProps, ConfidentialMptConvert>(
    'ConfidentialMPTConvert',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: ConfidentialMptConvert) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: ConfidentialMptConvert,
        overrides: Partial<ConfidentialMptConvertProps>,
      ) {
        return confidentialMptConvert(mergeForWith(this, overrides));
      },
    },
  );
}