/**
 * Functional ConfidentialMPTMergeInbox factory — frozen-object style.
 *
 * Merges the holder's pending confidential inbox balance into their
 * spendable confidential balance for the named MPT issuance. Resets
 * the inbox to canonical encrypted zero and increments the spending
 * version, ensuring subsequent zero-knowledge proofs reference a
 * stable spending balance.
 *
 * Validation happens at construction; there is no way to construct
 * an invalid tx. Compare to the class-based equivalent, which exposes
 * a separate `.validate()` method you must remember to call.
 *
 *   import { confidentialMptMergeInbox } from 'xrpjson';
 *   const tx = confidentialMptMergeInbox({ Account, MPTokenIssuanceID });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Fee: '100' });
 *
 * Requires the `ConfidentialTransfer` amendment.
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/confidentialmptmergeinbox
 * @see XLS-0096 §10 — Transaction: `ConfidentialMPTMergeInbox`
 *   (https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0096-confidential-mpt)
 * @see xrpl.js — packages/xrpl/src/models/transactions/ConfidentialMPTMergeInbox.ts
 *
 * ## Divergences
 *
 * Compared with the Class API's `ConfidentialMPTMergeInbox`,
 * this factory adds guards the class skips — and is documented where
 * additional canonical guards cannot be added in a zero-dependency
 * package.
 *
 * - **`Account` is validated as a well-formed XRPL classic or X-address**
 *   at construction time, with `isAccount` (`src/validation/helpers.ts`
 *   lines 55–60). The class API delegates Account validation to its
 *   `TokenTransaction` → `Transaction` parent chain via
 *   `super.validate()`; failures therefore surface as a separate
 *   `.validate()` step rather than at `new`. We re-implement the
 *   guard inline so a malformed Account is caught at construction.
 *   - Source: xrpl.js `validateBaseTransaction` (called transitively by
 *     `validateConfidentialMPTMergeInbox`).
 *   - Source: xrpl-dev-portal `confidentialmptmergeinbox.md` JSON-Type
 *     column for `Account` (`ACCOUNTID`).
 *
 * - **`MPTokenIssuanceID` is required to be exactly 48 hex characters
 *   at construction time** (XLS-0096 §10.2 declares
 *   `MPTokenIssuanceID` as `UINT192`; xrpl-dev-portal
 *   `confidentialmptmergeinbox.md` declares the same). The class
 *   does the same check via `isHex` + `length !== 48`, but only
 *   inside `.validate()` rather than at `new`.
 *   - Source: XLS-0096 §10.2 Fields table, Internal Type = `UINT192`.
 *   - Source: xrpl-dev-portal `confidentialmptmergeinbox.md` Fields
 *     table row for `MPTokenIssuanceID`.
 *
 * - **`Account` must NOT be the issuer of `MPTokenIssuanceID`
 *   (KNOWN LIMITATION — NOT IMPLEMENTED)**. XLS-0096 §10.4.1.2
 *   mandates this as `temMALFORMED`:
 *
 *     > "The account submitting the transaction is the Issuer.
 *     > (`temMALFORMED`)"
 *
 *   xrpl.js's `validateConfidentialMPTMergeInbox`
 *   (`packages/xrpl/src/models/transactions/ConfidentialMPTMergeInbox.ts`
 *   lines 36–41) enforces this via its `isMPTIssuer(account, mptIssuanceID)`
 *   helper, which calls `decodeAccountID` (base58 + double-SHA-256
 *   checksum decoding of the classic address) and compares the
 *   resulting 20-byte AccountID against `mptIssuanceID.slice(8)` (the
 *   40-hex-char issuer portion after the 8-hex-char sequence prefix).
 *
 *   This factory cannot add this guard because the package is
 *   **zero-dependency** — base58 + checksum decoding would require
 *   either inlining a ~50-line codec or pulling in
 *   `ripple-address-codec`, neither of which fits the scope of a
 *   single-tx factory. The class API also skips this guard (it
 *   relies on `super.validate()` which does not perform the
 *   issuer check), so this is not a coverage regression relative
 *   to the class — but it remains a documented gap that consumers
 *   must validate at the integration layer (e.g. via the ledger
 *   submission result).
 *   - Source: XLS-0096 §10.4.1.2 Failure Conditions (Data Verification),
 *     item 2: `temMALFORMED` when `Account` is the Issuer.
 *   - Source: xrpl-dev-portal `confidentialmptmergeinbox.md` Error
 *     Cases table, `temMALFORMED` row.
 *   - Source: xrpl.js `ConfidentialMPTMergeInbox.ts` lines 36–41
 *     (`isMPTIssuer` guard) and `common.ts` lines 632–646
 *     (`isMPTIssuer` implementation, including the base58 + AccountID
 *     decoding dependency).
 */
import { isAccount, isHex, isString } from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// `MPTokenIssuanceID` is a `UINT192`, hex-encoded to exactly 48 chars
// (192 / 8 = 24 bytes = 48 hex chars). XLS-0096 §10.2; xrpl-dev-portal
// `confidentialmptmergeinbox.md` Fields table.
const MPT_ISSUANCE_ID_HEX_LENGTH = 48;

// ─── Public types ────────────────────────────────────────────────────

export interface ConfidentialMptMergeInboxProps {
  /** The account performing the merge. Must be a valid XRPL classic/X-address. */
  Account: string;
  /** UInt192 — MPT issuance identifier (48-char hex). */
  MPTokenIssuanceID: string;
  /** Fee in XRP (drops), base-10 integer string. */
  Fee?: string | undefined;
  /** Account sequence number. */
  Sequence?: number | undefined;
}

export interface ConfidentialMptMergeInbox
  extends Readonly<ConfidentialMptMergeInboxProps> {
  readonly TransactionType: 'ConfidentialMPTMergeInbox';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(
    overrides: Partial<ConfidentialMptMergeInboxProps>,
  ): ConfidentialMptMergeInbox;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function confidentialMptMergeInbox(
  props: ConfidentialMptMergeInboxProps,
): ConfidentialMptMergeInbox {
  // ── Account ── required, must be a valid XRPL classic/X-address.
  require(
    props.Account,
    'ConfidentialMPTMergeInbox: Account is required',
    isAccount,
  );

  // ── MPTokenIssuanceID ── required, exactly 48-char hex (UINT192).
  if (
    !isString(props.MPTokenIssuanceID) ||
    !isHex(props.MPTokenIssuanceID) ||
    props.MPTokenIssuanceID.length !== MPT_ISSUANCE_ID_HEX_LENGTH
  ) {
    throw new ValidationError(
      `ConfidentialMPTMergeInbox: MPTokenIssuanceID must be a ${MPT_ISSUANCE_ID_HEX_LENGTH}-character hex string (UInt192)`,
    );
  }

  // NOTE: `Account` must NOT be the issuer of `MPTokenIssuanceID`
  // (XLS-0096 §10.4.1.2 / xrpl.js `isMPTIssuer` guard). Not enforced
  // here — see `## Divergences` header for why.

  return buildFrozenTx<ConfidentialMptMergeInboxProps, ConfidentialMptMergeInbox>(
    'ConfidentialMPTMergeInbox',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: ConfidentialMptMergeInbox) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: ConfidentialMptMergeInbox,
        overrides: Partial<ConfidentialMptMergeInboxProps>,
      ) {
        return confidentialMptMergeInbox(mergeForWith(this, overrides));
      },
    },
  );
}