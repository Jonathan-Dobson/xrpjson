/**
 * Functional ConfidentialMptSend factory — frozen-object style.
 *
 * Sends MPT tokens to another account while keeping the transfer amount
 * hidden on-ledger. The transferred amount is credited to the receiver's
 * confidential inbox balance (`CB_IN`) — the receiver may later merge
 * these funds into their spending balance via `ConfidentialMPTMergeInbox`.
 *
 * Validation happens at construction; there is no way to construct an
 * invalid tx. Compare to the class-based equivalent, which exposes a
 * separate `.validate()` method you must remember to call.
 *
 *   import { confidentialMptSend } from 'xrpjson';
 *   const tx = confidentialMptSend({
 *     Account,
 *     MPTokenIssuanceID,
 *     Destination,
 *     SenderEncryptedAmount,
 *     DestinationEncryptedAmount,
 *     IssuerEncryptedAmount,
 *     ZKProof,
 *     AmountCommitment,
 *     BalanceCommitment,
 *   });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Fee: '100' });
 *
 * Requires the `ConfidentialTransfer` amendment.
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/confidentialmptsend
 * @see XLS-0096 §9 — Transaction: `ConfidentialMPTSend`
 *   (https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0096-confidential-mpt)
 * @see xrpl.js — packages/xrpl/src/models/transactions/ConfidentialMPTSend.ts
 *
 * ## Divergences
 *
 * Compared with the Class API's `ConfidentialMPTSend`, this factory
 * adds guards the class skips — and explicitly documents the two
 * canonical guards that cannot be added in a zero-dependency package.
 *
 * - **`Account` is validated as a well-formed XRPL classic or X-address
 *   at construction time** (`src/validation/helpers.ts` `isAccount`,
 *   lines 55–60). The class delegates `Account` validation to its
 *   `TokenTransaction` → `Transaction` parent chain via `super.validate()`
 *   and never inspects `Account` directly. We re-implement the guard
 *   inline so a malformed Account is caught at construction.
 *   - Source: xrpl.js `validateBaseTransaction`
 *     (packages/xrpl/src/models/transactions/common.ts line 964).
 *   - Source: xrpl-dev-portal `confidentialmptsend.md` Fields table
 *     row for `Account`, JSON Type = `AccountID`.
 *
 * - **`Account` must NOT equal `Destination`** (XLS-0096 §9.4.1.4 mandates
 *   this as `temMALFORMED`; xrpl.js `validateConfidentialMPTSend` lines
 *   97–101 checks it explicitly). The class API does NOT check this —
 *   it relies on `super.validate()` which never compares the two fields.
 *   - Source: XLS-0096 §9.4.1.4 Failure Conditions, item 4: the sender
 *     and destination accounts are the same (`temMALFORMED`).
 *   - Source: xrpl.js `ConfidentialMPTSend.ts` lines 97–101.
 *
 * - **`DestinationTag` is accepted and validated as a `UINT32`** when
 *   supplied. The class omits this field entirely
 *   (`ConfidentialMPTSendTxFields` declares no `DestinationTag`).
 *   - Source: XLS-0096 §9.2 Fields table, Internal Type = `UINT32`.
 *   - Source: xrpl.js `ConfidentialMPTSend.ts` lines 40, 114
 *     (`DestinationTag?: number`, `validateOptionalField(tx,
 *     'DestinationTag', isNumber)`).
 *
 * - **`CredentialIDs` is structurally validated when supplied**: must be
 *   an array (not a single string), length must be in `[1, 8]`, each
 *   element must be a 64-character hex string (HASH256 / Vector256),
 *   and the array must contain no duplicates. The class declares the
 *   field but never inspects it. Per XLS-0096 §9.4.1 the empty-array
 *   case is `temMALFORMED`; per XLS-0096 §9.4.2.1 authorization checks
 *   on the credentials are runtime checks and not enforced here.
 *   - Source: XLS-0096 §9.4.1 Failure Conditions (temMALFORMED when
 *     CredentialIDs is empty, exceeds the maximum size, or contains
 *     duplicates).
 *   - Source: xrpl.js `validateCredentialsList` (common.ts line 1106)
 *     and `MAX_AUTHORIZED_CREDENTIALS = 8` (common.ts line 28).
 *   - Source: xrpl-dev-portal `confidentialmptsend.md` Fields table
 *     row for `CredentialIDs`, Internal Type = `Vector256`.
 *
 * - **`AuditorEncryptedAmount` is validated as exactly 132 hex chars**
 *   when supplied. The class already performs this check; we mirror it
 *   here for consistency with the other ciphertext fields.
 *
 * - **`Account` must NOT be the issuer of `MPTokenIssuanceID`
 *   (KNOWN LIMITATION — NOT IMPLEMENTED)**. XLS-0096 §9.4.1.2 mandates
 *   this as `temMALFORMED`:
 *
 *     > "The sender is the issuer of the MPT. (`temMALFORMED`)"
 *
 *   xrpl.js's `validateConfidentialMPTSend` (lines 104–108) enforces
 *   this via its `isMPTIssuer(account, mptIssuanceID)` helper (common.ts
 *   line 632), which calls `decodeAccountID` (base58 + double-SHA-256
 *   checksum decoding of the classic address) and compares the
 *   resulting 20-byte AccountID against `mptIssuanceID.slice(8)` (the
 *   40-hex-char issuer portion after the 8-hex-char sequence prefix).
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
 *   - Source: XLS-0096 §9.4.1.2 Failure Conditions (Data Verification),
 *     item 2: `temMALFORMED` when the sender is the issuer.
 *   - Source: xrpl-dev-portal `confidentialmptsend.md` Error Cases
 *     table, `temMALFORMED` row.
 *   - Source: xrpl.js `ConfidentialMPTSend.ts` lines 104–108
 *     (`isMPTIssuer` guard) and `common.ts` lines 632–646
 *     (`isMPTIssuer` implementation, including the base58 + AccountID
 *     decoding dependency).
 *
 * - **`Destination` must NOT be the issuer of `MPTokenIssuanceID`
 *   (KNOWN LIMITATION — NOT IMPLEMENTED)**. Same root cause and
 *   mitigation as the sender-issuer guard above.
 *   - Source: XLS-0096 §9.4.1.3 Failure Conditions (Data Verification),
 *     item 3: `temMALFORMED` when the destination is the issuer.
 *   - Source: xrpl.js `ConfidentialMPTSend.ts` lines 109–113
 *     (`isMPTIssuer` guard).
 */
import {
  isAccount,
  isArray,
  isHex,
  isNumber,
  isString,
} from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// `MPTokenIssuanceID` is a `UINT192`, hex-encoded to exactly 48 chars
// (192 / 8 = 24 bytes = 48 hex chars). XLS-0096 §9.2; xrpl-dev-portal
// `confidentialmptsend.md` Fields table.
const MPT_ISSUANCE_ID_HEX_LENGTH = 48;

// Pedersen commitments are 33-byte compressed EC points (BLOB).
// XLS-0096 §9.2 (AmountCommitment / BalanceCommitment), Internal Type = BLOB;
// xrpl.js `CONFIDENTIAL_EC_POINT_BYTES = 33`.
const CONFIDENTIAL_EC_POINT_HEX_LENGTH = 66;

// ElGamal ciphertexts are 66 bytes (two compressed EC points).
// XLS-0096 §9.2; xrpl.js `CONFIDENTIAL_ELGAMAL_CIPHERTEXT_BYTES = 66`.
const CONFIDENTIAL_CIPHERTEXT_HEX_LENGTH = 132;

// ConfidentialMPTSend ZKProof is a 946-byte bundle (192-byte compact
// sigma + 754-byte aggregated Bulletproof). XLS-0096 §9.2 / §9.4.1.5
// mandates the length exactly; xrpl.js `CONFIDENTIAL_SEND_PROOF_BYTES = 946`.
const CONFIDENTIAL_SEND_PROOF_HEX_LENGTH = 2 * 946;

// Vector256 = 64 hex chars per credential ID. XLS-70 / XLS-0096 §9.2.
const CREDENTIAL_ID_HEX_LENGTH = 64;

// Maximum number of credential IDs per transaction (XLS-70). XLS-0096
// §9.4.1 requires CredentialIDs not to exceed the maximum size;
// xrpl.js `MAX_AUTHORIZED_CREDENTIALS = 8`.
const MAX_AUTHORIZED_CREDENTIALS = 8;

// DestinationTag is a UINT32 (0 .. 2^32 − 1).
const MAX_UINT32 = 0xffffffff;

// ─── Public types ────────────────────────────────────────────────────

export interface ConfidentialMptSendProps {
  /** The account performing the send. Must be a valid XRPL classic/X-address. */
  Account: string;
  /** UInt192 — MPT issuance identifier (48-char hex). */
  MPTokenIssuanceID: string;
  /** AccountID — receiver of the confidential transfer. Must differ from Account. */
  Destination: string;
  /** UINT32 — destination tag (optional, used for hosted recipients). */
  DestinationTag?: number | undefined;
  /** Blob — 66-byte ElGamal ciphertext used to debit sender's spending balance. */
  SenderEncryptedAmount: string;
  /** Blob — 66-byte ciphertext credited to the receiver's inbox balance. */
  DestinationEncryptedAmount: string;
  /** Blob — 66-byte ciphertext used to update the issuer mirror balance. */
  IssuerEncryptedAmount: string;
  /** Blob — optional 66-byte ciphertext for the auditor. */
  AuditorEncryptedAmount?: string | undefined;
  /** Blob — 946-byte proof bundle (compact sigma + aggregated Bulletproof). */
  ZKProof: string;
  /** Blob — 33-byte Pedersen commitment to the transfer amount. */
  AmountCommitment: string;
  /** Blob — 33-byte Pedersen commitment to sender's spending balance. */
  BalanceCommitment: string;
  /** Vector256 — 1..8 credential IDs (conditional, non-empty when supplied). */
  CredentialIDs?: string[] | undefined;
  /** Fee in XRP (drops), base-10 integer string. */
  Fee?: string | undefined;
  /** Account sequence number. */
  Sequence?: number | undefined;
}

export interface ConfidentialMptSend
  extends Readonly<ConfidentialMptSendProps> {
  readonly TransactionType: 'ConfidentialMPTSend';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<ConfidentialMptSendProps>): ConfidentialMptSend;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Validate a hex blob of a specific byte length (length = 2 × bytes).
 */
function requireHexOfByteLength(
  field: string,
  value: unknown,
  bytes: number,
  errorPrefix: string,
): void {
  const hexLen = bytes * 2;
  if (
    !isString(value) ||
    !isHex(value) ||
    value.length !== hexLen
  ) {
    throw new ValidationError(
      `${errorPrefix}: ${field} must be a ${hexLen}-character hex string (${bytes} bytes)`,
    );
  }
}

// ─── Factory ─────────────────────────────────────────────────────────

export function confidentialMptSend(
  props: ConfidentialMptSendProps,
): ConfidentialMptSend {
  // ── Account ── required, must be a valid XRPL classic/X-address.
  require(
    props.Account,
    'ConfidentialMPTSend: Account is required',
    isAccount,
  );

  // ── MPTokenIssuanceID ── required, exactly 48-char hex (UINT192).
  requireHexOfByteLength(
    'MPTokenIssuanceID',
    props.MPTokenIssuanceID,
    MPT_ISSUANCE_ID_HEX_LENGTH / 2,
    'ConfidentialMPTSend',
  );

  // ── Destination ── required, must be a valid XRPL classic/X-address.
  require(
    props.Destination,
    'ConfidentialMPTSend: Destination is required',
    isAccount,
  );

  // ── Account != Destination ── (XLS-0096 §9.4.1.4 / xrpl.js).
  if (props.Account === props.Destination) {
    throw new ValidationError(
      'ConfidentialMPTSend: Destination and Account must be different',
    );
  }

  // ── DestinationTag ── optional, UINT32.
  if (props.DestinationTag !== undefined) {
    if (
      !isNumber(props.DestinationTag) ||
      !Number.isInteger(props.DestinationTag) ||
      props.DestinationTag < 0 ||
      props.DestinationTag > MAX_UINT32
    ) {
      throw new ValidationError(
        `ConfidentialMPTSend: DestinationTag must be an integer in [0, ${MAX_UINT32}]`,
      );
    }
  }

  // ── SenderEncryptedAmount ── required, 66-byte ciphertext.
  requireHexOfByteLength(
    'SenderEncryptedAmount',
    props.SenderEncryptedAmount,
    CONFIDENTIAL_CIPHERTEXT_HEX_LENGTH / 2,
    'ConfidentialMPTSend',
  );

  // ── DestinationEncryptedAmount ── required, 66-byte ciphertext.
  requireHexOfByteLength(
    'DestinationEncryptedAmount',
    props.DestinationEncryptedAmount,
    CONFIDENTIAL_CIPHERTEXT_HEX_LENGTH / 2,
    'ConfidentialMPTSend',
  );

  // ── IssuerEncryptedAmount ── required, 66-byte ciphertext.
  requireHexOfByteLength(
    'IssuerEncryptedAmount',
    props.IssuerEncryptedAmount,
    CONFIDENTIAL_CIPHERTEXT_HEX_LENGTH / 2,
    'ConfidentialMPTSend',
  );

  // ── AuditorEncryptedAmount ── optional, 66-byte ciphertext.
  if (props.AuditorEncryptedAmount !== undefined) {
    requireHexOfByteLength(
      'AuditorEncryptedAmount',
      props.AuditorEncryptedAmount,
      CONFIDENTIAL_CIPHERTEXT_HEX_LENGTH / 2,
      'ConfidentialMPTSend',
    );
  }

  // ── ZKProof ── required, 946-byte proof bundle.
  requireHexOfByteLength(
    'ZKProof',
    props.ZKProof,
    CONFIDENTIAL_SEND_PROOF_HEX_LENGTH / 2,
    'ConfidentialMPTSend',
  );

  // ── AmountCommitment ── required, 33-byte compressed EC point.
  requireHexOfByteLength(
    'AmountCommitment',
    props.AmountCommitment,
    CONFIDENTIAL_EC_POINT_HEX_LENGTH / 2,
    'ConfidentialMPTSend',
  );

  // ── BalanceCommitment ── required, 33-byte compressed EC point.
  requireHexOfByteLength(
    'BalanceCommitment',
    props.BalanceCommitment,
    CONFIDENTIAL_EC_POINT_HEX_LENGTH / 2,
    'ConfidentialMPTSend',
  );

  // ── CredentialIDs ── optional, but when present must be a non-empty
  //    array of unique 64-char hex strings of length 1..8.
  if (props.CredentialIDs !== undefined) {
    if (!isArray<string>(props.CredentialIDs)) {
      throw new ValidationError(
        'ConfidentialMPTSend: CredentialIDs must be an array',
      );
    }
    if (props.CredentialIDs.length === 0) {
      throw new ValidationError(
        'ConfidentialMPTSend: CredentialIDs cannot be an empty array',
      );
    }
    if (props.CredentialIDs.length > MAX_AUTHORIZED_CREDENTIALS) {
      throw new ValidationError(
        `ConfidentialMPTSend: CredentialIDs cannot exceed ${MAX_AUTHORIZED_CREDENTIALS} elements`,
      );
    }
    const seen = new Set<string>();
    for (const cid of props.CredentialIDs) {
      if (
        !isString(cid) ||
        !isHex(cid) ||
        cid.length !== CREDENTIAL_ID_HEX_LENGTH
      ) {
        throw new ValidationError(
          `ConfidentialMPTSend: each CredentialID must be a ${CREDENTIAL_ID_HEX_LENGTH}-character hex string (Vector256)`,
        );
      }
      if (seen.has(cid)) {
        throw new ValidationError(
          'ConfidentialMPTSend: CredentialIDs cannot contain duplicates',
        );
      }
      seen.add(cid);
    }
  }

  // NOTE: Account must NOT be the issuer of MPTokenIssuanceID
  // (XLS-0096 §9.4.1.2 / xrpl.js `isMPTIssuer` guard). Not enforced
  // here — see `## Divergences` header for why.

  // NOTE: Destination must NOT be the issuer of MPTokenIssuanceID
  // (XLS-0096 §9.4.1.3 / xrpl.js `isMPTIssuer` guard). Not enforced
  // here — see `## Divergences` header for why.

  return buildFrozenTx<ConfidentialMptSendProps, ConfidentialMptSend>(
    'ConfidentialMPTSend',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: ConfidentialMptSend) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: ConfidentialMptSend,
        overrides: Partial<ConfidentialMptSendProps>,
      ) {
        return confidentialMptSend(mergeForWith(this, overrides));
      },
    },
  );
}