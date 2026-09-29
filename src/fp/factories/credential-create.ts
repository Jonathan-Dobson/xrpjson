/**
 * Functional CredentialCreate factory — frozen-object style.
 *
 * Provisionally issues a credential to a `Subject` account. The credential
 * is not valid until the subject accepts it with a `CredentialAccept`.
 * Validation happens at construction; there is no way to construct an
 * invalid tx.
 *
 *   import { credentialCreate } from 'xrplt/fp';
 *   const tx = credentialCreate({
 *     Account: issuerAddr,
 *     Subject: subjectAddr,
 *     CredentialType: '6D795F63726564656E7469616C',
 *   });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Expiration: 1735689600 });
 *
 * Required amendment: `Credentials`.
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/credentialcreate
 * @see https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0070-credentials
 *
 * ## Divergences
 *
 * The class-based API at `src/transactions/credential-create.ts` is
 * missing several rules the canonical sources require AND exposes one
 * field that is not in the spec at all. The factory corrects both:
 *
 *   1. `CredentialSequence` is NOT in the spec.
 *      The class exposes `CredentialSequence: number` as a required
 *      field. XLS-0070 §3.1 lists ONLY `TransactionType`, `Account`,
 *      `Subject`, `CredentialType`, `Expiration`, `URI`. xrpl.js
 *      5.3.0 `models/transactions/CredentialCreate.ts` and xrpl-dev-portal
 *      `credentialcreate.md` agree: no `CredentialSequence`. The
 *      `Credential` ledger object's `CredentialSequence` is auto-assigned
 *      by the network (XLS-0070 §3.3), not by the issuer. The factory
 *      omits this field entirely.
 *      Source: XLS-0070 §3.1 (field table) and §3.3 (state changes);
 *              xrpl.js `models/transactions/CredentialCreate.ts`
 *              lines 22–39; xrpl-dev-portal
 *              `credentialcreate.md` (field table).
 *
 *   2. `CredentialType` must be a non-empty hex string ≤ 64 bytes.
 *      The class only checks `isString`. XLS-0070 §3.2 failure
 *      conditions: "The `CredentialType` field is empty or too long
 *      (limit 64 bytes)." XLS-0070 §2.1.3 also says: "It has a maximum
 *      length of 64 bytes, and cannot be an empty string." xrpl.js
 *      enforces the same with `MAX_CREDENTIAL_TYPE_LENGTH = 128`
 *      (hex chars for 64 bytes) and a hex regex.
 *      Source: XLS-0070 §3.2 + §2.1.3; xrpl.js
 *              `models/transactions/common.ts:29–30` (`MAX_CREDENTIAL_TYPE_LENGTH`),
 *              `models/transactions/common.ts:1061–1093`
 *              (`validateCredentialType`).
 *
 *   3. `URI` must be a non-empty hex string ≤ 256 bytes.
 *      The class only checks it is undefined-or-string. XLS-0070 §3.2
 *      failure: "The `URI` field is empty or too long (limit 256
 *      bytes)." The factory enforces ≤ 512 hex chars (256 bytes),
 *      matching the spec — NOT the more conservative 256-hex-char cap
 *      that xrpl.js 5.3.0 enforces at `CredentialCreate.ts:15`
 *      (`MAX_URI_LENGTH = 256` actually bounds the hex string to 256
 *      characters = 128 bytes; this is an xrpl.js under-spec limit that
 *      the factory intentionally does NOT mirror).
 *      Source: XLS-0070 §3.2 + §2.1.2 (`MaxCredentialUriBytes = 256`);
 *              xrpl-dev-portal `credentialcreate.md` (URI table row:
 *              "maximum is 256 bytes").
 *
 *   4. `Expiration` must be a positive integer in UInt32 range.
 *      The class only checks `isNumber`. XLS-0070 §3.1 lists
 *      `Expiration` as `UInt32`. The factory enforces `Expiration`
 *      to be a finite, non-negative integer ≤ 2^32 − 1. (Whether the
 *      time is in the future is a runtime check, not enforceable here.)
 *      Source: XLS-0070 §3.1 (Internal Type column = UInt32);
 *              XLS-0070 §3.2 failure "The time in Expiration is in the
 *              past".
 *
 *   5. `Subject` must not be ACCOUNT_ZERO (`rHb9CJAWyB4rj91VRWn96Dkukn4MRtfQ`).
 *      The class accepts any `isAccount`-shaped string. xrpl-dev-portal
 *      `credentialcreate.md` error cases lists `temINVALID_ACCOUNT_ID`
 *      fired "if it contains ACCOUNT_ZERO". The factory rejects the
 *      zero address explicitly.
 *      Source: xrpl-dev-portal `credentialcreate.md` (Error Cases
 *              table, row for `temINVALID_ACCOUNT_ID`).
 *
 *   6. `Account` must be a non-empty string.
 *      The class uses `isAccount` which allows empty strings to slip
 *      through the format regex's lower bound (24+ chars), so an empty
 *      Account would actually be caught — but only as a side effect of
 *      length. The factory makes the intent explicit.
 *      Source: XLS-0070 §3.1 (Account is required, type AccountID);
 *              xrpl.js `validateCredentialCreate` calls
 *              `validateRequiredField(tx, 'Account', isString)`.
 */
import { isAccount, isHex, isNumber, isString } from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

/** CredentialType max bytes (XLS-0070 §3.2). */
const MAX_CREDENTIAL_TYPE_BYTES = 64;
/** CredentialType max hex chars = 2 × bytes. */
const MAX_CREDENTIAL_TYPE_LENGTH = MAX_CREDENTIAL_TYPE_BYTES * 2;
/** URI max bytes (XLS-0070 §3.2). */
const MAX_URI_BYTES = 256;
/** URI max hex chars = 2 × bytes. */
const MAX_URI_LENGTH = MAX_URI_BYTES * 2;
/** UInt32 max. */
const UINT32_MAX = 0xffffffff;
/** The XRPL ACCOUNT_ZERO address; rippled rejects this as Subject. */
const ACCOUNT_ZERO = 'rHb9CJAWyB4rj91VRWn96Dkukn4MRtfQ';

// ─── Public types ────────────────────────────────────────────────────

export interface CredentialCreateProps {
  /** The issuer of the credential. */
  Account: string;
  /** The subject of the credential. */
  Subject: string;
  /** Hex-encoded credential type, 1–64 bytes. */
  CredentialType: string;
  /** Optional expiration (seconds since Ripple Epoch). */
  Expiration?: number | undefined;
  /** Optional hex-encoded URI, 1–256 bytes. */
  URI?: string | undefined;
  /** Bit-flags for this transaction. (No flags are defined for this tx.) */
  Flags?: number | undefined;
  Fee?: string | undefined;
  Sequence?: number | undefined;
}

export interface CredentialCreate
  extends Readonly<CredentialCreateProps> {
  readonly TransactionType: 'CredentialCreate';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<CredentialCreateProps>): CredentialCreate;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function validateCredentialType(value: unknown): string {
  if (!isString(value)) {
    throw new ValidationError(
      'CredentialCreate: CredentialType must be a hex string',
    );
  }
  if (value.length === 0) {
    throw new ValidationError(
      'CredentialCreate: CredentialType cannot be an empty string',
    );
  }
  if (!isHex(value)) {
    throw new ValidationError(
      'CredentialCreate: CredentialType must be encoded in hex',
    );
  }
  if (value.length % 2 !== 0) {
    throw new ValidationError(
      'CredentialCreate: CredentialType must be a hex string with an even number of characters',
    );
  }
  if (value.length > MAX_CREDENTIAL_TYPE_LENGTH) {
    throw new ValidationError(
      `CredentialCreate: CredentialType length must be <= ${MAX_CREDENTIAL_TYPE_LENGTH} hex chars (${MAX_CREDENTIAL_TYPE_BYTES} bytes)`,
    );
  }
  return value;
}

function validateURI(value: unknown): string {
  if (!isString(value)) {
    throw new ValidationError(
      'CredentialCreate: URI must be a hex string',
    );
  }
  if (value.length === 0) {
    throw new ValidationError(
      'CredentialCreate: URI cannot be an empty string',
    );
  }
  if (!isHex(value)) {
    throw new ValidationError(
      'CredentialCreate: URI must be encoded in hex',
    );
  }
  if (value.length > MAX_URI_LENGTH) {
    throw new ValidationError(
      `CredentialCreate: URI length must be <= ${MAX_URI_LENGTH} hex chars (${MAX_URI_BYTES} bytes)`,
    );
  }
  return value;
}

function validateExpiration(value: unknown): number {
  if (!isNumber(value) || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new ValidationError(
      'CredentialCreate: Expiration must be an integer',
    );
  }
  if (value < 0) {
    throw new ValidationError(
      'CredentialCreate: Expiration must be non-negative',
    );
  }
  if (value > UINT32_MAX) {
    throw new ValidationError(
      `CredentialCreate: Expiration must fit in UInt32 (max ${UINT32_MAX})`,
    );
  }
  return value;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function credentialCreate(
  props: CredentialCreateProps,
): CredentialCreate {
  // ── Account ── required, must be a non-empty string.
  require(
    props.Account,
    'CredentialCreate: Account is required',
    isString,
  );
  if (props.Account.length === 0) {
    throw new ValidationError('CredentialCreate: Account is required');
  }

  // ── Subject ── required, must be a valid XRPL account AND not ACCOUNT_ZERO.
  require(
    props.Subject,
    'CredentialCreate: Subject is required',
    isString,
  );
  if (props.Subject.length === 0) {
    throw new ValidationError('CredentialCreate: Subject is required');
  }
  if (!isAccount(props.Subject)) {
    throw new ValidationError(
      'CredentialCreate: Subject must be a valid XRPL address',
    );
  }
  if (props.Subject === ACCOUNT_ZERO) {
    throw new ValidationError(
      'CredentialCreate: Subject must not be ACCOUNT_ZERO',
    );
  }

  // ── CredentialType ── required, hex, 1–64 bytes.
  validateCredentialType(props.CredentialType);

  // ── URI ── optional, hex, 1–256 bytes when present.
  if (props.URI !== undefined) {
    validateURI(props.URI);
  }

  // ── Expiration ── optional, finite UInt32 integer.
  if (props.Expiration !== undefined) {
    validateExpiration(props.Expiration);
  }

  return buildFrozenTx<CredentialCreateProps, CredentialCreate>(
    'CredentialCreate',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: CredentialCreate) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: CredentialCreate,
        overrides: Partial<CredentialCreateProps>,
      ) {
        return credentialCreate(mergeForWith(this, overrides));
      },
    },
  );
}
