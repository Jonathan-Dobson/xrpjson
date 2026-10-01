/**
 * Functional XChainClaim factory — frozen-object style.
 *
 * Completes a cross-chain transfer of value by claiming funds on the
 * destination chain after a quorum of witness attestations have been
 * delivered for a corresponding `XChainCommit` transaction. Validation
 * happens at construction; there is no way to construct an invalid tx.
 *
 *   import { xchainClaim } from 'xrpjson';
 *   const tx = xchainClaim({
 *     Account,
 *     Amount: '10000',
 *     XChainClaimID: '13f',
 *     Destination: 'rahDmoXrtPdh7sUdrPjini3gcnTVYjbjjw',
 *     XChainBridge: {
 *       LockingChainDoor: 'rMAXACCrp3Y8PpswXcg3bKggHX76V3F8M4',
 *       LockingChainIssue: { currency: 'XRP' },
 *       IssuingChainDoor: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
 *       IssuingChainIssue: { currency: 'XRP' },
 *     },
 *   });
 *
 * Required amendment: `XChainBridge`.
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/xchainclaim
 * @see xrpl.js `packages/xrpl/src/models/transactions/XChainClaim.ts`
 *      (`validateXChainClaim` — source of every required-field check in
 *      this factory).
 * @see XLS-0038 §2.3.4 — "The `XChainClaim` transaction"
 *      `~/.mavis/docs.local/xrpl-standards/repo/XLS-0038-cross-chain-bridge/README.md`
 *      lines 519–559.
 *
 * ## Divergences
 *
 * Compared with the Class API's `XChainClaim`, this factory adds
 * guards the class skips (or that xrpl.js / xrpl.org / XLS-38 mandate
 * but the class omits):
 *
 * - **`Account` must be a valid XRPL classic or X-address.** The class
 *   accepts any string via `super.validate()` (which only checks
 *   `isString`). xrpl.js's `validateBaseTransaction` (which
 *   `validateXChainClaim` delegates to) enforces a valid classic
 *   address; we mirror that at construction.
 *   - Source: xrpl.js `common.ts` `validateBaseTransaction`.
 *   - Cross-ref: rippled parses `Account` as `STAccount`; only valid
 *     XRPL classic addresses parse.
 *
 * - **`Destination` must be a valid XRPL classic or X-address.** The
 *   class does not validate `Destination` at all (no `validate()` check,
 *   just `declare readonly Destination`). xrpl.js
 *   `validateXChainClaim` line 74 calls
 *   `validateRequiredField(tx, 'Destination', isAccount)`. xrpl.org
 *   `xchainclaim.md` line 47 marks it `String / AccountID`; XLS-38
 *   §2.3.4.1.3 line 548 defines `Destination` as `ACCOUNT`.
 *   - Source: xrpl.js `XChainClaim.ts` line 74.
 *   - Source: xrpl.org `xchainclaim.md` line 47.
 *   - Source: XLS-38 §2.3.4.1.3 line 547.
 *   - Cross-ref: rippled parses `Destination` as `STAccount`; only
 *     valid XRPL classic addresses parse.
 *
 * - **`XChainBridge` is fully shape-validated.** xrpl.js
 *   `validateXChainClaim` line 66 calls
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
 *   addresses.** `isXChainBridge` only checks that the door strings
 *   are strings; rippled parses them as `STAccount`. The factory
 *   additionally runs `isAccount` on each door so a malformed door
 *   string is caught at construction.
 *   - Source: rippled `XChainBridge.h:94–126` (parses `sfLockingChainDoor`,
 *     `sfIssuingChainDoor` as `STAccount`).
 *   - Cross-ref: XLS-38 §2.1.1.1.2 line 177 (`LockingChainDoor` is
 *     `ACCOUNT`); line 179 (`IssuingChainDoor` is `ACCOUNT`).
 *
 * - **`XChainClaimID` accepts number OR decimal string (UInt64).** The
 *   class types the field as `number` only. xrpl.js types it as
 *   `number | string` (`XChainClaim.ts:35`) and validates with
 *   `isNumber(inp) || isString(inp)` (line 71). xrpl.org
 *   `xchainclaim.md` line 50 marks it `String / UInt64`; XLS-38
 *   §2.3.4.1.2 line 543 defines it as `UINT64`. The wire format
 *   encodes UInt64 as a decimal string; callers frequently pass it as
 *   a string. The factory accepts either, and when a string is provided
 *   verifies it is a decimal integer in `[0, 2^64-1]`.
 *   - Source: xrpl.js `XChainClaim.ts:35,68–72`.
 *   - Source: xrpl.org `xchainclaim.md` line 50.
 *   - Source: XLS-38 §2.3.4.1.2 line 543.
 *
 * - **`DestinationTag` is exposed (XLS-38 §2.3.4.1.4).** The class
 *   does not declare this field at all. xrpl.js marks it optional with
 *   `DestinationTag?: number` (`XChainClaim.ts:48`) and validates with
 *   `validateOptionalField(tx, 'DestinationTag', isNumber)` (line 76).
 *   xrpl.org `xchainclaim.md` line 48 marks it `Number / UInt32`
 *   optional; XLS-38 §2.3.4.1.4 line 551 defines it as `UINT32`. The
 *   factory exposes the field, requires it to be a UInt32 when present,
 *   and rejects non-integers / negatives / values > 4294967295.
 *   - Source: xrpl.js `XChainClaim.ts:48,76`.
 *   - Source: xrpl.org `xchainclaim.md` line 48.
 *   - Source: XLS-38 §2.3.4.1.4 line 551.
 *
 * - **`Amount` must be strictly positive.** The class delegates to
 *   `isAmount`, which accepts `Amount: '0'` (XRP string) and
 *   `{value: '0'}` (IOU/MPT). Per XLS-38 §2.3.4.1.5 line 559, "This
 *   must match the amount attested to on the attestations associated
 *   with this `XChainClaimID`." The attestations record a non-zero
 *   amount (XChainCommit cannot commit 0), so a 0 Amount here would
 *   never match an attestation and would be rejected on-ledger. The
 *   factory enforces `> 0` across all three Amount forms (XRP string,
 *   IOU `value`, MPT `value`).
 *   - Source: XLS-38 §2.3.4.1.5 line 559 ("must match the amount
 *     attested to ... XChainClaimID").
 *   - Source: XLS-38 §2.3.2.1.3 line 440 (XChainCommit Amount must
 *     match the door's `LockingChainIssue`/`IssuingChainIssue`; the
 *     commit must be a positive transfer).
 *   - Cross-ref: xrpl.js `isAmount` accepts any shape; the strict
 *     `> 0` check is a factory addition.
 *
 * - **`OtherChainSource` is NOT a field on this transaction.** Some
 *   XLS-38 transactions carry an `OtherChainSource` (e.g.
 *   `XChainAddClaimAttestation` §2.3.3.1.5), but it is explicitly
 *   absent from XChainClaim's field table (§2.3.4.1 lines 533–537).
 *   The factory correctly omits `OtherChainSource`. (Documented for
 *   awareness; this is a spec clarification, not a divergence from the
 *   class.)
 *   - Source: XLS-38 §2.3.4.1 lines 533–537 (no `OtherChainSource`
 *     row in the field table).
 *   - Source: XLS-38 §2.3.3.1.5 line 468 (the attestation carries
 *     `OtherChainSource`, not the claim).
 *
 * - **`Flags` accepted for parity with the base transaction shape.**
 *   XChainClaim itself defines no transaction-specific flags; only
 *   `tfFullyCanonicalSig` (global) is normally meaningful. The class
 *   does not declare a `Flags` field. We accept a numeric bitmask
 *   for parity with the rest of the fp family.
 *   - Source: XLS-38 §2.3.4.1 lines 533–537 (no `Flags` row).
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

// XLS-38 §2.3.4.1.2 line 543: XChainClaimID is UInt64.
const UINT64_MIN = 0n;
const UINT64_MAX = (1n << 64n) - 1n;

// XLS-38 §2.3.4.1.4 line 551: DestinationTag is UInt32.
const UINT32_MIN = 0;
const UINT32_MAX = 0xffffffff;

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
      'XChainClaim: XChainBridge.LockingChainDoor must be a valid XRPL account address',
    );
  }
  if (!isAccount(bridge.IssuingChainDoor)) {
    throw new ValidationError(
      'XChainClaim: XChainBridge.IssuingChainDoor must be a valid XRPL account address',
    );
  }
}

/**
 * Validate that an Amount is strictly positive across all three forms
 * (XRP drops string, IssuedCurrencyAmount, MPTAmount). Mirrors the
 * OfferCreate / NFTokenCreateOffer positivity checks but accepts any
 * Amount shape (XChainClaim is bridge-agnostic; XRP-XRP and IOU-IOU
 * bridges are both supported, XLS-38 §2.3.4 has no asset restriction).
 */
function validatePositiveAmount(amount: Amount, path: string): void {
  if (!isAmount(amount)) {
    throw new ValidationError(
      `XChainClaim: ${path} must be a valid Amount (XRP drops string, IOU object, or MPT object)`,
    );
  }

  if (isString(amount)) {
    if (!DECIMAL_INT_REGEX.test(amount)) {
      throw new ValidationError(
        `XChainClaim: ${path} (XRP) must be a non-negative base-10 integer string`,
      );
    }
    if (amount === '0') {
      throw new ValidationError(
        `XChainClaim: ${path} must be strictly positive (XRP); got "0"`,
      );
    }
    return;
  }

  if (isIssuedCurrencyAmount(amount)) {
    if (!isString(amount.value) || !DECIMAL_INT_REGEX.test(amount.value)) {
      throw new ValidationError(
        `XChainClaim: ${path}.value must be a non-negative base-10 integer string`,
      );
    }
    if (amount.value === '0') {
      throw new ValidationError(
        `XChainClaim: ${path} must be strictly positive (IOU); got value "0"`,
      );
    }
    return;
  }

  if (isMPTAmount(amount)) {
    if (!isString(amount.value) || !DECIMAL_INT_REGEX.test(amount.value)) {
      throw new ValidationError(
        `XChainClaim: ${path}.value must be a non-negative base-10 integer string`,
      );
    }
    if (amount.value === '0') {
      throw new ValidationError(
        `XChainClaim: ${path} must be strictly positive (MPT); got value "0"`,
      );
    }
    return;
  }

  // Unreachable — defensive.
  throw new ValidationError(
    `XChainClaim: ${path} must be a valid Amount (XRP drops string, IOU object, or MPT object)`,
  );
}

/**
 * Validate that an XChainClaimID value (number or decimal string)
 * fits in `[0, 2^64-1]`. The wire format encodes UInt64 as a decimal
 * string; this helper normalises both forms into BigInt and range-
 * checks.
 */
function validateXChainClaimIDValue(
  value: number | string,
  field: string,
): void {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
      throw new ValidationError(
        `XChainClaim: ${field} numeric form must be a non-negative safe integer (UInt64)`,
      );
    }
    return;
  }

  if (!DECIMAL_INT_REGEX.test(value)) {
    throw new ValidationError(
      `XChainClaim: ${field} string form must be a decimal integer (UInt64)`,
    );
  }
  let big: bigint;
  try {
    big = BigInt(value);
  } catch {
    throw new ValidationError(
      `XChainClaim: ${field} string form is not a valid integer (UInt64)`,
    );
  }
  if (big < UINT64_MIN || big > UINT64_MAX) {
    throw new ValidationError(
      `XChainClaim: ${field} is out of UInt64 range [0, ${UINT64_MAX}]`,
    );
  }
}

// ─── Public types ────────────────────────────────────────────────────

export interface XchainClaimProps {
  /** The unique address of the transaction sender (the account that
   *  owns the `XChainOwnedClaimID` on the destination chain). */
  Account: string;

  /** The bridge associated with this transfer. 4-key shape with both
   *  doors as valid XRPL classic/X addresses and both Issues as valid
   *  currency objects. */
  XChainBridge: XChainBridge;

  /** The unique integer ID for a cross-chain transfer that was
   *  referenced in the corresponding `XChainCommit` transaction.
   *  UInt64 — accepts number or decimal string. */
  XChainClaimID: number | string;

  /** The destination account on the destination chain. Must exist for
   *  the transaction to succeed. Valid XRPL classic/X address. */
  Destination: string;

  /** Optional UInt32 destination tag. */
  DestinationTag?: number | undefined;

  /** The amount to claim on the destination chain. Must match the
   *  amount attested to on the attestations associated with this
   *  `XChainClaimID`. Strictly positive (> 0). */
  Amount: Amount;

  /** Bit-flags for this transaction. XChainClaim has no defined
   *  flags; only `tfFullyCanonicalSig` (global) is normally meaningful.
   *  Accepted for parity with the base tx shape. */
  Flags?: number | undefined;
  /** Fee in XRP (drops), base-10 integer string. */
  Fee?: string | undefined;
  /** Account sequence number. */
  Sequence?: number | undefined;
}

export interface XchainClaim extends Readonly<XchainClaimProps> {
  readonly TransactionType: 'XChainClaim';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<XchainClaimProps>): XchainClaim;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function xchainClaim(props: XchainClaimProps): XchainClaim {
  // ── Account ── required, valid XRPL classic/X-address.
  require(
    props.Account,
    'XChainClaim: missing or invalid Account',
    isAccount,
  );

  // ── XChainBridge ── required, full shape (4 keys + valid Issues) +
  //    both doors as valid XRPL accounts.
  require(
    props.XChainBridge,
    'XChainClaim: XChainBridge is required and must have shape {LockingChainDoor, LockingChainIssue, IssuingChainDoor, IssuingChainIssue}',
    isXChainBridge,
  );
  assertValidXChainBridge(props.XChainBridge);

  // ── XChainClaimID ── required, number OR decimal string (UInt64).
  if (!isNumber(props.XChainClaimID) && !isString(props.XChainClaimID)) {
    throw new ValidationError(
      'XChainClaim: XChainClaimID must be a number or decimal string (UInt64)',
    );
  }
  validateXChainClaimIDValue(props.XChainClaimID, 'XChainClaimID');

  // ── Destination ── required, valid XRPL account.
  require(
    props.Destination,
    'XChainClaim: missing or invalid Destination',
    isAccount,
  );

  // ── DestinationTag ── optional UInt32 (XLS-38 §2.3.4.1.4).
  if (props.DestinationTag !== undefined) {
    if (
      !isNumber(props.DestinationTag) ||
      !Number.isInteger(props.DestinationTag) ||
      props.DestinationTag < UINT32_MIN ||
      props.DestinationTag > UINT32_MAX
    ) {
      throw new ValidationError(
        `XChainClaim: DestinationTag must be a UInt32 in [${UINT32_MIN}, ${UINT32_MAX}]`,
      );
    }
  }

  // ── Amount ── required, any Currency Amount form, strictly positive.
  validatePositiveAmount(props.Amount, 'Amount');

  return buildFrozenTx<XchainClaimProps, XchainClaim>(
    'XChainClaim',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: XchainClaim) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: XchainClaim, overrides: Partial<XchainClaimProps>) {
        return xchainClaim(mergeForWith(this, overrides));
      },
    },
  );
}
