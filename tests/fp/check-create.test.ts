/**
 * Tests for the functional CheckCreate factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, Destination, SendMax)
 *      and all 3 SendMax forms (XRP drops, trust line, MPT).
 *   2. Optional field handling (DestinationTag, Expiration, InvoiceID,
 *      Flags, Fee, Sequence).
 *   3. Spec-mandated guards the class API omits:
 *        a. Destination must not equal Account (xrpl.org temREDUNDANT).
 *        b. SendMax must be strictly positive (xrpl.org temBAD_AMOUNT).
 *        c. DestinationTag must be a UInt32.
 *        d. Expiration must be a UInt32.
 *        e. InvoiceID must be a 64-char hex string (UInt256).
 *   4. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined fields).
 */
import { describe, it, expect } from 'vitest';
import { checkCreate } from '../../src/fp/factories/check-create.js';

const SENDER = 'rUn84CUYbNjRoTQ6mSW7BVJPSVJNLb1QLo';
const RECIPIENT = 'rfkE1aSy9G8Upk4JssnwBxhEv5p4mn2KTy';
// 64-char hex InvoiceID taken from the xrpl.org `checkcreate.md` example.
const VALID_INVOICE_ID =
  '6F1DFD1D0FE8A32E40E1F2C05CF1C15545BAB56B617F9C6C2D63A6B704BEF59B';
const ISSUER = 'rXJSJiZMxaLuH3kQBUV5DLipnYtrE6iVb';

const IOU_SEND_MAX = { currency: 'TST', issuer: ISSUER, value: '100' };
const MPT_SEND_MAX = { mpt_issuance_id: '00000001', value: '100' };

function make(extras: Record<string, unknown> = {}) {
  return checkCreate({
    Account: SENDER,
    Destination: RECIPIENT,
    SendMax: '100000000',
    ...extras,
  });
}

describe('fp/checkCreate()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('CheckCreate');
      expect(tx.Account).toBe(SENDER);
      expect(tx.Destination).toBe(RECIPIENT);
      expect(tx.SendMax).toBe('100000000');
    });

    it('accepts a trust-line IssuedCurrencyAmount SendMax', () => {
      const tx = checkCreate({
        Account: SENDER,
        Destination: RECIPIENT,
        SendMax: IOU_SEND_MAX,
      });
      expect(tx.SendMax).toEqual(IOU_SEND_MAX);
    });

    it('accepts an MPTAmount SendMax', () => {
      const tx = checkCreate({
        Account: SENDER,
        Destination: RECIPIENT,
        SendMax: MPT_SEND_MAX,
      });
      expect(tx.SendMax).toEqual(MPT_SEND_MAX);
    });

    it('passes through DestinationTag / Expiration / InvoiceID', () => {
      const tx = make({
        DestinationTag: 1,
        Expiration: 570113521,
        InvoiceID: VALID_INVOICE_ID,
      });
      expect(tx.DestinationTag).toBe(1);
      expect(tx.Expiration).toBe(570113521);
      expect(tx.InvoiceID).toBe(VALID_INVOICE_ID);
    });

    it('passes through optional Fee / Sequence / Flags', () => {
      const tx = make({ Flags: 0, Fee: '12', Sequence: 8 });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(8);
      expect(tx.Flags).toBe(0);
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        checkCreate({
          Account: '' as never,
          Destination: RECIPIENT,
          SendMax: '1000',
        }),
      ).toThrow(/Account/);
    });

    it('throws on a malformed Account address', () => {
      expect(() =>
        checkCreate({
          Account: 'not-an-address' as never,
          Destination: RECIPIENT,
          SendMax: '1000',
        }),
      ).toThrow(/Account/);
    });
  });

  describe('Destination validation', () => {
    it('throws on missing Destination', () => {
      expect(() =>
        checkCreate({
          Account: SENDER,
          Destination: '' as never,
          SendMax: '1000',
        }),
      ).toThrow(/Destination/);
    });

    it('throws on a malformed Destination address', () => {
      expect(() =>
        checkCreate({
          Account: SENDER,
          Destination: 'not-an-address' as never,
          SendMax: '1000',
        }),
      ).toThrow(/Destination/);
    });

    it('throws when Destination equals Account (xrpl.org temREDUNDANT)', () => {
      expect(() =>
        checkCreate({
          Account: SENDER,
          Destination: SENDER,
          SendMax: '1000',
        }),
      ).toThrow(/must not equal Account/);
    });
  });

  describe('SendMax validation', () => {
    it('throws on missing SendMax', () => {
      expect(() =>
        checkCreate({
          Account: SENDER,
          Destination: RECIPIENT,
          SendMax: undefined as never,
        }),
      ).toThrow(/SendMax/);
    });

    it('throws on a malformed SendMax (not an Amount form)', () => {
      expect(() =>
        checkCreate({
          Account: SENDER,
          Destination: RECIPIENT,
          SendMax: 123 as never,
        }),
      ).toThrow(/SendMax/);
    });

    it('throws on a zero XRP drops SendMax (xrpl.org temBAD_AMOUNT)', () => {
      expect(() =>
        checkCreate({
          Account: SENDER,
          Destination: RECIPIENT,
          SendMax: '0',
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on a negative XRP drops SendMax (xrpl.org temBAD_AMOUNT)', () => {
      expect(() =>
        checkCreate({
          Account: SENDER,
          Destination: RECIPIENT,
          SendMax: '-1',
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on a zero IOU value SendMax', () => {
      expect(() =>
        checkCreate({
          Account: SENDER,
          Destination: RECIPIENT,
          SendMax: { currency: 'TST', issuer: ISSUER, value: '0' },
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on a negative IOU value SendMax', () => {
      expect(() =>
        checkCreate({
          Account: SENDER,
          Destination: RECIPIENT,
          SendMax: { currency: 'TST', issuer: ISSUER, value: '-100' },
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on a zero MPT value SendMax', () => {
      expect(() =>
        checkCreate({
          Account: SENDER,
          Destination: RECIPIENT,
          SendMax: { mpt_issuance_id: '00000001', value: '0' },
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on a negative MPT value SendMax', () => {
      expect(() =>
        checkCreate({
          Account: SENDER,
          Destination: RECIPIENT,
          SendMax: { mpt_issuance_id: '00000001', value: '-100' },
        }),
      ).toThrow(/strictly positive/);
    });
  });

  describe('DestinationTag validation (UInt32)', () => {
    it('throws on a negative DestinationTag', () => {
      expect(() => make({ DestinationTag: -1 })).toThrow(/DestinationTag/);
    });

    it('throws on a non-integer DestinationTag', () => {
      expect(() => make({ DestinationTag: 1.5 })).toThrow(/DestinationTag/);
    });

    it('throws on a DestinationTag above UInt32 max', () => {
      expect(() => make({ DestinationTag: 0x1_0000_0000 })).toThrow(
        /DestinationTag/,
      );
    });

    it('accepts DestinationTag = 0 (xrpl.org lower bound)', () => {
      const tx = make({ DestinationTag: 0 });
      expect(tx.DestinationTag).toBe(0);
    });

    it('accepts DestinationTag = UInt32 max (xrpl.org upper bound)', () => {
      const tx = make({ DestinationTag: 0xffffffff });
      expect(tx.DestinationTag).toBe(0xffffffff);
    });
  });

  describe('Expiration validation (UInt32)', () => {
    it('throws on a negative Expiration', () => {
      expect(() => make({ Expiration: -1 })).toThrow(/Expiration/);
    });

    it('throws on a non-integer Expiration', () => {
      expect(() => make({ Expiration: 1.5 })).toThrow(/Expiration/);
    });

    it('throws on an Expiration above UInt32 max', () => {
      expect(() => make({ Expiration: 0x1_0000_0000 })).toThrow(/Expiration/);
    });

    it('accepts Expiration = 0 (xrpl.org lower bound)', () => {
      const tx = make({ Expiration: 0 });
      expect(tx.Expiration).toBe(0);
    });
  });

  describe('InvoiceID validation (UInt256 hex)', () => {
    it('throws on an InvoiceID of wrong length', () => {
      expect(() => make({ InvoiceID: 'DEADBEEF' })).toThrow(/InvoiceID/);
    });

    it('throws on a non-hex InvoiceID', () => {
      expect(() =>
        make({ InvoiceID: 'Z'.repeat(64) }),
      ).toThrow(/InvoiceID/);
    });

    it('throws on an odd-length hex InvoiceID', () => {
      expect(() =>
        make({ InvoiceID: 'ABC' }),
      ).toThrow(/InvoiceID/);
    });

    it('accepts a 64-char hex InvoiceID', () => {
      const tx = make({ InvoiceID: VALID_INVOICE_ID });
      expect(tx.InvoiceID).toBe(VALID_INVOICE_ID);
    });
  });

  describe('frozen-shape contract', () => {
    it('returns a frozen object', () => {
      const tx = make();
      expect(Object.isFrozen(tx)).toBe(true);
    });

    it('mutation throws in strict mode', () => {
      const tx = make();
      expect(() => {
        (tx as unknown as Record<string, unknown>).Destination =
          'rAnotherAddressXXXXXXXXXXXXXXX';
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      const tx = make();
      const tx2 = tx.with({ SendMax: '200000000' });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.SendMax).toBe('200000000');
      expect(tx.SendMax).toBe('100000000');
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() => tx.with({ Destination: SENDER })).toThrow(
        /must not equal Account/,
      );
      expect(() => tx.with({ SendMax: '0' })).toThrow(/strictly positive/);
      expect(() => tx.with({ SendMax: '-5' })).toThrow(/strictly positive/);
      expect(() => tx.with({ DestinationTag: -1 })).toThrow(/DestinationTag/);
      expect(() => tx.with({ InvoiceID: 'short' })).toThrow(/InvoiceID/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = checkCreate({
        Account: SENDER,
        Destination: RECIPIENT,
        SendMax: '5000000',
        DestinationTag: 1,
        Fee: '12',
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'CheckCreate',
        Account: SENDER,
        Destination: RECIPIENT,
        SendMax: '5000000',
        DestinationTag: 1,
        Fee: '12',
      });
    });

    it('.toJSON() skips undefined fields and methods', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('DestinationTag' in json).toBe(false);
      expect('Expiration' in json).toBe(false);
      expect('InvoiceID' in json).toBe(false);
      expect('Flags' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op after construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });
});