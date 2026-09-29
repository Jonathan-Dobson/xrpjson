/**
 * Functional XChainCommit factory — frozen-object style.
 *
 * Locks assets on the locking chain to start a cross-chain transfer.
 * Validation happens at construction; there is no way to construct an
 * invalid tx.
 *
 *   import { xchainCommit } from 'xrplt/fp';
 *   const tx = xchainCommit({
 *     Account,
 *     Amount: '10000',
 *     XChainClaimID: '13f',
 *     OtherChainDestination: 'rahDmoXrtPdh7sUdrPjini3gcnTVYjbjjw',
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
 * @see https://xrpl.org/docs/references/protocol/transactions/types/xchaincommit
 * @see xrpl.js `packages/xrpl/src/models/transactions/XChainCommit.ts`
 *      (`validateXChainCommit` — source of every required-field check in
 *      this factory).
 * @see XLS-0038 §2.3.2 — "The `XChainCommit` transaction"
 *      (`~/.mavis/docs.local/xrpl-standards/repo/XLS-0038-cross-chain-bridge/README.md`
 *      lines 412–447)
 *
 * ## Divergences
 *
 * Compared with `src/transactions/xchain-commit.ts`, this factory adds
 * guards the class skips (or that xrpl.js / xrpl.org / XLS-38 mandate
 * but the class omits):
 *
 * - **`Account` must be a valid XRPL classic or X-address.** The class
 *   accepts any string via `super.validate()` (which only checks
 *   `isString`). xrpl.js's `validateBaseTransaction` (which
 *   `validateXChainCommit` delegates to) enforces a valid classic
 *   address; we mirror that at construction.
 *   - Source: xrpl.js `common.ts` `validateBaseTransaction`.
 *   - Cross-ref: rippled parses `Account` as `STAccount`; only valid
 *     XRPL classic addresses parse.
 *
 * - **`XChainBridge` is fully shape-validated.** xrpl.js
 *   `validateXChainCommit` line 65 calls
 *   `validateRequiredField(tx, 'XChainBridge', isXChainBridge)`, which
 *   requires exactly 4 keys, two `AccountID` door strings, and two
 *   `Issue` currency objects (`{currency: 'XRP'}` or
 *   `{currency, issuer}`). The class only verifies `isRecord`, which
 *   accepts any object (including `{}` or `{foo: 'bar'}`). The factory
 *   uses the local `isXChainBridge` helper to enforce the full shape.
 *   - Source: xrpl.js `common.ts` `isXChainBridge`.
 *   - Source: XLS-38 §2.1.1.1.2 lines 175–180 (bridge fields are
 *     `XCHAIN_BRIDGE` internal type; all 4 sub-fields required).
 *   - Cross-ref: our `src/validation/helpers.ts` `isXChainBridge`
 *     (lines 168–177) mirrors the xrpl.js check.
 *
 * - **Both `XChainBridge` doors must be valid XRPL classic / X
 *   addresses.** `isXChainBridge` only checks that the door strings are
 *   strings; rippled parses them as `STAccount`. The factory
 *   additionally runs `isAccount` on each door so a malformed door
 *   string is caught at construction.
 *   - Source: rippled `XChainBridge.h` (parses `sfLockingChainDoor`,
 *     `sfIssuingChainDoor` as `STAccount`).
 *   - Cross-ref: XLS-38 §2.1.1.1.2 line 177 (`LockingChainDoor` is
 *     `ACCOUNT`); line 179 (`IssuingChainDoor` is `ACCOUNT`).
 *
 * - **`XChainClaimID` accepts number OR decimal string (UInt64).** The
 *   class types the field as `number` only. xrpl.js types it as
 *   `number | string` (`XChainCommit.ts:38`) and validates with
 *   `isNumber(inp) || isString(inp)` (line 70). xrpl.org
 *   `xchaincommit.md` line 47 marks it `String / UInt64`; XLS-38
 *   §2.3.2.1.2 line 432 defines it as `UINT64`. The wire format
 *   encodes UInt64 as a decimal string; callers frequently pass it as
 *   a string. The factory accepts either, and when a string is
 *   provided verifies it is a decimal integer in `[0, 2^64-1]`.
 *   - Source: xrpl.js `XChainCommit.ts:38,67–71`.
 *   - Source: xrpl.org `xchaincommit.md` line 47.
 *   - Source: XLS-38 §2.3.2.1.2 line 432.
 *
 * - **`OtherChainDestination` is optional, but when present must be a
 *   valid XRPL classic / X-address.** XLS-38 §2.3.2.1.4 line 422
 *   defines it as `ACCOUNT` and marks the field OPTIONAL. xrpl.org
 *   `xchaincommit.md` line 50 confirms `Required? No`. xrpl.js
 *   `validateXChainCommit` line 73 calls
 *   `validateOptionalField(tx, 'OtherChainDestination', isAccount)`.
 *   The class declares `OtherChainDestination?: string | undefined`
 *   without any `isAccount` check; any string passes. The factory
 *   enforces the XRPL-account format when present.
 *   - Source: xrpl.js `XChainCommit.ts:46,73`.
 *   - Source: xrpl.org `xchaincommit.md` line 50 (No).
 *   - Source: XLS-38 §2.3.2.1.4 line 422 (`ACCOUNT`, no required check).
 *
 * - **`Amount` must be strictly positive.** The class delegates to
 *   `isAmount`, which accepts `Amount: '0'` (XRP string) and
 *   `{value: '0'}` (IOU/MPT). Per XLS-38 §2.3.2.1.3 line 440, "The
 *   asset to commit, and the quantity. This must match the door
 *   account's LockingChainIssue (if on the locking chain) or the door
 *   account's IssuingChainIssue (if on the issuing chain)." The bridge
 *   can only be funded with a positive transfer; zero is meaningless
 *   and would be rejected on-ledger. The factory enforces `> 0` across
 *   all three Amount forms (XRP string, IOU `value`, MPT `value`).
 *   - Source: XLS-38 §2.3.2.1.3 line 440.
 *   - Cross-ref: xrpl.js `isAmount` accepts any shape; the strict
 *     `> 0` check is a factory addition.
 *
 * - **`Amount` shape sub-checks for IOU and MPT.** For IOU, the
 *   `issuer` must be a valid XRPL account address (rippled parses
 *   `STAmount.issuer` as `STAccount`); for both IOU and MPT, `value`
 *   must be a non-negative base-10 integer string (matching the XRPL
 *   wire format). The class's `isAmount` only checks structural keys;
 *   it does not validate `issuer` against `isAccount` or `value`
 *   against the decimal regex.
 *   - Source: rippled `Amount.cpp` (parses `issuer` as `STAccount`).
 *   - Source: rippled `STAmount.cpp` (parses `value` as decimal
 *     integer string).
 *
 * - **`Flags` accepted for parity with the base transaction shape.**
 *   XChainCommit itself defines no transaction-specific flags; only
 *   `tfFullyCanonicalSig` (global) is normally meaningful. The class
 *   does not declare a `Flags` field. We accept a numeric bitmask for
 *   parity with the rest of the fp family.
 *   - Source: XLS-38 §2.3.2.1 lines 414–418 (no `Flags` row).
 *   - Cross-ref: rippled accepts the `Flags` field for any transaction
 *     (it just defaults to `tfFullyCanonicalSig`).
 */
import type { Amount } from '../../types/amounts.js';
import type { XChainBridge } from '../../types/common.js';
import {
  isAccount,
  isAmount,
  isIssuedCurrencyAmount,
  isMPTAmount,
  isNumber,
  isString,
  isXChainBridge,
} from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// XLS-38 §2.3.2.1.2 line 432: XChainClaimID is UInt64.
const UINT64_MIN = 0n;
const UINT64_MAX = (1n << 64n) - 1n;

// Non-negative base-10 integer string used for Amount value parsing.
const DECIMAL_INT_REGEX = /^[0-9]+$/u;

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Verify both XChainBridge doors are valid XRPL account addresses
 * (the local `isXChainBridge` helper only checks `typeof === 'string'`).
 */
function assertValidXChainBridge(bridge: XChainBridge): void {
  if (!isAccount(bridge.LockingChainDoor)) {
    throw new ValidationError(
      'XChainCommit: XChainBridge.LockingChainDoor must be a valid XRPL account address',
    );
  }
  if (!isAccount(bridge.IssuingChainDoor)) {
    throw new ValidationError(
      'XChainCommit: XChainBridge.IssuingChainDoor must be a valid XRPL account address',
    );
  }
}

/**
 * Validate that an Amount is strictly positive across all three forms
 * (XRP drops string, IssuedCurrencyAmount, MPTAmount). XChainCommit is
 * bridge-agnostic: XRP-XRP and IOU-IOU bridges are both supported,
 * per XLS-38 §2.3.2.1.3 line 440.
 */
function validatePositiveAmount(amount: Amount, path: string): void {
  if (!isAmount(amount)) {
    throw new ValidationError(
      `XChainCommit: ${path} must be a valid Amount (XRP drops string, IOU object, or MPT object)`,
    );
  }

  if (isString(amount)) {
    if (!DECIMAL_INT_REGEX.test(amount)) {
      throw new ValidationError(
        `XChainCommit: ${path} (XRP) must be a non-negative base-10 integer string`,
      );
    }
    if (amount === '0') {
      throw new ValidationError(
        `XChainCommit: ${path} must be strictly positive (XRP); got "0"`,
      );
    }
    return;
  }

  if (isIssuedCurrencyAmount(amount)) {
    if (!isAccount(amount.issuer)) {
      throw new ValidationError(
        `XChainCommit: ${path}.issuer must be a valid XRPL account address`,
      );
    }
    if (!isString(amount.value) || !DECIMAL_INT_REGEX.test(amount.value)) {
      throw new ValidationError(
        `XChainCommit: ${path}.value must be a non-negative base-10 integer string`,
      );
    }
    if (amount.value === '0') {
      throw new ValidationError(
        `XChainCommit: ${path} must be strictly positive (IOU); got value "0"`,
      );
    }
    return;
  }

  if (isMPTAmount(amount)) {
    if (!isString(amount.value) || !DECIMAL_INT_REGEX.test(amount.value)) {
      throw new ValidationError(
        `XChainCommit: ${path}.value must be a non-negative base-10 integer string`,
      );
    }
    if (amount.value === '0') {
      throw new ValidationError(
        `XChainCommit: ${path} must be strictly positive (MPT); got value "0"`,
      );
    }
    return;
  }

  // Unreachable — defensive.
  throw new ValidationError(
    `XChainCommit: ${path} must be a valid Amount (XRP drops string, IOU object, or MPT object)`,
  );
}

/**
 * Validate that an XChainClaimID value (number or decimal string) fits
 * in `[0, 2^64-1]`. The wire format encodes UInt64 as a decimal
 * string; this helper normalises both forms into BigInt and
 * range-checks.
 */
function validateXChainClaimIDValue(
  value: number | string,
  field: string,
): void {
  if (typeof value === 'number') {
    if (
      !Number.isInteger(value) ||
      value < 0 ||
      value > Number.MAX_SAFE_INTEGER
    ) {
      throw new ValidationError(
        `XChainCommit: ${field} numeric form must be a non-negative safe integer (UInt64)`,
      );
    }
    return;
  }

  if (!DECIMAL_INT_REGEX.test(value)) {
    throw new ValidationError(
      `XChainCommit: ${field} string form must be a decimal integer (UInt64)`,
    );
  }
  let big: bigint;
  try {
    big = BigInt(value);
  } catch {
    throw new ValidationError(
      `XChainCommit: ${field} string form is not a valid integer (UInt64)`,
    );
  }
  if (big < UINT64_MIN || big > UINT64_MAX) {
    throw new ValidationError(
      `XChainCommit: ${field} is out of UInt64 range [0, ${UINT64_MAX}]`,
    );
  }
}

// ─── Public types ────────────────────────────────────────────────────

export interface XchainCommitProps {
  /** The unique address of the transaction sender (the account that
   *  funds the lock-and-unwrap). */
  Account: string;

  /** The bridge to use to transfer funds. 4-key shape with both doors
   *  as valid XRPL classic/X addresses and both Issues as valid
   *  currency objects. */
  XChainBridge: XChainBridge;

  /** The unique integer ID for a cross-chain transfer that was created
   *  on the destination chain via an `XChainCreateClaimID` transaction.
   *  UInt64 — accepts number or decimal string. */
  XChainClaimID: number | string;

  /** The asset to commit, and the quantity. Must match the door
   *  account's `LockingChainIssue` (locking chain) or
   *  `IssuingChainIssue` (issuing chain). Strictly positive (> 0). */
  Amount: Amount;

  /** The destination account on the destination chain. Optional.
   *  If not specified, the account that submitted the
   *  `XChainCreateClaimID` transaction on the destination chain will
   *  need to submit an `XChainClaim` transaction to claim the funds. */
  OtherChainDestination?: string | undefined;

  /** Bit-flags for this transaction. XChainCommit has no defined
   *  flags; only `tfFullyCanonicalSig` (global) is normally meaningful.
   *  Accepted for parity with the base tx shape. */
  Flags?: number | undefined;
  Fee?: string | undefined;
  Sequence?: number | undefined;
}

export interface XchainCommit extends Readonly<XchainCommitProps> {
  readonly TransactionType: 'XChainCommit';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<XchainCommitProps>): XchainCommit;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function xchainCommit(props: XchainCommitProps): XchainCommit {
  // ── Account ── required, valid XRPL classic/X-address.
  require(
    props.Account,
    'XChainCommit: missing or invalid Account',
    isAccount,
  );

  // ── XChainBridge ── required, full shape (4 keys + valid Issues) +
  //    both doors as valid XRPL accounts.
  require(
    props.XChainBridge,
    'XChainCommit: XChainBridge is required and must have shape {LockingChainDoor, LockingChainIssue, IssuingChainDoor, IssuingChainIssue}',
    isXChainBridge,
  );
  assertValidXChainBridge(props.XChainBridge);

  // ── XChainClaimID ── required, number OR decimal string (UInt64).
  if (!isNumber(props.XChainClaimID) && !isString(props.XChainClaimID)) {
    throw new ValidationError(
      'XChainCommit: XChainClaimID must be a number or decimal string (UInt64)',
    );
  }
  validateXChainClaimIDValue(props.XChainClaimID, 'XChainClaimID');

  // ── Amount ── required, any Currency Amount form, strictly positive.
  validatePositiveAmount(props.Amount, 'Amount');

  // ── OtherChainDestination ── optional, valid XRPL account when
  //    present (XLS-38 §2.3.2.1.4 line 422: `ACCOUNT`, not required).
  if (props.OtherChainDestination !== undefined) {
    if (!isAccount(props.OtherChainDestination)) {
      throw new ValidationError(
        'XChainCommit: OtherChainDestination must be a valid XRPL account address',
      );
    }
  }

  return buildFrozenTx<XchainCommitProps, XchainCommit>(
    'XChainCommit',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: XchainCommit) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: XchainCommit, overrides: Partial<XchainCommitProps>) {
        return xchainCommit(mergeForWith(this, overrides));
      },
    },
  );
}