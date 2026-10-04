/**
 * Functional ConfidentialMptClawback factory — frozen-object style.
 *
 * Issuer-only operation that burns the holder's entire confidential MPT
 * balance (inbox + spending) and decrements both `OutstandingAmount` and
 * `ConfidentialOutstandingAmount`. Unlike a normal `Clawback`, the issuer
 * does not possess the holder's private ElGamal key, so it must supply a
 * `MPTAmount` (the plaintext total) and a 64-byte compact Clawback sigma
 * `ZKProof` proving that the on-ledger `IssuerEncryptedBalance` ciphertext
 * encrypts that plaintext.
 *
 * Validation happens at construction; there is no way to construct an
 * invalid tx. Compare to the class-based equivalent, which exposes a
 * separate `.validate()` method you must remember to call.
 *
 *   import { confidentialMptClawback } from 'xrpjson';
 *   const tx = confidentialMptClawback({ Account, Holder, MPTokenIssuanceID, MPTAmount, ZKProof });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Fee: '100' });
 *
 * Requires the `ConfidentialTransfer` amendment.
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/confidentialmptclawback
 * @see XLS-0096 §12 — Transaction: `ConfidentialMPTClawback`
 *   (https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0096-confidential-mpt)
 * @see xrpl.js — packages/xrpl/src/models/transactions/ConfidentialMPTClawback.ts
 *
 * ## Divergences
 *
 * Compared with the Class API's `ConfidentialMPTClawback`, this
 * factory adds guards the class skips — and is explicit about the
 * canonical guards it cannot enforce in a zero-dependency package.
 *
 * - **`Account` is validated as a well-formed XRPL classic or X-address**
 *   at construction time, with `isAccount` (`src/validation/helpers.ts`
 *   lines 55–60). The class API delegates Account validation to its
 *   `TokenTransaction` → `Transaction` parent chain via `super.validate()`;
 *   failures therefore surface as a separate `.validate()` step rather
 *   than at `new`. We re-implement the guard inline so a malformed Account
 *   is caught at construction.
 *   - Source: xrpl.js `validateBaseTransaction` (called transitively by
 *     `validateConfidentialMPTClawback`).
 *   - Source: xrpl-dev-portal `confidentialmptclawback.md` JSON-Type
 *     column for `Account` (`ACCOUNTID`).
 *
 * - **`Holder` is validated as a well-formed XRPL classic or X-address**
 *   at construction time. The class also checks this (`isAccount`), but
 *   only inside `.validate()` rather than at `new`.
 *   - Source: XLS-0096 §12.2 Fields table, Internal Type = `ACCOUNTID`
 *     for `Holder`.
 *   - Source: xrpl-dev-portal `confidentialmptclawback.md` Fields table
 *     row for `Holder` (`ACCOUNTID`).
 *
 * - **`MPTAmount` is bounded to the canonical UInt64 range and rejected
 *   for non-numeric / non-integer / out-of-range / "MAX+1" form.** The class
 *   only checks `MPTAmount !== '0'`, allowing `'9223372036854775808'`
 *   (one past max uint64) to pass through and rely on the ledger to reject
 *   it. xrpl.js's `validateConfidentialMPTAmount` (called via
 *   `validateConfidentialMPTClawback` with `allowZero = false`) enforces
 *   both `INTEGER_SANITY_CHECK` (`/^[0-9]+$/u`) and
 *   `MPTAmount <= MAX_MPT_AMOUNT (= 9223372036854775807)`.
 *   - Source: xrpl.js `validateConfidentialMPTAmount`
 *     (`packages/xrpl/src/models/transactions/common.ts` lines 596–608).
 *   - Source: xrpl.js `MAX_MPT_AMOUNT` (same file, line 48).
 *   - Source: xrpl.js test `ConfidentialMPTClawback.test.ts` cases
 *     "throws w/ zero MPTAmount", "throws w/ out-of-range MPTAmount",
 *     "throws w/ non-numeric MPTAmount".
 *   - Source: XLS-0096 §12.4.1 item 5: `MPTAmount` is zero or exceeds
 *     the maximum limits → `temBAD_AMOUNT`.
 *
 * - **`Account` must NOT equal `Holder` (KNOWN LIMITATION — NOT
 *   IMPLEMENTED)**. XLS-0096 §12.4.1.3 mandates this as `temMALFORMED`:
 *
 *     > "The `Account` is attempting to claw back from itself
 *     > (`Account` == `Holder`). (`temMALFORMED`)"
 *
 *   xrpl.js's `validateConfidentialMPTClawback` (lines 59–63) enforces
 *   this via a direct string comparison.
 *
 *   The class API also skips this guard (it relies on `super.validate()`
 *   which does not perform the self-clawback check), so this is not a
 *   coverage regression relative to the class. Adding the guard is
 *   trivially possible in this factory (a single string comparison), so
 *   we **do** add it here — making the factory strictly more correct
 *   than the class API.
 *   - Source: XLS-0096 §12.4.1.3 Failure Conditions (Data Verification),
 *     item 3: `temMALFORMED` when `Account` == `Holder`.
 *   - Source: xrpl-dev-portal `confidentialmptclawback.md` Error Cases
 *     table, `temMALFORMED` row, "The `Account` and the `Holder` are
 *     the same".
 *   - Source: xrpl.js `ConfidentialMPTClawback.ts` lines 59–63.
 *
 * - **`Account` must be the issuer of `MPTokenIssuanceID` (KNOWN
 *   LIMITATION — NOT IMPLEMENTED)**. XLS-0096 §12.4.1.2 mandates this as
 *   `temMALFORMED`:
 *
 *     > "The `Account` is not the issuer of the `MPTokenIssuanceID`.
 *     > (`temMALFORMED`)"
 *
 *   xrpl.js's `validateConfidentialMPTClawback` (lines 53–57) enforces
 *   this via its `isMPTIssuer(account, mptIssuanceID)` helper, which
 *   calls `decodeAccountID` (base58 + double-SHA-256 checksum decoding of
 *   the classic address) and compares the resulting 20-byte AccountID
 *   against `mptIssuanceID.slice(8)` (the 40-hex-char issuer portion
 *   after the 8-hex-char sequence prefix).
 *
 *   This factory cannot add this guard because the package is
 *   **zero-dependency** — base58 + checksum decoding would require
 *   either inlining a ~50-line codec or pulling in
 *   `ripple-address-codec`, neither of which fits the scope of a
 *   single-tx factory. The class API also skips this guard (it relies on
 *   `super.validate()` which does not perform the issuer check), so this
 *   is not a coverage regression relative to the class — but it remains
 *   a documented gap that consumers must validate at the integration
 *   layer (e.g. via the ledger submission result).
 *   - Source: XLS-0096 §12.4.1.2 Failure Conditions (Data Verification),
 *     item 2: `temMALFORMED` when `Account` is not the issuer.
 *   - Source: xrpl-dev-portal `confidentialmptclawback.md` Error Cases
 *     table, `temMALFORMED` row.
 *   - Source: xrpl.js `ConfidentialMPTClawback.ts` lines 53–57
 *     (`isMPTIssuer` guard) and `common.ts` lines 632–646
 *     (`isMPTIssuer` implementation, including the base58 + AccountID
 *     decoding dependency).
 */
import type { BasePropsFields } from '../../types/base.js';
import { isAccount, isHex, isString } from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// `MPTokenIssuanceID` is a `UINT192`, hex-encoded to exactly 48 chars
// (192 / 8 = 24 bytes = 48 hex chars). XLS-0096 §12.2; xrpl-dev-portal
// `confidentialmptclawback.md` Fields table.
const MPT_ISSUANCE_ID_HEX_LENGTH = 48;

// ZKProof is a 64-byte blob, hex-encoded to 128 chars
// (XLS-0096 §12.2: `BLOB`; xrpl.js `CONFIDENTIAL_CLAWBACK_PROOF_BYTES = 64`).
const ZK_PROOF_HEX_LENGTH = 128;

// `MPTAmount` is a `UINT64` per XLS-0096 §12.2. The maximum is 2^63 − 1
// (signed integer range), matching xrpl.js's `MAX_MPT_AMOUNT`. Integer
// form is required (no decimals, no leading sign) per xrpl.js
// `INTEGER_SANITY_CHECK = /^[0-9]+$/u`.
const MAX_MPT_AMOUNT = BigInt('9223372036854775807');
const INTEGER_SANITY_CHECK = /^[0-9]+$/u;

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
export interface ConfidentialMptClawbackProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  /** Issuer AccountID — must be the issuer of `MPTokenIssuanceID`. */
  Account: string;
  /** AccountID — the holder being clawed back from. */
  Holder: string;
  /** UInt192 — MPT issuance identifier (48-char hex). */
  MPTokenIssuanceID: string;
  /** UInt64 — plaintext total to claw back. */
  MPTAmount: string;
  /** 64-byte Clawback sigma proof (128-char hex). */
  ZKProof: string;
}

export interface ConfidentialMptClawback
  extends Readonly<ConfidentialMptClawbackProps> {
  readonly TransactionType: 'ConfidentialMPTClawback';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(
    overrides: Partial<ConfidentialMptClawbackProps>,
  ): ConfidentialMptClawback;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function confidentialMptClawback(
  props: ConfidentialMptClawbackProps,
): ConfidentialMptClawback {
  // ── Account ── required, must be a valid XRPL classic/X-address.
  require(
    props.Account,
    'ConfidentialMPTClawback: Account is required',
    isAccount,
  );

  // ── Holder ── required, must be a valid XRPL classic/X-address.
  require(
    props.Holder,
    'ConfidentialMPTClawback: Holder is required',
    isAccount,
  );

  // ── MPTokenIssuanceID ── required, exactly 48-char hex (UINT192).
  if (
    !isString(props.MPTokenIssuanceID) ||
    !isHex(props.MPTokenIssuanceID) ||
    props.MPTokenIssuanceID.length !== MPT_ISSUANCE_ID_HEX_LENGTH
  ) {
    throw new ValidationError(
      `ConfidentialMPTClawback: MPTokenIssuanceID must be a ${MPT_ISSUANCE_ID_HEX_LENGTH}-character hex string (UInt192)`,
    );
  }

  // ── MPTAmount ── required, non-empty integer string, in [1, 2^63-1].
  if (!isString(props.MPTAmount)) {
    throw new ValidationError('ConfidentialMPTClawback: MPTAmount is required');
  }
  if (!INTEGER_SANITY_CHECK.test(props.MPTAmount)) {
    throw new ValidationError(
      'ConfidentialMPTClawback: MPTAmount must be a non-negative base-10 integer string',
    );
  }
  const amount = BigInt(props.MPTAmount);
  if (amount === BigInt(0)) {
    throw new ValidationError(
      'ConfidentialMPTClawback: MPTAmount must be non-zero',
    );
  }
  if (amount > MAX_MPT_AMOUNT) {
    throw new ValidationError(
      `ConfidentialMPTClawback: MPTAmount out of range (max ${MAX_MPT_AMOUNT.toString()})`,
    );
  }

  // ── ZKProof ── required, exactly 128-char hex (64 bytes).
  if (!isString(props.ZKProof) || !isHex(props.ZKProof) || props.ZKProof.length !== ZK_PROOF_HEX_LENGTH) {
    throw new ValidationError(
      `ConfidentialMPTClawback: ZKProof must be a ${ZK_PROOF_HEX_LENGTH}-character hex string (64 bytes)`,
    );
  }

  // ── Account != Holder ── issuer cannot claw back from itself
  //   (XLS-0096 §12.4.1.3). The class API skips this guard.
  if (props.Account === props.Holder) {
    throw new ValidationError(
      'ConfidentialMPTClawback: Holder and Account must be different',
    );
  }

  // NOTE: `Account` must be the issuer of `MPTokenIssuanceID`
  // (XLS-0096 §12.4.1.2 / xrpl.js `isMPTIssuer` guard). Not enforced
  // here — see `## Divergences` header for why.

  // ─── Base transaction fields ───
  // Catches the seven shared fields this factory now accepts through
  // `BasePropsFields` but does not otherwise check: Memos, SourceTag,
  // LastLedgerSequence, AccountTxnID, NetworkID, Delegate, TicketSequence.
  // Placed AFTER the ConfidentialMPTClawback-specific checks so a more specific
  // message wins for a more specific mistake, and this acts as the backstop for
  // everything shared across transaction types.
  //
  // `TransactionType` is supplied because the validator checks a transaction,
  // not a props bag — the factory injects it in `buildFrozenTx` below.
  validateBaseTransaction({ TransactionType: 'ConfidentialMPTClawback', ...props });

  return buildFrozenTx<ConfidentialMptClawbackProps, ConfidentialMptClawback>(
    'ConfidentialMPTClawback',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: ConfidentialMptClawback) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: ConfidentialMptClawback,
        overrides: Partial<ConfidentialMptClawbackProps>,
      ) {
        return confidentialMptClawback(mergeForWith(this, overrides));
      },
    },
  );
}