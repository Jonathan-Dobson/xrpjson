/**
 * Functional XChainAccountCreateCommit factory — frozen-object style.
 *
 * Commits funds on the source chain to create a new account on the
 * destination chain via a witness-attested bridge. Validation happens at
 * construction; there is no way to construct an invalid tx from the fields it
 * models.
 *
 *   import { xchainAccountCreateCommit } from 'xrpjson';
 *   const tx = xchainAccountCreateCommit({
 *     Account,
 *     Amount: '20000000',
 *     SignatureReward: '100',
 *     Destination: 'rD323VyRjgzzhY4bFpo44rmyh2neB5d8Mo',
 *     XChainBridge: {
 *       LockingChainDoor: 'rMAXACCrp3Y8PpswXcg3bKggHX76V3F8M4',
 *       LockingChainIssue: { currency: 'XRP' },
 *       IssuingChainDoor: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
 *       IssuingChainIssue: { currency: 'XRP' },
 *     },
 *   });
 *   const j = tx.toJSON();
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/xchainaccountcreatecommit
 * @see https://github.com/XRPLF/xrpl.js/blob/main/packages/xrpl/src/models/transactions/XChainAccountCreateCommit.ts
 * @see XLS-0038 (Cross-Chain Bridge) §2.4.1
 *     (`~/.mavis/docs.local/xrpl-standards/repo/XLS-0038-cross-chain-bridge/README.md`
 *     lines 565–606)
 *
 * Affected amendments:
 *   - `XChainBridge` — required for the transaction to be accepted.
 *
 * ## Divergences
 *
 * Compared with the Class API's `XChainAccountCreateCommit`,
 * this factory adds guards the class skips (or that xrpl.js / xrpl.org
 * / XLS-38 mandate but the class omits):
 *
 * - **`Account` must be a valid XRPL classic or X-address.** The class
 *   accepts any non-empty string — only the base transaction
 *   `super.validate()` is invoked. xrpl.js's
 *   `validateBaseTransaction` (which `validateXChainAccountCreateCommit`
 *   delegates to) enforces a valid classic address; we mirror that at
 *   construction.
 *   - Source: xrpl.js
 *     `~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/common.ts`
 *     `validateBaseTransaction`.
 *   - Cross-ref: rippled parses `Account` as `STAccount` via the generic
 *     JSON leaf parser — `src/libxrpl/protocol/STParsedJSON.cpp::parseLeaf`
 *     (case `STI_ACCOUNT`); the field's serialised type is `ACCOUNT`
 *     (`include/xrpl/protocol/detail/sfields.macro`,
 *     `TYPED_SFIELD(sfAccount, ACCOUNT, 1)`). Note rippled's `parseLeaf`
 *     also accepts a 40-char hex account, so "classic address" is not the
 *     whole story — the X-address tolerance comes from xrpl.js, not rippled.
 *
 * - **`Destination` must be a valid XRPL classic or X-address.**
 *   xrpl.js `validateXChainAccountCreateCommit` (line 66) calls
 *   `validateRequiredField(tx, 'Destination', isAccount)`. The class
 *   does not validate `Destination` at all (no `validate()` check, just
 *   `declare readonly Destination`).
 *   - Source: xrpl.js `XChainAccountCreateCommit.ts` line 66
 *     (`isAccount`).
 *   - Source: xrpl.org `xchainaccountcreatecommit.md` line 48
 *     (`AccountID` internal type).
 *   - Cross-ref: rippled parses `Destination` as `STAccount`; only
 *     valid XRPL classic addresses parse. XLS-38 §2.4.1.1.4 line 604
 *     defines `Destination` as `ACCOUNT`.
 *
 * - **`XChainBridge` is fully shape-validated.** xrpl.js's
 *   `validateXChainAccountCreateCommit` (line 62) calls
 *   `validateRequiredField(tx, 'XChainBridge', isXChainBridge)`, which
 *   requires exactly 4 keys, two `AccountID` door strings, and two
 *   `Issue` currency objects (`{currency: 'XRP'}` or
 *   `{currency, issuer}`). Our class only verifies `isRecord`, which
 *   accepts any object (including `{}` or `{foo: 'bar'}`). The factory
 *   uses the local `isXChainBridge` helper to enforce the full shape.
 *   - Source: xrpl.js `common.ts` `isXChainBridge` (lines 444–453);
 *     `isIssuedCurrency` (lines 282–291).
 *   - Source: XLS-38 §2.1.1.1.2 lines 175–180 (`XChainBridge`
 *     `XCHAIN_BRIDGE` internal type; `LockingChainDoor`,
 *     `LockingChainIssue`, `IssuingChainDoor`, `IssuingChainIssue`
 *     all required).
 *   - Cross-ref: our `src/validation/helpers.ts` `isXChainBridge`
 *     (lines 168–177) mirrors the xrpl.js check.
 *
 * - **Both `XChainBridge` doors must be valid XRPL classic
 * X addresses.** `isXChainBridge` only checks that the door strings are
 * strings; rippled parses them as `STAccount`. The factory additionally
 * runs `isAccount` on each door so a malformed door string is caught
 * at construction.
 *   - Source: rippled parses both doors as `STAccount` in the bridge's JSON
 *     constructor — `src/libxrpl/protocol/STXChainBridge.cpp::STXChainBridge(SField const&, json::Value const&)`
 *     (`parseBase58<AccountID>`; a bad door throws at deserialisation, not
 *     at preclaim). Field types:
 *     `include/xrpl/protocol/detail/sfields.macro`
 *     (`TYPED_SFIELD(sfLockingChainDoor, ACCOUNT, 22)`,
 *     `TYPED_SFIELD(sfIssuingChainDoor, ACCOUNT, 23)`).
 *   - Cross-ref: XLS-38 §2.1.1.1.2 line 177 (`LockingChainDoor` is
 *     `ACCOUNT`); line 179 (`IssuingChainDoor` is `ACCOUNT`).
 *
 * - **`Amount` must be a strictly-positive XRP drops string.** xrpl.org
 *   `xchainaccountcreatecommit.md` line 47 states: "The amount, **in
 *   XRP**, to use for account creation." XLS-38 §2.4.1.1.3 line 600
 *   repeats "The amount, in XRP, to use for account creation." The
 *   transaction is "for XRP-XRP bridges only" per XLS-38 §2.4.1 line
 *   571 ("This transaction can only be used for XRP-XRP bridges").
 *   The class and xrpl.js both accept any `Amount` form (IOU object,
 *   MPT object, or XRP string); for an XRP-XRP-only transaction this
 *   is too permissive — an IOU/MPT `Amount` would be rejected on-ledger
 *   as `temBAD_AMOUNT`. The factory enforces XRP-only (drops string)
 *   AND `> 0` (must exceed `MinAccountCreateAmount`, which is itself
 *   positive).
 *   - Source: xrpl.org `xchainaccountcreatecommit.md` line 47 ("in
 *     XRP").
 *   - Source: XLS-38 §2.4.1 line 571 ("XRP-XRP bridges only").
 *   - Source: XLS-38 §2.4.1.1.3 line 602 (Amount in XRP).
 *   - Cross-ref: rippled enforces the XRP-only constraint in
 *     `src/libxrpl/tx/transactors/bridge/XChainBridge.cpp::XChainCreateAccountCommit::preflight`
 *     — `if (amount.signum() <= 0 || !amount.native()) return temBAD_AMOUNT;`
 *     (preflight, not preclaim) — and
 *     `::XChainCreateAccountCommit::preclaim` rejects a non-XRP
 *     destination-chain issue with `tecXCHAIN_CREATE_ACCOUNT_NONXRP_ISSUE`.
 *
 * - **`SignatureReward` must be a non-negative XRP drops string.**
 *   xrpl.org line 49: "The amount, **in XRP**, to be used to reward
 *   the witness servers for providing signatures." XLS-38 §2.4.1.1.2
 *   line 592 repeats it. As with `Amount`, the class and xrpl.js accept
 *   any `Amount` form; for an XRP-XRP-only bridge, IOU/MPT forms are
 *   out-of-spec. The factory enforces XRP-only (drops string) with
 *   `≥ 0` (zero is permitted; the value must match the bridge's
 *   `SignatureReward`, which may legitimately be zero if the bridge
 *   chooses to pay no witnesses).
 *   - Source: xrpl.org `xchainaccountcreatecommit.md` line 49 ("in
 *     XRP").
 *   - Source: XLS-38 §2.4.1.1.2 line 592 (SignatureReward in XRP).
 *   - Cross-ref: rippled enforces this in
 *     `src/libxrpl/tx/transactors/bridge/XChainBridge.cpp::XChainCreateAccountCommit::preflight`
 *     — `if (reward.signum() < 0 || !reward.native()) return temBAD_AMOUNT;`
 *     (negative rejected, zero permitted) — and
 *     `::XChainCreateAccountCommit::preclaim` requires the submitted reward
 *     to equal the bridge's stored `sfSignatureReward`
 *     (`tecXCHAIN_REWARD_MISMATCH`).
 *
 * - **`Amount` does NOT include the `Signers` array.** rippled's
 *   `XChainCreateAccountCommit` does not accept a `Signers` field
 *   (witness attestations arrive via separate `XChainAddAccountCreateAttestation`
 *   transactions, not as part of this tx). The class API does not
 *   declare `Signers`, but this is documented here to flag the
 *   apparent confusion in the task brief, which described
 *   `OtherChainDestination` as an optional field on this transaction.
 *   `OtherChainDestination` is a field on `XChainCommit` (XLS-38
 *   §2.3.2.1.4 line 422), NOT on `XChainAccountCreateCommit`. The
 *   factory correctly omits both fields.
 *   - Source: XLS-38 §2.4.1.1 fields table (lines 581–586); no
 *     `OtherChainDestination` row.
 *   - Source: XLS-38 §2.3.2.1.4 line 422 (`OtherChainDestination` is
 *     a `XChainCommit` field).
 *
 * - **`Flags` accepted for parity with the base transaction shape.**
 *   XChainAccountCreateCommit itself defines no transaction-specific
 *   flags; only `tfFullyCanonicalSig` (global) is normally meaningful.
 *   The class does not declare a `Flags` field. We accept a numeric
 *   bitmask for parity with `loan-set.ts` / `payment-channel-create.ts`.
 *   This is a permissive addition, not a tightening; callers who pass
 *   a non-zero Flags get the value stored verbatim. (Divergence
 *   documented for awareness; no spec source requires flag rejection
 *   for XChainAccountCreateCommit.)
 */
import type { XChainBridge } from '../../types/common.js';
import type { BasePropsFields } from '../../types/base.js';
import { isAccount, isString, isXChainBridge } from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// XRPL UInt64 max (4-byte unsigned). Used for non-negative integer
// validation helpers in the future; not directly needed here since
// XRP drops strings are decimal.
const XRP_DROPS_REGEX = /^[0-9]+$/u;

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Strictly-positive XRP drops Amount. Accepts canonical XRP drops
 * mantissa form (decimal integer string with no exponent, no decimal
 * point — the wire format used by Amount fields in XChainBridge-related
 * transactions) and rejects zero, negative, and non-numeric values.
 */
function isStrictlyPositiveXrpAmount(value: unknown): boolean {
  if (!isString(value)) return false;
  if (!XRP_DROPS_REGEX.test(value)) return false;
  // Reject leading zeros (e.g., '01', '00100') — the XRPL wire format
  // rejects these. `'0'` itself is the only valid zero.
  if (value.length > 1 && value.startsWith('0')) return false;
  return value !== '0';
}

/**
 * Non-negative XRP drops Amount. Same as the strictly-positive variant
 * but allows '0'. Used for SignatureReward.
 */
function isNonNegativeXrpAmount(value: unknown): boolean {
  if (!isString(value)) return false;
  if (!XRP_DROPS_REGEX.test(value)) return false;
  if (value.length > 1 && value.startsWith('0')) return false;
  return true;
}

/**
 * Validate XChainBridge object shape: 4 keys with both doors as valid
 * XRPL classic/X addresses and both issues as valid Issue forms (XRP
 * or IOU). The local `isXChainBridge` helper checks the structural
 * 4-key + Issue shape; we add XRPL-account format validation on the
 * two doors.
 */
function assertValidXChainBridge(bridge: XChainBridge): void {
  if (!isAccount(bridge.LockingChainDoor)) {
    throw new ValidationError(
      'XChainAccountCreateCommit: XChainBridge.LockingChainDoor must be a valid XRPL account address',
    );
  }
  if (!isAccount(bridge.IssuingChainDoor)) {
    throw new ValidationError(
      'XChainAccountCreateCommit: XChainBridge.IssuingChainDoor must be a valid XRPL account address',
    );
  }
}

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
export interface XchainAccountCreateCommitProps
  extends Omit<BasePropsFields, 'TransactionType' | 'Flags'> {
  /** The unique address of the transaction sender (the source-chain
   *  account that pays `Amount + SignatureReward`). */
  Account: string;
  /** The bridge to create accounts for. */
  XChainBridge: XChainBridge;
  /** The amount, in XRP, to use for account creation on the destination
   *  chain. Strictly positive (> 0). */
  Amount: string;
  /** The amount, in XRP, to be used to reward the witness servers for
   *  providing signatures. Must match the bridge's `SignatureReward`.
   *  Non-negative (≥ 0). */
  SignatureReward: string;
  /** The destination account on the destination chain. */
  Destination: string;
  /** Bit-flags for this transaction. XChainAccountCreateCommit has no
   *  defined flags; only `tfFullyCanonicalSig` (global) is meaningful.
   *  Accepted for parity with the base tx shape. */
  Flags?: number | undefined;
}

export interface XchainAccountCreateCommit
  extends Readonly<XchainAccountCreateCommitProps> {
  readonly TransactionType: 'XChainAccountCreateCommit';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(
    overrides: Partial<XchainAccountCreateCommitProps>,
  ): XchainAccountCreateCommit;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function xchainAccountCreateCommit(
  props: XchainAccountCreateCommitProps,
): XchainAccountCreateCommit {
  // ── Account ── required, must be a valid XRPL classic or X-address.
  require(
    props.Account,
    'XChainAccountCreateCommit: Account is required',
    isAccount,
  );

  // ── XChainBridge ── required, full shape (4 keys, both doors valid
  //    XRPL accounts, both issues valid Issue forms). The factory
  //    uses the local `isXChainBridge` helper for the structural
  //    shape (see validation/helpers.ts lines 168–177) and additionally
  //    verifies the door strings are valid XRPL accounts.
  require(
    props.XChainBridge,
    'XChainAccountCreateCommit: XChainBridge is required and must have shape {LockingChainDoor, LockingChainIssue, IssuingChainDoor, IssuingChainIssue}',
    isXChainBridge,
  );
  // Now `props.XChainBridge` is type-narrowed to XChainBridge — verify
  // the doors are valid XRPL accounts (the helper only checks
  // `typeof === 'string'`).
  assertValidXChainBridge(props.XChainBridge);

  // ── Amount ── required, strictly-positive XRP drops string.
  if (!isStrictlyPositiveXrpAmount(props.Amount)) {
    throw new ValidationError(
      'XChainAccountCreateCommit: Amount must be a strictly-positive XRP drops string (in XRP, > 0; XLS-38 §2.4.1: XRP-XRP bridges only)',
    );
  }

  // ── SignatureReward ── required, non-negative XRP drops string.
  if (!isNonNegativeXrpAmount(props.SignatureReward)) {
    throw new ValidationError(
      'XChainAccountCreateCommit: SignatureReward must be a non-negative XRP drops string (in XRP, ≥ 0)',
    );
  }

  // ── Destination ── required, must be a valid XRPL account.
  require(
    props.Destination,
    'XChainAccountCreateCommit: Destination is required',
    isAccount,
  );

  // ─── Base transaction fields ───
  // Catches the seven shared fields this factory now accepts through
  // `BasePropsFields` but does not otherwise check: Memos, SourceTag,
  // LastLedgerSequence, AccountTxnID, NetworkID, Delegate, TicketSequence.
  // Placed AFTER the XChainAccountCreateCommit-specific checks so a more
  // specific message wins for a more specific mistake, and this acts as the
  // backstop for everything shared across transaction types.
  //
  // `TransactionType` is supplied because the validator checks a transaction,
  // not a props bag — the factory injects it in `buildFrozenTx` below.
  validateBaseTransaction({
    TransactionType: 'XChainAccountCreateCommit',
    ...props,
  });

  return buildFrozenTx<XchainAccountCreateCommitProps, XchainAccountCreateCommit>(
    'XChainAccountCreateCommit',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: XchainAccountCreateCommit) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: XchainAccountCreateCommit,
        overrides: Partial<XchainAccountCreateCommitProps>,
      ) {
        return xchainAccountCreateCommit(mergeForWith(this, overrides));
      },
    },
  );
}