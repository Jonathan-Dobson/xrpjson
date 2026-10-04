/**
 * Functional ConfidentialMptConvertBack factory — frozen-object style.
 *
 * Converts a holder's confidential (encrypted) MPT spending balance back
 * into a public balance. The plaintext `MPTAmount` is credited to the
 * holder's public balance, while the ciphertext pair is homomorphically
 * subtracted from the holder's spending balance and the issuer's mirror
 * balance. Issuers may also use this transaction from their dedicated
 * second account to return confidential supply to public form.
 *
 * Validation happens at construction; there is no way to construct an
 * invalid tx. Compare to the class-based equivalent, which exposes a
 * separate `.validate()` method you must remember to call.
 *
 *   import { confidentialMptConvertBack } from 'xrpjson';
 *   const tx = confidentialMptConvertBack({
 *     Account,
 *     MPTokenIssuanceID,
 *     MPTAmount,
 *     HolderEncryptedAmount,
 *     IssuerEncryptedAmount,
 *     BlindingFactor,
 *     BalanceCommitment,
 *     ZKProof,
 *   });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Fee: '100' });
 *
 * Requires the `ConfidentialTransfer` amendment.
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/confidentialmptconvertback
 * @see XLS-0096 §11 — Transaction: `ConfidentialMPTConvertBack`
 *   (https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0096-confidential-mpt)
 * @see xrpl.js — packages/xrpl/src/models/transactions/ConfidentialMPTConvertBack.ts
 *
 * ## Divergences
 *
 * Compared with the Class API's `ConfidentialMPTConvertBack`, this
 * factory adds guards the class skips — and is explicit about the
 * canonical guards it cannot enforce in a zero-dependency package.
 *
 * - **`Account` is validated as a well-formed XRPL classic or X-address**
 *   at construction time, with `isAccount` (`src/validation/helpers.ts`
 *   lines 55–60). The class API delegates Account validation to its
 *   `TokenTransaction` → `Transaction` parent chain via `super.validate()`;
 *   failures therefore surface as a separate `.validate()` step rather
 *   than at `new`. We re-implement the guard inline so a malformed Account
 *   is caught at construction.
 *   - Source: xrpl.js `validateBaseTransaction` (called transitively by
 *     `validateConfidentialMPTConvertBack`).
 *   - Source: xrpl-dev-portal `confidentialmptconvertback.md` JSON-Type
 *     column for `Account` (`ACCOUNTID`).
 *
 * - **`MPTokenIssuanceID` is required to be exactly 48 hex characters
 *   at construction time** (XLS-0096 §11.3 declares `MPTokenIssuanceID`
 *   as `UINT192`; xrpl-dev-portal `confidentialmptconvertback.md`
 *   declares the same). The class does the same check via `isHex` +
 *   `length !== 48`, but only inside `.validate()` rather than at `new`.
 *   - Source: XLS-0096 §11.3 Fields table, Internal Type = `UINT192`.
 *   - Source: xrpl-dev-portal `confidentialmptconvertback.md` Fields
 *     table row for `MPTokenIssuanceID`.
 *
 * - **`MPTAmount` is bounded to the canonical UInt64 range and rejected
 *   for non-numeric / non-integer / out-of-range form.** The class only
 *   checks `MPTAmount === '0'`, allowing `'9223372036854775808'` (one
 *   past max uint64) to pass through and rely on the ledger to reject
 *   it. xrpl.js's `validateConfidentialMPTAmount` (called via
 *   `validateConfidentialMPTConvertBack` with `allowZero = false`)
 *   enforces both `INTEGER_SANITY_CHECK` (`/^[0-9]+$/u`) and
 *   `MPTAmount <= MAX_MPT_AMOUNT (= 9223372036854775807)`.
 *   - Source: xrpl.js `validateConfidentialMPTAmount`
 *     (`packages/xrpl/src/models/transactions/common.ts` lines 596–608).
 *   - Source: xrpl.js `MAX_MPT_AMOUNT` (same file, line 48).
 *   - Source: xrpl.js `ConfidentialMPTConvertBack.ts` line 83:
 *     `validateConfidentialMPTAmount(tx, false)` (allowZero=false).
 *   - Source: XLS-0096 §11.5.1 item 4: `MPTAmount` is zero or exceeds
 *     the maximum allowable supply → `temBAD_AMOUNT`.
 *
 * - **`Account` must NOT be the issuer of `MPTokenIssuanceID` (KNOWN
 *   LIMITATION — NOT IMPLEMENTED)**. XLS-0096 §11.5.1.2 mandates this
 *   as `temMALFORMED`:
 *
 *     > "The account submitting the transaction is the Issuer.
 *     > (`temMALFORMED`)"
 *
 *   xrpl.js's `validateConfidentialMPTConvertBack` (lines 78–82)
 *   enforces this via its `isMPTIssuer(account, mptIssuanceID)` helper,
 *   which calls `decodeAccountID` (base58 + double-SHA-256 checksum
 *   decoding of the classic address) and compares the resulting 20-byte
 *   AccountID against `mptIssuanceID.slice(8)` (the 40-hex-char issuer
 *   portion after the 8-hex-char sequence prefix).
 *
 *   This factory cannot add this guard because the package is
 *   **zero-dependency** — base58 + checksum decoding would require
 *   either inlining a ~50-line codec or pulling in
 *   `ripple-address-codec`, neither of which fits the scope of a
 *   single-tx factory. The class API also skips this guard (it relies
 *   on `super.validate()` which does not perform the issuer check), so
 *   this is not a coverage regression relative to the class — but it
 *   remains a documented gap that consumers must validate at the
 *   integration layer (e.g. via the ledger submission result).
 *   - Source: XLS-0096 §11.5.1.2 Failure Conditions (Data Verification),
 *     item 2: `temMALFORMED` when `Account` is the Issuer.
 *   - Source: xrpl-dev-portal `confidentialmptconvertback.md` Error
 *     Cases table, `temMALFORMED` row.
 *   - Source: xrpl.js `ConfidentialMPTConvertBack.ts` lines 78–82
 *     (`isMPTIssuer` guard) and `common.ts` lines 632–646
 *     (`isMPTIssuer` implementation, including the base58 + AccountID
 *     decoding dependency).
 */
import type { BasePropsFields } from '../../types/base.js';
import { isAccount, isHex, isString } from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// `MPTokenIssuanceID` is a `UINT192`, hex-encoded to exactly 48 chars
// (192 / 8 = 24 bytes = 48 hex chars). XLS-0096 §11.3; xrpl-dev-portal
// `confidentialmptconvertback.md` Fields table.
const MPT_ISSUANCE_ID_HEX_LENGTH = 48;

// ElGamal ciphertext = 2 compressed points = 66 bytes = 132 hex chars.
// XLS-0096 §11.3; xrpl.js `CONFIDENTIAL_ELGAMAL_CIPHERTEXT_BYTES = 66`.
const ELGAMAL_CIPHERTEXT_HEX_LENGTH = 132;

// `BlindingFactor` is `UINT256` = 32 bytes = 64 hex chars.
// XLS-0096 §11.3; xrpl.js `CONFIDENTIAL_BLINDING_FACTOR_BYTES = 32`.
const BLINDING_FACTOR_HEX_LENGTH = 64;

// Pedersen commitment = 1 compressed point = 33 bytes = 66 hex chars.
// XLS-0096 §11.3; xrpl.js `CONFIDENTIAL_EC_POINT_BYTES = 33`.
const BALANCE_COMMITMENT_HEX_LENGTH = 66;

// `ZKProof` for ConvertBack is 816 bytes = 1632 hex chars
// (128 bytes compact sigma + 688 bytes single Bulletproof range proof).
// XLS-0096 §11.3 + §11 "Proof Structure"; xrpl.js
// `CONFIDENTIAL_CONVERT_BACK_PROOF_BYTES = 816`.
const ZK_PROOF_HEX_LENGTH = 1632;

// `MPTAmount` is a `UINT64` per XLS-0096 §11.3. The maximum is 2^63 − 1
// (signed integer range), matching xrpl.js's `MAX_MPT_AMOUNT`. Integer
// form is required (no decimals, no leading sign) per xrpl.js
// `INTEGER_SANITY_CHECK = /^[0-9]+$/u`. Zero is forbidden for
// ConvertBack (only Convert allows zero).
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
export interface ConfidentialMptConvertBackProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  /** The account performing the conversion. Must be a valid XRPL classic/X-address. */
  Account: string;
  /** UInt192 — MPT issuance identifier (48-char hex). */
  MPTokenIssuanceID: string;
  /** UInt64 — plaintext amount to credit to the public balance (base-10 integer string, in [1, 2⁶³−1]). */
  MPTAmount: string;
  /** 66-byte ElGamal ciphertext to subtract from the holder's spending balance (132 hex chars). */
  HolderEncryptedAmount: string;
  /** 66-byte ElGamal ciphertext to subtract from the issuer's mirror balance (132 hex chars). */
  IssuerEncryptedAmount: string;
  /** UInt256 — 32-byte scalar blinding factor (64 hex chars). */
  BlindingFactor: string;
  /** 33-byte Pedersen commitment to the holder's spending balance (66 hex chars). */
  BalanceCommitment: string;
  /** 816-byte proof bundle (compact sigma + single Bulletproof range proof, 1632 hex chars). */
  ZKProof: string;
  /** 66-byte ElGamal ciphertext for the auditor (132 hex chars). Required iff issuance has AuditorEncryptionKey. */
  AuditorEncryptedAmount?: string | undefined;
}

export interface ConfidentialMptConvertBack
  extends Readonly<ConfidentialMptConvertBackProps> {
  readonly TransactionType: 'ConfidentialMPTConvertBack';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(
    overrides: Partial<ConfidentialMptConvertBackProps>,
  ): ConfidentialMptConvertBack;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function requireHexOfLength(
  value: unknown,
  fieldName: string,
  hexLength: number,
): void {
  if (!isString(value) || !isHex(value) || value.length !== hexLength) {
    throw new ValidationError(
      `ConfidentialMPTConvertBack: ${fieldName} must be a ${hexLength}-character hex string (${hexLength / 2} bytes)`,
    );
  }
}

// ─── Factory ─────────────────────────────────────────────────────────

export function confidentialMptConvertBack(
  props: ConfidentialMptConvertBackProps,
): ConfidentialMptConvertBack {
  // ── Account ── required, must be a valid XRPL classic/X-address.
  require(
    props.Account,
    'ConfidentialMPTConvertBack: Account is required',
    isAccount,
  );

  // ── MPTokenIssuanceID ── required, exactly 48-char hex (UINT192).
  requireHexOfLength(
    props.MPTokenIssuanceID,
    'MPTokenIssuanceID',
    MPT_ISSUANCE_ID_HEX_LENGTH,
  );

  // ── MPTAmount ── required, non-empty integer string, in [1, 2^63-1].
  if (!isString(props.MPTAmount)) {
    throw new ValidationError(
      'ConfidentialMPTConvertBack: MPTAmount is required',
    );
  }
  if (!INTEGER_SANITY_CHECK.test(props.MPTAmount)) {
    throw new ValidationError(
      'ConfidentialMPTConvertBack: MPTAmount must be a non-negative base-10 integer string',
    );
  }
  const amount = BigInt(props.MPTAmount);
  if (amount === BigInt(0)) {
    throw new ValidationError(
      'ConfidentialMPTConvertBack: MPTAmount must be non-zero',
    );
  }
  if (amount > MAX_MPT_AMOUNT) {
    throw new ValidationError(
      `ConfidentialMPTConvertBack: MPTAmount out of range (max ${MAX_MPT_AMOUNT.toString()})`,
    );
  }

  // ── HolderEncryptedAmount ── required, 132-char hex (66-byte ElGamal ciphertext).
  requireHexOfLength(
    props.HolderEncryptedAmount,
    'HolderEncryptedAmount',
    ELGAMAL_CIPHERTEXT_HEX_LENGTH,
  );

  // ── IssuerEncryptedAmount ── required, 132-char hex (66-byte ElGamal ciphertext).
  requireHexOfLength(
    props.IssuerEncryptedAmount,
    'IssuerEncryptedAmount',
    ELGAMAL_CIPHERTEXT_HEX_LENGTH,
  );

  // ── BlindingFactor ── required, 64-char hex (32-byte scalar).
  requireHexOfLength(
    props.BlindingFactor,
    'BlindingFactor',
    BLINDING_FACTOR_HEX_LENGTH,
  );

  // ── BalanceCommitment ── required, 66-char hex (33-byte Pedersen commitment).
  requireHexOfLength(
    props.BalanceCommitment,
    'BalanceCommitment',
    BALANCE_COMMITMENT_HEX_LENGTH,
  );

  // ── ZKProof ── required, 1632-char hex (816-byte ConvertBack proof bundle).
  requireHexOfLength(props.ZKProof, 'ZKProof', ZK_PROOF_HEX_LENGTH);

  // ── AuditorEncryptedAmount ── optional, 132-char hex (66-byte ElGamal ciphertext).
  if (props.AuditorEncryptedAmount !== undefined) {
    requireHexOfLength(
      props.AuditorEncryptedAmount,
      'AuditorEncryptedAmount',
      ELGAMAL_CIPHERTEXT_HEX_LENGTH,
    );
  }

  // NOTE: `Account` must NOT be the issuer of `MPTokenIssuanceID`
  // (XLS-0096 §11.5.1.2 / xrpl.js `isMPTIssuer` guard). Not enforced
  // here — see `## Divergences` header for why.

  // ─── Base transaction fields ───
  // Catches the seven shared fields this factory now accepts through
  // `BasePropsFields` but does not otherwise check: Memos, SourceTag,
  // LastLedgerSequence, AccountTxnID, NetworkID, Delegate, TicketSequence.
  // Placed AFTER the ConfidentialMPTConvertBack-specific checks so a more
  // specific message wins for a more specific mistake, and this acts as the
  // backstop for everything shared across transaction types.
  //
  // `TransactionType` is supplied because the validator checks a transaction,
  // not a props bag — the factory injects it in `buildFrozenTx` below.
  validateBaseTransaction({
    TransactionType: 'ConfidentialMPTConvertBack',
    ...props,
  });

  return buildFrozenTx<
    ConfidentialMptConvertBackProps,
    ConfidentialMptConvertBack
  >(
    'ConfidentialMPTConvertBack',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: ConfidentialMptConvertBack) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: ConfidentialMptConvertBack,
        overrides: Partial<ConfidentialMptConvertBackProps>,
      ) {
        return confidentialMptConvertBack(mergeForWith(this, overrides));
      },
    },
  );
}
