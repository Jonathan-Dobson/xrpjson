/**
 * Zero-dependency runtime validation helpers.
 *
 * These replace the validators from xrpl.js that depend on
 * ripple-address-codec and ripple-binary-codec.
 */
import type {
  Amount,
  IssuedCurrencyAmount,
  MPTAmount,
  Currency,
  IssuedCurrency,
  ClawbackAmount,
} from '../types/amounts.js';
import type { Memo, Signer, Path, XChainBridge, AuthorizeCredential } from '../types/common.js';

// ─── Primitives ──────────────────────────────────────────────────────

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

export function isArray<T = unknown>(value: unknown): value is T[] {
  return value != null && Array.isArray(value);
}

// ─── Hex ─────────────────────────────────────────────────────────────

const HEX_REGEX = /^[0-9A-Fa-f]+$/u;

export function isHex(value: string): boolean {
  return HEX_REGEX.test(value);
}

// ─── Account address ─────────────────────────────────────────────────
// Lightweight check — validates format without full base58 checksum.
// For a zero-dependency package this is the pragmatic trade-off.
// Full address validation can be done via the xrpl integration layer.

const CLASSIC_ADDRESS_REGEX = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/u;
const X_ADDRESS_REGEX = /^X[1-9A-HJ-NP-Za-km-z]{46}$/u;

/**
 * Check if a string looks like a valid XRPL classic or X-address.
 * This is a format-only check (no base58 checksum verification).
 */
export function isAccount(value: unknown): value is string {
  return (
    isString(value) &&
    (CLASSIC_ADDRESS_REGEX.test(value) || X_ADDRESS_REGEX.test(value))
  );
}

// ─── Amount types ────────────────────────────────────────────────────

export function isIssuedCurrencyAmount(
  value: unknown,
): value is IssuedCurrencyAmount {
  return (
    isRecord(value) &&
    Object.keys(value).length === 3 &&
    isString(value['currency']) &&
    isString(value['issuer']) &&
    isString(value['value'])
  );
}

export function isMPTAmount(value: unknown): value is MPTAmount {
  return (
    isRecord(value) &&
    Object.keys(value).length === 2 &&
    isString(value['mpt_issuance_id']) &&
    isString(value['value'])
  );
}

export function isAmount(value: unknown): value is Amount {
  return isString(value) || isIssuedCurrencyAmount(value) || isMPTAmount(value);
}

export function isClawbackAmount(value: unknown): value is ClawbackAmount {
  return isIssuedCurrencyAmount(value) || isMPTAmount(value);
}

export function isIssuedCurrency(value: unknown): value is IssuedCurrency {
  return (
    isRecord(value) &&
    ((Object.keys(value).length === 2 &&
      isString(value['currency']) &&
      isString(value['issuer'])) ||
      (Object.keys(value).length === 1 && value['currency'] === 'XRP'))
  );
}

export function isCurrency(value: unknown): value is Currency {
  return (
    isRecord(value) &&
    (isIssuedCurrency(value) ||
      (Object.keys(value).length === 1 && value['currency'] === 'XRP') ||
      (Object.keys(value).length === 1 && isString(value['mpt_issuance_id'])))
  );
}

// ─── Supporting types ────────────────────────────────────────────────

export function isMemo(value: unknown): value is Memo {
  if (!isRecord(value)) return false;
  const memo = value['Memo'];
  if (!isRecord(memo)) return false;
  const keys = Object.keys(memo);
  if (keys.length < 1 || keys.length > 3) return false;
  const validKeys = ['MemoData', 'MemoType', 'MemoFormat'];
  if (!keys.every((k) => validKeys.includes(k))) return false;
  if (memo['MemoData'] != null && !(isString(memo['MemoData']) && isHex(memo['MemoData'])))
    return false;
  if (memo['MemoType'] != null && !(isString(memo['MemoType']) && isHex(memo['MemoType'])))
    return false;
  if (memo['MemoFormat'] != null && !(isString(memo['MemoFormat']) && isHex(memo['MemoFormat'])))
    return false;
  return true;
}

export function isSigner(value: unknown): value is Signer {
  if (!isRecord(value)) return false;
  const signer = value['Signer'];
  if (!isRecord(signer)) return false;
  return (
    Object.keys(signer).length === 3 &&
    isString(signer['Account']) &&
    isString(signer['TxnSignature']) &&
    isString(signer['SigningPubKey'])
  );
}

export function isPathStep(
  value: unknown,
): value is { account?: string; currency?: string; issuer?: string } {
  if (!isRecord(value)) return false;
  if (value['account'] !== undefined && !isString(value['account'])) return false;
  if (value['currency'] !== undefined && !isString(value['currency'])) return false;
  if (value['issuer'] !== undefined && !isString(value['issuer'])) return false;
  // At least one field must be present
  return (
    value['account'] !== undefined ||
    value['currency'] !== undefined ||
    value['issuer'] !== undefined
  );
}

export function isPath(value: unknown): value is Path {
  if (!isArray(value) || value.length === 0) return false;
  return value.every(isPathStep);
}

export function isPaths(value: unknown): value is Path[] {
  if (!isArray(value) || value.length === 0) return false;
  return value.every(isPath);
}

export function isXChainBridge(value: unknown): value is XChainBridge {
  return (
    isRecord(value) &&
    Object.keys(value).length === 4 &&
    isString(value['LockingChainDoor']) &&
    isIssuedCurrency(value['LockingChainIssue']) &&
    isString(value['IssuingChainDoor']) &&
    isIssuedCurrency(value['IssuingChainIssue'])
  );
}

export function isAuthorizeCredential(
  value: unknown,
): value is AuthorizeCredential {
  return (
    isRecord(value) &&
    isRecord(value['Credential']) &&
    Object.keys(value).length === 1 &&
    isString((value['Credential'] as Record<string, unknown>)['Issuer']) &&
    isString(
      (value['Credential'] as Record<string, unknown>)['CredentialType'],
    )
  );
}

// ─── Domain ID ───────────────────────────────────────────────────────

const DOMAIN_ID_LENGTH = 64;

export function isDomainID(value: unknown): value is string {
  return isString(value) && value.length === DOMAIN_ID_LENGTH && isHex(value);
}

// ─── Ledger entry ID ─────────────────────────────────────────────────

const LEDGER_ENTRY_ID_LENGTH = 64;

export function isLedgerEntryId(value: unknown): value is string {
  return (
    isString(value) && isHex(value) && value.length === LEDGER_ENTRY_ID_LENGTH
  );
}

// ─── Flag helpers ────────────────────────────────────────────────────

/**
 * Check if a specific bit flag is enabled in a numeric flags value.
 */
export function isFlagEnabled(flags: number, flag: number): boolean {
  return (flags & flag) === flag;
}
