/**
 * Tests for the functional NFTokenModify factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, NFTokenID).
 *   2. Optional field validation: URI, Owner.
 *   3. NFTokenID format: must be 64-char hex (UInt256 / HASH256),
 *      must not be all-zero, must be hex.
 *   4. URI format: must be hex, non-empty, even-length, ≤ 256 bytes.
 *   5. Owner cross-field rule: must not equal Account.
 *   6. Frozen-shape contract (mutation throws, .with() returns a new
 *      frozen tx, .toJSON() strips methods + undefined fields).
 *   7. .with() re-validates the merged shape.
 *
 * Spec sources verified against:
 *   - xrpl.js:  ~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/NFTokenModify.ts
 *   - xrpl.org: ~/.mavis/docs.local/xrpl-dev-portal/repo/docs/references/protocol/transactions/types/nftokenmodify.md
 *   - XLS-46:   ~/.mavis/docs.local/xrpl-standards/repo/XLS-0046-dynamic-non-fungible-tokens/README.md
 */
import { describe, it } from 'vitest';
import { nftokenModify } from '../../src/fp/factories/nftoken-modify.js';

const ACCOUNT = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const OWNER = 'rogue5HnPRSszD9CWGSUz8UGHMVwSSKF6';
// Valid 64-char hex NFTokenID (UInt256 HASH256 form).
const NFTOKEN_ID =
  '0008C350C182B4F213B82CCFA4C6F59AD76F0AFCFBDF04D5A048C0A300000007';
const NFTOKEN_ID_ZERO = '0'.repeat(64);
// Real IPFS URI from xrpl.org's NFTokenModify example (line 28).
const URI_HEX =
  '697066733A2F2F62616679626569636D6E73347A736F6C686C6976346C746D6E356B697062776373637134616C70736D6C6179696970666B73746B736D3472746B652F5665742E706E67';

function make(extras: Record<string, unknown> = {}) {
  return nftokenModify({
    Account: ACCOUNT,
    NFTokenID: NFTOKEN_ID,
    ...extras,
  });
}

// ─── Construction ────────────────────────────────────────────────────

describe('fp/nftokenModify()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      if (tx.TransactionType !== 'NFTokenModify') throw new Error('type');
      if (tx.Account !== ACCOUNT) throw new Error('account');
      if (tx.NFTokenID !== NFTOKEN_ID) throw new Error('nftid');
    });

    it('accepts Fee and Sequence as base transaction fields', () => {
      const tx = make({ Fee: '10', Sequence: 33 });
      if (tx.Fee !== '10') throw new Error('fee');
      if (tx.Sequence !== 33) throw new Error('seq');
    });

    it('accepts a numeric Flags bitmask (no tx-specific flags; global only)', () => {
      const tx = make({ Flags: 0 });
      if (tx.Flags !== 0) throw new Error('flags');
    });

    it('accepts an optional URI', () => {
      const tx = make({ URI: URI_HEX });
      if (tx.URI !== URI_HEX) throw new Error('uri');
    });

    it('accepts an optional Owner different from Account', () => {
      const tx = make({ Owner: OWNER });
      if (tx.Owner !== OWNER) throw new Error('owner');
    });

    it('accepts all spec fields together (URI + Owner)', () => {
      const tx = nftokenModify({
        Account: ACCOUNT,
        NFTokenID: NFTOKEN_ID,
        URI: URI_HEX,
        Owner: OWNER,
        Fee: '10',
        Sequence: 33,
      });
      if (tx.Owner !== OWNER) throw new Error('owner');
      if (tx.URI !== URI_HEX) throw new Error('uri');
      if (tx.Fee !== '10') throw new Error('fee');
      if (tx.Sequence !== 33) throw new Error('seq');
    });
  });

  // ─── Account validation ─────────────────────────────────────────────

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        nftokenModify({
          Account: '',
          NFTokenID: NFTOKEN_ID,
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      expect(() =>
        nftokenModify({
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
        nftokenModify({
          Account: ACCOUNT,
          NFTokenID: undefined as unknown as string,
        }),
      ).toThrow(/NFTokenID/);
    });

    it('throws on non-string NFTokenID', () => {
      expect(() =>
        nftokenModify({
          Account: ACCOUNT,
          NFTokenID: 12345 as unknown as string,
        }),
      ).toThrow(/NFTokenID/);
    });

    it('throws on non-hex NFTokenID', () => {
      // 64-char string with non-hex characters.
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

  // ─── URI validation ─────────────────────────────────────────────────

  describe('URI validation', () => {
    it('accepts a valid hex URI', () => {
      const tx = make({ URI: URI_HEX });
      if (tx.URI !== URI_HEX) throw new Error('uri');
    });

    it('accepts a short hex URI', () => {
      // '697066733A2F2F62616679' = 'ipfs://bafy' (9 bytes / 18 hex chars).
      const short = '697066733A2F2F62616679';
      const tx = make({ URI: short });
      if (tx.URI !== short) throw new Error('short uri');
    });

    it('accepts a lowercase hex URI', () => {
      const lower = URI_HEX.toLowerCase();
      const tx = make({ URI: lower });
      if (tx.URI !== lower) throw new Error('lowercase uri');
    });

    it('throws on non-hex URI', () => {
      expect(() => make({ URI: 'not-hex!@#' })).toThrow(/hex/);
    });

    it('throws on empty-string URI', () => {
      // xrpl.js NFTokenModify.ts lines 60–62: "URI must not be empty
      // string". xrpl.org nftokenmodify.md line 38: omit URI to delete;
      // "" is distinct from omitted.
      expect(() => make({ URI: '' })).toThrow(/empty string/);
    });

    it('throws on odd-length hex URI', () => {
      // 3 hex chars — odd, not a valid byte-aligned BLOB encoding.
      expect(() => make({ URI: 'ABC' })).toThrow(/even number/);
    });

    it('throws on URI > 256 bytes (513+ hex chars)', () => {
      const huge = 'A'.repeat(514); // 514 hex chars = 257 bytes
      expect(() => make({ URI: huge })).toThrow(/URI/);
    });

    it('accepts URI at exactly 256 bytes (512 hex chars)', () => {
      const ok = 'A'.repeat(512);
      const tx = make({ URI: ok });
      if (tx.URI !== ok) throw new Error('256-byte uri');
    });

    it('accepts URI omitted (deletes existing URI on token)', () => {
      // xrpl.org nftokenmodify.md line 38: omitting URI deletes any
      // existing URI. There is no cross-field rule binding URI to other
      // fields. Verify by constructing without URI.
      const tx = make();
      if (tx.URI !== undefined) throw new Error('uri should be undefined');
      const json = tx.toJSON();
      if ('URI' in json) throw new Error('URI should be stripped from json');
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

    it('throws when Owner equals Account (xrpl.org guard)', () => {
      // xrpl.org nftokenmodify.md line 36: "If the `Account` and
      // `Owner` are the same address, omit this field." We reject the
      // redundant form at build time.
      expect(() => make({ Owner: ACCOUNT })).toThrow(
        /Owner must not equal Account/,
      );
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
      const tx = make({ Owner: OWNER, URI: URI_HEX });
      const tx2 = tx.with({ Sequence: 7 });
      if (tx2.Owner !== OWNER) throw new Error('owner lost');
      if (tx2.URI !== URI_HEX) throw new Error('uri lost');
      if (tx2.Sequence !== 7) throw new Error('seq not applied');
    });

    it('.with() re-validates the merged shape', () => {
      const tx = make();
      expect(() => tx.with({ NFTokenID: NFTOKEN_ID_ZERO })).toThrow(
        /all-zero HASH256/,
      );
    });

    it('.with() re-validates a freshly-set URI', () => {
      const tx = make();
      expect(() => tx.with({ URI: 'not-hex' })).toThrow(/hex/);
    });

    it('.with() re-validates a freshly-set Owner', () => {
      const tx = make();
      expect(() => tx.with({ Owner: 'not-an-account' })).toThrow(/Owner/);
    });

    it('.with() re-validates Owner ≠ Account coupling', () => {
      const tx = make({ Owner: OWNER });
      // Replace Owner with Account — should fail at re-validation.
      expect(() => tx.with({ Owner: ACCOUNT })).toThrow(
        /Owner must not equal Account/,
      );
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({ Owner: OWNER, URI: URI_HEX, Fee: '10', Sequence: 1 });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'NFTokenModify',
        Account: ACCOUNT,
        NFTokenID: NFTOKEN_ID,
        URI: URI_HEX,
        Owner: OWNER,
        Fee: '10',
        Sequence: 1,
      });
    });

    it('.toJSON() skips undefined fields', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('URI' in json).toBe(false);
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
      // The class sets `this.URI?: string = undefined` and
      // `this.Owner?: string = undefined`, so both are present on the
      // class output as `undefined` accessors. The factory omits
      // unspecified fields from Object.keys when those fields are not
      // provided. This is the intentional divergence documented in the
      // factory header — the class shape has extra undefined accessors,
      // the factory shape does not.
      const tx = make();
      const keys = Object.keys(tx).sort();
      expect(keys).toContain('TransactionType');
      expect(keys).toContain('Account');
      expect(keys).toContain('NFTokenID');
      expect(keys).not.toContain('URI');
      expect(keys).not.toContain('Owner');
      expect(tx.TransactionType).toBe('NFTokenModify');
    });
  });
});