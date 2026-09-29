/**
 * Functional EscrowCreate factory — frozen-object style.
 *
 * Set aside XRP (or, under the TokenEscrow amendment, IOU/MPT tokens) in
 * an escrow that delivers them to a predetermined recipient when
 * certain conditions are met. Validation happens at construction;
 * there is no way to construct an invalid tx.
 *
 *   import { escrowCreate } from 'xrplt/fp';
 *   const tx = escrowCreate({ Account, Amount, Destination, FinishAfter: 533171558 });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ CancelAfter: 533257958 });
 *
 * Affected amendments:
 *   - `Escrow` (base XRP escrow)
 *   - `TokenEscrow` (XLS-85: IOU/MPT tokens in addition to XRP)
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/escrowcreate
 * @see https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0085-token-escrow
 *
 * ## Divergences
 *
 * Compared with `src/transactions/escrow-create.ts`, this factory adds
 * preclaim guards the class API skips:
 *
 * 1. **`Amount` must be strictly positive (non-zero, non-negative).**
 *    Source: xrpl.js
 *    (`repo/packages/xrpl/src/models/transactions/escrowCreate.ts:25–28`) —
 *    "Must always be a positive value." The local `isAmount` helper (and the
 *    class) accept any numeric string, including `"0"` and `"-1"`, which the
 *    ledger rejects with `temBAD_AMOUNT`.
 *
 * 2. **`FinishAfter` must be strictly less than `CancelAfter` when both
 *    are present.**
 *    Source: xrpl.org `escrowcreate.md` fields table — "`FinishAfter` …
 *    the escrowed funds can be released to the recipient. This value is
 *    immutable" — combined with the `CancelAfter` description "the funds
 *    can only be returned to the sender after this time" — implying
 *    `FinishAfter < CancelAfter` for any meaningful escrow. The class
 *    does not enforce the ordering.
 *
 * 3. **`Condition` must be a hex string.**
 *    Source: xrpl.org `escrowcreate.md` — "`Condition` — Hex value
 *    representing a PREIMAGE-SHA-256 crypto-condition." The class only
 *    checks `isString(Condition)` and accepts arbitrary text.
 *
 * 4. **Either `FinishAfter` or `Condition` must be specified.**
 *    Source: xrpl.js
 *    (`repo/packages/xrpl/src/models/transactions/escrowCreate.ts:74–78`) —
 *    "Either Condition or FinishAfter must be specified." A conditional
 *    escrow with no `FinishAfter` and no `CancelAfter` would be
 *    unspendable forever; the class does not enforce this.
 *
 * 5. **`Destination` must not equal `Account`.**
 *    Source: XRPL `rippled` preclaim `temMALFORMED` for self-escrow
 *    (`EscrowCreate.cpp` — `if (ctx.tx[sfDestination] == ctx.tx[sfAccount])
 *    return temMALFORMED;`). The class only checks the address format.
 *
 * 6. **`DestinationTag`, `CancelAfter`, `FinishAfter` must be
 *    non-negative integers when provided.**
 *    Source: xrpl.org `escrowcreate.md` — fields are typed `UInt32`.
 *    The class accepts negative numbers as JavaScript `number`s.
 *    Note: the lower bound is `>= 0` (seconds since the Ripple Epoch),
 *    NOT `>= RIPPLE_EPOCH_OFFSET` (which would incorrectly reject every
 *    valid pre-2030 timestamp).
 */
import type { Amount } from '../../types/amounts.js';
import {
  isAccount,
  isAmount,
  isHex,
  isNumber,
  isString,
} from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Public types ────────────────────────────────────────────────────

export interface EscrowCreateProps {
  /** The unique address of the transaction sender. */
  Account: string;
  /** Amount of XRP (drops) or fungible token to set aside. */
  Amount: Amount;
  /** Address to receive escrowed funds. Must differ from `Account`. */
  Destination: string;
  /**
   * Time (seconds since Ripple Epoch) after which the escrow can be
   * cancelled and funds returned to the sender. `UInt32`.
   */
  CancelAfter?: number | undefined;
  /**
   * Time (seconds since Ripple Epoch) after which the escrow can be
   * finished and funds released to the destination. `UInt32`.
   */
  FinishAfter?: number | undefined;
  /**
   * Hex PREIMAGE-SHA-256 crypto-condition. 80 hex chars.
   */
  Condition?: string | undefined;
  /**
   * Optional destination tag (`UInt32`) — e.g. a hosted recipient
   * identifier at the destination address.
   */
  DestinationTag?: number | undefined;
  /** Bit-flags for this transaction. EscrowCreate has no defined flags. */
  Flags?: number | undefined;
  Fee?: string | undefined;
  Sequence?: number | undefined;
}

export interface EscrowCreate extends Readonly<EscrowCreateProps> {
  readonly TransactionType: 'EscrowCreate';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<EscrowCreateProps>): EscrowCreate;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Per xrpl.js docs (escrowCreate.ts:25–28): "Amount … Must always be a
 * positive value." Validates the sign of an Amount in all three
 * accepted forms (XRP drop string, issued-currency object, MPT object).
 *
 * Rejects zero, negative, `-0`, and unparseable values.
 */
function isPositiveAmount(amount: Amount): boolean {
  if (typeof amount === 'string') {
    if (!/^-?[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u.test(amount)) {
      return false;
    }
    return parseFloat(amount) > 0;
  }
  if (typeof amount !== 'object' || amount === null) return false;
  const value = (amount as { value?: unknown }).value;
  if (typeof value !== 'string') return false;
  if (!/^-?[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u.test(value)) {
    return false;
  }
  return parseFloat(value) > 0;
}

/**
 * Validate a `UInt32` field (any unsigned 32-bit integer). The ledger
 * rejects negative values and non-integers. Used for `CancelAfter` /
 * `FinishAfter` (which the docs further constrain to be ≥ Ripple Epoch,
 * enforced separately) and for `DestinationTag`.
 */
function isUInt32(value: unknown): boolean {
  return (
    isNumber(value) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 0xffffffff
  );
}

/**
 * Validate a Ripple Epoch timestamp (`UInt32`, seconds since 2000-01-01).
 *
 * The value is "seconds since the Ripple Epoch" — so any non-negative
 * integer up to 2^32-1 is valid. The lower bound is 0, NOT the
 * Ripple Epoch offset (`946684800`) — that would compare a Ripple Epoch
 * value against a UNIX timestamp value and reject every valid timestamp
 * before 2030.
 *
 * Source: xrpl-dev-portal/repo/docs/references/protocol/transactions/types/escrowcreate.md
 * — "`CancelAfter` … The time, in seconds since the Ripple Epoch, when this
 * escrow expires." Internal type `UInt32`. Example value in the docs:
 * `533257958` (≈ 2016-12-01), well below `RIPPLE_EPOCH_OFFSET`.
 *
 * Used for `CancelAfter` / `FinishAfter`.
 */
function isRippleEpochUInt32(value: unknown): boolean {
  return (
    isNumber(value) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 0xffffffff
  );
}

// ─── Factory ─────────────────────────────────────────────────────────

export function escrowCreate(props: EscrowCreateProps): EscrowCreate {
  // ── Account ── required, must be a valid XRPL classic or X-address.
  require(props.Account, 'EscrowCreate: Account is required', isAccount);

  // ── Destination ── required, must be a valid XRPL classic or X-address.
  if (!isAccount(props.Destination)) {
    throw new ValidationError(
      'EscrowCreate: Destination must be a valid XRPL account address',
    );
  }

  // ── Destination ≠ Account ── rippled preclaim temMALFORMED.
  if (props.Destination === props.Account) {
    throw new ValidationError(
      'EscrowCreate: Destination must not equal Account (cannot escrow to yourself)',
    );
  }

  // ── Amount ── required, must be a valid Amount AND strictly positive.
  if (!isAmount(props.Amount)) {
    throw new ValidationError(
      'EscrowCreate: Amount must be a valid Amount (XRP / trust line / MPT form)',
    );
  }
  if (!isPositiveAmount(props.Amount)) {
    throw new ValidationError(
      'EscrowCreate: Amount must be strictly positive (non-zero, non-negative)',
    );
  }

  // ── CancelAfter + FinishAfter ── at least one must be present, and if
  //    both are, FinishAfter must precede CancelAfter.
  if (props.CancelAfter === undefined && props.FinishAfter === undefined) {
    throw new ValidationError(
      'EscrowCreate: either CancelAfter or FinishAfter must be specified',
    );
  }
  if (props.CancelAfter !== undefined && !isRippleEpochUInt32(props.CancelAfter)) {
    throw new ValidationError(
      'EscrowCreate: CancelAfter must be a non-negative integer in seconds since the Ripple Epoch (UInt32)',
    );
  }
  if (props.FinishAfter !== undefined && !isRippleEpochUInt32(props.FinishAfter)) {
    throw new ValidationError(
      'EscrowCreate: FinishAfter must be a non-negative integer in seconds since the Ripple Epoch (UInt32)',
    );
  }
  if (
    props.CancelAfter !== undefined &&
    props.FinishAfter !== undefined &&
    props.FinishAfter >= props.CancelAfter
  ) {
    throw new ValidationError(
      'EscrowCreate: FinishAfter must be strictly less than CancelAfter',
    );
  }

  // ── FinishAfter or Condition ── at least one must be present.
  //    A pure Condition with no FinishAfter would never release funds if
  //    CancelAfter is also absent, and per xrpl.js the spec explicitly
  //    requires one of the two.
  if (props.FinishAfter === undefined && props.Condition === undefined) {
    throw new ValidationError(
      'EscrowCreate: either FinishAfter or Condition must be specified',
    );
  }

  // ── Condition ── must be a hex string when present. (xrpl.js only
  //    validates the type; the factory enforces hex so obvious typos
  //    are caught at the call site rather than at finish time.)
  if (props.Condition !== undefined) {
    if (!isString(props.Condition) || !isHex(props.Condition)) {
      throw new ValidationError(
        'EscrowCreate: Condition must be a hex string (PREIMAGE-SHA-256 crypto-condition)',
      );
    }
  }

  // ── DestinationTag ── optional, must be a UInt32 when present.
  if (props.DestinationTag !== undefined) {
    if (!isUInt32(props.DestinationTag)) {
      throw new ValidationError(
        'EscrowCreate: DestinationTag must be a positive integer (UInt32)',
      );
    }
  }

  return buildFrozenTx<EscrowCreateProps, EscrowCreate>(
    'EscrowCreate',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: EscrowCreate) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: EscrowCreate, overrides: Partial<EscrowCreateProps>) {
        return escrowCreate(mergeForWith(this, overrides));
      },
    },
  );
}