/**
 * Tests for the functional NFTokenBurn factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, NFTokenID).
 *   2. Optional field validation: Owner.
 *   3. NFTokenID format: must be 64-char hex (UInt256 / HASH256),
 *      must not be all-zero, must be hex.
 *   4. Frozen-shape contract (mutation throws, .with() returns a new
 *      frozen tx, .toJSON() strips methods + undefined fields).
 *   5. .with() re-validates the merged shape.
 */
import { describe, it } from 'vitest';
import { nftokenBurn } from '../../src/fp/factories/nftoken-burn.js';

const ACCOUNT = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const OWNER = 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B';
// Valid 64-char hex NFTokenID (UInt256 HASH256 form).
const NFTOKEN_ID =
  '000B013A95F14B0044F78A264E41713C64B5F89242540EE208C3098E00000D65';
const NFTOKEN_ID_ZERO = '0'.repeat(64);

function make(extras: Record<string, unknown> = {}) {
  return nftokenBurn({
    Account: ACCOUNT,
    NFTokenID: NFTOKEN_ID,
    ...extras,
  });
}

// ─── Construction ────────────────────────────────────────────────────

describe('fp/nftokenBurn()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      if (tx.TransactionType !== 'NFTokenBurn') throw new Error('type');
      if (tx.Account !== ACCOUNT) throw new Error('account');
      if (tx.NFTokenID !== NFTOKEN_ID) throw new Error('nftid');
    });

    it('accepts Fee and Sequence as base transaction fields', () => {
      const tx = make({ Fee: '10', Sequence: 42 });
      if (tx.Fee !== '10') throw new Error('fee');
      if (tx.Sequence !== 42) throw new Error('seq');
    });

    it('accepts a numeric Flags bitmask', () => {
      // NFTokenBurn itself defines no transaction-specific flags; only
      // global flags (tfFullyCanonicalSig etc.) are meaningful. The
      // factory accepts a numeric mask for parity with the base shape.
      const tx = make({ Flags: 0 });
      if (tx.Flags !== 0) throw new Error('flags');
    });

    it('accepts an optional Owner different from Account', () => {
      const tx = make({ Owner: OWNER });
      if (tx.Owner !== OWNER) throw new Error('owner');
    });
  });

  // ─── Account validation ─────────────────────────────────────────────

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        nftokenBurn({
          Account: '',
          NFTokenID: NFTOKEN_ID,
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      expect(() =>
        nftokenBurn({
          Account: 'not-an-account',
          NFTokenID: NFTOKEN_ID,
        }),
      ).toThrow(/Account/);
    });
  });

  // ─── NFTokenID validation ───────────────────────────────────────────

  describe('NFTokenID validation', () => {
    it('throws on missing NFTokenID', () => {
      expect(() =>
        nftokenBurn({
          Account: ACCOUNT,
          NFTokenID: undefined as unknown as string,
        }),
      ).toThrow(/NFTokenID/);
    });

    it('throws on non-string NFTokenID', () => {
      expect(() =>
        nftokenBurn({
          Account: ACCOUNT,
          NFTokenID: 12345 as unknown as string,
        }),
      ).toThrow(/NFTokenID/);
    });

    it('throws on non-hex NFTokenID', () => {
      expect(() =>
        make({ NFTokenID: 'not-hex!@#'.padEnd(64, '0') }),
      ).toThrow(/hex/);
    });

    it('throws on NFTokenID shorter than 64 chars', () => {
      expect(() => make({ NFTokenID: 'ABCD1234' })).toThrow(/64 hex characters/);
    });

    it('throws on NFTokenID longer than 64 chars', () => {
      expect(() =>
        make({ NFTokenID: 'A'.repeat(66) }),
      ).toThrow(/64 hex characters/);
    });

    it('throws on odd-length hex NFTokenID', () => {
      // 63 hex chars — odd, not byte-aligned. UInt256 requires 32 bytes.
      expect(() =>
        make({ NFTokenID: 'A'.repeat(63) }),
      ).toThrow(/64 hex characters/);
    });

    it('throws on all-zero NFTokenID (malformed HASH256)', () => {
      expect(() => make({ NFTokenID: NFTOKEN_ID_ZERO })).toThrow(
        /all-zero HASH256/,
      );
    });

    it('accepts lowercase hex NFTokenID', () => {
      // XRPL JSON convention is uppercase, but case-insensitive parsing
      // is the spec. We accept either.
      const lower = NFTOKEN_ID.toLowerCase();
      const tx = make({ NFTokenID: lower });
      if (tx.NFTokenID !== lower) throw new Error('lowercase id');
    });
  });

  // ─── Owner validation ───────────────────────────────────────────────

  describe('Owner validation', () => {
    it('accepts a valid XRPL classic address as Owner', () => {
      const tx = make({ Owner: OWNER });
      if (tx.Owner !== OWNER) throw new Error('owner');
    });

    it('accepts an X-address as Owner', () => {
      // X-addresses are 47 chars: 'X' + 46 base58 chars. Full base58
      // checksum is not enforced by isAccount; only the format is.
      const xAddr = 'Xwgz5ms2XFgQQmJW3AoZQXZzeJpWUH3iYyBoCePbf1812DC';
      const tx = make({ Owner: xAddr });
      if (tx.Owner !== xAddr) throw new Error('x-address');
    });

    it('throws on malformed Owner', () => {
      expect(() => make({ Owner: 'not-an-account' })).toThrow(/Owner/);
    });

    it('throws on empty Owner', () => {
      // Empty string is not a valid address, even though it is `isString`.
      expect(() => make({ Owner: '' })).toThrow(/Owner/);
    });
  });

  // ─── Frozen-shape contract ──────────────────────────────────────────

  describe('frozen-shape contract', () => {
    it('returns a frozen object', () => {
      const tx = make();
      expect(Object.isFrozen(tx)).toBe(true);
    });

    it('mutation throws in strict mode', () => {
      const tx = make();
      expect(() => {
        (tx as unknown as { NFTokenID: string }).NFTokenID = 'A'.repeat(64);
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides', () => {
      const tx = make();
      const newId = '000C013A95F14B0044F78A264E41713C64B5F89242540EE208C3098E00000D65';
      const tx2 = tx.with({ NFTokenID: newId });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      if (tx2.NFTokenID !== newId) throw new Error('override not applied');
      if (tx.NFTokenID !== NFTOKEN_ID) throw new Error('original mutated');
    });

    it('.with() preserves unchanged fields', () => {
      const tx = make({ Owner: OWNER });
      const tx2 = tx.with({ Sequence: 7 });
      if (tx2.Owner !== OWNER) throw new Error('owner lost');
      if (tx2.Sequence !== 7) throw new Error('seq not applied');
    });

    it('.with() re-validates the merged shape', () => {
      const tx = make();
      expect(() => tx.with({ NFTokenID: NFTOKEN_ID_ZERO })).toThrow(
        /all-zero HASH256/,
      );
    });

    it('.with() re-validates a freshly-set Owner', () => {
      const tx = make();
      expect(() => tx.with({ Owner: 'not-an-account' })).toThrow(/Owner/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({ Owner: OWNER, Fee: '10', Sequence: 1 });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'NFTokenBurn',
        Account: ACCOUNT,
        NFTokenID: NFTOKEN_ID,
        Owner: OWNER,
        Fee: '10',
        Sequence: 1,
      });
    });

    it('.toJSON() skips undefined fields', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('Owner' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
      expect('Flags' in json).toBe(false);
    });

    it('.toJSON() omits the bound methods', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
    });

    it('.validate() is a no-op (already validated at construction)', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });

  // ─── Compatibility with class-based source ─────────────────────────

  describe('compatibility with class source', () => {
    it('produces an object shaped like the class output (Account + NFTokenID + TransactionType)', () => {
      // The class sets `this.Owner?: string = undefined` so `Owner` is
      // present on the object. The factory omits it from Object.keys when
      // unspecified. This is the intentional divergence documented in the
      // factory header — the class shape has an extra undefined accessor,
      // the factory shape does not.
      const tx = make();
      const keys = Object.keys(tx).sort();
      expect(keys).toContain('TransactionType');
      expect(keys).toContain('Account');
      expect(keys).toContain('NFTokenID');
      expect(keys).not.toContain('Owner');
      expect(tx.TransactionType).toBe('NFTokenBurn');
    });
  });

  // ─── Base transaction fields ──────────────────────────────────────────────
  // `NftokenBurnProps` extends `BasePropsFields`, so the seven shared base
  // fields are part of this props type: Memos, SourceTag, LastLedgerSequence,
  // AccountTxnID, NetworkID, Delegate and TicketSequence.
  //
  // The factory now CALLS `validateBaseTransaction` as its last check before
  // `buildFrozenTx`, so both directions below are real runtime behaviour: the
  // accept cases must survive the validator, and the reject cases assert the
  // validator's own messages from src/validation/base.ts. Bad values are cast
  // `as any` deliberately — the point is the runtime check, and a type error
  // would make the tests uncompilable.
  describe('BaseTransactionFields', () => {
    const base = { Account: ACCOUNT, NFTokenID: NFTOKEN_ID };
    const MEMOS = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
    const TXN_ID = 'AB'.repeat(32);

    it('accepts Memos', () => {
      const tx = nftokenBurn({ ...base, Memos: MEMOS });
      expect(tx.Memos).toEqual(MEMOS);
      expect(tx.toJSON().Memos).toEqual(MEMOS);
    });

    it('accepts SourceTag', () => {
      const tx = nftokenBurn({ ...base, SourceTag: 99 });
      expect(tx.SourceTag).toBe(99);
    });

    it('accepts LastLedgerSequence', () => {
      const tx = nftokenBurn({ ...base, LastLedgerSequence: 1_000_000 });
      expect(tx.LastLedgerSequence).toBe(1_000_000);
    });

    it('accepts AccountTxnID', () => {
      const tx = nftokenBurn({ ...base, AccountTxnID: TXN_ID });
      expect(tx.AccountTxnID).toBe(TXN_ID);
    });

    it('accepts NetworkID', () => {
      const tx = nftokenBurn({ ...base, NetworkID: 1 });
      expect(tx.NetworkID).toBe(1);
    });

    it('accepts a Delegate distinct from Account', () => {
      const tx = nftokenBurn({ ...base, Delegate: OWNER });
      expect(tx.Delegate).toBe(OWNER);
    });

    it('accepts TicketSequence alongside Sequence: 0', () => {
      const tx = nftokenBurn({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.TicketSequence).toBe(42);
    });

    // ─── Reject side ───

    it('rejects a malformed Memos value', () => {
      expect(() => nftokenBurn({ ...base, Memos: 'not-an-array' } as any)).toThrow(
        /invalid Memos/,
      );
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() => nftokenBurn({ ...base, SourceTag: 'NaN' } as any)).toThrow(
        /SourceTag must be a number/,
      );
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() =>
        nftokenBurn({ ...base, LastLedgerSequence: 'soon' } as any),
      ).toThrow(/LastLedgerSequence must be a number/);
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() => nftokenBurn({ ...base, AccountTxnID: 12345 } as any)).toThrow(
        /AccountTxnID must be a string/,
      );
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() => nftokenBurn({ ...base, NetworkID: {} } as any)).toThrow(
        /NetworkID must be a number/,
      );
    });

    it('rejects a Delegate that is not a valid address', () => {
      expect(() =>
        nftokenBurn({ ...base, Delegate: 'not-an-address' } as any),
      ).toThrow(/invalid Delegate/);
    });

    it('rejects a Delegate equal to Account', () => {
      expect(() => nftokenBurn({ ...base, Delegate: base.Account })).toThrow(
        /cannot be the same/,
      );
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() => nftokenBurn({ ...base, TicketSequence: 'nope' } as any)).toThrow(
        /TicketSequence must be a number/,
      );
    });

    it('rejects a non-string Fee', () => {
      expect(() => nftokenBurn({ ...base, Fee: 12 } as any)).toThrow(
        /Fee must be a string/,
      );
    });

    it('still checks NFTokenID before the shared base fields', () => {
      // Ordering check: a factory-specific mistake still produces the
      // factory's own message, not the base validator's backstop message.
      expect(() =>
        nftokenBurn({
          ...base,
          NFTokenID: NFTOKEN_ID_ZERO,
          SourceTag: 'NaN',
        } as any),
      ).toThrow(/NFTokenID/);
    });

    it('survives .with() with a base field set', () => {
      const tx = nftokenBurn({ ...base, SourceTag: 7 });
      const next = tx.with({ Fee: '20' });
      expect(next.SourceTag).toBe(7);
    });
  });
});