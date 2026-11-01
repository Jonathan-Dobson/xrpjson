/**
 * Functional Payment factory — frozen-object style.
 *
 *   import { payment } from 'xrpjson';
 *   const tx = payment({ Account, Destination, Amount });
 *   tx.validate();   // throws if construction didn't already
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Fee: '12', Sequence: 42 });
 *
 * Compare with the class-based equivalent, where fields are assigned to
 * an instance and validate() must be called explicitly:
 *
 *   const tx = new Payment({ Account, Destination, Amount });
 *   tx.validate();   // must be called explicitly
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Fee: '12', Sequence: 42 });
 *
 * The functional version validates at construction. There is no way to
 * build an invalid tx from the fields it models — `with()` re-runs the factory, so overrides are
 * re-validated too.
 *
 * Tree-shaking: a consumer that only imports `payment` should pull in
 * ONLY this file plus its direct imports (validators, types). The class
 * registry and 70 other leaf files should NOT appear in the bundle.
 *
 * ## Divergences
 *
 * The class-based API at the Class API's `Payment` is missing one rule
 * that the canonical sources require. The factory adds it:
 *
 *   1. `Account` must be a well-formed XRPL classic or X-address.
 *      The class API's base validator checks `Account` with `isString`
 *      only, so `"not-an-address"` passes. The factory requires a
 *      well-formed address — a format check, not a checksum verification.
 *      rippled parses `Account` as an `AccountID` and rejects anything
 *      that is neither hex nor valid base58, so the rule is the ledger's
 *      own; xrpl.js checks the field with `isString` and ignores it.
 *      Source: rippled `src/libxrpl/protocol/STParsedJSON.cpp:919`
 *              (`case STI_ACCOUNT:`);
 *              xrpl.js `models/transactions/common.ts:987`
 *              (`validateRequiredField(common, 'Account', isString)`);
 *              Class API `src/validation/base.ts:40–41`.
 *
 *   2. `CredentialIDs` is not declared by the class.
 *      The class exposes no `CredentialIDs` field, so callers using the
 *      class API cannot authorize a payment with deposit credentials
 *      (XLS-0070). The factory adds the field with the same validation
 *      the `accountDelete` factory applies to the same field: when present
 *      the array must be non-empty, length ≤ `MAX_AUTHORIZED_CREDENTIALS`
 *      (8), each entry a 64-char hex string, and contain no duplicates.
 *      Source: rippled `include/xrpl/protocol/detail/transactions.macro`
 *              (the `ttPAYMENT` block lists `{sfCredentialIDs,
 *              SoeOptional}`);
 *              xrpl.js `models/transactions/payment.ts` lines 214–218
 *              (`validateCredentialsList(tx.CredentialIDs, …, true,
 *              MAX_AUTHORIZED_CREDENTIALS)`);
 *              xrpl.js `models/transactions/common.ts:28`
 *              (`MAX_AUTHORIZED_CREDENTIALS = 8`).
 *
 *   3. `DomainID` is not declared by the class.
 *      The class exposes no `DomainID` field, so callers using the class
 *      API cannot make a payment that belongs to a permissioned domain
 *      (XLS-0080d). The factory adds the field: when present it must be a
 *      64-character hex string.
 *      Source: rippled `include/xrpl/protocol/detail/transactions.macro`
 *              (the `ttPAYMENT` block lists `{sfDomainID, SoeOptional}`);
 *              xrpl.js `models/transactions/payment.ts` line 225
 *              (`validateOptionalField(tx, 'DomainID', isDomainID)`).
 */
import type { Amount } from '../../types/amounts.js';
import type { PathStep } from '../../types/common.js';
import type { BasePropsFields } from '../../types/base.js';
import type { PaymentFlagsInterface } from '../../types/flags.js';
import {
  isAccount,
  isAmount,
  isArray,
  isDomainID,
  isHex,
  isString,
} from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ───────────────────────────────────────────────

/** A credential ID is a 256-bit hash — 64 hex characters. */
const CREDENTIAL_ID_LENGTH = 64;
/** xrpl.js `MAX_AUTHORIZED_CREDENTIALS` (common.ts:28). */
const MAX_CREDENTIAL_IDS = 8;

// ─── Public types ────────────────────────────────────────────────────

// `TransactionType` is omitted because the factory injects it, and because
// `buildFrozenTx` spreads the field set AFTER setting it — a caller-supplied
// value would win. Inheriting it would put that hazard in the type.
// `Flags` is omitted so it can be re-declared with this transaction's own
// flag interface; `PaymentFlagsInterface extends GlobalFlagsInterface`, so
// the narrowing is assignable to the base's.
//
// The base is `BasePropsFields`, NOT `BaseTransactionFields` itself. The
// latter ends with `readonly [key: string]: unknown`; that index signature
// widens `keyof` to `string | number`, so `Omit<BaseTransactionFields, ...>`
// collapses to a bare index signature and silently discards all fourteen
// named members. Extending that would make `Account` optional, accept any
// misspelled field, and accept any value type — the inheritance would read
// as correct and enforce nothing. `BasePropsFields` keeps the named members
// and drops only the index signature. See the type's doc comment in
// src/types/base.ts.
type PaymentBaseFields = Omit<BasePropsFields, 'TransactionType' | 'Flags'>;

export interface PaymentProps extends PaymentBaseFields {
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
  /**
   * IDs of credentials that authorize this payment (XLS-0070).
   *
   * Optional. When present: a non-empty array of at most 8 entries, each a
   * 64-character hex string, with no duplicates.
   */
  CredentialIDs?: string[] | undefined;
  /**
   * The permissioned domain this payment belongs to (XLS-0080d).
   *
   * Optional. When present, a 64-character hex string.
   */
  DomainID?: string | undefined;
  /** Bit-flags for this transaction. */
  Flags?: number | PaymentFlagsInterface | undefined;
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
      throw new ValidationError(
        'Payment: DeliverMin requires tfPartialPayment flag',
      );
    }
  }

  // ── CredentialIDs ── optional array; bounds + entry-shape + uniqueness
  //   enforced when present. Per xrpl.js validatePayment, which calls
  //   validateCredentialsList with maxCredentials = MAX_AUTHORIZED_CREDENTIALS
  //   = 8. The entry shape is a 64-character hex string, the same rule the
  //   `credentialDelete` / `accountDelete` factories apply to the same field.
  if (props.CredentialIDs !== undefined) {
    if (!isArray(props.CredentialIDs)) {
      throw new ValidationError(
        'Payment: CredentialIDs must be an array of credential ID strings',
      );
    }
    if (props.CredentialIDs.length === 0) {
      throw new ValidationError(
        'Payment: CredentialIDs must not be an empty array',
      );
    }
    if (props.CredentialIDs.length > MAX_CREDENTIAL_IDS) {
      throw new ValidationError(
        `Payment: CredentialIDs length cannot exceed ${MAX_CREDENTIAL_IDS} elements (actual: ${props.CredentialIDs.length})`,
      );
    }
    for (let i = 0; i < props.CredentialIDs.length; i++) {
      const cid = props.CredentialIDs[i];
      if (
        !isString(cid) ||
        !isHex(cid) ||
        cid.length !== CREDENTIAL_ID_LENGTH
      ) {
        throw new ValidationError(
          `Payment: CredentialIDs[${i}] must be a ${CREDENTIAL_ID_LENGTH}-character hex string`,
        );
      }
    }
    // xrpl.js validateCredentialsList rejects duplicates; mirror that
    // (xrpl.js common.ts: containsDuplicates check).
    const seen = new Set<string>();
    for (const cid of props.CredentialIDs) {
      if (seen.has(cid)) {
        throw new ValidationError(
          'Payment: CredentialIDs cannot contain duplicate elements',
        );
      }
      seen.add(cid);
    }
  }

  // ── DomainID ── optional 64-character hex string (XLS-0080d Permissioned
  //   DEX). xrpl.js validatePayment calls validateOptionalField(tx,
  //   'DomainID', isDomainID).
  if (props.DomainID !== undefined && !isDomainID(props.DomainID)) {
    throw new ValidationError(
      'Payment: DomainID must be a 64-character hex string',
    );
  }

  // ─── Base transaction fields ───
  // Catches the seven fields this factory now accepts through
  // `BaseTransactionFields` but does not otherwise check: Memos, SourceTag,
  // LastLedgerSequence, AccountTxnID, NetworkID, Delegate, TicketSequence.
  //
  // Placed AFTER the Payment-specific checks so a more specific message wins
  // for a more specific mistake, and this acts as the backstop for everything
  // shared across transaction types.
  //
  // `TransactionType` is supplied because the validator checks a transaction,
  // not a props bag — the factory injects it in `buildFrozenTx` below.
  validateBaseTransaction({ TransactionType: 'Payment', ...props });

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