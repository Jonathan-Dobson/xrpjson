/**
 * Functional PermissionedDomainSet factory — frozen-object style.
 *
 * Creates or modifies a PermissionedDomain ledger entry. Validation
 * happens at construction; there is no way to construct an invalid tx from the
 * fields it models.
 *
 *   import { permissionedDomainSet } from 'xrpjson';
 *   const tx = permissionedDomainSet({
 *     Account,
 *     AcceptedCredentials: [
 *       { Credential: { Issuer: iss, CredentialType: '6D795F63726564656E7469616C' } },
 *     ],
 *   });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ DomainID: existingDomainId });
 *
 * Affected amendments:
 *   - `PermissionedDomains` — introduces this transaction type.
 *   - `Credentials`         — required amendment (PermissionedDomainSet
 *                             transactions are invalid without it).
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/permissioneddomainset
 * @see https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0080-permissioned-domains
 *
 * ## Divergences
 *
 * The class-based API at the Class API's `PermissionedDomainSet`
 * is missing several rules that the canonical sources require, AND
 * exposes one field that is not in the spec at all. The factory
 * corrects both:
 *
 *   1. `AcceptedCredentials` is REQUIRED.
 *      The class marks it optional (`AcceptedCredentials?: unknown[]`).
 *      XLS-0080 §3.1 (Field table) lists it as required; xrpl.js
 *      `validatePermissionedDomainSet` calls `validateRequiredField`.
 *      Source: XLS-0080 §3.1 table row for `AcceptedCredentials`;
 *              xrpl.js `permissionedDomainSet.ts` lines 40–41.
 *
 *   2. `AcceptedCredentials` must be a NON-EMPTY array.
 *      The class only checks the field is an array, so `[]` passes.
 *      XLS-0080 §6 invariant 2: "The `AcceptedCredentials` array must
 *      have length between 1 and 10, if included." XLS-0080 §3.2
 *      failure: "The `AcceptedCredentials` array is empty or too long."
 *      Source: XLS-0080 §6 invariant; XLS-0080 §3.2 failure conditions.
 *
 *   3. `AcceptedCredentials` must have at most 10 entries.
 *      The class does not check the length. XLS-0080 §3.2 + §6 invariant
 *      set the cap at 10. xrpl.js enforces the same cap
 *      (`MAX_ACCEPTED_CREDENTIALS = 10`).
 *      Source: XLS-0080 §3.2; xrpl.js `permissionedDomainSet.ts:13`.
 *
 *   4. `AcceptedCredentials` cannot contain duplicates.
 *      The class has no dedupe check. xrpl.js calls
 *      `validateCredentialsList` which calls `containsDuplicates` on
 *      `(Issuer, CredentialType)` pairs.
 *      Source: xrpl-dev-portal `permissioneddomainset.md` (field
 *              table: "it cannot contain duplicates"); xrpl.js
 *              `common.ts` `containsDuplicates`.
 *
 *   5. Each entry must be a valid `AuthorizeCredential` object form.
 *      The class types the field as `unknown[]` and accepts any array.
 *      xrpl.js enforces object form only — strings (credential IDs)
 *      are explicitly rejected for this transaction.
 *      Source: xrpl.js `permissionedDomainSet.ts:46` (the `false`
 *              isStringID argument); xrpl.js `common.ts:1129–1141`.
 *
 *   6. `CredentialType` must be a non-empty hex string.
 *      The class has no per-credential validation. XLS-0070 §2.1.3
 *      states: "It has a maximum length of 64 bytes, and cannot be an
 *      empty string." `CredentialType` is encoded as a Blob (hex) per
 *      XLS-0070 §2.1.
 *      Source: XLS-0070 §2.1 + §2.1.3; XLS-0080 §3.2 failure
 *              "Any credential in `AcceptedCredentials` has an empty
 *              `CredentialType`".
 *
 *   7. `CredentialType` must be at most 64 bytes (128 hex chars).
 *      The class has no length check. XLS-0080 §3.2 failure: "Any
 *      credential in `AcceptedCredentials` has a `CredentialType`
 *      longer than 64 bytes (as per XLS-70)." XLS-0070 §2.1.3 sets the
 *      64-byte limit.
 *      Source: XLS-0080 §3.2; XLS-0070 §2.1.3.
 *
 *   8. `AcceptedAccounts` is NOT in the spec.
 *      The class exposes `AcceptedAccounts?: string[]` as an
 *      assignable field, but XLS-0080 §3.1 lists ONLY `DomainID` and
 *      `AcceptedCredentials`. The factory omits this field entirely —
 *      no spec source mandates or defines its shape.
 *      Source: XLS-0080 §3.1 field table; xrpl.js
 *              `permissionedDomainSet.ts` (no `AcceptedAccounts`).
 */
import type { BasePropsFields } from '../../types/base.js';
import type { AuthorizeCredential } from '../../types/common.js';
import { isAuthorizeCredential, isHex, isString } from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// Maximum number of accepted credentials (XLS-0080 §3.2 + §6 invariant 2).
const MAX_ACCEPTED_CREDENTIALS = 10;
// HASH256 length in hex characters.
const DOMAIN_ID_LENGTH = 64;
// CredentialType is a hex-encoded Blob capped at 64 bytes (XLS-0070 §2.1.3).
const MAX_CREDENTIAL_TYPE_BYTES = 64;

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
export interface PermissionedDomainSetProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  /** The account creating or modifying the permissioned domain. */
  Account: string;
  /**
   * The ledger entry ID of an existing permissioned domain to modify.
   * If omitted, a new domain is created.
   * 64-character hex string. Must not be the all-zeros HASH256 value.
   */
  DomainID?: string | undefined;
  /**
   * The list of credentials that grant access to this domain.
   * Required; must contain 1–10 unique `AuthorizeCredential` entries.
   */
  AcceptedCredentials: AuthorizeCredential[];
  /** Bit-flags for this transaction. (No flags are defined for this tx.) */
  Flags?: number | undefined;
}

export interface PermissionedDomainSet
  extends Readonly<PermissionedDomainSetProps> {
  readonly TransactionType: 'PermissionedDomainSet';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<PermissionedDomainSetProps>): PermissionedDomainSet;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function validateCredentialType(txType: string, value: unknown): string {
  if (!isString(value)) {
    throw new ValidationError(
      `${txType}: Credential.CredentialType must be a hex string`,
    );
  }
  if (value.length === 0) {
    throw new ValidationError(
      `${txType}: Credential.CredentialType must not be empty`,
    );
  }
  if (!isHex(value)) {
    throw new ValidationError(
      `${txType}: Credential.CredentialType must be a hex string`,
    );
  }
  if (value.length % 2 !== 0) {
    throw new ValidationError(
      `${txType}: Credential.CredentialType must be a hex string with an even number of characters`,
    );
  }
  const bytes = value.length / 2;
  if (bytes > MAX_CREDENTIAL_TYPE_BYTES) {
    throw new ValidationError(
      `${txType}: Credential.CredentialType exceeds ${MAX_CREDENTIAL_TYPE_BYTES} bytes (actual: ${bytes})`,
    );
  }
  return value;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function permissionedDomainSet(
  props: PermissionedDomainSetProps,
): PermissionedDomainSet {
  // ── Account ── required, must be a non-empty string.
  require(
    props.Account,
    'PermissionedDomainSet: Account is required',
    isString,
  );
  if (props.Account.length === 0) {
    throw new ValidationError('PermissionedDomainSet: Account is required');
  }

  // ── DomainID ── optional, 64-char hex AND non-zero when present.
  if (props.DomainID !== undefined) {
    if (
      !isString(props.DomainID) ||
      !isHex(props.DomainID) ||
      props.DomainID.length !== DOMAIN_ID_LENGTH
    ) {
      throw new ValidationError(
        'PermissionedDomainSet: DomainID must be a 64-character hex string',
      );
    }
    // The all-zeros DomainID is malformed per the `isDomainID` helper
    // in xrpl.js (`common.ts:1198–1204`) — although rippled itself
    // currently only checks the format at the transaction boundary,
    // rejecting it here matches the rest of this library's fp factories
    // and avoids silently constructing an obviously-bogus tx.
    if (/^0+$/u.test(props.DomainID)) {
      throw new ValidationError(
        'PermissionedDomainSet: DomainID must not be the all-zeros HASH256 value',
      );
    }
  }

  // ── AcceptedCredentials ── REQUIRED, 1..10 unique AuthorizeCredential entries.
  if (props.AcceptedCredentials === undefined) {
    throw new ValidationError(
      'PermissionedDomainSet: AcceptedCredentials is required',
    );
  }
  if (!Array.isArray(props.AcceptedCredentials)) {
    throw new ValidationError(
      'PermissionedDomainSet: AcceptedCredentials must be an array',
    );
  }
  if (props.AcceptedCredentials.length === 0) {
    throw new ValidationError(
      'PermissionedDomainSet: AcceptedCredentials cannot be an empty array',
    );
  }
  if (props.AcceptedCredentials.length > MAX_ACCEPTED_CREDENTIALS) {
    throw new ValidationError(
      `PermissionedDomainSet: AcceptedCredentials length cannot exceed ${MAX_ACCEPTED_CREDENTIALS} elements`,
    );
  }
  const seen = new Set<string>();
  props.AcceptedCredentials.forEach((credential, idx) => {
    if (!isAuthorizeCredential(credential)) {
      throw new ValidationError(
        `PermissionedDomainSet: AcceptedCredentials[${idx}] is not a valid AuthorizeCredential`,
      );
    }
    const credObj = credential.Credential;
    validateCredentialType(
      `PermissionedDomainSet: AcceptedCredentials[${idx}]`,
      credObj.CredentialType,
    );
    const key = `${credObj.Issuer}-${credObj.CredentialType}`;
    if (seen.has(key)) {
      throw new ValidationError(
        'PermissionedDomainSet: AcceptedCredentials cannot contain duplicate elements',
      );
    }
    seen.add(key);
  });

  // ─── Base transaction fields ───
  // Runtime backstop for the seven shared fields: Memos, SourceTag,
  // LastLedgerSequence, AccountTxnID, NetworkID, Delegate, TicketSequence.
  // `PermissionedDomainSetProps` now extends `BasePropsFields`: the seven shared
  // fields are type-checked at compile time, and this call is the
  // runtime backstop. Without it they reached `buildFrozenTx` unchecked. Placed AFTER the PermissionedDomainSet-specific checks so a
  // more specific message wins for a more specific mistake.
  //
  // `TransactionType` is supplied because the validator checks a transaction,
  // not a props bag — the factory injects it in `buildFrozenTx` below.
  validateBaseTransaction({ TransactionType: 'PermissionedDomainSet', ...props });

  return buildFrozenTx<PermissionedDomainSetProps, PermissionedDomainSet>(
    'PermissionedDomainSet',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: PermissionedDomainSet) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: PermissionedDomainSet,
        overrides: Partial<PermissionedDomainSetProps>,
      ) {
        return permissionedDomainSet(mergeForWith(this, overrides));
      },
    },
  );
}
