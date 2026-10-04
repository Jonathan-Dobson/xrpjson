/**
 * Functional AMMBid factory — frozen-object style.
 *
 * Bids on an Automated Market Maker's (AMM's) auction slot. If the
 * bid wins, the sender can trade against the AMM at a discounted
 * fee for up to 24 hours. Validation happens at construction;
 * there is no way to construct an invalid tx from the fields it models.
 *
 *   import { ammBid } from 'xrpjson';
 *   const tx = ammBid({
 *     Account,
 *     Asset:  { currency: 'XRP' },
 *     Asset2: { currency: 'TST', issuer: 'r…' },
 *     BidMax: { currency: '039C99…', issuer: 'r…', value: '100' },
 *     AuthAccounts: [
 *       { AuthAccount: { Account: 'r…' } },
 *     ],
 *   });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ BidMax: { …, value: '200' } });
 *
 * Affected amendments:
 *   - `AMM` (base AMMBid)
 *   - `fixCleanup3_4_0` (minimum-bid floor when trading fee is 0;
 *     runtime, not locally checkable)
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/ammbid
 * @see https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0030-automated-market-maker
 *
 * ## Divergences
 * The factory enforces seven preclaim checks that the class API
 * (the Class API's `AMMBid`) skips:
 *
 *   1. `Asset` must be a valid `Currency` (XRP / IOU / MPT), not
 *      merely a record. The class API uses `isRecord(this.Asset)`,
 *      which accepts any object — including an MPT, an arbitrary
 *      object, or an incomplete IOU object.
 *      Source: xrpl.js `validateAMMBid` lines 66–72 — throws
 *      `'AMMBid: missing field Asset'` (undefined/null) and
 *      `'AMMBid: Asset must be a Currency'`.
 *      Note: xrpl.js's `validateAMMBid` uses `isIssuedCurrency`
 *      (XRP-form OR IOU-form, NOT MPT), which is narrower than
 *      the xrpl.org `ammbid.md` Fields table — "the asset can be
 *      XRP, a token, or an MPT". The factory uses `isCurrency`
 *      (XRP / IOU / MPT) to honor the broader spec.
 *
 *   2. `Asset2` must be a valid `Currency` (XRP / IOU / MPT).
 *      Same source as #1, but applied to Asset2 (xrpl.js lines 74–80).
 *
 *   3. `BidMin`, when present, must be an `IssuedCurrencyAmount`.
 *      LP tokens are always issued currencies — never XRP and never
 *      an MPT — so this guards against malformed bid amounts that
 *      would be rejected at submit time as `temBAD_AMM_TOKENS`
 *      (xrpl.org `ammbid.md` Error Cases: "The specified `BidMin`
 *      or `BidMax` were not specified as the correct LP Tokens for
 *      this AMM").
 *      Source: xrpl.js `validateAMMBid` lines 82–84 — throws
 *      `'AMMBid: BidMin must be an Amount'`. The class API does
 *      not validate `BidMin` at all.
 *      (Note: xrpl.js uses `isAmount` here, which allows XRP/MPT
 *      forms. The factory tightens this to `IssuedCurrencyAmount`
 *      to match the LP-token semantics and the typed
 *      `AMMBid.BidMin?: IssuedCurrencyAmount` declaration.)
 *
 *   4. `BidMax`, when present, must be an `IssuedCurrencyAmount`.
 *      Same rationale as #3, applied to `BidMax` (xrpl.js lines
 *      86–88). The class API does not validate `BidMax`.
 *
 *   5. `AuthAccounts`, when present, must be an array. The class
 *      API types it as `Record<string, string>[]` but performs no
 *      runtime array check.
 *      Source: xrpl.js `validateAMMBid` lines 90–95 — throws
 *      `'AMMBid: AuthAccounts must be an AuthAccount array'`.
 *
 *   6. `AuthAccounts.length` must not exceed 4.
 *      Source: xrpl.js `validateAMMBid` lines 96–100 — throws
 *      `'AMMBid: AuthAccounts length must not be greater than 4'`;
 *      xrpl.org `ammbid.md` Fields table — "A list of up to 4
 *      additional accounts" — and Error Cases: `temMALFORMED`
 *      "such as a list of `AuthAccounts` that is too long".
 *
 *   7. Each element of `AuthAccounts` must have the inner shape
 *      `{ AuthAccount: { Account: <string> } }`, AND `AuthAccounts`
 *      must NOT include the sender's address.
 *      Source: xrpl.js `validateAuthAccounts` lines 105–129 — throws
 *      `'AMMBid: invalid AuthAccounts'` for malformed inner records
 *      and `'AMMBid: AuthAccounts must not include sender's address'`
 *      when the sender is in the list.
 *      xrpl.org `ammbid.md` Fields table — "This cannot include the
 *      address of the transaction sender." The class API does no
 *      inner-shape check and does not check for the sender address.
 */
import type { BasePropsFields } from '../../types/base.js';
import type { Currency, IssuedCurrencyAmount } from '../../types/amounts.js';
import {
  isAccount,
  isCurrency,
  isIssuedCurrencyAmount,
  isRecord,
  isString,
} from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

/** xrpl.js `MAX_AUTH_ACCOUNTS = 4` (xrpl.js AMMBid.ts line 13). */
const MAX_AUTH_ACCOUNTS = 4;

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
export interface AmmBidProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  /** The unique address of the transaction sender (the bidder). */
  Account: string;
  /** One of the two assets in the AMM's pool (XRP / IOU / MPT). */
  Asset: Currency;
  /** The other asset in the AMM's pool (XRP / IOU / MPT). */
  Asset2: Currency;
  /**
   * Pay at least this LP-token amount for the auction slot. Always an
   * `IssuedCurrencyAmount` — LP tokens are issued currencies, never
   * XRP and never an MPT.
   */
  BidMin?: IssuedCurrencyAmount | undefined;
  /**
   * Pay at most this LP-token amount for the auction slot. Always an
   * `IssuedCurrencyAmount` — LP tokens are issued currencies, never
   * XRP and never an MPT.
   */
  BidMax?: IssuedCurrencyAmount | undefined;
  /**
   * Up to 4 additional accounts allowed to trade at the discounted
   * fee. Must NOT include the sender's address.
   */
  AuthAccounts?:
    | ReadonlyArray<{ readonly AuthAccount: { readonly Account: string } }>
    | undefined;
  /** Bit-flags for this transaction. */
  Flags?: number | undefined;
}

export interface AmmBid extends Readonly<AmmBidProps> {
  readonly TransactionType: 'AMMBid';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<AmmBidProps>): AmmBid;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function ammBid(props: AmmBidProps): AmmBid {
  // ── Account ── required, must be a valid XRPL classic address.
  if (!isString(props.Account) || !isAccount(props.Account)) {
    throw new ValidationError(
      'AMMBid: Account is required and must be a valid XRPL account address',
    );
  }

  // ── Asset ── required, must be a valid Currency (XRP / IOU / MPT).
  if (props.Asset === undefined) {
    throw new ValidationError('AMMBid: missing field Asset');
  }
  if (!isCurrency(props.Asset)) {
    throw new ValidationError(
      'AMMBid: Asset must be a Currency (XRP, trust line, or MPT form)',
    );
  }

  // ── Asset2 ── required, must be a valid Currency (XRP / IOU / MPT).
  if (props.Asset2 === undefined) {
    throw new ValidationError('AMMBid: missing field Asset2');
  }
  if (!isCurrency(props.Asset2)) {
    throw new ValidationError(
      'AMMBid: Asset2 must be a Currency (XRP, trust line, or MPT form)',
    );
  }

  // ── BidMin / BidMax ── when present, must be an IssuedCurrencyAmount
  //    (LP tokens are always issued currencies, never XRP and never MPT).
  if (props.BidMin !== undefined && !isIssuedCurrencyAmount(props.BidMin)) {
    throw new ValidationError(
      'AMMBid: BidMin must be an IssuedCurrencyAmount (LP tokens are an issued currency, never XRP and never MPT)',
    );
  }
  if (props.BidMax !== undefined && !isIssuedCurrencyAmount(props.BidMax)) {
    throw new ValidationError(
      'AMMBid: BidMax must be an IssuedCurrencyAmount (LP tokens are an issued currency, never XRP and never MPT)',
    );
  }

  // ── AuthAccounts ── optional, but when present must be an array of
  //    up to MAX_AUTH_ACCOUNTS `{ AuthAccount: { Account } }` records,
  //    and must not include the sender's address.
  if (props.AuthAccounts !== undefined) {
    if (!Array.isArray(props.AuthAccounts)) {
      throw new ValidationError(
        'AMMBid: AuthAccounts must be an AuthAccount array',
      );
    }
    if (props.AuthAccounts.length > MAX_AUTH_ACCOUNTS) {
      throw new ValidationError(
        `AMMBid: AuthAccounts length must not be greater than ${MAX_AUTH_ACCOUNTS}`,
      );
    }
    for (const entry of props.AuthAccounts) {
      if (!isRecord(entry)) {
        throw new ValidationError('AMMBid: invalid AuthAccounts');
      }
      const inner = entry['AuthAccount'];
      if (!isRecord(inner)) {
        throw new ValidationError('AMMBid: invalid AuthAccounts');
      }
      const acct = inner['Account'];
      if (acct === undefined || acct === null || typeof acct !== 'string') {
        throw new ValidationError('AMMBid: invalid AuthAccounts');
      }
      if (acct === props.Account) {
        throw new ValidationError(
          "AMMBid: AuthAccounts must not include sender's address",
        );
      }
    }
  }

  // ─── Base transaction fields ───
  // Catches the seven shared base fields this factory does not otherwise
  // check: Memos, SourceTag, LastLedgerSequence, AccountTxnID, NetworkID,
  // Delegate, TicketSequence.
  //
  // Placed AFTER the AMMBid-specific checks so a more specific message
  // wins for a more specific mistake, and this acts as the backstop for
  // everything shared across transaction types.
  //
  // `TransactionType` is supplied because the validator checks a transaction,
  // not a props bag — the factory injects it in `buildFrozenTx` below.
  validateBaseTransaction({ TransactionType: 'AMMBid', ...props });

  return buildFrozenTx<AmmBidProps, AmmBid>(
    'AMMBid',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: AmmBid) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: AmmBid, overrides: Partial<AmmBidProps>) {
        return ammBid(mergeForWith(this, overrides));
      },
    },
  );
}