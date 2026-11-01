/**
 * Tests for the library-wide `Account` guard.
 *
 * Every factory must reject an `Account` that is not a well-formed XRPL
 * address. The class API's base validator checks `Account` with `isString`
 * only (`xrplt src/validation/base.ts:40–41`), so `"not-an-address"` passes
 * there; xrpl.js does the same (`models/transactions/common.ts:987`).
 * This library tightened the check to `isAccount` in every factory, so a
 * transaction with a malformed signer address cannot be held in a variable
 * at all — the library's stated contract is eager validation.
 *
 * `isAccount` is a FORMAT check (regex over the classic / X address shape),
 * not a checksum verification — see `src/validation/helpers.ts` and the
 * "Format-only check" term in `CONTEXT.md`. A well-formed but invalid
 * address still passes here and is caught by the ledger.
 *
 * These tests pin the invariant repo-wide rather than per factory, so a
 * future factory cannot reintroduce the laxer check by accident — the eight
 * that still used `isString` were `credentialAccept`, `credentialCreate`,
 * `oracleSet`, `permissionedDomainSet`, `vaultCreate`, `vaultDelete`,
 * `vaultDeposit` and `vaultSet`.
 */
import { describe, it, expect } from 'vitest';
import * as xrpjson from '../../src/fp/index.js';

const VALID_CLASSIC = 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH';
const VALID_X = 'X7AcgcsBL6XDcUb289X4mJ8djcdyKaB5hJDWMArnXr61cqZ';
const MALFORMED = 'not-an-address';

/** Every lowercase function export in the barrel is a factory. */
const factories = Object.entries(xrpjson).filter(
  (entry): entry is [string, (props: Record<string, unknown>) => unknown] =>
    typeof entry[1] === 'function' && /^[a-z]/.test(entry[0]),
);

type Factory = (props: Record<string, unknown>) => unknown;

/** Calls a factory and returns the error message, or '' when it succeeds. */
function failureMessage(factory: Factory, props: Record<string, unknown>): string {
  try {
    factory(props);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe('fp — the Account guard', () => {
  it('enumerates all 79 factories', () => {
    expect(factories).toHaveLength(79);
  });

  describe('rejects a malformed Account', () => {
    it('every factory rejects it, naming Account in the error', () => {
      for (const [name, factory] of factories) {
        const message = failureMessage(factory, { Account: MALFORMED });
        expect(message, name).not.toBe('');
        expect(message, name).toMatch(/Account/);
      }
    });

    it('the rejection names the transaction, not a generic failure', () => {
      // Each factory prefixes its errors with its own name, so a consumer
      // reading a caught ValidationError knows which rule fired.
      for (const [name, factory] of factories) {
        const message = failureMessage(factory, { Account: MALFORMED });
        expect(message, name).toMatch(new RegExp(name, 'i'));
      }
    });
  });

  describe('accepts a well-formed address', () => {
    it('a classic address gets past the Account guard on every factory', () => {
      for (const [name, factory] of factories) {
        const message = failureMessage(factory, { Account: VALID_CLASSIC });
        // The factory may still reject OTHER missing fields — what matters
        // is that it did not reject the Account itself.
        expect(message, name).not.toMatch(/Account is required|invalid Account/);
      }
    });

    it('an X-address gets past the Account guard on every factory', () => {
      for (const [name, factory] of factories) {
        const message = failureMessage(factory, { Account: VALID_X });
        expect(message, name).not.toMatch(/Account is required|invalid Account/);
      }
    });
  });

  describe('the eight factories that used to accept any string', () => {
    // Each of these checked `Account` with `isString`, so `"not-an-address"`
    // passed and the error surfaced on a different field.
    const tightened: Array<[string, Factory]> = [
      ['credentialAccept', xrpjson.credentialAccept as Factory],
      ['credentialCreate', xrpjson.credentialCreate as Factory],
      ['oracleSet', xrpjson.oracleSet as Factory],
      ['permissionedDomainSet', xrpjson.permissionedDomainSet as Factory],
      ['vaultCreate', xrpjson.vaultCreate as Factory],
      ['vaultDelete', xrpjson.vaultDelete as Factory],
      ['vaultDeposit', xrpjson.vaultDeposit as Factory],
      ['vaultSet', xrpjson.vaultSet as Factory],
    ];

    it('covers exactly the eight', () => {
      expect(tightened).toHaveLength(8);
    });

    it.each(tightened)('%s rejects a malformed Account', (_name, factory) => {
      const message = failureMessage(factory, { Account: MALFORMED });
      expect(message).toMatch(/Account/);
    });
  });
});
