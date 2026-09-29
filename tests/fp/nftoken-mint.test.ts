/**
 * Tests for the functional NFTokenMint factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, NFTokenTaxon).
 *   2. Optional field validation: Issuer, TransferFee, URI, Amount,
 *      Expiration, Destination.
 *   3. Cross-field rules: Expiration/Destination require Amount;
 *      TransferFee requires tfTransferable; Issuer ≠ Account.
 *   4. Flag handling: numeric + boolean-map form; tfMutable (XLS-46)
 *      and tfBurnable / tfOnlyXRP / tfTransferable; tfTrustLine rejected.
 *   5. Frozen-shape contract (mutation throws, .with() returns new
 *      frozen tx, .toJSON() strips methods + undefined).
 */
import { describe, it, expect } from 'vitest';
import { nftokenMint } from '../../src/fp/factories/nftoken-mint.js';

const ACCOUNT = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const ISSUER = 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B';
const DESTINATION = 'rNCFjv8Ek5oDrNiMJ3pw6eLLFtMjZLJnf2';

function make(extras: Record<string, unknown> = {}) {
  return nftokenMint({
    Account: ACCOUNT,
    NFTokenTaxon: 0,
    ...extras,
  });
}

// ─── Construction ────────────────────────────────────────────────────

describe('fp/nftokenMint()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('NFTokenMint');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.NFTokenTaxon).toBe(0);
    });

    it('accepts an arbitrary UInt32 NFTokenTaxon', () => {
      const tx = make({ NFTokenTaxon: 12345 });
      expect(tx.NFTokenTaxon).toBe(12345);
    });

    it('accepts max UInt32 NFTokenTaxon (0xFFFFFFFF)', () => {
      const tx = make({ NFTokenTaxon: 0xffffffff });
      expect(tx.NFTokenTaxon).toBe(0xffffffff);
    });

    it('accepts Fee and Sequence as base transaction fields', () => {
      const tx = make({ Fee: '12', Sequence: 42 });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(42);
    });

    it('accepts all spec fields together', () => {
      const tx = nftokenMint({
        Account: ACCOUNT,
        NFTokenTaxon: 7,
        Issuer: ISSUER,
        TransferFee: 314,
        URI: '697066733A2F2F62616679',
        Amount: '1000000',
        Expiration: 800000000,
        Destination: DESTINATION,
        Flags: 0x00000001 | 0x00000008, // tfBurnable | tfTransferable
      });
      expect(tx.Issuer).toBe(ISSUER);
      expect(tx.TransferFee).toBe(314);
      expect(tx.URI).toBe('697066733A2F2F62616679');
      expect(tx.Amount).toBe('1000000');
      expect(tx.Expiration).toBe(800000000);
      expect(tx.Destination).toBe(DESTINATION);
      const flags = tx.Flags as number;
      expect(flags & 0x00000001).toBe(0x00000001);
      expect(flags & 0x00000008).toBe(0x00000008);
    });
  });

  // ─── Account validation ─────────────────────────────────────────────

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        nftokenMint({
          Account: '',
          NFTokenTaxon: 0,
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      expect(() =>
        nftokenMint({
          Account: 'not-an-account',
          NFTokenTaxon: 0,
        }),
      ).toThrow(/Account/);
    });
  });

  // ─── NFTokenTaxon validation ────────────────────────────────────────

  describe('NFTokenTaxon validation', () => {
    it('throws on missing NFTokenTaxon', () => {
      expect(() =>
        nftokenMint({
          Account: ACCOUNT,
          NFTokenTaxon: undefined as unknown as number,
        }),
      ).toThrow(/NFTokenTaxon/);
    });

    it('throws on non-integer NFTokenTaxon', () => {
      expect(() => make({ NFTokenTaxon: 1.5 })).toThrow(/NFTokenTaxon/);
    });

    it('throws on negative NFTokenTaxon', () => {
      expect(() => make({ NFTokenTaxon: -1 })).toThrow(/NFTokenTaxon/);
    });

    it('throws on NFTokenTaxon > UInt32 max', () => {
      expect(() => make({ NFTokenTaxon: 0x100000000 })).toThrow(/NFTokenTaxon/);
    });

    it('accepts NFTokenTaxon=0 (boundary)', () => {
      const tx = make({ NFTokenTaxon: 0 });
      expect(tx.NFTokenTaxon).toBe(0);
    });
  });

  // ─── Issuer validation ──────────────────────────────────────────────

  describe('Issuer validation', () => {
    it('accepts a valid Issuer different from Account', () => {
      const tx = make({ Issuer: ISSUER });
      expect(tx.Issuer).toBe(ISSUER);
    });

    it('throws on malformed Issuer', () => {
      expect(() => make({ Issuer: 'not-an-account' })).toThrow(/Issuer/);
    });

    it('throws when Issuer equals Account (xrpl.js guard)', () => {
      expect(() => make({ Issuer: ACCOUNT })).toThrow(/Issuer must not be equal to Account/);
    });
  });

  // ─── TransferFee validation ─────────────────────────────────────────

  describe('TransferFee validation', () => {
    it('throws on TransferFee=0 without tfTransferable (field provided ⇒ MUST have flag)', () => {
      // XLS-20 §1.5.1 line 367: "The field MUST NOT be present if the
      // tfTransferable flag is not set." Per xrpl.org: "If this field is
      // provided, the transaction MUST have the tfTransferable flag
      // enabled." Field-presence is what gates the requirement, not value.
      expect(() => make({ TransferFee: 0 })).toThrow(/tfTransferable/);
    });

    it('accepts TransferFee=50000 with tfTransferable', () => {
      const tx = make({ TransferFee: 50000, Flags: 0x00000008 });
      expect(tx.TransferFee).toBe(50000);
    });

    it('throws on TransferFee < 0', () => {
      expect(() => make({ TransferFee: -1 })).toThrow(/TransferFee/);
    });

    it('throws on TransferFee > 50000', () => {
      expect(() => make({ TransferFee: 50001 })).toThrow(/TransferFee/);
    });

    it('throws on non-integer TransferFee', () => {
      expect(() => make({ TransferFee: 1.5 })).toThrow(/TransferFee/);
    });

    it('throws on TransferFee without tfTransferable (XLS-20 §1.5.1)', () => {
      expect(() => make({ TransferFee: 314 })).toThrow(/tfTransferable/);
    });

    it('accepts TransferFee with object-form tfTransferable flag', () => {
      const tx = make({
        TransferFee: 314,
        Flags: { tfTransferable: true },
      });
      expect(tx.TransferFee).toBe(314);
      // Factory stores the original Flags form (object) — same as
      // loan-manage / vault-create pattern.
      expect(tx.Flags).toEqual({ tfTransferable: true });
    });
  });

  // ─── URI validation ─────────────────────────────────────────────────

  describe('URI validation', () => {
    it('accepts a valid hex URI', () => {
      const uri = '697066733A2F2F62616679626569676479727A74357366703775646D37687537367568377932366E6634646675796C71616266336F636C67747179353566627A6469';
      const tx = make({ URI: uri });
      expect(tx.URI).toBe(uri);
    });

    it('throws on non-hex URI', () => {
      expect(() => make({ URI: 'not-hex!@#' })).toThrow(/URI/);
    });

    it('throws on empty-string URI', () => {
      expect(() => make({ URI: '' })).toThrow(/URI/);
    });

    it('throws on odd-length hex URI', () => {
      // 3 hex chars — odd, not a valid byte-aligned BLOB encoding.
      expect(() => make({ URI: 'ABC' })).toThrow(/even number/);
    });

    it('throws on URI > 256 bytes (512 hex chars)', () => {
      const huge = 'A'.repeat(514); // 514 hex chars = 257 bytes
      expect(() => make({ URI: huge })).toThrow(/URI/);
    });

    it('accepts URI at exactly 256 bytes (512 hex chars)', () => {
      const ok = 'A'.repeat(512);
      const tx = make({ URI: ok });
      expect(tx.URI).toBe(ok);
    });
  });

  // ─── Amount validation ──────────────────────────────────────────────

  describe('Amount validation', () => {
    it('accepts XRP Amount as drops string', () => {
      const tx = make({ Amount: '1000000' });
      expect(tx.Amount).toBe('1000000');
    });

    it('accepts XRP Amount of "0" (gratis giveaway, XLS-20 §1.5.1)', () => {
      const tx = make({ Amount: '0' });
      expect(tx.Amount).toBe('0');
    });

    it('accepts IssuedCurrencyAmount', () => {
      const amount = { currency: 'USD', issuer: ISSUER, value: '100' };
      const tx = make({ Amount: amount });
      expect(tx.Amount).toEqual(amount);
    });

    it('accepts MPTAmount', () => {
      const amount = { mpt_issuance_id: '00000001', value: '50' };
      const tx = make({ Amount: amount });
      expect(tx.Amount).toEqual(amount);
    });

    it('throws on malformed Amount', () => {
      expect(() => make({ Amount: { foo: 'bar' } as never })).toThrow(/Amount/);
    });

    it('throws when IOU Amount.issuer is not a valid account', () => {
      expect(() =>
        make({
          Amount: { currency: 'USD', issuer: 'bad', value: '100' } as never,
        }),
      ).toThrow(/issuer/);
    });

    it('throws when Amount.value is not a non-negative base-10 integer string', () => {
      expect(() =>
        make({
          Amount: { currency: 'USD', issuer: ISSUER, value: '-1' } as never,
        }),
      ).toThrow(/value/);
    });
  });

  // ─── Expiration validation ──────────────────────────────────────────

  describe('Expiration validation', () => {
    const future = 800000000;

    it('accepts a UInt32 Expiration when Amount is present', () => {
      const tx = make({ Amount: '1000000', Expiration: future });
      expect(tx.Expiration).toBe(future);
    });

    it('throws when Expiration is set without Amount', () => {
      expect(() => make({ Expiration: future })).toThrow(/Expiration requires Amount/);
    });

    it('throws on non-integer Expiration', () => {
      expect(() => make({ Amount: '1000000', Expiration: 1.5 })).toThrow(/Expiration/);
    });

    it('throws on negative Expiration', () => {
      expect(() => make({ Amount: '1000000', Expiration: -1 })).toThrow(/Expiration/);
    });

    it('throws on Expiration > UInt32 max', () => {
      expect(() =>
        make({ Amount: '1000000', Expiration: 0x100000000 }),
      ).toThrow(/Expiration/);
    });
  });

  // ─── Destination validation ─────────────────────────────────────────

  describe('Destination validation', () => {
    it('accepts a valid Destination when Amount is present', () => {
      const tx = make({ Amount: '1000000', Destination: DESTINATION });
      expect(tx.Destination).toBe(DESTINATION);
    });

    it('throws when Destination is set without Amount', () => {
      expect(() => make({ Destination: DESTINATION })).toThrow(/Destination requires Amount/);
    });

    it('throws on malformed Destination', () => {
      expect(() =>
        make({ Amount: '1000000', Destination: 'not-an-account' }),
      ).toThrow(/Destination/);
    });
  });

  // ─── Flag handling ──────────────────────────────────────────────────

  describe('Flag handling', () => {
    it('accepts numeric Flags with tfBurnable (0x1)', () => {
      const tx = make({ Flags: 0x00000001 });
      expect((tx.Flags as number) & 0x00000001).toBe(0x00000001);
    });

    it('accepts numeric Flags with tfOnlyXRP (0x2)', () => {
      const tx = make({ Flags: 0x00000002 });
      expect((tx.Flags as number) & 0x00000002).toBe(0x00000002);
    });

    it('accepts numeric Flags with tfTransferable (0x8)', () => {
      const tx = make({ Flags: 0x00000008 });
      expect((tx.Flags as number) & 0x00000008).toBe(0x00000008);
    });

    it('accepts numeric Flags with tfMutable (0x10) — XLS-46 dNFT', () => {
      const tx = make({ Flags: 0x00000010 });
      expect((tx.Flags as number) & 0x00000010).toBe(0x00000010);
    });

    it('accepts combined numeric Flags (tfBurnable | tfTransferable | tfMutable)', () => {
      const combined = 0x00000001 | 0x00000008 | 0x00000010;
      const tx = make({ Flags: combined });
      expect(tx.Flags).toBe(combined);
    });

    it('accepts boolean-map Flags (NFTokenMintFlagsInterface)', () => {
      const tx = make({
        Flags: { tfBurnable: true, tfOnlyXRP: true, tfMutable: true },
      });
      // Factory stores the original (object) form.
      expect(tx.Flags).toEqual({
        tfBurnable: true,
        tfOnlyXRP: true,
        tfMutable: true,
      });
    });

    it('rejects numeric Flags with tfTrustLine (deprecated amendment)', () => {
      expect(() => make({ Flags: 0x00000004 })).toThrow(/tfTrustLine/);
    });

    it('rejects object-form Flags with tfTrustLine=true', () => {
      expect(() => make({ Flags: { tfTrustLine: true } as never })).toThrow(/tfTrustLine/);
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
        (tx as unknown as { NFTokenTaxon: number }).NFTokenTaxon = 99;
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides', () => {
      const tx = make();
      const tx2 = tx.with({ NFTokenTaxon: 42 });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.NFTokenTaxon).toBe(42);
      expect(tx.NFTokenTaxon).toBe(0);
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() =>
        tx.with({ NFTokenTaxon: -5 }),
      ).toThrow(/NFTokenTaxon/);
    });

    it('.with() re-validates when adding TransferFee without tfTransferable', () => {
      const tx = make();
      expect(() =>
        tx.with({ TransferFee: 314 }),
      ).toThrow(/tfTransferable/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({ NFTokenTaxon: 5, Flags: 0x00000001 });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'NFTokenMint',
        Account: ACCOUNT,
        NFTokenTaxon: 5,
        Flags: 0x00000001,
      });
    });

    it('.toJSON() skips undefined fields', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('Issuer' in json).toBe(false);
      expect('TransferFee' in json).toBe(false);
      expect('URI' in json).toBe(false);
      expect('Amount' in json).toBe(false);
      expect('Expiration' in json).toBe(false);
      expect('Destination' in json).toBe(false);
      expect('Flags' in json).toBe(false);
    });

    it('.validate() is a no-op (already validated at construction)', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });
});
