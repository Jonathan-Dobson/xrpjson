/**
 * Functional PaymentChannelCreate factory — frozen-object style.
 *
 * Creates a unidirectional payment channel and funds it with XRP. The
 * sender becomes the "source address" of the channel and the named
 * Destination becomes the recipient that can claim against it.
 *
 * Validation happens at construction; there is no way to construct an
 * invalid tx from the fields it models.
 *
 *   import { paymentChannelCreate } from 'xrpjson';
 *   const tx = paymentChannelCreate({ Account, Amount, Destination, SettleDelay, PublicKey });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ CancelAfter: 800000000 });
 *
 * Affected amendments:
 *   - `PayChan` (base PaymentChannelCreate)
 *   - `fixPayChanCancelAfter` (CancelAfter must be > parentCloseTime)
 *   - `DisallowIncoming` (Destination with lsfDisallowIncomingPayChan flag
 *     rejects the tx — runtime-only)
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/paymentchannelcreate
 * @see https://github.com/XRPLF/rippled/blob/develop/src/libxrpl/tx/transactors/payment_channel/PaymentChannelCreate.cpp
 *
 * ## Divergences
 * The factory enforces five preclaim checks that the class API
 * (the Class API's `PaymentChannelCreate`) and/or `xrpl.js`
 * (`validatePaymentChannelCreate`) skip:
 *
 *   1. `Amount` must be in XRP-drops form only (a decimal/integer string)
 *      AND strictly positive (> 0).
 *      Source: rippled PaymentChannelCreate.cpp `preflight` —
 *      `if (!isXRP(ctx.tx[sfAmount]) || (ctx.tx[sfAmount] <= beast::kZero)) return temBAD_AMOUNT;`
 *      xrpl.js `validatePaymentChannelCreate` only requires the field to
 *      be a string and `isAmount` (in `src/validation/helpers.ts`)
 *      accepts IOU/MPT object forms. The class API in this repo uses
 *      `isAmount`, which would also accept IOU/MPT — both diverge from
 *      the ledger's hard XRP-only constraint.
 *
 *   2. `Destination` must not equal `Account` (no self-channel).
 *      Source: rippled PaymentChannelCreate.cpp `preflight` —
 *      `if (ctx.tx[sfAccount] == ctx.tx[sfDestination]) return temDST_IS_SRC;`
 *      xrpl.js `validatePaymentChannelCreate` does not enforce this;
 *      the class API in this repo does not enforce it either.
 *
 *   3. `PublicKey` must be a non-empty hex string whose decoded length is
 *      32 bytes (Ed25519) or 33 bytes (compressed secp256k1).
 *      Source: rippled PaymentChannelCreate.cpp `preflight` —
 *      `if (!publicKeyType(ctx.tx[sfPublicKey])) return temMALFORMED;`
 *      xrpl.js `validatePaymentChannelCreate` only requires the field to
 *      be a string; the class API in this repo also only requires a
 *      string.
 *
 *   4. `SettleDelay` must be a non-negative integer that fits in a
 *      UInt32 (`>= 0` and `<= 0xFFFFFFFF`).
 *      Source: xrpl.org docs (`/docs/references/protocol/transactions/types/paymentchannelcreate`)
 *      — "SettleDelay | Number | UInt32". xrpl.js only checks it is a
 *      number; the class API in this repo also only checks it is a
 *      number (no range guard). The factory rejects negative values,
 *      non-integers, and out-of-range values.
 *
 *   5. `CancelAfter`, if supplied, must be a non-negative integer that
 *      fits in a UInt32 (i.e. seconds-since-Ripple-Epoch).
 *      Source: xrpl.org docs — "CancelAfter | Number | UInt32". Same
 *      reasoning as (4); additionally the `fixPayChanCancelAfter`
 *      amendment requires it to be greater than parentCloseTime, but
 *      that requires live ledger state and is not locally checkable.
 *
 * Preclaim checks that require ledger state (NOT locally checkable):
 *   - Destination account must exist (`tecNO_DST`).
 *   - Destination must not block incoming payment channels
 *     (`lsfDisallowIncomingPayChan` -> `tecNO_PERMISSION`).
 *   - Destination must not be a pseudo-account (`tecNO_PERMISSION`).
 *   - Source account must have sufficient balance + reserve to fund
 *     the channel (`tecUNFUNDED` / `tecINSUFFICIENT_RESERVE`).
 *   - If destination has `lsfRequireDestTag`, `DestinationTag` is required
 *     (`tecDST_TAG_NEEDED`).
 */
import type { BasePropsFields } from '../../types/base.js';
import { isAccount, isHex, isString } from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// UInt32 max (4-byte unsigned). SettleDelay / CancelAfter / DestinationTag
// are documented as UInt32 in the XRPL protocol.
const UINT32_MAX = 0xFFFFFFFF;

// A secp256k1 compressed public key is 33 bytes; an Ed25519 public key
// is 32 bytes. Both are accepted per rippled `publicKeyType()`.
const ALLOWED_PUBLIC_KEY_HEX_LENGTHS = [64, 66] as const;

/**
 * Strictly-positive XRP drops Amount.
 *
 * Accepts canonical XRP drops mantissa form (decimal or scientific)
 * and rejects zero, negative, and non-numeric values. Used for
 * PaymentChannelCreate, where Amount must be XRP-only and > 0.
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
export interface PaymentChannelCreateProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  /** The unique address of the transaction sender (becomes the channel owner). */
  Account: string;
  /** Amount of XRP, in drops, to set aside in the channel. Must be > 0. */
  Amount: string;
  /** The account that can receive XRP claims against this channel. */
  Destination: string;
  /** Seconds the source must wait before closing the channel. UInt32. */
  SettleDelay: number;
  /**
   * 33-byte (secp256k1) or 32-byte (Ed25519) public key in hex.
   */
  PublicKey: string;
  /** Time (seconds since Ripple Epoch) when the channel expires. UInt32. */
  CancelAfter?: number | undefined;
  /** Arbitrary tag for the destination. UInt32. */
  DestinationTag?: number | undefined;
  /** Bit-flags for this transaction. PaymentChannelCreate has no defined flags. */
  Flags?: number | undefined;
}

export interface PaymentChannelCreate
  extends Readonly<PaymentChannelCreateProps> {
  readonly TransactionType: 'PaymentChannelCreate';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(
    overrides: Partial<PaymentChannelCreateProps>,
  ): PaymentChannelCreate;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function paymentChannelCreate(
  props: PaymentChannelCreateProps,
): PaymentChannelCreate {
  // ── Account ── required, must be a valid XRPL classic or X-address.
  require(
    props.Account,
    'PaymentChannelCreate: Account is required',
    isAccount,
  );

  // ── Destination ── required, must be a valid account AND must not
  //    equal Account (rippled `temDST_IS_SRC`).
  require(
    props.Destination,
    'PaymentChannelCreate: Destination is required',
    isAccount,
  );
  if (props.Destination === props.Account) {
    throw new ValidationError(
      'PaymentChannelCreate: Destination must not equal Account (temDST_IS_SRC)',
    );
  }

  // ── Amount ── required, must be a strictly-positive XRP drops string.
  //    The ledger refuses IOU/MPT forms outright (temBAD_AMOUNT); both
  //    xrpl.js and the class API in this repo accept any string-or-Amount
  //    form, so this is a divergence.
  if (!isXrpAmount(props.Amount)) {
    throw new ValidationError(
      'PaymentChannelCreate: Amount must be a strictly-positive XRP drops string (temBAD_AMOUNT)',
    );
  }

  // ── SettleDelay ── required, UInt32 (non-negative integer in
  //    [0, 0xFFFFFFFF]).
  if (!isUInt32(props.SettleDelay)) {
    throw new ValidationError(
      'PaymentChannelCreate: SettleDelay must be a non-negative integer in [0, 0xFFFFFFFF] (UInt32)',
    );
  }

  // ── PublicKey ── required, hex string, 32 or 33 bytes.
  if (!isString(props.PublicKey) || !isHex(props.PublicKey)) {
    throw new ValidationError(
      'PaymentChannelCreate: PublicKey must be a hex string',
    );
  }
  if (
    !ALLOWED_PUBLIC_KEY_HEX_LENGTHS.includes(
      props.PublicKey.length as 64 | 66,
    )
  ) {
    throw new ValidationError(
      `PaymentChannelCreate: PublicKey hex must be 64 (Ed25519, 32 bytes) or 66 (secp256k1, 33 bytes) characters; got ${props.PublicKey.length} hex chars (temMALFORMED)`,
    );
  }

  // ── CancelAfter ── optional UInt32.
  if (props.CancelAfter !== undefined && !isUInt32(props.CancelAfter)) {
    throw new ValidationError(
      'PaymentChannelCreate: CancelAfter must be a non-negative integer in [0, 0xFFFFFFFF] (UInt32)',
    );
  }

  // ── DestinationTag ── optional UInt32.
  if (
    props.DestinationTag !== undefined &&
    !isUInt32(props.DestinationTag)
  ) {
    throw new ValidationError(
      'PaymentChannelCreate: DestinationTag must be a non-negative integer in [0, 0xFFFFFFFF] (UInt32)',
    );
  }

  // ─── Base transaction fields ───
  // Catches the seven shared base fields this factory does not otherwise
  // check: Memos, SourceTag, LastLedgerSequence, AccountTxnID, NetworkID,
  // Delegate, TicketSequence.
  //
  // Placed AFTER the PaymentChannelCreate-specific checks so a more specific message
  // wins for a more specific mistake, and this acts as the backstop for
  // everything shared across transaction types.
  //
  // `TransactionType` is supplied because the validator checks a transaction,
  // not a props bag — the factory injects it in `buildFrozenTx` below.
  validateBaseTransaction({ TransactionType: 'PaymentChannelCreate', ...props });

  return buildFrozenTx<PaymentChannelCreateProps, PaymentChannelCreate>(
    'PaymentChannelCreate',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: PaymentChannelCreate) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(
        this: PaymentChannelCreate,
        overrides: Partial<PaymentChannelCreateProps>,
      ) {
        return paymentChannelCreate(mergeForWith(this, overrides));
      },
    },
  );
}