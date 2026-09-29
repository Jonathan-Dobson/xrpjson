/**
 * Functional Payment factory — frozen-object style.
 *
 *   import { payment } from 'xrplt/fp';
 *   const tx = payment({ Account, Destination, Amount });
 *   tx.validate();   // throws if construction didn't already
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Fee: '12', Sequence: 42 });
 *
 * Compare with the class-based equivalent:
 *
 *   import { Payment } from 'xrplt';
 *   const tx = new Payment({ Account, Destination, Amount });
 *   tx.validate();   // must be called explicitly
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Fee: '12', Sequence: 42 });
 *
 * The functional version validates at construction. There is no way to
 * build an invalid tx — `with()` re-runs the factory, so overrides are
 * re-validated too.
 *
 * Tree-shaking: a consumer that only imports `payment` should pull in
 * ONLY this file plus its direct imports (validators, types). The class
 * registry and 70 other leaf files should NOT appear in the bundle.
 */
import type { Amount } from '../../types/amounts.js';
import type { PathStep } from '../../types/common.js';
import type { PaymentFlagsInterface } from '../../types/flags.js';
import { isAccount, isAmount } from '../../validation/helpers.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Public types ────────────────────────────────────────────────────

export interface PaymentProps {
  /** The unique address of the transaction sender. */
  Account: string;
  /** The amount of currency to deliver. */
  Amount: Amount;
  /** The address to receive the funds. */
  Destination: string;
  /** Arbitrary destination tag for the recipient. */
  DestinationTag?: number | undefined;
  /** Hash of a check or other condition for the payment. */
  InvoiceID?: string | undefined;
  /** Minimum amount to deliver (requires tfPartialPayment). */
  DeliverMin?: Amount | undefined;
  /** Payment paths for cross-currency transfers. */
  Paths?: PathStep[][] | undefined;
  /** Maximum amount to spend including fees/slippage. */
  SendMax?: Amount | undefined;
  /** Bit-flags for this transaction. */
  Flags?: number | PaymentFlagsInterface | undefined;
  // Common base fields — included here for completeness; the class
  // version also accepts them via the BaseTransactionFields spread.
  Fee?: string | undefined;
  Sequence?: number | undefined;
}

export interface Payment extends Readonly<PaymentProps> {
  readonly TransactionType: 'Payment';
  /** No-op: validation already happened at construction. */
  validate(): void;
  /** Serialize to a plain object matching `xrpl.js` input shape. */
  toJSON(): Record<string, unknown>;
  /** Derive a new Payment with overrides applied; re-validates. */
  with(overrides: Partial<PaymentProps>): Payment;
}

// ─── Factory ────────────────────────────────────────────────────────

/**
 * Build a frozen Payment. Throws ValidationError on construction if
 * fields are missing or malformed.
 */
export function payment(props: PaymentProps): Payment {
  // ─── Validate at construction ───
  require(props.Account, 'Payment: missing or invalid Account', isAccount);
  require(props.Amount, 'Payment: missing or invalid Amount', isAmount);
  require(props.Destination, 'Payment: missing or invalid Destination', isAccount);

  if (props.DeliverMin !== undefined) {
    const f = props.Flags as
      | number
      | PaymentFlagsInterface
      | undefined;
    const hasPartialFlag =
      typeof f === 'number'
        ? (f & 0x00020000) !== 0
        : (f as PaymentFlagsInterface | undefined)?.tfPartialPayment;
    if (!hasPartialFlag) {
      throw new Error(
        'Payment: DeliverMin requires tfPartialPayment flag',
      );
    }
  }

  // ─── Build frozen shape ───
  return buildFrozenTx<PaymentProps, Payment>(
    'Payment',
    props,
    {
      validate(this: Payment) {
        // Construction-time validation is the contract. Calling this is a
        // no-op so consumers who write `tx.validate()` on a fp tx don't
        // have to special-case the API surface.
      },
      toJSON(this: Payment) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: Payment, overrides: Partial<PaymentProps>) {
        // Re-invoke the factory so overrides are re-validated. Spread the
        // current tx's enumerable own properties (skipping functions) and
        // apply overrides on top.
        return payment(mergeForWith(this, overrides));
      },
    },
  );
}