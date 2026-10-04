/**
 * Functional AccountDelete factory — frozen-object style.
 *
 * Deletes an account and any objects it owns in the XRP Ledger, sending
 * the leftover XRP to a specified destination account. Validation happens
 * at construction; there is no way to construct an invalid tx from the fields
 * it models.
 *
 *   import { accountDelete } from 'xrpjson';
 *   const tx = accountDelete({ Account, Destination });
 *   tx.validate();   // throws if construction didn't already
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ DestinationTag: 42 });
 *
 * Affected amendments:
 *   - `DeletableAccounts` — base AccountDelete.
 *   - `Credentials`       — introduces the optional `CredentialIDs` field
 *                           for deposit-authorized deletions.
 *   - `Sponsor`           — `tecNO_SPONSOR_PERMISSION` runtime guard
 *                           (not locally checkable).
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/accountdelete
 *
 * ## Divergences
 *
 * The class-based API at the Class API's `AccountDelete` is missing
 * three rules that the canonical sources require. The factory fills them:
 *
 *   1. `CredentialIDs` is not declared by the class.
 *      The class has no `CredentialIDs` field at all, so callers using the
 *      class API cannot authorize a deletion with deposit credentials. The
 *      factory adds the field with full xrpl.js validation: when present
 *      the array must be non-empty, length ≤ `MAX_AUTHORIZED_CREDENTIALS`
 *      (8), each entry a 64-char hex string, and contain no duplicates.
 *      Source: xrpl.js `packages/xrpl/src/models/transactions/accountDelete.ts`
 *      `validateAccountDelete` calls `validateCredentialsList(..., true, 8)`;
 *              `packages/xrpl/src/models/transactions/common.ts:28`
 *              `MAX_AUTHORIZED_CREDENTIALS = 8`;
 *              `validateCredentialsList` (`common.ts:1106`).
 *              xrpl-dev-portal `accountdelete.md` Fields table
 *              (`CredentialIDs` is listed as a field).
 *
 *   2. `temDST_IS_SRC` is not enforced.
 *      The class never compares `Destination` against `Account`, so an
 *      AccountDelete that names itself as the destination passes class
 *      validation and only fails at the ledger with `temDST_IS_SRC`.
 *      Source: xrpl-dev-portal `accountdelete.md` Error Cases table
 *              (`temDST_IS_SRC` — "Destination matches the sender").
 *
 *   3. `DestinationTag` UInt32 bounds are not enforced.
 *      The class only checks `isNumber`, so non-integer, negative, or
 *      out-of-UInt32-range values pass. The spec defines the field as
 *      `UInt32` (0 ≤ value ≤ 2^32 − 1).
 *      Source: xrpl-dev-portal `accountdelete.md` Fields table
 *              (`DestinationTag` Internal Type: `UInt32`).
 */
import type { BasePropsFields } from '../../types/base.js';
import { isAccount, isArray, isHex, isNumber, isString } from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// XRPL UInt32 max (per rippled STUInt32).
const UINT32_MAX = 0xffffffff;

// Credential IDs are 64-char hex (HASH256 — same as ledger entry IDs).
// xrpl.js caps non-DomainSet credential arrays at 8 entries.
//   packages/xrpl/src/models/transactions/common.ts: MAX_AUTHORIZED_CREDENTIALS = 8
const CREDENTIAL_ID_LENGTH = 64;
const MAX_CREDENTIAL_IDS = 8;

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
export interface AccountDeleteProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  Account: string;
  /**
   * The address of an account to receive any leftover XRP after deleting
   * the sending account. Must be a funded account in the ledger, and must
   * NOT be the sending account (`temDST_IS_SRC`).
   */
  Destination: string;
  /**
   * Arbitrary destination tag for the recipient. UInt32:
   * 0 ≤ value ≤ 0xFFFFFFFF.
   */
  DestinationTag?: number | undefined;
  /**
   * (Credentials amendment) Optional set of credential IDs authorizing
   * the deletion when the destination requires deposit authorization.
   * When present: array must be non-empty, length ≤ 8, each entry a
   * 64-character hex string, no duplicates.
   */
  CredentialIDs?: string[] | undefined;
  /** Bit-flags for this transaction. AccountDelete has no defined flags. */
  Flags?: number | undefined;
}

export interface AccountDelete extends Readonly<AccountDeleteProps> {
  readonly TransactionType: 'AccountDelete';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<AccountDeleteProps>): AccountDelete;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function accountDelete(props: AccountDeleteProps): AccountDelete {
  // ── Account ── required, must be a valid XRPL classic or X-address.
  require(props.Account, 'AccountDelete: Account is required', isAccount);

  // ── Destination ── required, must be a valid XRPL address.
  require(props.Destination, 'AccountDelete: Destination is required', isAccount);

  // ── temDST_IS_SRC ── Destination must not equal the sender.
  //   xrpl-dev-portal accountdelete.md Error Cases table.
  if (props.Destination === props.Account) {
    throw new ValidationError(
      'AccountDelete: Destination must not equal Account (temDST_IS_SRC)',
    );
  }

  // ── DestinationTag ── UInt32 (0 ≤ value ≤ 0xFFFFFFFF, integer).
  if (props.DestinationTag !== undefined) {
    if (
      !isNumber(props.DestinationTag) ||
      !Number.isInteger(props.DestinationTag) ||
      props.DestinationTag < 0 ||
      props.DestinationTag > UINT32_MAX
    ) {
      throw new ValidationError(
        `AccountDelete: DestinationTag must be an integer in [0, ${UINT32_MAX}]`,
      );
    }
  }

  // ── CredentialIDs ── optional array; bounds + entry-shape + uniqueness
  //   enforced when present. Per xrpl.js validateAccountDelete, which calls
  //   validateCredentialsList with maxCredentials = MAX_AUTHORIZED_CREDENTIALS = 8.
  if (props.CredentialIDs !== undefined) {
    if (!isArray(props.CredentialIDs)) {
      throw new ValidationError(
        'AccountDelete: CredentialIDs must be an array of credential ID strings',
      );
    }
    if (props.CredentialIDs.length === 0) {
      throw new ValidationError(
        'AccountDelete: CredentialIDs must not be an empty array',
      );
    }
    if (props.CredentialIDs.length > MAX_CREDENTIAL_IDS) {
      throw new ValidationError(
        `AccountDelete: CredentialIDs length cannot exceed ${MAX_CREDENTIAL_IDS} elements (actual: ${props.CredentialIDs.length})`,
      );
    }
    for (let i = 0; i < props.CredentialIDs.length; i++) {
      const cid = props.CredentialIDs[i];
      if (
        !isString(cid) ||
        !isHex(cid) ||
        cid.length !== CREDENTIAL_ID_LENGTH
      ) {
        throw new ValidationError(
          `AccountDelete: CredentialIDs[${i}] must be a ${CREDENTIAL_ID_LENGTH}-character hex string`,
        );
      }
    }
    // xrpl.js validateCredentialsList rejects duplicates; mirror that
    // (xrpl.js common.ts: containsDuplicates check).
    const seen = new Set<string>();
    for (const cid of props.CredentialIDs) {
      if (seen.has(cid)) {
        throw new ValidationError(
          'AccountDelete: CredentialIDs cannot contain duplicate elements',
        );
      }
      seen.add(cid);
    }
  }

  // ─── Base transaction fields ───
  // Runtime backstop for the seven shared fields: Memos, SourceTag,
  // LastLedgerSequence, AccountTxnID, NetworkID, Delegate, TicketSequence.
  // `AccountDeleteProps` now extends `BasePropsFields`: the seven shared
  // fields are type-checked at compile time, and this call is the
  // runtime backstop. Without it they reached `buildFrozenTx` unchecked. Placed AFTER the AccountDelete-specific checks so a more
  // specific message wins for a more specific mistake.
  //
  // `TransactionType` is supplied because the validator checks a transaction,
  // not a props bag — the factory injects it in `buildFrozenTx` below.
  validateBaseTransaction({ TransactionType: 'AccountDelete', ...props });

  return buildFrozenTx<AccountDeleteProps, AccountDelete>(
    'AccountDelete',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: AccountDelete) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: AccountDelete, overrides: Partial<AccountDeleteProps>) {
        return accountDelete(mergeForWith(this, overrides));
      },
    },
  );
}
