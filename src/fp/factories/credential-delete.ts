/**
 * Functional CredentialDelete factory — frozen-object style.
 *
 * Deletes a `Credential` ledger entry. The holder or the issuer may
 * submit this transaction. Validation happens at construction; there is
 * no way to construct an invalid tx.
 *
 *   import { credentialDelete } from 'xrpjson';
 *   const tx = credentialDelete({ Account, Subject, CredentialType });
 *   const j = tx.toJSON();
 *
 * Affected amendments:
 *   - `Credentials` — base CredentialDelete (XLS-0070 §5).
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/credentialdelete
 * @see XLS-0070 §5 (Transaction: `CredentialDelete`) in
 *      `~/.mavis/docs.local/xrpl-standards/repo/XLS-0070-credentials/README.md`
 *
 * ## Divergences
 *
 * The class-based API at the Class API's `CredentialDelete` and
 * xrpl.js's `validateCredentialDelete` both diverge from the XLS-0070
 * spec on two rules. The factory fills both gaps.
 *
 *   1. `Subject` and `Issuer` are OPTIONAL — at least one is required.
 *
 *      Per XLS-0070 §5.1, both `Subject` and `Issuer` are listed as
 *      not-required ("If omitted, `Account` is assumed to be the
 *      subject / issuer"). The note immediately below the field table
 *      states: "If an account is deleting a credential it issued to
 *      itself, then either `Subject` or `Issuer` can be specified, but
 *      at least one must be."
 *
 *      xrpl.js implements this correctly
 *      (`validateCredentialDelete` in
 *       `~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/
 *       transactions/CredentialDelete.ts`, lines 39–55 — throws
 *       "either `Issuer` or `Subject` must be provided" when both are
 *       absent).
 *
 *      The local class API is wrong on this point: it declares
 *      `Subject` and `Issuer` as `readonly Subject: string` /
 *      `readonly Issuer: string` (both required) and rejects any tx
 *      that omits one with "missing or invalid Subject/Issuer". A tx
 *      with `Account === Issuer === Subject` (deleting a self-issued
 *      credential) cannot be constructed via the class. The factory
 *      makes both optional and enforces "at least one of {Subject,
 *      Issuer}".
 *
 *      Source citation:
 *        - XLS-0070 §5.1 + §5.2 in
 *          `~/.mavis/docs.local/xrpl-standards/repo/XLS-0070-credentials/
 *          README.md` (lines 199–212).
 *        - xrpl.js `validateCredentialDelete` at
 *          `~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/
 *          transactions/CredentialDelete.ts` (lines 39–55).
 *        - xrpl-dev-portal `credentialdelete.md`
 *          (`~/.mavis/docs.local/xrpl-dev-portal/repo/docs/references/
 *          protocol/transactions/types/credentialdelete.md`): "You
 *          must provide the `Subject` field, `Issuer` field, or both."
 *        - Local class at the Class API's `CredentialDelete`
 *          (lines 9–17 and 37–38 — both declared required and both
 *          validated as required).
 *
 *   2. `CredentialType` is a hex `Blob`, not just any string.
 *
 *      Per XLS-0070 §2.1.3 (the field definition carried over into the
 *      CredentialDelete spec): "It has a maximum length of 64 bytes,
 *      and cannot be an empty string." In hex that is 1–128
 *      characters. xrpl.js's `validateCredentialType` enforces this
 *      (`~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/
 *      transactions/common.ts`, lines 1061–1093 — checks
 *      `MAX_CREDENTIAL_BYTE_LENGTH = 64`, empty-string rejection, and
 *      `HEX_REGEX`).
 *
 *      The local class API only checks `isString(this.CredentialType)`
 *      (line 39). That admits three classes of bad input that rippled
 *      will reject: empty string (too short), non-hex strings, and
 *      strings longer than 128 hex chars. The factory rejects all
 *      three at construction.
 *
 *      Source citation:
 *        - XLS-0070 §2.1.3 in
 *          `~/.mavis/docs.local/xrpl-standards/repo/XLS-0070-credentials/
 *          README.md` (line 116: "It has a maximum length of 64
 *          bytes, and cannot be an empty string.").
 *        - xrpl.js `validateCredentialType` at
 *          `~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/
 *          transactions/common.ts` (lines 1061–1093 — empty-string,
 *          length ≤ 128 hex chars, `HEX_REGEX`).
 *        - xrpl-dev-portal `credentialdelete.md` (line 34): "The
 *          minimum length is 1 byte and the maximum length is 256
 *          bytes." (Note: the portal's "256 bytes" appears to be a
 *          copy-paste error from the `URI` field table; XLS-0070
 *          §2.1.3 and xrpl.js both cap at 64 bytes / 128 hex chars.
 *          The factory follows the standard + xrpl.js.)
 *        - Local class at the Class API's `CredentialDelete`
 *          (line 39 — only `isString`).
 *
 * The factory also validates `Account` as a well-formed XRPL
 * classic/X-address. This matches the pattern in every other fp factory
 * (`vaultDelete`, `permissionedDomainDelete`, `loanBrokerDelete`, …)
 * and matches xrpl.js's `validateBaseTransaction` (which calls
 * `validateRequiredField(common, 'Account', isString)` against the
 * same regex). The class API here uses only `isString` via
 * `validateBaseTransaction`.
 */
import type { BasePropsFields } from '../../types/base.js';
import { isAccount, isHex, isString } from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// XLS-0070 §2.1.3 + xrpl.js MAX_CREDENTIAL_BYTE_LENGTH (= 64) → 128 hex chars.
const MAX_CREDENTIAL_TYPE_HEX_LENGTH = 128;

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
export interface CredentialDeleteProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  /** The unique address of the transaction sender. */
  Account: string;
  /**
   * The subject of the credential to delete.
   * If omitted, `Account` is assumed to be the subject.
   * At least one of `Subject` / `Issuer` must be provided (XLS-0070 §5.1).
   */
  Subject?: string | undefined;
  /**
   * The issuer of the credential to delete.
   * If omitted, `Account` is assumed to be the issuer.
   * At least one of `Subject` / `Issuer` must be provided (XLS-0070 §5.1).
   */
  Issuer?: string | undefined;
  /**
   * Hex-encoded credential type (Blob). 1–128 hex chars (1–64 bytes).
   * Cannot be empty (XLS-0070 §2.1.3).
   */
  CredentialType: string;
}

export interface CredentialDelete extends Readonly<CredentialDeleteProps> {
  readonly TransactionType: 'CredentialDelete';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<CredentialDeleteProps>): CredentialDelete;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function credentialDelete(props: CredentialDeleteProps): CredentialDelete {
  // ── Account ── required, must be a valid XRPL classic or X-address.
  require(
    props.Account,
    'CredentialDelete: Account is required',
    isAccount,
  );

  // ── Subject / Issuer ── both optional, but at least one must be set.
  // Per XLS-0070 §5.1 + xrpl.js's `validateCredentialDelete`:
  //   "either `Issuer` or `Subject` must be provided"
  // The class API makes both required — see "Divergences" #1 in the
  // header for the full citation trail.
  const hasSubject = props.Subject !== undefined;
  const hasIssuer = props.Issuer !== undefined;
  if (!hasSubject && !hasIssuer) {
    throw new ValidationError(
      'CredentialDelete: either Subject or Issuer must be provided',
    );
  }
  if (hasSubject && !isAccount(props.Subject)) {
    throw new ValidationError(
      'CredentialDelete: Subject must be a valid XRPL address',
    );
  }
  if (hasIssuer && !isAccount(props.Issuer)) {
    throw new ValidationError(
      'CredentialDelete: Issuer must be a valid XRPL address',
    );
  }

  // ── CredentialType ── required, hex Blob, 1–128 hex chars (1–64 bytes).
  // Per XLS-0070 §2.1.3 + xrpl.js `validateCredentialType`:
  //   non-empty, ≤ 64 decoded bytes, hex-encoded.
  // The class API only does `isString` — see "Divergences" #2.
  if (!isString(props.CredentialType) || props.CredentialType.length === 0) {
    throw new ValidationError(
      'CredentialDelete: CredentialType is required and must be a non-empty hex string',
    );
  }
  if (props.CredentialType.length > MAX_CREDENTIAL_TYPE_HEX_LENGTH) {
    throw new ValidationError(
      `CredentialDelete: CredentialType exceeds ${MAX_CREDENTIAL_TYPE_HEX_LENGTH} hex chars (${MAX_CREDENTIAL_TYPE_HEX_LENGTH / 2} bytes)`,
    );
  }
  if (!isHex(props.CredentialType)) {
    throw new ValidationError(
      'CredentialDelete: CredentialType must be a hex string',
    );
  }

  // ── Base transaction fields ──
  // Catches the seven shared fields this factory now accepts through
  // `BasePropsFields` but does not otherwise check: Memos, SourceTag,
  // LastLedgerSequence, AccountTxnID, NetworkID, Delegate, TicketSequence.
  // Placed AFTER the CredentialDelete-specific checks so a more specific
  // message wins for a more specific mistake.
  validateBaseTransaction({ TransactionType: 'CredentialDelete', ...props });

  return buildFrozenTx<CredentialDeleteProps, CredentialDelete>(
    'CredentialDelete',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: CredentialDelete) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: CredentialDelete,
        overrides: Partial<CredentialDeleteProps>,
      ) {
        return credentialDelete(mergeForWith(this, overrides));
      },
    },
  );
}