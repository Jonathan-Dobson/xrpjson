/**
 * Functional DelegateSet factory — frozen-object style.
 *
 * Authorizes another account (the `Authorize` field) to issue a set of
 * transaction types on behalf of the sender. Validation happens at
 * construction; there is no way to construct an invalid tx.
 *
 *   import { delegateSet } from 'xrplt/fp';
 *   const tx = delegateSet({
 *     Account,
 *     Authorize: OTHER_ACCOUNT,
 *     Permissions: [
 *       { Permission: { PermissionValue: 'Payment' } },
 *     ],
 *   });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Fee: '12', Sequence: 42 });
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/delegateSet
 * @see xrpl.js `dist/npm/models/transactions/delegateSet.ts`
 *      (validateDelegateSet — source of every guard below).
 *
 * ## Divergences
 *
 * The factory implements the canonical XRPL DelegateSet shape from
 * xrpl.js / XLS-85d, which is a strict superset of the current class
 * API at `src/transactions/delegate-set.ts`. The class is a placeholder
 * skeleton — it accepts a single `Delegate` field and does not model
 * the `Permissions` array at all. Concretely:
 *
 *   1. **Field rename: `Delegate` → `Authorize`.** The class
 *      `src/transactions/delegate-set.ts` exposes `Delegate: string` as
 *      its sole body field. Canonical xrpl.js names the field
 *      `Authorize: Account` (`node_modules/xrpl/src/models/transactions/
 *      delegateSet.ts:36-48`). The factory follows xrpl.js / XLS-85d
 *      and uses `Authorize`. Any caller passing `Delegate` will not
 *      see it on the wire — the fp output goes through
 *      `ripple-binary-codec` which would silently drop the unknown
 *      field. Source: xrpl.js `DelegateSet` interface (Authorize field).
 *
 *   2. **`Permissions` array is required.** xrpl.js requires
 *      `validateRequiredField(tx, 'Permissions', Array.isArray)`
 *      (xrpl.js `validateDelegateSet.ts:68`). The class does not model
 *      `Permissions` at all. Without it the tx is malformed and rippled
 *      rejects with `temMALFORMED`. Source: xrpl.js
 *      `validateDelegateSet.ts:68`; ripple-binary-codec
 *      `definitions.json` `DelegateSet: Permissions [ required ]`.
 *
 *   3. **`Permissions` length cap is 10.** xrpl.js enforces
 *      `permissions.length > PERMISSIONS_MAX_LENGTH`
 *      (`PERMISSIONS_MAX_LENGTH = 10`) and rejects longer arrays
 *      (xrpl.js `validateDelegateSet.ts:72-76`). The factory mirrors
 *      this with a `ValidationError` at construction.
 *
 *   4. **Each `Permission` element must have exactly `{ Permission: {
 *      PermissionValue: string } }` shape.** xrpl.js rejects:
 *      null elements, more than one outer key, missing `Permission`,
 *      more than one key under `Permission`, missing `PermissionValue`,
 *      non-string `PermissionValue` (xrpl.js `validateDelegateSet.ts:
 *      79-99`). The factory runs the same shape checks at
 *      construction. The class does not model `Permissions` so cannot
 *      reason about its shape at all.
 *
 *   5. **`PermissionValue` must not be a non-delegatable transaction.**
 *      xrpl.js maintains `NON_DELEGABLE_TRANSACTIONS = { AccountSet,
 *      SetRegularKey, SignerListSet, DelegateSet, AccountDelete, Batch,
 *      EnableAmendment, SetFee, UNLModify }` (xrpl.js
 *      `validateDelegateSet.ts:12-25, 102-104`) and rejects any
 *      `PermissionValue` in that set. The factory encodes the same set
 *      and rejects at construction. Self-delegation via `DelegateSet`
 *      is therefore blocked preclaim, matching rippled's behaviour.
 *
 *   6. **`Authorize` must differ from `Account`.** xrpl.js throws
 *      `'DelegateSet: Authorize and Account must be different.'`
 *      (xrpl.js `validateDelegateSet.ts:62-66`). The class does not
 *      check this — `delegateSet({ Account: A, Delegate: A })` would
 *      pass the class's `isAccount(this.Delegate)` check.
 *
 *   7. **No duplicate `PermissionValue`s.** xrpl.js maintains a Set
 *      while iterating and throws if
 *      `permissions.length !== permissionValueSet.size`
 *      (`validateDelegateSet.ts:107-111`). The factory mirrors this.
 *
 *   8. **`Account` is validated as a classic/X-address via
 *      `isAccount`, not just as a non-empty string.** The class
 *      delegates `Account` to the base class's
 *      `validateBaseTransaction`, which only requires
 *      `typeof Account === 'string'` (`src/validation/base.ts:42-49`).
 *      The factory is consistent with all other MPT/Loan/Vault
 *      factories.
 */
import { isAccount, isString } from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

/**
 * Maximum number of `Permission` entries in a single DelegateSet
 * transaction. Mirrors xrpl.js `PERMISSIONS_MAX_LENGTH`.
 */
const PERMISSIONS_MAX_LENGTH = 10;

/**
 * Transactions that cannot be delegated, per XLS-85d / xrpl.js
 * `NON_DELEGABLE_TRANSACTIONS`. Self-delegation is included so a user
 * cannot grant themselves rights they already have by definition.
 */
const NON_DELEGABLE_TRANSACTIONS: ReadonlySet<string> = new Set([
  'AccountSet',
  'SetRegularKey',
  'SignerListSet',
  'DelegateSet',
  'AccountDelete',
  'Batch',
  // Pseudo transactions:
  'EnableAmendment',
  'SetFee',
  'UNLModify',
]);

// ─── Public types ────────────────────────────────────────────────────

/**
 * A single permission grant. Wraps a `PermissionValue` (the
 * transaction-type string being delegated) in two layers of objects
 * because that is the on-ledger shape; rippled's binary codec
 * expects exactly this nesting.
 */
export interface Permission {
  Permission: {
    PermissionValue: string;
  };
}

export interface DelegateSetProps {
  /** The unique address of the transaction sender. */
  Account: string;
  /**
   * The account being authorized to act on the sender's behalf.
   * Must be a valid XRPL classic or X-address AND must not equal
   * `Account` (self-delegation is rejected).
   */
  Authorize: string;
  /**
   * The transaction permissions being granted. Each entry must be of
   * shape `{ Permission: { PermissionValue: string } }`. At most
   * `PERMISSIONS_MAX_LENGTH` entries; no duplicate `PermissionValue`s;
   * `PermissionValue` must be a string AND must not name a
   * non-delegatable transaction.
   */
  Permissions: Permission[];
  /** Bit-flags for this transaction. The spec defines none — must be 0. */
  Flags?: number | undefined;
  /** Fee in XRP (drops), base-10 integer string. */
  Fee?: string | undefined;
  /** Account sequence number. */
  Sequence?: number | undefined;
}

export interface DelegateSet
  extends Readonly<DelegateSetProps> {
  readonly TransactionType: 'DelegateSet';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<DelegateSetProps>): DelegateSet;
}

// ─── Factory ─────────────────────────────────────────────────────────

/**
 * Build a frozen DelegateSet. Throws `ValidationError` on construction
 * if any required field is missing or malformed.
 *
 * The class-based equivalent validates lazily (caller must invoke
 * `.validate()`); this functional version validates at construction.
 * There is no way to build an invalid tx — `with()` re-runs the
 * factory, so overrides are re-validated too.
 */
export function delegateSet(props: DelegateSetProps): DelegateSet {
  // ── Account ── required, must be a valid XRPL classic/X-address.
  require(
    props.Account,
    'DelegateSet: missing or invalid Account',
    isAccount,
  );

  // ── Authorize ── required, must be a valid XRPL account AND must
  //    not equal Account (no self-delegation).
  require(
    props.Authorize,
    'DelegateSet: missing or invalid Authorize',
    isAccount,
  );
  if (props.Authorize === props.Account) {
    throw new ValidationError(
      'DelegateSet: Authorize and Account must be different',
    );
  }

  // ── Permissions ── required, must be an array.
  if (!Array.isArray(props.Permissions)) {
    throw new ValidationError(
      'DelegateSet: missing or invalid Permissions (array required)',
    );
  }

  if (props.Permissions.length > PERMISSIONS_MAX_LENGTH) {
    throw new ValidationError(
      `DelegateSet: Permissions array length cannot be greater than ${PERMISSIONS_MAX_LENGTH} (actual: ${props.Permissions.length})`,
    );
  }

  // ── Permissions ── shape + non-delegatable + duplicate checks.
  const seen = new Set<string>();
  for (const permission of props.Permissions) {
    if (
      permission == null ||
      typeof permission !== 'object' ||
      Object.keys(permission).length !== 1 ||
      permission.Permission == null ||
      typeof permission.Permission !== 'object' ||
      Object.keys(permission.Permission).length !== 1
    ) {
      throw new ValidationError(
        'DelegateSet: Permissions array element is malformed (expected { Permission: { PermissionValue: string } })',
      );
    }

    const permissionValue = permission.Permission.PermissionValue;
    if (permissionValue === undefined || permissionValue === null) {
      throw new ValidationError(
        'DelegateSet: PermissionValue must be defined',
      );
    }
    if (!isString(permissionValue)) {
      throw new ValidationError(
        'DelegateSet: PermissionValue must be a string',
      );
    }
    if (NON_DELEGABLE_TRANSACTIONS.has(permissionValue)) {
      throw new ValidationError(
        `DelegateSet: PermissionValue contains a non-delegatable transaction ${permissionValue}`,
      );
    }
    if (seen.has(permissionValue)) {
      throw new ValidationError(
        `DelegateSet: Permissions array cannot contain duplicate values (${permissionValue})`,
      );
    }
    seen.add(permissionValue);
  }

  return buildFrozenTx<DelegateSetProps, DelegateSet>(
    'DelegateSet',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: DelegateSet) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: DelegateSet, overrides: Partial<DelegateSetProps>) {
        return delegateSet(mergeForWith(this, overrides));
      },
    },
  );
}