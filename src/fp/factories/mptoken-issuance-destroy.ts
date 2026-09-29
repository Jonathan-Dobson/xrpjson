/**
 * Functional MPTokenIssuanceDestroy factory — frozen-object style.
 *
 * Permanently removes an MPTokenIssuance ledger entry. Only the issuer
 * of the MPT can submit this transaction, and only if no holders have
 * non-zero balances. Validation happens at construction; there is no
 * way to construct an invalid tx.
 *
 *   import { mptokenIssuanceDestroy } from 'xrplt/fp';
 *   const tx = mptokenIssuanceDestroy({ Account, MPTokenIssuanceID });
 *   const j = tx.toJSON();
 *
 * Affected amendments:
 *   - `MPTokensV1` — base MPTokenIssuanceDestroy.
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/mptokenissuancedestroy
 * @see XLS-0033 §3.2 (Transaction: `MPTokenIssuanceDestroy`)
 *      in `~/.mavis/docs.local/xrpl-standards/repo/XLS-0033-multi-purpose-tokens/README.md`
 * @see ripple-binary-codec `definitions.json`:
 *      `MPTokenIssuanceDestroy: [ { name: "MPTokenIssuanceID", optionality: 0 } ]`
 *      (transaction type id 55; only required field is `MPTokenIssuanceID`).
 *
 * ## Divergences
 *
 * The factory enforces three preclaim checks that the class API
 * (`src/transactions/mptoken-issuance-destroy.ts`) and xrpl.js both skip:
 *
 *   1. `MPTokenIssuanceID` must be a 48-character hex string (24 bytes /
 *      UINT192). The class only calls `isString(this.MPTokenIssuanceID)`,
 *      so any string passes — including malformed or wrong-length values.
 *      The ripple-binary-codec serializer requires exactly 24 bytes.
 *      Source: XLS-0033 §3.2.1 (`MPTokenIssuanceID` — `UINT192`);
 *              ripple-binary-codec `definitions.json`
 *              (`MPTokenIssuanceDestroy` field schema).
 *
 *   2. `MPTokenIssuanceID` must NOT be the all-zeros UINT192 value.
 *      A 48-char string of zeros would otherwise pass the hex+length
 *      check. The spec does not assign ledger entries an all-zero id;
 *      rippled would reject this with `temMALFORMED` at submit time.
 *      Source: XLS-0033 §2.1.1.1 (MPTokenIssuanceID derivation —
 *              contains a 4-byte sequence plus a 20-byte AccountID, so
 *              an all-zero value cannot be a valid issuance id);
 *              analogue with XLS-66 §3.4.3.1 (HASH256 zero rejection).
 *
 *   3. `Account` is validated as a classic/X-address via `isAccount`,
 *      not just as a non-empty string. The class API delegates Account
 *      checking to the base class's `validateBaseTransaction`, which
 *      only requires `typeof Account === 'string'`. The factory is
 *      consistent with other MPT factories (`mptokenIssuanceCreate`,
 *      `loanBrokerDelete`).
 *      Source: `src/validation/base.ts` (validateBaseTransaction —
 *              only `isString(Account)`); `src/fp/factories/
 *              mptoken-issuance-create.ts` precedent.
 */
import { isAccount, isHex, isString } from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// UINT192 = 192 bits = 24 bytes = 48 hex chars.
const MP_TOKEN_ISSUANCE_ID_LENGTH = 48;
// All-zeros UINT192 — never a valid MPTokenIssuanceID.
const MP_TOKEN_ISSUANCE_ID_ZERO = '0'.repeat(MP_TOKEN_ISSUANCE_ID_LENGTH);

// ─── Public types ────────────────────────────────────────────────────

export interface MptokenIssuanceDestroyProps {
  /** The unique address of the transaction sender (must be the MPT issuer). */
  Account: string;
  /**
   * The id of the MPTokenIssuance ledger entry to remove. UINT192 —
   * exactly 48 hex chars; must not be all-zero.
   */
  MPTokenIssuanceID: string;
  /** Bit-flags for this transaction. The spec defines none — must be 0. */
  Flags?: number | undefined;
  /** Fee in XRP (drops), base-10 integer string. */
  Fee?: string | undefined;
  /** Account sequence number. */
  Sequence?: number | undefined;
}

export interface MptokenIssuanceDestroy
  extends Readonly<MptokenIssuanceDestroyProps> {
  readonly TransactionType: 'MPTokenIssuanceDestroy';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<MptokenIssuanceDestroyProps>): MptokenIssuanceDestroy;
}

// ─── Factory ─────────────────────────────────────────────────────────

/**
 * Build a frozen MPTokenIssuanceDestroy. Throws ValidationError on
 * construction if fields are missing or malformed.
 *
 * The class-based version validates lazily (caller must invoke
 * `.validate()`); this functional version validates at construction.
 * There is no way to build an invalid tx — `with()` re-runs the factory,
 * so overrides are re-validated too.
 */
export function mptokenIssuanceDestroy(
  props: MptokenIssuanceDestroyProps,
): MptokenIssuanceDestroy {
  // ── Account ── required, must be a valid XRPL classic or X-address.
  require(
    props.Account,
    'MPTokenIssuanceDestroy: Account is required',
    isAccount,
  );

  // ── MPTokenIssuanceID ── required, 48-char hex (UINT192), non-zero.
  if (
    !isString(props.MPTokenIssuanceID) ||
    !isHex(props.MPTokenIssuanceID) ||
    props.MPTokenIssuanceID.length !== MP_TOKEN_ISSUANCE_ID_LENGTH
  ) {
    throw new ValidationError(
      `MPTokenIssuanceDestroy: MPTokenIssuanceID must be a ${MP_TOKEN_ISSUANCE_ID_LENGTH}-character hex string (UINT192)`,
    );
  }
  if (props.MPTokenIssuanceID === MP_TOKEN_ISSUANCE_ID_ZERO) {
    throw new ValidationError(
      'MPTokenIssuanceDestroy: MPTokenIssuanceID must not be zero',
    );
  }

  return buildFrozenTx<MptokenIssuanceDestroyProps, MptokenIssuanceDestroy>(
    'MPTokenIssuanceDestroy',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: MptokenIssuanceDestroy) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: MptokenIssuanceDestroy,
        overrides: Partial<MptokenIssuanceDestroyProps>,
      ) {
        return mptokenIssuanceDestroy(mergeForWith(this, overrides));
      },
    },
  );
}
