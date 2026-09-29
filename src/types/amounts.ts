/**
 * Amount-related types used across XRPL transactions.
 *
 * These mirror the shapes from xrpl.js but are defined independently
 * so this package has zero dependencies.
 */

/**
 * Represents an amount of an issued (IOU) currency.
 */
export interface IssuedCurrencyAmount {
  readonly currency: string;
  readonly issuer: string;
  readonly value: string;
}

/**
 * Represents an amount of a Multi-Purpose Token.
 */
export interface MPTAmount {
  readonly mpt_issuance_id: string;
  readonly value: string;
}

/**
 * An XRPL Amount — either XRP drops (string), an issued currency, or an MPT.
 *
 * - XRP amounts are strings representing drops (e.g. `"1000000"` = 1 XRP)
 * - Issued currency amounts are objects with `currency`, `issuer`, and `value`
 * - MPT amounts are objects with `mpt_issuance_id` and `value`
 */
export type Amount = string | IssuedCurrencyAmount | MPTAmount;

/**
 * Represents a clawback amount (issued currency or MPT only — not XRP).
 */
export type ClawbackAmount = IssuedCurrencyAmount | MPTAmount;

/**
 * Represents an issued currency specifier (without amount).
 */
export interface IssuedCurrency {
  readonly currency: string;
  readonly issuer: string;
}

/**
 * Represents a currency specifier — either XRP, an issued currency, or an MPT.
 */
export type Currency =
  | { readonly currency: 'XRP' }
  | IssuedCurrency
  | { readonly mpt_issuance_id: string };
