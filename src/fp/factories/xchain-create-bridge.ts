/**
 * Functional XChainCreateBridge factory — frozen-object style.
 *
 * Defines a new cross-chain bridge on the chain the transaction is
 * sent from. The transaction creates a `Bridge` ledger entry owned by
 * the door account. The same transaction must be submitted by the
 * corresponding door account on the other chain to complete bridge
 * setup. Validation happens at construction; there is no way to
 * construct an invalid tx.
 *
 *   import { xchainCreateBridge } from 'xrpjson';
 *   const tx = xchainCreateBridge({
 *     Account: 'rhWQzvdmhf5vFS35vtKUSUwNZHGT53qQsg',
 *     XChainBridge: {
 *       LockingChainDoor: 'rhWQzvdmhf5vFS35vtKUSUwNZHGT53qQsg',
 *       LockingChainIssue: { currency: 'XRP' },
 *       IssuingChainDoor: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
 *       IssuingChainIssue: { currency: 'XRP' },
 *     },
 *     SignatureReward: '200',
 *   });
 *   const j = tx.toJSON();
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/xchaincreatebridge
 * @see https://github.com/XRPLF/xrpl.js/blob/main/packages/xrpl/src/models/transactions/XChainCreateBridge.ts
 * @see XLS-0038 (Cross-Chain Bridge) §2.2.1
 *     (`~/.mavis/docs.local/xrpl-standards/repo/XLS-0038-cross-chain-bridge/README.md`
 *     lines 300–332)
 *
 * ## Divergences
 *
 * Compared with the Class API's `XChainCreateBridge`, this factory
 * adds guards the class skips (or that xrpl.js / xrpl.org / XLS-38
 * mandate but the class omits):
 *
 * - **`Account` must be a valid XRPL classic or X-address.** The class
 *   accepts any non-empty string — only the base transaction
 *   `super.validate()` is invoked. xrpl.js's
 *   `validateBaseTransaction` (which `validateXChainCreateBridge`
 *   delegates to) requires a string; we additionally enforce the XRPL
 *   classic/X-address format at construction, matching every other fp
 *   factory.
 *   - Source: xrpl.js
 *     `~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/common.ts`
 *     `validateBaseTransaction`.
 *   - Cross-ref: rippled `XChainBridge.cpp` `preflight` parses
 *     `Account` as `STAccount`; only valid XRPL classic addresses
 *     parse. xrpl.org `xchaincreatebridge.md` example line 28 lists
 *     `Account` as the door account on the locking chain.
 *
 * - **`XChainBridge` is fully shape-validated.** xrpl.js
 *   `XChainCreateBridge.ts:51` calls
 *   `validateRequiredField(tx, 'XChainBridge', isXChainBridge)`,
 *   which requires exactly 4 keys, two `AccountID` door strings, and
 *   two `Issue` currency objects (`{currency: 'XRP'}` or
 *   `{currency, issuer}`). Our class only verifies `isRecord`, which
 *   accepts any object (including `{}` or `{foo: 'bar'}`). The factory
 *   uses the local `isXChainBridge` helper to enforce the full shape.
 *   - Source: xrpl.js `common.ts` `isXChainBridge` (lines 444–453);
 *     `isIssuedCurrency` (lines 282–291).
 *   - Source: XLS-38 §2.2.1.1.1 line 322 (`XChainBridge` is required,
 *     `XCHAIN_BRIDGE` internal type).
 *   - Source: xrpl.org `xchaincreatebridge.md` lines 56–61 (the four
 *     sub-fields are each required: `IssuingChainDoor`,
 *     `IssuingChainIssue`, `LockingChainDoor`, `LockingChainIssue`).
 *   - Cross-ref: our `src/validation/helpers.ts` `isXChainBridge`
 *     (lines 168–177) mirrors the xrpl.js check.
 *
 * - **Both `XChainBridge` doors must be valid XRPL classic
 *   addresses.** `isXChainBridge` only checks that the door strings
 *   are strings; rippled parses them as `STAccount`. The factory
 *   additionally runs `isAccount` on each door so a malformed door
 *   string is caught at construction. This is especially important
 *   for `XChainCreateBridge` because the spec mandates that
 *   `Account` (the sender) must match the `LockingChainDoor` on the
 *   locking chain and `rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh` is the
 *   only valid `IssuingChainDoor` for an XRP-XRP bridge (it must be
 *   the genesis account). The factory's door-format check is a
 *   preclaim for both fields.
 *   - Source: rippled `XChainBridge.cpp` (`sfLockingChainDoor`,
 *     `sfIssuingChainDoor` parsed as `STAccount`).
 *   - Source: xrpl.org `xchaincreatebridge.md` line 58 (IssuingChainDoor
 *     is `AccountID`); line 60 (LockingChainDoor is `AccountID`).
 *   - Source: XLS-38 §2.1.1.1.2 lines 175–180 (`XChainBridge`
 *     `XCHAIN_BRIDGE` internal type; `LockingChainDoor`,
 *     `LockingChainIssue`, `IssuingChainDoor`, `IssuingChainIssue`
 *     all required).
 *
 * - **`SignatureReward` must be a non-negative XRP drops string.**
 *   XLS-38 §2.1.1.1.3 line 200: "The total amount, **in XRP**, to be
 *   rewarded for providing a signature for a cross-chain transfer or
 *   for signing for the cross-chain reward. This will be split among
 *   the signers." xrpl.org `xchaincreatebridge.md` line 50 lists
 *   `SignatureReward` as `Currency Amount`, and the example JSON
 *   (line 39) shows `"SignatureReward": 200`. xrpl.js
 *   `XChainCreateBridge.ts:53` only runs `isAmount`, which
 *   accepts any of: XRP drops string, IOU object, or MPT object. The
 *   factory enforces XRP-only (drops string) with `≥ 0` (zero is
 *   permitted; a bridge may opt out of witness payment). This matches
 *   the XLS-38 wording and rippled's `STAmount` parse for
 *   `sfSignatureReward` on a bridge object, and mirrors our sibling
 *   `xchainAccountCreateCommit` factory.
 *   - Source: XLS-38 §2.1.1.1.3 line 200 ("in XRP").
 *   - Source: xrpl.org `xchaincreatebridge.md` line 39 (example JSON
 *     uses a numeric Amount).
 *   - Source: XLS-38 §2.2.1.1.2 line 328 (`SignatureReward` field).
 *   - Cross-ref: rippled `XChainBridge.cpp` parses `SignatureReward`
 *     as `STAmount` with XRP constraint.
 *
 * - **`MinAccountCreateAmount`, when present, must be a non-negative
 *   XRP drops string.** xrpl.org line 49: "The minimum amount, **in
 *   XRP**, required for a `XChainAccountCreateCommit` transaction.
 *   If this isn't present, the `XChainAccountCreateCommit`
 *   transaction will fail. **This field can only be present on
 *   XRP-XRP bridges.**" XLS-38 §2.1.1.1.4 line 204 repeats the
 *   same. The class accepts any `Amount` (via the `isAmount` helper
 *   inherited from the base); xrpl.js's
 *   `XChainCreateBridge.ts:55` does the same. The factory
 *   rejects IOU/MPT forms at construction and additionally rejects
 *   non-canonical wire forms (leading zeros, decimals, exponents)
 *   to mirror the strict sibling behavior. Optional: when omitted,
 *   the bridge is created without a minimum and
 *   `XChainAccountCreateCommit` will fail against it.
 *   - Source: xrpl.org `xchaincreatebridge.md` line 49 ("in XRP";
 *     "can only be present on XRP-XRP bridges").
 *   - Source: XLS-38 §2.1.1.1.4 line 204 ("in XRP"; "XRP-XRP
 *     bridges only").
 *   - Source: XLS-38 §2.2.1.1.3 line 332 (`MinAccountCreateAmount`
 *     field).
 *   - Cross-ref: rippled `XChainBridge.cpp` parses
 *     `MinAccountCreateAmount` as `STAmount` with XRP constraint.
 *
 * - **`Account` should equal `XChainBridge.LockingChainDoor`.** The
 *   transaction "must be submitted first by the locking chain door
 *   account" per xrpl.org `xchaincreatebridge.md` line 15; the
 *   example JSON (lines 28, 30) sets `Account` and
 *   `LockingChainDoor` to the same address. The factory enforces this
 *   equality at construction. The class does not (it accepts any
 *   `Account` shape and leaves the door mismatch to on-ledger
 *   rejection). Note: an issuing-chain submission uses the
 *   `IssuingChainDoor` instead, but the canonical example shows the
 *   locking-side submission; this equality check is therefore a
 *   preclaim tightening, not a hard spec rule.
 *   - Source: xrpl.org `xchaincreatebridge.md` line 15 ("must be
 *     submitted first by the locking chain door account").
 *   - Source: xrpl.org example JSON (lines 28, 30) — `Account`
 *     equals `LockingChainDoor`.
 *   - Cross-ref: rippled `XChainBridge.cpp` preflight checks that
 *     `tx[sfAccount]` matches the door account implied by the
 *     `XChainBridge` structure; otherwise rejects with `temMALFORMED`.
 *
 * - **`Flags` accepted for parity with the base transaction shape.**
 *   XChainCreateBridge defines no transaction-specific flags; only
 *   `tfFullyCanonicalSig` (global) is normally meaningful. The class
 *   does not declare a `Flags` field. We accept a numeric bitmask
 *   for parity with other factories; non-zero flags are stored
 *   verbatim. (Documented for awareness; no spec source requires
 *   flag rejection.)
 *
 * - **No `Amount` field.** `XChainCreateBridge` does not include an
 *   `Amount` field — only `SignatureReward` and the optional
 *   `MinAccountCreateAmount`. The factory correctly omits
 *   `Amount`/`Destination`. (Sanity note; included to prevent
 *   future API drift.)
 *   - Source: XLS-38 §2.2.1.1 fields table (lines 316–320); no
 *     `Amount` row.
 *   - Source: xrpl.org `xchaincreatebridge.md` Fields table
 *     (lines 47–51); no `Amount` row.
 */
import type { XChainBridge } from '../../types/common.js';
import type { BasePropsFields } from '../../types/base.js';
import { isAccount, isString, isXChainBridge } from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Helpers ─────────────────────────────────────────────────────────

const XRP_DROPS_REGEX = /^[0-9]+$/u;

/**
 * Non-negative XRP drops Amount. Accepts canonical XRP drops mantissa
 * form (decimal integer string with no exponent, no decimal point —
 * the wire format used by Amount fields in XChainBridge-related
 * transactions) and rejects zero, negative, and non-numeric values
 * via the strictly-positive wrapper.
 *
 * For XChainCreateBridge, both `SignatureReward` and
 * `MinAccountCreateAmount` may legitimately be `'0'` (a bridge may
 * opt out of witness payment; `MinAccountCreateAmount` defaults to 0
 * when omitted). Zero is therefore allowed.
 */
function isNonNegativeXrpAmount(value: unknown): boolean {
  if (!isString(value)) return false;
  if (!XRP_DROPS_REGEX.test(value)) return false;
  // Reject leading zeros (e.g., '01', '00100') — the XRPL wire format
  // rejects these. `'0'` itself is the only valid zero.
  if (value.length > 1 && value.startsWith('0')) return false;
  return true;
}

/**
 * Validate XChainBridge object shape: 4 keys with both doors as valid
 * XRPL classic/X addresses and both issues as valid Issue forms. The
 * local `isXChainBridge` helper checks the structural 4-key + Issue
 * shape; we add XRPL-account format validation on the two doors.
 */
function assertValidXChainBridge(bridge: XChainBridge): void {
  if (!isAccount(bridge.LockingChainDoor)) {
    throw new ValidationError(
      'XChainCreateBridge: XChainBridge.LockingChainDoor must be a valid XRPL account address',
    );
  }
  if (!isAccount(bridge.IssuingChainDoor)) {
    throw new ValidationError(
      'XChainCreateBridge: XChainBridge.IssuingChainDoor must be a valid XRPL account address',
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
export interface XchainCreateBridgeProps
  extends Omit<BasePropsFields, 'TransactionType' | 'Flags'> {
  /** The unique address of the transaction sender — the door account
   *  on the chain the bridge is being defined on. For a locking-chain
   *  submission, this MUST equal `XChainBridge.LockingChainDoor`
   *  (xrpl.org line 15, rippled preflight). */
  Account: string;
  /** The bridge (door accounts and assets) to create. Required;
   *  must be a fully-shaped `XChainBridge` (4 keys, two valid XRPL
   *  doors, two valid Issue forms). */
  XChainBridge: XChainBridge;
  /** The total amount to pay the witness servers for their
   *  signatures (XRP drops, ≥ 0). This amount will be split among
   *  the signers. */
  SignatureReward: string;
  /** Optional. The minimum amount, in XRP, required for a
   *  `XChainAccountCreateCommit` transaction against this bridge.
   *  May only be present on XRP-XRP bridges; defaults to 0 when
   *  omitted. */
  MinAccountCreateAmount?: string | undefined;
  /** Bit-flags for this transaction. XChainCreateBridge has no
   *  defined flags; only `tfFullyCanonicalSig` (global) is meaningful.
   *  Accepted for parity with the base tx shape. */
  Flags?: number | undefined;
}

export interface XchainCreateBridge
  extends Readonly<XchainCreateBridgeProps> {
  readonly TransactionType: 'XChainCreateBridge';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<XchainCreateBridgeProps>): XchainCreateBridge;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function xchainCreateBridge(
  props: XchainCreateBridgeProps,
): XchainCreateBridge {
  // ── Account ── required, must be a valid XRPL classic or X-address.
  require(
    props.Account,
    'XChainCreateBridge: Account is required',
    isAccount,
  );

  // ── XChainBridge ── required, full shape (4 keys, both doors valid
  //    XRPL accounts, both issues valid Issue forms). The factory
  //    uses the local `isXChainBridge` helper for the structural
  //    shape (see validation/helpers.ts lines 168–177) and
  //    additionally verifies the door strings are valid XRPL accounts.
  require(
    props.XChainBridge,
    'XChainCreateBridge: XChainBridge is required and must have shape {LockingChainDoor, LockingChainIssue, IssuingChainDoor, IssuingChainIssue}',
    isXChainBridge,
  );
  // `props.XChainBridge` is now type-narrowed to XChainBridge —
  // verify the doors are valid XRPL accounts (the helper only
  // checks `typeof === 'string'`).
  assertValidXChainBridge(props.XChainBridge);

  // ── Account must equal LockingChainDoor (locking-chain submission).
  //    xrpl.org line 15: "The transaction must be submitted first by
  //    the locking chain door account." The example JSON shows
  //    `Account === LockingChainDoor`. (For an issuing-chain
  //    submission the analogous preflight uses IssuingChainDoor; we
  //    do not enforce that case here — see Spec Ambiguities #3.)
  if (props.Account !== props.XChainBridge.LockingChainDoor) {
    throw new ValidationError(
      'XChainCreateBridge: Account must equal XChainBridge.LockingChainDoor (transaction must be submitted by the locking-chain door account)',
    );
  }

  // ── SignatureReward ── required, non-negative XRP drops string.
  if (!isNonNegativeXrpAmount(props.SignatureReward)) {
    throw new ValidationError(
      'XChainCreateBridge: SignatureReward must be a non-negative XRP drops string (in XRP, ≥ 0; XLS-38 §2.1.1.1.3 line 200)',
    );
  }

  // ── MinAccountCreateAmount ── optional. When present, must be a
  //    non-negative XRP drops string. The spec limits this field to
  //    XRP-XRP bridges (xrpl.org line 49 / XLS-38 §2.1.1.1.4 line
  //    204). We do not detect IOU-IOU bridges here; the IOU form of
  //    the amount is rejected by the XRP-drops format check.
  if (props.MinAccountCreateAmount !== undefined) {
    if (!isNonNegativeXrpAmount(props.MinAccountCreateAmount)) {
      throw new ValidationError(
        'XChainCreateBridge: MinAccountCreateAmount must be a non-negative XRP drops string (in XRP, ≥ 0; XRP-XRP bridges only — xrpl.org line 49)',
      );
    }
  }

  // ─── Base transaction fields ───
  // Catches the seven shared fields this factory now accepts through
  // `BasePropsFields` but does not otherwise check: Memos, SourceTag,
  // LastLedgerSequence, AccountTxnID, NetworkID, Delegate, TicketSequence.
  // Placed AFTER the XChainCreateBridge-specific checks so a more specific
  // message wins for a more specific mistake, and this acts as the backstop
  // for everything shared across transaction types.
  //
  // `TransactionType` is supplied because the validator checks a transaction,
  // not a props bag — the factory injects it in `buildFrozenTx` below.
  validateBaseTransaction({ TransactionType: 'XChainCreateBridge', ...props });

  return buildFrozenTx<XchainCreateBridgeProps, XchainCreateBridge>(
    'XChainCreateBridge',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: XchainCreateBridge) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: XchainCreateBridge,
        overrides: Partial<XchainCreateBridgeProps>,
      ) {
        return xchainCreateBridge(mergeForWith(this, overrides));
      },
    },
  );
}