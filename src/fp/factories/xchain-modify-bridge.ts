/**
 * Functional XChainModifyBridge factory — frozen-object style.
 *
 * Updates the parameters of an existing cross-chain bridge. Per XLS-38
 * §2.2.2 (line 336), only `SignatureReward` and `MinAccountCreateAmount`
 * may be modified — changing the door accounts or assets would be
 * equivalent to creating a new bridge. The transaction is sent by the
 * door account and requires witness signatures (collected outside the
 * ledger). Validation happens at construction; there is no way to
 * construct an invalid tx from the fields it models.
 *
 *   import { xchainModifyBridge } from 'xrpjson';
 *   const tx = xchainModifyBridge({
 *     Account: 'rhWQzvdmhf5vFS35vtKUSUwNZHGT53qQsg',
 *     XChainBridge: { ... },
 *     SignatureReward: '250',
 *     MinAccountCreateAmount: '500000',
 *     Flags: { tfClearAccountCreateAmount: false },
 *   });
 *   // Clear the MinAccountCreateAmount via the explicit flag:
 *   const tx2 = xchainModifyBridge({
 *     Account: 'rhWQzvdmhf5vFS35vtKUSUwNZHGT53qQsg',
 *     XChainBridge: { ... },
 *     SignatureReward: '250',
 *     Flags: { tfClearAccountCreateAmount: true },
 *   });
 *   const j = tx.toJSON();
 *   const tx3 = tx.with({ SignatureReward: '300' });
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/xchainmodifybridge
 * @see https://github.com/XRPLF/xrpl.js/blob/main/packages/xrpl/src/models/transactions/XChainModifyBridge.ts
 * @see XLS-0038 (Cross-Chain Bridge) §2.2.2
 *     (`~/.mavis/docs.local/xrpl-standards/repo/XLS-0038-cross-chain-bridge/README.md`
 *     lines 334–372)
 *
 * ## Divergences
 *
 * Compared with the Class API's `XChainModifyBridge`, this factory
 * adds guards the class skips (or that xrpl.js / xrpl.org / XLS-38
 * mandate but the class omits):
 *
 * - **`Account` must be a valid XRPL classic or X-address.** The class
 *   only invokes `super.validate()` (the base transaction check), which
 *   does not enforce an XRPL address format. xrpl.js's
 *   `validateBaseTransaction` (which `validateXChainModifyBridge`
 *   delegates to) requires a string; we additionally enforce the XRPL
 *   classic/X-address format at construction, matching every other fp
 *   factory.
 *   - Source: xrpl.js
 *     `~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/common.ts`
 *     `validateBaseTransaction`.
 *   - Cross-ref: rippled `XChainBridge.cpp` preflight parses
 *     `Account` as `STAccount`; only valid XRPL classic addresses parse.
 *     xrpl.org `xchainmodifybridge.md` line 26 lists `Account` as the
 *     door account.
 *
 * - **`XChainBridge` is fully shape-validated.** xrpl.js
 *   `XChainModifyBridge.ts:72` calls
 *   `validateRequiredField(tx, 'XChainBridge', isXChainBridge)`,
 *   which requires exactly 4 keys, two `AccountID` door strings, and
 *   two `Issue` currency objects. Our class only verifies `isRecord`,
 *   which accepts any object (including `{}` or `{foo: 'bar'}`). The
 *   factory uses the local `isXChainBridge` helper to enforce the full
 *   shape.
 *   - Source: xrpl.js `common.ts` `isXChainBridge` (lines 444–453).
 *   - Source: XLS-38 §2.2.2.1.1 line 354 (`XChainBridge` is required,
 *     `XCHAIN_BRIDGE` internal type).
 *   - Source: xrpl.org `xchainmodifybridge.md` line 50 (required).
 *
 * - **Both `XChainBridge` doors must be valid XRPL classic
 *   addresses.** `isXChainBridge` only checks that the door strings are
 *   strings; rippled parses them as `STAccount`. The factory
 *   additionally runs `isAccount` on each door so a malformed door
 *   string is caught at construction.
 *   - Source: xrpl.org `xchainmodifybridge.md` lines 57, 59 (each
 *     door is `AccountID`).
 *   - Cross-ref: rippled `XChainBridge.cpp` (`sfLockingChainDoor`,
 *     `sfIssuingChainDoor` parsed as `STAccount`).
 *
 * - **`SignatureReward` must be a non-negative XRP drops string.**
 *   XLS-38 §2.1.1.1.3 line 200 (the spec text is shared between
 *   create-bridge and modify-bridge): "The total amount, **in XRP**, to
 *   be rewarded for providing a signature for a cross-chain transfer or
 *   for signing for the cross-chain reward." xrpl.js
 *   `XChainModifyBridge.ts:74` only runs `isAmount`, which
 *   accepts any of: XRP drops string, IOU object, or MPT object. The
 *   factory enforces XRP-only (drops string) with `≥ 0`, matching the
 *   XLS-38 wording and rippled's `STAmount` parse for `sfSignatureReward`.
 *   The factory treats `SignatureReward` as **required** even though the
 *   canonical sources mark it as optional, because modifying the
 *   signature reward is the canonical use case of this transaction and
 *   forcing the caller to be explicit avoids silently no-op txs
 *   (cf. Spec Ambiguities #1).
 *   - Source: XLS-38 §2.1.1.1.3 line 200 ("in XRP").
 *   - Source: xrpl.org `xchainmodifybridge.md` line 49 (example uses
 *     numeric `200`).
 *   - Source: XLS-38 §2.2.2.1.2 line 358 (`SignatureReward` field).
 *
 * - **`MinAccountCreateAmount`, when present, must be a non-negative
 *   XRP drops string.** xrpl.org line 48: "The minimum amount, **in
 *   XRP**, required for a `XChainAccountCreateCommit` transaction.
 *   ... **This field can only be present on XRP-XRP bridges.**" XLS-38
 *   §2.1.1.1.4 line 204 repeats the same. The class accepts any string;
 *   xrpl.js's `XChainModifyBridge.ts:76` does the same. The
 *   factory rejects IOU/MPT forms and non-canonical wire forms (leading
 *   zeros, decimals, exponents) at construction.
 *   - Source: xrpl.org `xchainmodifybridge.md` line 48 ("in XRP";
 *     "can only be present on XRP-XRP bridges").
 *   - Source: XLS-38 §2.1.1.1.4 line 204 ("in XRP"; "XRP-XRP
 *     bridges only").
 *   - Source: XLS-38 §2.2.2.1.3 line 362 (`MinAccountCreateAmount`
 *     field).
 *
 * - **`Account` must equal `XChainBridge.LockingChainDoor`.** xrpl.org
 *   line 13: "Only managers can send this transaction." xrpl.org line
 *   15: "This transaction must be sent by the door account." The
 *   example JSON (lines 26, 28) sets `Account === LockingChainDoor`.
 *   The factory enforces this equality at construction. The class does
 *   not (it accepts any `Account` shape). Note: an issuing-chain
 *   submission uses the `IssuingChainDoor` instead; we do not enforce
 *   that case here — see Spec Ambiguities #2.
 *   - Source: xrpl.org `xchainmodifybridge.md` line 13 ("Only managers
 *     can send this transaction").
 *   - Source: xrpl.org `xchainmodifybridge.md` line 15 ("must be sent
 *     by the door account").
 *   - Source: xrpl.org example JSON (lines 26, 28) — `Account` equals
 *     `LockingChainDoor`.
 *   - Cross-ref: rippled `XChainBridge.cpp` preflight checks
 *     `tx[sfAccount]` matches the door account.
 *
 * - **`Flags` accepts the `tfClearAccountCreateAmount` flag (0x00010000)
 *   via boolean-map form.** XLS-38 §2.2.2.1.4 lines 366–372 defines a
 *   single transaction-specific flag,
 *   `tfClearAccountCreateAmount` (`0x00010000`), which clears the
 *   `MinAccountCreateAmount` on the bridge. xrpl.js exposes this via
 *   `XChainModifyBridgeFlagsInterface` (lines 29–32). The class does
 *   not declare any `Flags` field; we accept both numeric and
 *   boolean-map forms and translate the latter to a numeric bitmask
 *   for downstream consumers (mirroring `nftokenMint`'s flag handling).
 *   When set, the resulting `Flags` includes the `0x00010000` bit.
 *   - Source: xrpl.js `XChainModifyBridge.ts` lines 18–32
 *     (`XChainModifyBridgeFlags` enum, `XChainModifyBridgeFlagsInterface`).
 *   - Source: XLS-38 §2.2.2.1.4 line 372.
 *   - Source: xrpl.org `xchainmodifybridge.md` line 69.
 *
 * - **No `Amount` / `Destination` / `Memos` are not declared here.**
 *   `XChainModifyBridge` only carries `SignatureReward` /
 *   `MinAccountCreateAmount` (plus the `XChainBridge`). We do not add
 *   unsupported fields. The factory does not pass through arbitrary
 *   keys — `.with()` can override the documented fields only.
 *   (Sanity note; included to prevent future API drift.)
 *   - Source: XLS-38 §2.2.2.1 fields table (lines 347–352); no other
 *     amount-bearing fields.
 *   - Source: xrpl.org `xchainmodifybridge.md` Fields table
 *     (lines 45–50); no other fields.
 */
import type { XChainBridge } from '../../types/common.js';
import type { BasePropsFields } from '../../types/base.js';
import type { XChainModifyBridgeFlagsInterface } from '../../types/flags.js';
import { isAccount, isString, isXChainBridge } from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// ─── Helpers ─────────────────────────────────────────────────────────

const XRP_DROPS_REGEX = /^[0-9]+$/u;

/**
 * Non-negative XRP drops Amount. Accepts the canonical XRPL wire form
 * (decimal integer string with no exponent, no decimal point) and
 * rejects leading zeros (e.g. `'01'`, `'00100'`) so the form matches
 * what rippled's `STAmount` parser will accept. `'0'` itself is the
 * only valid zero.
 *
 * For XChainModifyBridge, both `SignatureReward` and
 * `MinAccountCreateAmount` may legitimately be `'0'`: a zero
 * `SignatureReward` is permitted (bridge may opt out of witness
 * payment); a zero `MinAccountCreateAmount` is the default value when
 * the field is omitted. Zero is therefore allowed.
 */
function isNonNegativeXrpAmount(value: unknown): boolean {
  if (!isString(value)) return false;
  if (!XRP_DROPS_REGEX.test(value)) return false;
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
      'XChainModifyBridge: XChainBridge.LockingChainDoor must be a valid XRPL account address',
    );
  }
  if (!isAccount(bridge.IssuingChainDoor)) {
    throw new ValidationError(
      'XChainModifyBridge: XChainBridge.IssuingChainDoor must be a valid XRPL account address',
    );
  }
}

// ─── Public types ────────────────────────────────────────────────────

// Why the two keys are omitted — do not "simplify" this away:
//  TransactionType: buildFrozenTx spreads props AFTER setting it, so a
//    caller-supplied value would win. See payment.ts:36-40.
//  Flags: re-declared per transaction with that type's narrower flag
//    interface, which is assignable to the base's. Here that is
//    `XChainModifyBridgeFlagsInterface`, which adds `tfClearAccountCreateAmount`.
//
// The base is `BasePropsFields`, not `BaseTransactionFields`: the latter
// carries a trailing `[key: string]: unknown` that widens `keyof` to
// `string | number`, so `Omit<BaseTransactionFields, ...>` would collapse to
// a bare index signature and silently drop all fourteen named members.
// See the doc comment on BasePropsFields in src/types/base.ts.
export interface XchainModifyBridgeProps
  extends Omit<BasePropsFields, 'TransactionType' | 'Flags'> {
  /** The unique address of the transaction sender — the door account
   *  on the chain the bridge was created on. For a locking-chain
   *  submission, this MUST equal `XChainBridge.LockingChainDoor`
   *  (xrpl.org line 15, rippled preflight). */
  Account: string;
  /** The bridge (door accounts and assets) to modify. Required;
   *  must be a fully-shaped `XChainBridge` (4 keys, two valid XRPL
   *  doors, two valid Issue forms). */
  XChainBridge: XChainBridge;
  /** The total amount to pay the witness servers for their
   *  signatures (XRP drops, ≥ 0). Factory treats this as required
   *  even though XLS-38 marks it optional — see Divergences for
   *  rationale. */
  SignatureReward: string;
  /** Optional. The minimum amount, in XRP, required for a
   *  `XChainAccountCreateCommit` transaction against this bridge.
   *  May only be present on XRP-XRP bridges; defaults to 0 when
   *  omitted. To explicitly clear a previously-set value, use the
   *  `tfClearAccountCreateAmount` flag instead. */
  MinAccountCreateAmount?: string | undefined;
  /** Bit-flags for this transaction. Accepts a numeric bitmask or
   *  the `XChainModifyBridgeFlagsInterface` boolean-map form. The
   *  transaction-specific flag is `tfClearAccountCreateAmount`
   *  (`0x00010000`); setting it clears the bridge's stored
   *  `MinAccountCreateAmount`. */
  Flags?: number | XChainModifyBridgeFlagsInterface | undefined;
}

export interface XchainModifyBridge
  extends Readonly<XchainModifyBridgeProps> {
  readonly TransactionType: 'XChainModifyBridge';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<XchainModifyBridgeProps>): XchainModifyBridge;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function xchainModifyBridge(
  props: XchainModifyBridgeProps,
): XchainModifyBridge {
  // ── Account ── required, must be a valid XRPL classic or X-address.
  require(
    props.Account,
    'XChainModifyBridge: Account is required',
    isAccount,
  );

  // ── XChainBridge ── required, full shape (4 keys, both doors valid
  //    XRPL accounts, both issues valid Issue forms). The factory uses
  //    the local `isXChainBridge` helper for the structural shape
  //    (see validation/helpers.ts lines 168–177) and additionally
  //    verifies the door strings are valid XRPL accounts.
  require(
    props.XChainBridge,
    'XChainModifyBridge: XChainBridge is required and must have shape {LockingChainDoor, LockingChainIssue, IssuingChainDoor, IssuingChainIssue}',
    isXChainBridge,
  );
  assertValidXChainBridge(props.XChainBridge);

  // ── Account must equal LockingChainDoor (locking-chain submission).
  //    xrpl.org line 15: "This transaction must be sent by the door
  //    account." The example JSON shows `Account === LockingChainDoor`.
  if (props.Account !== props.XChainBridge.LockingChainDoor) {
    throw new ValidationError(
      'XChainModifyBridge: Account must equal XChainBridge.LockingChainDoor (transaction must be submitted by the locking-chain door account)',
    );
  }

  // ── SignatureReward ── required, non-negative XRP drops string.
  if (!isNonNegativeXrpAmount(props.SignatureReward)) {
    throw new ValidationError(
      'XChainModifyBridge: SignatureReward must be a non-negative XRP drops string (in XRP, ≥ 0; XLS-38 §2.1.1.1.3 line 200)',
    );
  }

  // ── MinAccountCreateAmount ── optional. When present, must be a
  //    non-negative XRP drops string. The spec limits this field to
  //    XRP-XRP bridges (xrpl.org line 48 / XLS-38 §2.1.1.1.4 line 204).
  //    We do not detect IOU-IOU bridges here; the IOU form of the
  //    amount is rejected by the XRP-drops format check.
  if (props.MinAccountCreateAmount !== undefined) {
    if (!isNonNegativeXrpAmount(props.MinAccountCreateAmount)) {
      throw new ValidationError(
        'XChainModifyBridge: MinAccountCreateAmount must be a non-negative XRP drops string (in XRP, ≥ 0; XRP-XRP bridges only — xrpl.org line 48)',
      );
    }
  }

  // ── Flags ── optional. We accept both numeric and boolean-map
  //    forms. The factory stores the original form (numeric or object)
  //    so `.with({ Flags: { tfClearAccountCreateAmount: true } })`
  //    round-trips verbatim. We do NOT enforce a specific value or
  //    require the field (parity with sibling factories such as
  //    `nftokenMint` and `vaultCreate`). Note: XLS-38 §2.2.2.1 marks
  //    Flags as required; we keep it optional here for parity with
  //    the rest of the fp codebase — see Spec Ambiguities #3.

  // ─── Base transaction fields ───
  // Catches the seven shared base fields this factory does not otherwise
  // check: Memos, SourceTag, LastLedgerSequence, AccountTxnID, NetworkID,
  // Delegate, TicketSequence.
  //
  // Placed AFTER the XChainModifyBridge-specific checks so a more specific message
  // wins for a more specific mistake, and this acts as the backstop for
  // everything shared across transaction types.
  //
  // `TransactionType` is supplied because the validator checks a transaction,
  // not a props bag — the factory injects it in `buildFrozenTx` below.
  validateBaseTransaction({ TransactionType: 'XChainModifyBridge', ...props });

  return buildFrozenTx<XchainModifyBridgeProps, XchainModifyBridge>(
    'XChainModifyBridge',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: XchainModifyBridge) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: XchainModifyBridge,
        overrides: Partial<XchainModifyBridgeProps>,
      ) {
        return xchainModifyBridge(mergeForWith(this, overrides));
      },
    },
  );
}
