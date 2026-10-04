/**
 * Functional CredentialAccept factory — frozen-object style.
 *
 * Accepts a credential that was provisionally issued to the Account.
 * Validation happens at construction; there is no way to construct an
 * invalid tx.
 *
 *   import { credentialAccept } from 'xrpjson';
 *   const tx = credentialAccept({
 *     Account,
 *     Issuer: iss,
 *     CredentialType: '6D795F63726564656E7469616C',
 *   });
 *   const j = tx.toJSON();
 *
 * Affected amendments:
 *   - `Credentials` — introduces this transaction type (XLS-0070 §4).
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/credentialaccept
 * @see https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0070-credentials
 *
 * ## Divergences
 *
 * The class-based API at the Class API's `CredentialAccept` is
 * missing three rules that the canonical sources require. The factory
 * adds them:
 *
 *   1. `CredentialType` must not be an empty string.
 *      The class only checks `isString(this.CredentialType)`, so `""`
 *      passes. XLS-0070 §2.1.3: "It has a maximum length of 64 bytes,
 *      and cannot be an empty string." xrpl.js `validateCredentialType`
 *      rejects `tx.CredentialType.length === 0`. xrpl-dev-portal's
 *      `credentialaccept.md` field table likewise lists the minimum
 *      length as 1 byte.
 *      Source: XLS-0070 §2.1.3; xrpl.js
 *              `models/transactions/common.ts:1061–1086`
 *              (`validateCredentialType`).
 *
 *   2. `CredentialType` must be hex-encoded.
 *      The class accepts any string (e.g. `"not-hex!"`). The spec
 *      encodes `CredentialType` as a `Blob` (XLS-0070 §2.1 field table
 *      row for `CredentialType`: Internal Type `Blob`). xrpl.js
 *      `validateCredentialType` enforces `HEX_REGEX.test`.
 *      Source: XLS-0070 §2.1 field table; xrpl.js
 *              `models/transactions/common.ts:1088–1092`
 *              (`validateCredentialType`).
 *
 *   3. `CredentialType` length must be at most 128 hex chars (64 bytes).
 *      The class has no length check. XLS-0070 §2.1.3 caps the value at
 *      64 bytes; the hex-encoded form is therefore at most 128 chars.
 *      xrpl.js enforces `MAX_CREDENTIAL_TYPE_LENGTH = 128`
 *      (`common.ts:30`). The hex form must also be even-length to round-
 *      trip cleanly through the binary codec — the factory enforces
 *      even length explicitly so users get a clear error.
 *      Source: XLS-0070 §2.1.3; xrpl.js
 *              `models/transactions/common.ts:30` and
 *              `models/transactions/common.ts:1082–1086`.
 *
 *   4. `Account` is explicitly required and validated as a non-empty
 *      string.
 *      The class inherits its `Account` handling from
 *      `Transaction.validate()` via `super.validate()` and never
 *      re-checks the field. The factory has no inheritance chain, so
 *      the requirement is enforced here. xrpl.js enforces the same via
 *      `validateRequiredField(tx, 'Account', isString)`.
 *      Source: XLS-0070 §4.1 (Account is required, JSON Type Address);
 *              xrpl.js `models/transactions/CredentialAccept.ts:39`.
 *
 * Note on `Issuer`: the class uses `isAccount` (format-only XRPL
 * address check). This is stricter than xrpl.js's `isString` and is
 * retained here — `Issuer` is typed `AccountID` in XLS-0070 §4.1, so
 * the format check is correct.
 */
import type { BasePropsFields } from '../../types/base.js';
import { isAccount, isHex, isString } from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// CredentialType is a hex-encoded Blob capped at 64 bytes (XLS-0070 §2.1.3).
const MAX_CREDENTIAL_TYPE_BYTES = 64;
const MAX_CREDENTIAL_TYPE_HEX_LENGTH = MAX_CREDENTIAL_TYPE_BYTES * 2;

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
export interface CredentialAcceptProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  /** The subject of the credential (the Account submitting the tx). */
  Account: string;
  /** The issuer of the credential. XRPL classic or X-address. */
  Issuer: string;
  /**
   * Hex-encoded identifier of the credential type. 1–64 bytes
   * (2–128 hex chars), non-empty.
   */
  CredentialType: string;
  /** Bit-flags for this transaction. */
  Flags?: number | undefined;
}

export interface CredentialAccept
  extends Readonly<CredentialAcceptProps> {
  readonly TransactionType: 'CredentialAccept';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<CredentialAcceptProps>): CredentialAccept;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function validateCredentialTypeHex(value: string): void {
  if (value.length === 0) {
    throw new ValidationError(
      'CredentialAccept: CredentialType cannot be an empty string',
    );
  }
  if (!isHex(value)) {
    throw new ValidationError(
      'CredentialAccept: CredentialType must be encoded in hex',
    );
  }
  if (value.length % 2 !== 0) {
    throw new ValidationError(
      'CredentialAccept: CredentialType must be a hex string with an even number of characters',
    );
  }
  if (value.length > MAX_CREDENTIAL_TYPE_HEX_LENGTH) {
    throw new ValidationError(
      `CredentialAccept: CredentialType length cannot be > ${MAX_CREDENTIAL_TYPE_HEX_LENGTH} (64 bytes)`,
    );
  }
}

// ─── Factory ─────────────────────────────────────────────────────────

export function credentialAccept(props: CredentialAcceptProps): CredentialAccept {
  // ── Account ── required, must be a non-empty string.
  require(
    props.Account,
    'CredentialAccept: Account is required',
    isString,
  );
  if (props.Account.length === 0) {
    throw new ValidationError('CredentialAccept: Account is required');
  }

  // ── Issuer ── required, must look like an XRPL classic or X-address.
  if (!isAccount(props.Issuer)) {
    throw new ValidationError(
      'CredentialAccept: missing or invalid Issuer',
    );
  }

  // ── CredentialType ── required, hex, non-empty, even-length, ≤ 64 bytes.
  if (props.CredentialType === undefined) {
    throw new ValidationError(
      'CredentialAccept: missing field CredentialType',
    );
  }
  if (!isString(props.CredentialType)) {
    throw new ValidationError(
      'CredentialAccept: CredentialType must be a string',
    );
  }
  validateCredentialTypeHex(props.CredentialType);

  // ─── Base transaction fields ───
  // Catches the seven shared fields this factory now accepts through
  // `BasePropsFields` but does not otherwise check: Memos, SourceTag,
  // LastLedgerSequence, AccountTxnID, NetworkID, Delegate, TicketSequence.
  // Placed AFTER the CredentialAccept-specific checks so a more specific
  // message wins for a more specific mistake, and this acts as the backstop
  // for everything shared across transaction types.
  //
  // `TransactionType` is supplied because the validator checks a transaction,
  // not a props bag — the factory injects it in `buildFrozenTx` below.
  validateBaseTransaction({ TransactionType: 'CredentialAccept', ...props });

  return buildFrozenTx<CredentialAcceptProps, CredentialAccept>(
    'CredentialAccept',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: CredentialAccept) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: CredentialAccept,
        overrides: Partial<CredentialAcceptProps>,
      ) {
        return credentialAccept(mergeForWith(this, overrides));
      },
    },
  );
}