/**
 * Base transaction field interface.
 *
 * Every XRPL transaction shares these common fields. This is the
 * foundational shape that all transaction classes are built from.
 */
import type { TransactionType } from './transaction-types.js';
import type { Memo, Signer } from './common.js';
import type { GlobalFlagsInterface } from './flags.js';

/**
 * The common fields present on every XRPL transaction.
 */
export interface BaseTransactionFields {
  /** The unique address of the transaction sender. */
  readonly Account: string;

  /**
   * The type of transaction. Inherited as optional here because the
   * concrete `<ClassName>TxFields` interfaces narrow this to a literal
   * (and the class constructor injects the value from its static
   * `<ClassName>.TRANSACTION_TYPE`). Marking it optional lets callers
   * construct via `new X({ Account, ... })` without redundantly passing
   * the discriminator — the constructor takes care of it.
   */
  readonly TransactionType?: TransactionType;

  /**
   * Integer amount of XRP, in drops, to be destroyed as a cost for
   * distributing this transaction to the network.
   */
  readonly Fee?: string | undefined;

  /**
   * The sequence number of the account sending the transaction.
   * 0 means the transaction is using a Ticket instead.
   */
  readonly Sequence?: number | undefined;

  /**
   * Hash value identifying another transaction. If provided, this transaction
   * is only valid if the sending account's previously-sent transaction matches
   * the provided hash.
   */
  readonly AccountTxnID?: string | undefined;

  /**
   * Set of bit-flags for this transaction.
   * Can be a numeric bitmask or a boolean flag map.
   */
  readonly Flags?: number | GlobalFlagsInterface | undefined;

  /**
   * Highest ledger index this transaction can appear in.
   * Places a strict upper limit on how long the transaction can wait
   * to be validated or rejected.
   */
  readonly LastLedgerSequence?: number | undefined;

  /** Additional arbitrary information used to identify this transaction. */
  readonly Memos?: Memo[] | undefined;

  /**
   * Array of objects that represent a multi-signature which authorizes
   * this transaction.
   */
  readonly Signers?: Signer[] | undefined;

  /**
   * Arbitrary integer used to identify the reason for this payment,
   * or a sender on whose behalf this transaction is made.
   */
  readonly SourceTag?: number | undefined;

  /**
   * Hex representation of the public key that corresponds to the private key
   * used to sign this transaction. Empty string indicates multi-sig.
   */
  readonly SigningPubKey?: string | undefined;

  /**
   * The sequence number of the ticket to use in place of a Sequence number.
   * If provided, Sequence must be 0.
   */
  readonly TicketSequence?: number | undefined;

  /**
   * The signature that verifies this transaction as originating from
   * the account it says it is from.
   */
  readonly TxnSignature?: string | undefined;

  /** The network id of the transaction. */
  readonly NetworkID?: number | undefined;

  /** The delegate account that is sending the transaction. */
  readonly Delegate?: string | undefined;

  /** Allow additional fields for forward-compatibility. */
  readonly [key: string]: unknown;
}

/**
 * The NAMED members of {@link BaseTransactionFields}, with the trailing
 * open-ended index signature removed.
 *
 * `BaseTransactionFields` ends with `readonly [key: string]: unknown` so that
 * class-based transactions can carry forward-compatible fields the library
 * does not model yet. That signature is deliberate there — but it makes the
 * interface unusable as a base for a factory's props type:
 *
 *   - `keyof BaseTransactionFields` widens to `string | number`, because the
 *     index signature subsumes every named key.
 *   - `Omit<T, K>` is defined in terms of `keyof T`, so
 *     `Omit<BaseTransactionFields, 'TransactionType' | 'Flags'>` does not
 *     subtract two keys from fourteen — it collapses to a bare index
 *     signature and discards every named member.
 *
 * A factory extending that collapsed type silently loses `Account` as a
 * required field, accepts any misspelled field name, and accepts any value
 * type for the fields it "inherited". The inheritance looks correct in review
 * and enforces nothing at compile time.
 *
 * This type re-projects the interface through a key remap that drops the
 * index signature and keeps each named field with its exact declared type,
 * so a factory can extend it and genuinely inherit the seven shared fields
 * (Memos, SourceTag, LastLedgerSequence, AccountTxnID, NetworkID, Delegate,
 * TicketSequence) with real type checking.
 *
 * Use this, not a bare `Omit<BaseTransactionFields, ...>`, in factory props
 * interfaces.
 */
export type BasePropsFields = {
  [K in keyof BaseTransactionFields as string extends K
    ? never
    : number extends K
      ? never
      : K]: BaseTransactionFields[K];
};

/**
 * A transaction that has been fully prepared for signing.
 * Fee, Sequence, and LastLedgerSequence are guaranteed present.
 */
export type PreparedTransactionFields = BaseTransactionFields & {
  readonly Fee: string;
  readonly Sequence: number;
  readonly LastLedgerSequence: number;
};

/**
 * A transaction that has been signed.
 * SigningPubKey and TxnSignature are guaranteed present.
 */
export type SignedTransactionFields = PreparedTransactionFields & {
  readonly SigningPubKey: string;
  readonly TxnSignature: string;
};
