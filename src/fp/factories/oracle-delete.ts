/**
 * Functional OracleDelete factory — frozen-object style.
 *
 * Deletes a `PriceOracle` ledger entry. Only the owner of the oracle can
 * send this transaction. Validation happens at construction; there is no
 * way to construct an invalid tx.
 *
 *   import { oracleDelete } from 'xrpjson';
 *   const tx = oracleDelete({ Account, OracleDocumentID: 34 });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Fee: '15' });
 *
 * Affected amendments:
 *   - `PriceOracle` — base OracleDelete.
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/oracledelete
 * @see XLS-0047 (Price Oracles) §"Transaction for deleting Oracle instance"
 *      in `~/.mavis/docs.local/xrpl-standards/repo/XLS-0047-PriceOracles/README.md`
 *      (lines 191–223).
 *
 * ## Divergences
 *
 * The class-based API at the Class API's `OracleDelete` and xrpl.js's
 * `validateOracleDelete` both skip two rules that the canonical sources
 * require. The factory fills them:
 *
 *   1. `OracleDocumentID` must be an unsigned 32-bit integer.
 *      The class and xrpl.js only check `typeof === 'number'` (the class
 *      uses the local `isNumber`, xrpl.js's `isNumber` is identical).
 *      That allows NaN, ±Infinity, fractional values, negative numbers,
 *      and values > 2^32 − 1 to pass. XLS-0047 and the on-ledger codec
 *      both require `UINT32` (an integer in [0, 0xFFFFFFFF]).
 *      The factory rejects anything that fails that range/integer check.
 *      Source: XLS-0047 §"Transaction for deleting Oracle instance"
 *              (`~/.mavis/docs.local/xrpl-standards/repo/XLS-0047-PriceOracles/README.md`)
 *              line 209 (`UINT32` Internal Type for `OracleDocumentID`).
 *      Source: xrpl.js `validateOracleDelete`
 *              (`~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/oracleDelete.ts`)
 *              lines 28–32 — `validateRequiredField(tx, 'OracleDocumentID', isNumber)`
 *              with `isNumber = (n) => typeof n === 'number'` (common.ts
 *              line 209). No integer/range check.
 *      Source: ripple-binary-codec `definitions.json`
 *              (`~/.mavis/docs.local/xrpl.js/repo/packages/ripple-binary-codec/src/enums/definitions.json`)
 *              line 4722 (OracleDelete field declaration) — `OracleDocumentID`
 *              is a `UInt32` STInteger.
 *
 *   2. `Account` must be a valid XRPL classic or X-address.
 *      The class does not validate `Account` at all (it relies on the
 *      base `Transaction.validate()`). The factory validates it via
 *      `isAccount`, consistent with every other fp factory. The on-ledger
 *      `temINVALID_ACCOUNT` check would otherwise only fire at submit
 *      time.
 *      Source: XLS-0047 §"Transaction for deleting Oracle instance"
 *              (`~/.mavis/docs.local/xrpl-standards/repo/XLS-0047-PriceOracles/README.md`)
 *              line 208 (`ACCOUNTID` Internal Type for `Account`) and
 *              line 220 ("The `Account` account doesn't exist").
 *      Source: xrpl.org `oracledelete.md`
 *              (`~/.mavis/docs.local/xrpl-dev-portal/repo/docs/references/protocol/transactions/types/oracledelete.md`)
 *              line 13 ("Only the owner of the price oracle can send
 *              this transaction") — implying the Account must be a
 *              valid XRPL account.
 */
import { isAccount, isNumber } from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// OracleDocumentID is a UInt32 per XLS-0047 §"Transaction for deleting
// Oracle instance" (line 209: `UINT32` Internal Type).
const MAX_UINT32 = 0xffffffff;

// ─── Public types ────────────────────────────────────────────────────

export interface OracleDeleteProps {
  /** The owner of the PriceOracle (must equal `PriceOracle.Owner`). */
  Account: string;
  /**
   * The unique identifier of the price oracle for `Account`.
   * UInt32 — integer in [0, 0xFFFFFFFF].
   */
  OracleDocumentID: number;
  /** Fee in XRP (drops), base-10 integer string. */
  Fee?: string | undefined;
  /** Account sequence number. */
  Sequence?: number | undefined;
}

export interface OracleDelete extends Readonly<OracleDeleteProps> {
  readonly TransactionType: 'OracleDelete';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<OracleDeleteProps>): OracleDelete;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function oracleDelete(props: OracleDeleteProps): OracleDelete {
  // ── Account ── required, must be a valid XRPL classic or X-address.
  require(
    props.Account,
    'OracleDelete: Account is required',
    isAccount,
  );

  // ── OracleDocumentID ── required, UInt32 (integer in [0, 0xFFFFFFFF]).
  if (
    !isNumber(props.OracleDocumentID) ||
    !Number.isInteger(props.OracleDocumentID) ||
    props.OracleDocumentID < 0 ||
    props.OracleDocumentID > MAX_UINT32
  ) {
    throw new ValidationError(
      `OracleDelete: OracleDocumentID must be an integer in [0, ${MAX_UINT32}] (UInt32)`,
    );
  }

  return buildFrozenTx<OracleDeleteProps, OracleDelete>(
    'OracleDelete',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: OracleDelete) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: OracleDelete,
        overrides: Partial<OracleDeleteProps>,
      ) {
        return oracleDelete(mergeForWith(this, overrides));
      },
    },
  );
}