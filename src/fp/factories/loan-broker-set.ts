/**
 * Functional LoanBrokerSet factory — frozen-object style.
 *
 * Creates or updates a `LoanBroker` ledger entry. A `LoanBroker` owns a
 * `Vault` and configures the protocol settings (management fee rate, debt
 * maximum, cover rates). Creation and modification share one transaction
 * type; the presence of `LoanBrokerID` distinguishes them ("update" vs
 * "create"). Validation happens at construction; there is no way to
 * construct an invalid tx.
 *
 *   import { loanBrokerSet } from 'xrpjson';
 *   // Create
 *   const tx = loanBrokerSet({ Account, VaultID });
 *   // Update (must not change fixed fields)
 *   const tx2 = loanBrokerSet({
 *     Account, VaultID, LoanBrokerID, Data: '7B...',
 *   });
 *   const j = tx.toJSON();
 *   const tx3 = tx.with({ ManagementFeeRate: 100 });
 *
 * Affected amendments:
 *   - `LendingProtocol` (base LoanBrokerSet)
 *   - `LendingProtocolV1_1` (closed-ended vault constraints; locally
 *     uncheckable — that constraint compares against on-ledger state.)
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/loanbrokerset
 * @see XLS-66 §3.3 (Transaction: `LoanBrokerSet`)
 *      in `~/.mavis/docs.local/xrpl-standards/repo/XLS-0066-lending-protocol/README.md`
 *      (line 563)
 *
 * ## Divergences
 *
 * The factory enforces four preclaim checks that the class API
 * (the Class API's `LoanBrokerSet`) and xrpl.js's
 * `validateLoanBrokerSet` both skip. Each one comes from a named check in
 * XLS-66 §3.3.3.1.
 *
 *   1. `VaultID` must not be the all-zeros HASH256 value.
 *      Source: XLS-66 §3.3.3.1 check 1 — "`VaultID` is zero. (`temINVALID`)"
 *      (`~/.mavis/docs.local/xrpl-standards/repo/XLS-0066-lending-protocol/README.md`
 *      line 589).
 *      The class and `validateLoanBrokerSet` only call
 *      `isLedgerEntryId(tx.VaultID)`, which the all-zeros string
 *      satisfies (`~/.mavis/docs/xrpl.js/.../loanBrokerSet.ts` lines 87–91).
 *
 *   2. `LoanBrokerID` must not be the all-zeros HASH256 value when present.
 *      Source: XLS-66 §3.3.3.1 check 8 — "`LoanBrokerID` is specified
 *      and is zero. (`temINVALID`)" (line 596).
 *      Same `isLedgerEntryId`-only gap as `LoanBrokerDelete`.
 *
 *   3. When `LoanBrokerID` is present (modification path), none of the
 *      fixed fields (`ManagementFeeRate`, `CoverRateMinimum`,
 *      `CoverRateLiquidation`) may be supplied.
 *      Source: XLS-66 §3.3.3.1 check 9 — "`LoanBrokerID` is specified
 *      and the submitter is attempting to modify fixed fields
 *      (`ManagementFeeRate`, `CoverRateMinimum`, `CoverRateLiquidation`).
 *      (`temINVALID`)" (line 597).
 *      The class does not implement it; neither does `validateLoanBrokerSet`.
 *      Only `Data` and `DebtMaximum` are mutable on existing entries
 *      (XLS-66 §3.3.4 lines 646–647).
 *
 *   4. `ManagementFeeRate`, `CoverRateMinimum`, `CoverRateLiquidation`
 *      must be integers (not fractional).
 *      Source: XLS-66 §3.3.1 — internal types `UINT16` and `UINT32`
 *      respectively (lines 576, 578, 579).
 *      The class does check `Number.isInteger` via its `rateInRange`
 *      helper. `validateLoanBrokerSet` accepts any number including
 *      `1.5`, since the check is `< 0` and `> max` only
 *      (`loanBrokerSet.ts` lines 105–137).
 *
 * Note: `Account` is also validated as a classic/X-address here. The class
 * delegates Account validation to its `LoanTransaction` base class; we
 * re-implement it explicitly so a malformed Account fails at construction
 * time, identically to the other loan fp factories.
 */
import type { GlobalFlagsInterface } from '../../types/flags.js';
import { isAccount, isHex, isNumber, isString } from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// VaultID / LoanBrokerID are HASH256 = 32 bytes = 64 hex chars.
const HASH256_LENGTH = 64;
// All-zeros HASH256 is reserved / malformed per XLS-66 §3.3.3.1 checks 1 & 8.
const HASH256_ZERO =
  '0000000000000000000000000000000000000000000000000000000000000000';

// Spec caps (XLS-66 §3.3.1).
const MAX_DATA_LENGTH_CHARS = 512; // 256 bytes = 512 hex chars.
const MAX_MANAGEMENT_FEE_RATE = 10_000; // 1/10 bp; 0%–10% (UINT16).
const MAX_COVER_RATE = 100_000; // 1/10 bp; 0%–100% (UINT32).

// ─── Public types ────────────────────────────────────────────────────

export interface LoanBrokerSetProps {
  /** The unique address of the transaction sender (must be `Vault.Owner`). */
  Account: string;
  /** The Vault ID that the Lending Protocol will use to access liquidity. 64-char hex, non-zero. */
  VaultID: string;
  /** LoanBrokerID when updating an existing entry (64-char hex, non-zero). */
  LoanBrokerID?: string | undefined;
  /** Bit-flags for this transaction. The spec defines none — pass-through only. */
  Flags?: number | GlobalFlagsInterface | undefined;
  /** Arbitrary metadata in hex format, 1–512 hex chars (≤ 256 bytes). */
  Data?: string | undefined;
  /** Management fee rate in 1/10 bp; integer 0–10000 (0%–10%). */
  ManagementFeeRate?: number | undefined;
  /** Max protocol debt owed to the Vault; 0 = unlimited. Non-negative base-10 integer string. */
  DebtMaximum?: string | undefined;
  /** Min cover rate for first-loss capital; integer 0–100000 (1/10 bp). */
  CoverRateMinimum?: number | undefined;
  /** Cover-rate liquidation cap; integer 0–100000 (1/10 bp). */
  CoverRateLiquidation?: number | undefined;
  /** Fee in XRP (drops), base-10 integer string. */
  Fee?: string | undefined;
  /** Account sequence number. */
  Sequence?: number | undefined;
}

export interface LoanBrokerSet extends Readonly<LoanBrokerSetProps> {
  readonly TransactionType: 'LoanBrokerSet';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<LoanBrokerSetProps>): LoanBrokerSet;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * True when `value` is an integer in `[min, max]` inclusive. Mirrors
 * the class's private `rateInRange` helper but lives at module scope
 * so it can be reused by both ManagementFeeRate and the cover-rate
 * range checks.
 */
function rateInRange(value: number, min: number, max: number): boolean {
  return (
    isNumber(value) &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

// ─── Factory ─────────────────────────────────────────────────────────

export function loanBrokerSet(props: LoanBrokerSetProps): LoanBrokerSet {
  // ── Account ── required, must be a valid XRPL classic/X-address.
  require(props.Account, 'LoanBrokerSet: Account is required', isAccount);

  // ── VaultID ── required, 64-char hex AND non-zero.
  // XLS-66 §3.3.3.1 check 1: "`VaultID` is zero. (`temINVALID`)".
  if (
    !isString(props.VaultID) ||
    !isHex(props.VaultID) ||
    props.VaultID.length !== HASH256_LENGTH
  ) {
    throw new ValidationError(
      'LoanBrokerSet: VaultID must be a 64-character hex string',
    );
  }
  if (props.VaultID === HASH256_ZERO) {
    throw new ValidationError(
      'LoanBrokerSet: VaultID must not be the all-zeros HASH256 value',
    );
  }

  // ── LoanBrokerID ── optional, 64-char hex AND non-zero.
  // XLS-66 §3.3.3.1 check 8: "`LoanBrokerID` is specified and is zero".
  if (props.LoanBrokerID !== undefined) {
    if (
      !isString(props.LoanBrokerID) ||
      !isHex(props.LoanBrokerID) ||
      props.LoanBrokerID.length !== HASH256_LENGTH
    ) {
      throw new ValidationError(
        'LoanBrokerSet: LoanBrokerID must be a 64-character hex string',
      );
    }
    if (props.LoanBrokerID === HASH256_ZERO) {
      throw new ValidationError(
        'LoanBrokerSet: LoanBrokerID must not be the all-zeros HASH256 value',
      );
    }
  }

  // ── Fixed-field guard for the modification path ──
  // XLS-66 §3.3.3.1 check 9: when LoanBrokerID is specified (modifying an
  // existing entry), ManagementFeeRate / CoverRateMinimum /
  // CoverRateLiquidation are fixed and cannot be re-supplied. Only
  // `Data` and `DebtMaximum` are mutable (XLS-66 §3.3.4 lines 646–647).
  if (props.LoanBrokerID !== undefined) {
    const attempted: string[] = [];
    if (props.ManagementFeeRate !== undefined) attempted.push('ManagementFeeRate');
    if (props.CoverRateMinimum !== undefined) attempted.push('CoverRateMinimum');
    if (props.CoverRateLiquidation !== undefined) attempted.push('CoverRateLiquidation');
    if (attempted.length > 0) {
      throw new ValidationError(
        `LoanBrokerSet: cannot modify fixed field(s) when LoanBrokerID is specified: ${attempted.join(', ')}`,
      );
    }
  }

  // ── Data ── hex, 1–512 chars (≤ 256 bytes).
  if (props.Data !== undefined) {
    if (!isString(props.Data) || !isHex(props.Data)) {
      throw new ValidationError(
        'LoanBrokerSet: Data must be a valid non-empty hex string',
      );
    }
    if (props.Data.length === 0 || props.Data.length > MAX_DATA_LENGTH_CHARS) {
      throw new ValidationError(
        `LoanBrokerSet: Data must be 1 to ${MAX_DATA_LENGTH_CHARS} hex characters (actual: ${props.Data.length})`,
      );
    }
  }

  // ── ManagementFeeRate ── integer in [0, 10000] (1/10 bp; 0%–10%).
  if (props.ManagementFeeRate !== undefined) {
    if (!rateInRange(props.ManagementFeeRate, 0, MAX_MANAGEMENT_FEE_RATE)) {
      throw new ValidationError(
        `LoanBrokerSet: ManagementFeeRate must be an integer between 0 and ${MAX_MANAGEMENT_FEE_RATE} inclusive`,
      );
    }
  }

  // ── DebtMaximum ── non-negative base-10 integer string.
  if (props.DebtMaximum !== undefined) {
    if (
      !isString(props.DebtMaximum) ||
      !/^[0-9]+$/u.test(props.DebtMaximum)
    ) {
      throw new ValidationError(
        'LoanBrokerSet: DebtMaximum must be a non-negative base-10 integer string',
      );
    }
  }

  // ── CoverRateMinimum / CoverRateLiquidation ranges.
  if (
    props.CoverRateMinimum !== undefined &&
    !rateInRange(props.CoverRateMinimum, 0, MAX_COVER_RATE)
  ) {
    throw new ValidationError(
      `LoanBrokerSet: CoverRateMinimum must be an integer between 0 and ${MAX_COVER_RATE} inclusive`,
    );
  }
  if (
    props.CoverRateLiquidation !== undefined &&
    !rateInRange(props.CoverRateLiquidation, 0, MAX_COVER_RATE)
  ) {
    throw new ValidationError(
      `LoanBrokerSet: CoverRateLiquidation must be an integer between 0 and ${MAX_COVER_RATE} inclusive`,
    );
  }

  // ── Cover-rate coupling rule ──
  // XLS-66 §3.3.3.1 check 7: "One of `CoverRateMinimum` and
  // `CoverRateLiquidation` is zero, and the other one is not. (Either
  // both are zero, or both are non-zero) (`temINVALID`)".
  const coverMin = props.CoverRateMinimum ?? 0;
  const coverLiq = props.CoverRateLiquidation ?? 0;
  if ((coverMin === 0) !== (coverLiq === 0)) {
    throw new ValidationError(
      'LoanBrokerSet: CoverRateMinimum and CoverRateLiquidation must both be zero or both be non-zero',
    );
  }

  // ── Flags ── spec defines no per-tx flags; pass-through only. We do
  // not reject non-zero numeric Flags because the field is reserved for
  // future amendments. Object-form Flags are also pass-through (the spec
  // doesn't define a `LoanBrokerSetFlagsInterface`).

  return buildFrozenTx<LoanBrokerSetProps, LoanBrokerSet>(
    'LoanBrokerSet',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: LoanBrokerSet) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: LoanBrokerSet, overrides: Partial<LoanBrokerSetProps>) {
        return loanBrokerSet(mergeForWith(this, overrides));
      },
    },
  );
}