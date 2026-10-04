/**
 * Functional PaymentChannelFund factory — frozen-object style.
 *
 * Adds XRP to an existing payment channel and optionally updates its
 * mutable `Expiration`. Only the channel's source account may submit
 * this transaction (enforced at runtime by the ledger; the factory
 * just verifies the field-level shape).
 *
 * Validation happens at construction; there is no way to construct an
 * invalid tx.
 *
 *   import { paymentChannelFund } from 'xrpjson';
 *   const tx = paymentChannelFund({ Account, Channel, Amount });
 *   const tx2 = tx.with({ Expiration: 543171558 });
 *   const j = tx.toJSON();
 *
 * Affected amendments:
 *   - `PayChan` (base PaymentChannelFund)
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/paymentchannelfund
 * @see https://xrpl.org/docs/references/protocol/ledger-data/ledger-entry-types/paychannel
 *
 * ## Divergences
 * The factory enforces three preflight guards that the class API
 * (the Class API's `PaymentChannelFund`) and/or `xrpl.js`
 * (`validatePaymentChannelFund`) skip:
 *
 *   1. `Amount` must be an XRP-drops string (decimal/scientific mantissa)
 *      AND strictly positive (> 0). IOU / MPT object forms are rejected.
 *      Source: xrpl.org docs (`/docs/references/protocol/transactions/types/paymentchannelfund`)
 *      — "Amount of XRP, in drops, to add to the channel. Must be a positive
 *      amount of XRP." plus the `temBAD_AMOUNT` row — "The amount must
 *      either be XRP or fungible tokens and cannot be zero or negative."
 *      (The IOU/MPT path only activates if the XLS-34 `PaychanAndEscrowForTokens`
 *      amendment becomes enabled — currently only proposed, not active.)
 *      xrpl.js `validatePaymentChannelFund` only checks the field is a string;
 *      the class API in this repo uses `isAmount` (which accepts IOU/MPT object
 *      forms), so both diverge from the active ledger's XRP-only constraint.
 *
 *   2. `Channel` must be a 64-character hex string (UInt256).
 *      Source: xrpl.org docs — "Channel | String - Hexadecimal | UInt256 | Yes |
 *      The unique ID of the channel to fund." Also `account_channels` RPC:
 *      "channel_id ... as a 64-character hexadecimal string".
 *      xrpl.js `validatePaymentChannelFund` only checks it is a string; the
 *      class API in this repo also only checks it is a string. Both would
 *      accept malformed channel IDs that the ledger cannot resolve
 *      (`tecNO_ENTRY` at runtime).
 *
 *   3. `Expiration`, if supplied, must be a non-negative integer that fits
 *      in a UInt32 (`>= 0` and `<= 0xFFFFFFFF`).
 *      Source: xrpl.org docs — "Expiration | Number | UInt32 | No | New expiration
 *      time to set for the channel, in seconds since the Ripple Epoch."
 *      xrpl.js only checks `typeof === 'number'` (no range guard); the class
 *      API in this repo does not validate `Expiration` at all.
 *
 * Preclaim / runtime checks that require ledger state (NOT locally
 * checkable):
 *   - The `Channel` must reference an existing PayChannel ledger entry
 *     (`tecNO_ENTRY`).
 *   - The sender (`Account`) must be the source address of that channel
 *     (`tecNO_PERMISSION`).
 *   - The source account must hold enough XRP to fund `Amount` plus the
 *     reserve (`tecUNSUFFICIENT_RESERVE` / `tecUNFUNDED`).
 *   - `Expiration` must not be earlier than `now + SettleDelay` nor earlier
 *     than the channel's current `Expiration` (`temBAD_EXPIRATION`).
 *   - Destination account deletion handling per `fixPayChanRecipientOwnerDir`
 *     (`tecNO_DST`) — only possible for channels created before that
 *     amendment.
 */
import type { BasePropsFields } from '../../types/base.js';
import {
  isAccount,
  isLedgerEntryId,
  isString,
} from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// UInt32 max (4-byte unsigned). Expiration is documented as UInt32 in the
// XRPL protocol (seconds since Ripple Epoch).
const UINT32_MAX = 0xFFFFFFFF;

// ─── Helpers (local — mirrors payment-channel-create.ts) ─────────────

/**
 * Strictly-positive XRP drops Amount.
 *
 * Accepts canonical XRP drops mantissa form (decimal or scientific) and
 * rejects zero, negative, non-numeric, and non-string (IOU/MPT object)
 * values. Used for PaymentChannelFund, where Amount must be XRP-only
 * and > 0.
 */
function isXrpAmount(value: unknown): boolean {
  if (!isString(value)) return false;
  if (!/^[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u.test(value)) {
    return false;
  }
  const n = parseFloat(value);
  return n > 0;
}

/**
 * Validate a UInt32 (non-negative integer, <= 0xFFFFFFFF).
 */
function isUInt32(value: unknown): boolean {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= UINT32_MAX
  );
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
export interface PaymentChannelFundProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  /** The unique address of the transaction sender (must be the channel source). */
  Account: string;
  /** Unique ID of the channel to fund, as a 64-character hex (UInt256). */
  Channel: string;
  /** Amount of XRP, in drops, to add to the channel. Must be > 0. */
  Amount: string;
  /**
   * New mutable expiration time for the channel, in seconds since the
   * Ripple Epoch (UInt32). Optional.
   */
  Expiration?: number | undefined;
  /** Bit-flags for this transaction. PaymentChannelFund has no defined flags. */
  Flags?: number | undefined;
}

export interface PaymentChannelFund
  extends Readonly<PaymentChannelFundProps> {
  readonly TransactionType: 'PaymentChannelFund';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<PaymentChannelFundProps>): PaymentChannelFund;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function paymentChannelFund(
  props: PaymentChannelFundProps,
): PaymentChannelFund {
  // ── Account ── required, must be a valid XRPL classic or X-address.
  require(
    props.Account,
    'PaymentChannelFund: Account is required',
    isAccount,
  );

  // ── Channel ── required, 64-char hex (UInt256).
  require(
    props.Channel,
    'PaymentChannelFund: Channel is required',
    isLedgerEntryId,
  );

  // ── Amount ── required, must be a strictly-positive XRP drops string.
  //    The active ledger refuses IOU/MPT forms; the XLS-34
  //    `PaychanAndEscrowForTokens` amendment that would enable IOU/MPT
  //    funding is only proposed, not active. xrpl.js and the class API
  //    both diverge from this hard XRP-only constraint.
  if (!isXrpAmount(props.Amount)) {
    throw new ValidationError(
      'PaymentChannelFund: Amount must be a strictly-positive XRP drops string (temBAD_AMOUNT)',
    );
  }

  // ── Expiration ── optional UInt32.
  if (props.Expiration !== undefined && !isUInt32(props.Expiration)) {
    throw new ValidationError(
      'PaymentChannelFund: Expiration must be a non-negative integer in [0, 0xFFFFFFFF] (UInt32)',
    );
  }

  // ─── Base transaction fields ───
  // Catches the seven shared fields this factory now accepts through
  // `BasePropsFields` but does not otherwise check: Memos, SourceTag,
  // LastLedgerSequence, AccountTxnID, NetworkID, Delegate, TicketSequence.
  // Placed AFTER the PaymentChannelFund-specific checks so a more specific
  // message wins for a more specific mistake, and this acts as the backstop for
  // everything shared across transaction types.
  //
  // `TransactionType` is supplied because the validator checks a transaction,
  // not a props bag — the factory injects it in `buildFrozenTx` below.
  validateBaseTransaction({ TransactionType: 'PaymentChannelFund', ...props });

  return buildFrozenTx<PaymentChannelFundProps, PaymentChannelFund>(
    'PaymentChannelFund',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: PaymentChannelFund) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: PaymentChannelFund,
        overrides: Partial<PaymentChannelFundProps>,
      ) {
        return paymentChannelFund(mergeForWith(this, overrides));
      },
    },
  );
}
