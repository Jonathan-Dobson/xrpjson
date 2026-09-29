/**
 * Functional XChainCreateClaimID factory — frozen-object style.
 *
 * Creates a new cross-chain claim ID on the destination chain. The claim
 * ID represents one cross-chain transfer of value and is the first step
 * of a transfer: after this transaction succeeds, a corresponding
 * `XChainCommit` transaction on the source chain can reference the
 * resulting `XChainClaimID`. Validation happens at construction; there
 * is no way to construct an invalid tx.
 *
 *   import { xchainCreateClaimID } from 'xrplt/fp';
 *   const tx = xchainCreateClaimID({
 *     Account: 'rahDmoXrtPdh7sUdrPjini3gcnTVYjbjjw',
 *     OtherChainSource: 'rMTi57fNy2UkUb4RcdoUeJm7gjxVQvxzUo',
 *     SignatureReward: '100',
 *     XChainBridge: {
 *       LockingChainDoor: 'rMAXACCrp3Y8PpswXcg3bKggHX76V3F8M4',
 *       LockingChainIssue: { currency: 'XRP' },
 *       IssuingChainDoor: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
 *       IssuingChainIssue: { currency: 'XRP' },
 *     },
 *   });
 *   const j = tx.toJSON();
 *
 * Required amendment: `XChainBridge`.
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/xchaincreateclaimid
 * @see https://github.com/XRPLF/xrpl.js/blob/main/packages/xrpl/src/models/transactions/XChainCreateClaimID.ts
 * @see XLS-0038 (Cross-Chain Bridge) §2.3.1
 *      `~/.mavis/docs.local/xrpl-standards/repo/XLS-0038-cross-chain-bridge/README.md`
 *      lines 376–403
 * @see rippled `XChainBridge.cpp::XChainCreateClaimID::preflight` (signatures
 *      must be XRP, ≥ 0, and a legal net value):
 *      https://github.com/XRPLF/rippled/blob/develop/src/libxrpl/tx/transactors/bridge/XChainBridge.cpp#L1961-L1969
 *
 * ## Divergences
 *
 * Compared with `src/transactions/xchain-create-claim-id.ts`, this
 * factory adds guards the class skips (or that xrpl.js / xrpl.org /
 * XLS-38 / rippled mandate but the class omits):
 *
 * - **`Account` must be a valid XRPL classic or X-address.** The class
 *   accepts any non-empty string — only the base transaction
 *   `super.validate()` is invoked. xrpl.js's `validateBaseTransaction`
 *   (which `validateXChainCreateClaimID` delegates to) enforces a string;
 *   we additionally enforce the XRPL classic/X-address format at
 *   construction, matching every other fp factory.
 *   - Source: xrpl.js
 *     `~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/common.ts`
 *     `validateBaseTransaction`.
 *   - Cross-ref: rippled parses `Account` as `STAccount`; only valid
 *     XRPL classic addresses parse. xrpl.org `xchaincreateclaimid.md`
 *     example line 20 lists `Account` as a classic address.
 *
 * - **`XChainBridge` is fully shape-validated.** xrpl.js
 *   `validateXChainCreateClaimID` line 47 calls
 *   `validateRequiredField(tx, 'XChainBridge', isXChainBridge)`, which
 *   requires exactly 4 keys, two `AccountID` door strings, and two
 *   `Issue` currency objects (`{currency: 'XRP'}` or `{currency,
 *   issuer}`). The class only verifies `isRecord`, which accepts any
 *   object (including `{}` or `{foo: 'bar'}`). The factory uses the
 *   local `isXChainBridge` helper to enforce the full shape.
 *   - Source: xrpl.js
 *     `~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/common.ts`
 *     `isXChainBridge` (lines 444–453).
 *   - Source: XLS-38 §2.3.1.1.1 line 391 (`XChainBridge` is required;
 *     `XCHAIN_BRIDGE` internal type).
 *   - Source: xrpl.org `xchaincreateclaimid.md` lines 56–61 (the four
 *     sub-fields are each required: `IssuingChainDoor`,
 *     `IssuingChainIssue`, `LockingChainDoor`, `LockingChainIssue`).
 *   - Cross-ref: our `src/validation/helpers.ts` `isXChainBridge`
 *     (lines 168–177) mirrors the xrpl.js check.
 *
 * - **Both `XChainBridge` doors must be valid XRPL classic
 *   / X-addresses.** `isXChainBridge` only checks that the door
 *   strings are strings; rippled parses them as `STAccount`. The
 *   factory additionally runs `isAccount` on each door so a malformed
 *   door string is caught at construction.
 *   - Source: rippled `XChainBridge.cpp` (`sfLockingChainDoor`,
 *     `sfIssuingChainDoor` parsed as `STAccount`).
 *   - Source: xrpl.org `xchaincreateclaimid.md` line 58
 *     (`IssuingChainDoor` is `Account`); line 60 (`LockingChainDoor`
 *     is `Account`).
 *   - Cross-ref: XLS-38 §2.1.1.1.2 lines 175–180 (bridge `XCHAIN_BRIDGE`
 *     internal type; `LockingChainDoor` / `IssuingChainDoor` are
 *     `ACCOUNT`).
 *
 * - **`SignatureReward` must be a non-negative XRP drops string.** The
 *   class delegates to `isAmount`, which accepts any of: XRP drops
 *   string, IOU object, or MPT object. XLS-38 §2.3.1.1.2 line 398
 *   states: "The amount, **in XRP**, to be used to reward the witness
 *   servers for providing signatures." xrpl.org
 *   `xchaincreateclaimid.md` line 45 calls it a `Currency Amount`
 *   (per the JSON type column) but the example JSON (line 22) uses
 *   `"SignatureReward": "100"` (XRP drops string form), and the
 *   description immediately after the table says "in XRP". rippled's
 *   `XChainCreateClaimID::preflight` enforces `isXRP(reward) &&
 *   reward.signum() >= 0 && isLegalNet(reward)` — i.e., native (XRP),
 *   non-negative, and within the protocol's native mantissa cap. The
 *   factory mirrors this with a strict XRP drops string check, ≥ 0
 *   (zero is permitted; a bridge may opt out of witness payment).
 *   - Source: XLS-38 §2.3.1.1.2 line 398 ("in XRP").
 *   - Source: xrpl.org `xchaincreateclaimid.md` line 45 + example line
 *     22 (`"SignatureReward": "100"`).
 *   - Source: rippled `XChainBridge.cpp` lines 1961–1969
 *     (`isXRP(reward) && signum() >= 0 && isLegalNet(reward)` →
 *     `temXCHAIN_BRIDGE_BAD_REWARD_AMOUNT`).
 *   - Cross-ref: `isLegalNet` enforces `mantissa() <= kMaxNativeN`
 *     (`include/xrpl/protocol/STAmount.h` line 23: `kMaxNativeN =
 *     100'000'000'000'000'000ull`). The factory does NOT enforce this
 *     ceiling — at 100 billion XRP the wire form would already be too
 *     large for the integer-string parser; we rely on the `isString`
 *     type check plus the regex. (Documented for awareness; the spec
 *     upper bound is effectively `kMaxNativeN`.)
 *
 * - **`OtherChainSource` must be a valid XRPL classic / X-address.**
 *   The class declares the field as `readonly OtherChainSource: string`
 *   but never validates it. xrpl.js `validateXChainCreateClaimID`
 *   line 49 calls `validateRequiredField(tx, 'OtherChainSource',
 *   isAccount)`. xrpl.org `xchaincreateclaimid.md` line 44 marks it
 *   `String - Address / AccountID`; XLS-38 §2.3.1.1.3 line 402 defines
 *   it as `ACCOUNT`. rippled parses it as `STAccount`. The factory
 *   enforces XRPL address format at construction.
 *   - Source: xrpl.js `XChainCreateClaimID.ts` line 49 (`isAccount`).
 *   - Source: xrpl.org `xchaincreateclaimid.md` line 44 (`AccountID`).
 *   - Source: XLS-38 §2.3.1.1.3 line 402 (`ACCOUNT` internal type).
 *   - Cross-ref: rippled parses `OtherChainSource` as `STAccount`; only
 *     valid XRPL classic addresses parse.
 *
 * - **`XChainClaimID` is NOT a transaction field.** The task brief
 *   mentioned `XChainClaimID` as a `number | string` UInt64 input, but
 *   the canonical spec lists exactly three fields — `XChainBridge`,
 *   `SignatureReward`, `OtherChainSource` — at XLS-38 §2.3.1.1 lines
 *   385–389. xrpl.js's `XChainCreateClaimID` interface (lines 23–37)
 *   also omits it. rippled's `XChainCreateClaimID::doApply` derives
 *   the new claim ID by incrementing the bridge's stored counter
 *   (`(*sleBridge)[sfXChainClaimID] + 1`, `XChainBridge.cpp:2022`).
 *   The factory correctly omits `XChainClaimID`; consumers read the
 *   new claim ID from the transaction's metadata after submission.
 *   - Source: XLS-38 §2.3.1.1 lines 385–389 (no `XChainClaimID` row).
 *   - Source: xrpl.js `XChainCreateClaimID.ts` lines 23–37 (interface
 *     has no `XChainClaimID` field).
 *   - Source: rippled `XChainBridge.cpp` lines 2022–2029 (claim ID is
 *     derived, not input).
 *
 * - **`Account` and `OtherChainSource` are typically different
 *   accounts.** The factory does NOT enforce a `Account !==
 *   OtherChainSource` check (XLS-38 does not forbid self-source), but
 *   in practice `OtherChainSource` is the source-chain account that
 *   will later submit the `XChainCommit` transaction, while `Account`
 *   is the destination-chain account that submits this
 *   `XChainCreateClaimID`. Same-account usage is unusual but allowed.
 *   Documented here to clarify the factory's scope; no spec rule is
 *   relaxed.
 *
 * - **`Flags` accepted for parity with the base transaction shape.**
 *   XChainCreateClaimID defines no transaction-specific flags; only
 *   `tfFullyCanonicalSig` (global) is normally meaningful. The class
 *   does not declare a `Flags` field. We accept a numeric bitmask
 *   for parity with the rest of the fp family. This is a permissive
 *   addition, not a tightening.
 *   - Source: XLS-38 §2.3.1.1 lines 385–389 (no `Flags` row).
 *   - Cross-ref: rippled accepts the `Flags` field for any transaction
 *     (it defaults to `tfFullyCanonicalSig`).
 */
import type { XChainBridge } from '../../types/common.js';
import { isAccount, isString, isXChainBridge } from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Helpers ─────────────────────────────────────────────────────────

const XRP_DROPS_REGEX = /^[0-9]+$/u;

/**
 * Non-negative XRP drops Amount. Accepts the canonical XRP drops
 * mantissa form (decimal integer string with no exponent, no decimal
 * point — the wire format used by Amount fields in XChainBridge-related
 * transactions) and rejects zero, negative, and non-numeric values
 * via the strictly-positive wrapper.
 *
 * For XChainCreateClaimID, `SignatureReward` may legitimately be `'0'`
 * (a bridge may opt out of witness payment). Zero is therefore allowed.
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
      'XChainCreateClaimID: XChainBridge.LockingChainDoor must be a valid XRPL account address',
    );
  }
  if (!isAccount(bridge.IssuingChainDoor)) {
    throw new ValidationError(
      'XChainCreateClaimID: XChainBridge.IssuingChainDoor must be a valid XRPL account address',
    );
  }
}

// ─── Public types ────────────────────────────────────────────────────

export interface XchainCreateClaimIDProps {
  /** The unique address of the transaction sender — the destination-
   *  chain account that will own the resulting `XChainOwnedClaimID`
   *  ledger object. Valid XRPL classic/X-address. */
  Account: string;
  /** The bridge to create the claim ID for. Required; 4-key shape with
   *  both doors as valid XRPL classic/X addresses and both Issues as
   *  valid Issue forms. */
  XChainBridge: XChainBridge;
  /** The amount, in XRP, to reward the witness servers for providing
   *  signatures. Must match the bridge's stored `SignatureReward`.
   *  Non-negative (≥ 0). */
  SignatureReward: string;
  /** The account that must send the `XChainCommit` transaction on the
   *  source chain. Valid XRPL classic/X-address. */
  OtherChainSource: string;
  /** Bit-flags for this transaction. XChainCreateClaimID has no
   *  defined flags; only `tfFullyCanonicalSig` (global) is meaningful.
   *  Accepted for parity with the base tx shape. */
  Flags?: number | undefined;
  /** Fee in drops. */
  Fee?: string | undefined;
  /** Account sequence number. */
  Sequence?: number | undefined;
}

export interface XchainCreateClaimID
  extends Readonly<XchainCreateClaimIDProps> {
  readonly TransactionType: 'XChainCreateClaimID';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<XchainCreateClaimIDProps>): XchainCreateClaimID;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function xchainCreateClaimID(
  props: XchainCreateClaimIDProps,
): XchainCreateClaimID {
  // ── Account ── required, must be a valid XRPL classic or X-address.
  require(
    props.Account,
    'XChainCreateClaimID: Account is required',
    isAccount,
  );

  // ── XChainBridge ── required, full shape (4 keys, both doors valid
  //    XRPL accounts, both issues valid Issue forms).
  require(
    props.XChainBridge,
    'XChainCreateClaimID: XChainBridge is required and must have shape {LockingChainDoor, LockingChainIssue, IssuingChainDoor, IssuingChainIssue}',
    isXChainBridge,
  );
  // `props.XChainBridge` is now type-narrowed to XChainBridge —
  // verify the doors are valid XRPL accounts (the helper only
  // checks `typeof === 'string'`).
  assertValidXChainBridge(props.XChainBridge);

  // ── SignatureReward ── required, non-negative XRP drops string.
  if (!isNonNegativeXrpAmount(props.SignatureReward)) {
    throw new ValidationError(
      'XChainCreateClaimID: SignatureReward must be a non-negative XRP drops string (in XRP, ≥ 0; XLS-38 §2.3.1.1.2 line 398)',
    );
  }

  // ── OtherChainSource ── required, valid XRPL classic/X-address.
  require(
    props.OtherChainSource,
    'XChainCreateClaimID: OtherChainSource is required',
    isAccount,
  );

  return buildFrozenTx<XchainCreateClaimIDProps, XchainCreateClaimID>(
    'XChainCreateClaimID',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: XchainCreateClaimID) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: XchainCreateClaimID,
        overrides: Partial<XchainCreateClaimIDProps>,
      ) {
        return xchainCreateClaimID(mergeForWith(this, overrides));
      },
    },
  );
}
