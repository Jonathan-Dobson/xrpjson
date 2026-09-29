/**
 * Functional MPTokenAuthorize factory — frozen-object style.
 *
 * Authorize or deauthorize an account to hold a Multi-Purpose Token (MPT),
 * or for an issuer running allow-listing, authorize/deauthorize a holder.
 * Validation happens at construction; there is no way to construct an
 * invalid tx.
 *
 *   import { mptokenAuthorize } from 'xrplt/fp';
 *   const tx = mptokenAuthorize({
 *     Account: HOLDER,
 *     MPTokenIssuanceID: '000004C463C52827307480341125DA0577DEFC38405B0E3E',
 *   });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Flags: 0x00000001 }); // tfMPTUnauthorize
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/mptokenauthorize
 *
 * ## Divergences
 *
 * The class-based API at `src/transactions/mptoken-authorize.ts` (and
 * xrpl.js's `validateMPTokenAuthorize`) is missing two rules that the
 * canonical sources require. The factory fills them:
 *
 *   1. `MPTokenIssuanceID` must be a 48-character uppercase-or-lowercase
 *      hex string and must not be all-zero.
 *      The class only checks that the field is a string (`isString`), so
 *      a wrong-length string, a non-hex string, or all-zero (`'00…00'`,
 *      48 chars) all pass. The spec declares the field a `UInt192` —
 *      exactly 24 bytes — and a value of zero is malformed.
 *      Source: XLS-0033 §3.5.1 (`UInt192` internal type);
 *              xrpl-dev-portal `mptokenauthorize.md` (Field table:
 *              `MPTokenIssuanceID | String | UInt192 | Yes`).
 *
 *   2. `Holder` must not equal `Account`.
 *      The class only checks that `Holder`, when present, is a valid XRPL
 *      address. The spec requires `Holder` to be omitted when the
 *      transaction is submitted by the holder — i.e. `Holder == Account`
 *      is malformed.
 *      Source: XLS-0033 §3.5.1 ("Specifies the holder's address that the
 *              issuer wants to authorize. Only used for authorization
 *              /allow-listing; should not be present if submitted by the
 *              holder.");
 *              xrpl-dev-portal `mptokenauthorize.md` (Field table, Holder
 *              description: "must be omitted if submitted by the holder").
 */
import type { MPTokenAuthorizeFlagsInterface } from '../../types/flags.js';
import { isAccount, isHex, isString } from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// `UInt192` internal type: 24 bytes = 48 hex characters.
const MP_TOKEN_ISSUANCE_ID_LENGTH = 48;

// ─── Public types ────────────────────────────────────────────────────

export interface MptokenAuthorizeProps {
  /** The transaction sender. May be a holder (opt-in) or an issuer (allow-listing). */
  Account: string;
  /** The ID of the MPT issuance, encoded as a 48-character hex `UInt192`. */
  MPTokenIssuanceID: string;
  /**
   * Optional holder address. Only valid when the transaction is submitted
   * by an issuer for allow-listing. Must be omitted when `Account` is
   * itself the holder.
   */
  Holder?: string | undefined;
  /** Bit-flags for this transaction. Currently only `tfMPTUnauthorize` (0x1) is defined. */
  Flags?: number | MPTokenAuthorizeFlagsInterface | undefined;
  Fee?: string | undefined;
  Sequence?: number | undefined;
}

export interface MptokenAuthorize
  extends Readonly<MptokenAuthorizeProps> {
  readonly TransactionType: 'MPTokenAuthorize';
  /** No-op: validation already happened at construction. */
  validate(): void;
  /** Serialize to a plain object matching `xrpl.js` input shape. */
  toJSON(): Record<string, unknown>;
  /** Derive a new MptokenAuthorize with overrides applied; re-validates. */
  with(overrides: Partial<MptokenAuthorizeProps>): MptokenAuthorize;
}

// ─── Factory ─────────────────────────────────────────────────────────

/**
 * Build a frozen MPTokenAuthorize. Throws ValidationError on
 * construction if fields are missing or malformed.
 *
 * The class-based version validates lazily (caller must invoke
 * `.validate()`); this functional version validates at construction.
 * There is no way to build an invalid tx — `with()` re-runs the factory,
 * so overrides are re-validated too.
 */
export function mptokenAuthorize(
  props: MptokenAuthorizeProps,
): MptokenAuthorize {
  // ─── Account ─── required, must be a valid XRPL classic address.
  require(
    props.Account,
    'MPTokenAuthorize: Account is required',
    isAccount,
  );

  // ─── MPTokenIssuanceID ─── required, 48-char hex, non-zero.
  if (
    !isString(props.MPTokenIssuanceID) ||
    !isHex(props.MPTokenIssuanceID) ||
    props.MPTokenIssuanceID.length !== MP_TOKEN_ISSUANCE_ID_LENGTH
  ) {
    throw new ValidationError(
      `MPTokenAuthorize: MPTokenIssuanceID must be a ${MP_TOKEN_ISSUANCE_ID_LENGTH}-character hex string`,
    );
  }
  // All-zero `UInt192` is malformed per the spec.
  if (/^0+$/u.test(props.MPTokenIssuanceID)) {
    throw new ValidationError(
      'MPTokenAuthorize: MPTokenIssuanceID must not be zero',
    );
  }

  // ─── Holder ─── optional, but if present must be a valid XRPL
  // address AND must differ from `Account`. The latter rule is the
  // spec mandate "must be omitted if submitted by the holder" — a
  // holder submitting this transaction is opting in (or out) for
  // themselves; specifying themselves as `Holder` is malformed.
  if (props.Holder !== undefined) {
    if (!isAccount(props.Holder)) {
      throw new ValidationError('MPTokenAuthorize: invalid Holder');
    }
    if (props.Holder === props.Account) {
      throw new ValidationError(
        'MPTokenAuthorize: Holder must be omitted when Account is itself the holder',
      );
    }
  }

  return buildFrozenTx<MptokenAuthorizeProps, MptokenAuthorize>(
    'MPTokenAuthorize',
    props,
    {
      validate() {
        // Construction-time validation is the contract.
      },
      toJSON(this: MptokenAuthorize) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: MptokenAuthorize,
        overrides: Partial<MptokenAuthorizeProps>,
      ) {
        return mptokenAuthorize(mergeForWith(this, overrides));
      },
    },
  );
}
