/**
 * Functional PermissionedDomainDelete factory — frozen-object style.
 *
 * Deletes a `PermissionedDomain` ledger entry. Only the domain owner can
 * submit this transaction (the ledger enforces this; not locally checkable
 * here). Validation happens at construction; there is no way to construct
 * an invalid tx.
 *
 *   import { permissionedDomainDelete } from 'xrpjson';
 *   const tx = permissionedDomainDelete({ Account, DomainID });
 *   const j = tx.toJSON();
 *
 * PermissionedDomainDelete has no Flags field per the spec — the
 * xrpl-dev-portal docs ("PermissionedDomainDelete Flags") state
 * "There are no flags defined for PermissionedDomainDelete
 * transactions." This factory therefore omits a `Flags` field entirely.
 *
 * Affected amendments:
 *   - `PermissionedDomains` — base PermissionedDomainDelete.
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/permissioneddomaindelete
 * @see XLS-0080 §4 (Transaction: `PermissionedDomainDelete`) in
 *      `~/.mavis/docs.local/xrpl-standards/repo/XLS-0080-permissioned-domains/README.md`
 *
 * ## Divergences
 *
 * What: `Account` is validated as a well-formed XRPL classic or X-address.
 *
 * Why: xrpl.js's `validatePermissionedDomainDelete`
 *      (`~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/
 *      transactions/permissionedDomainDelete.ts` line 25) calls
 *      `validateBaseTransaction`, which checks Account via `isAccount`
 *      (well-formed XRPL address). The local class API's
 *      `validateBaseTransaction` (`src/validation/base.ts` lines 28–32)
 *      only checks `isString(Account)`, missing the address-format guard
 *      that xrpl.js performs. A malformed Account therefore passes the
 *      class constructor and only fails at the deferred `.validate()`
 *      step. The factory matches xrpl.js's strictness at construction
 *      time.
 *
 * Source citation:
 *   - xrpl.js `validatePermissionedDomainDelete` at
 *     `~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/
 *     transactions/permissionedDomainDelete.ts` (line 22–28 — calls
 *     `validateBaseTransaction(tx)` + `validateRequiredField(tx,
 *     'DomainID', isString)`).
 *   - Local `validateBaseTransaction` at `src/validation/base.ts`
 *     (lines 28–32 — only does `isString(tx['Account'])`).
 *   - Local helper `isAccount` at `src/validation/helpers.ts`
 *     (lines 55–60 — regex check for classic or X-address format).
 */
import { isAccount, isDomainID } from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Public types ────────────────────────────────────────────────────

export interface PermissionedDomainDeleteProps {
  /** The unique address of the transaction sender. Must be the domain owner. */
  Account: string;
  /** The ledger entry ID of the Permissioned Domain to delete. 64-char hex. */
  DomainID: string;
  /** Fee in XRP (drops), base-10 integer string. */
  Fee?: string | undefined;
  /** Account sequence number. */
  Sequence?: number | undefined;
}

export interface PermissionedDomainDelete
  extends Readonly<PermissionedDomainDeleteProps> {
  readonly TransactionType: 'PermissionedDomainDelete';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(
    overrides: Partial<PermissionedDomainDeleteProps>,
  ): PermissionedDomainDelete;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function permissionedDomainDelete(
  props: PermissionedDomainDeleteProps,
): PermissionedDomainDelete {
  // ── Account ── required, must be a valid XRPL classic/X-address.
  // Strict address-format check (matches xrpl.js's `isAccount`) rather
  // than the class API's looser `isString(Account)` check.
  require(
    props.Account,
    'PermissionedDomainDelete: Account is required',
    isAccount,
  );

  // ── DomainID ── required, 64-char hex (Hash256).
  // Per XLS-0080 §4.1, DomainID is `Hash256`. The `isDomainID` helper
  // enforces `isString + length === 64 + isHex` — same checks as the
  // class, restated locally because the factory has no base class.
  if (!isDomainID(props.DomainID)) {
    throw new ValidationError(
      'PermissionedDomainDelete: DomainID must be a 64-character hex string',
    );
  }

  return buildFrozenTx<PermissionedDomainDeleteProps, PermissionedDomainDelete>(
    'PermissionedDomainDelete',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: PermissionedDomainDelete) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: PermissionedDomainDelete,
        overrides: Partial<PermissionedDomainDeleteProps>,
      ) {
        return permissionedDomainDelete(mergeForWith(this, overrides));
      },
    },
  );
}
