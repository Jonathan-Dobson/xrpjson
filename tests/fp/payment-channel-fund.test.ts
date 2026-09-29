/**
 * Tests for the functional PaymentChannelFund factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, Channel, Amount).
 *   2. Optional fields (Expiration, Flags, Fee, Sequence).
 *   3. Spec-mandated guards the class API omits:
 *        a. Amount must be XRP-drops AND strictly positive
 *           (rippled preflight `temBAD_AMOUNT`).
 *        b. Channel must be a 64-character hex (UInt256).
 *        c. Expiration must fit UInt32 (xrpl.org doc).
 *   4. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined fields).
 *   5. Round-trip through xrpl encode/decode.
 */
import { describe, it, expect } from 'vitest';
import { decode, encode } from 'xrpl';
import { paymentChannelFund } from '../../src/fp/factories/payment-channel-fund.js';

const ACCOUNT_A = 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn';
// 64-character hex (UInt256) PayChannel ID — same value used in the
// xrpl.js canonical fixture.
const CHANNEL_ID =
  'C1AE6DDDEEC05CF2978C0BAD6FE302948E9533691DC749DCDD3B9E5992CA6198';

const BASE_PROPS = {
  Account: ACCOUNT_A,
  Channel: CHANNEL_ID,
  Amount: '200000',
};

function make(
  extras: Record<string, unknown> = {},
): ReturnType<typeof paymentChannelFund> {
  return paymentChannelFund({ ...BASE_PROPS, ...extras });
}

describe('fp/paymentChannelFund()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = paymentChannelFund(BASE_PROPS);
      expect(tx.TransactionType).toBe('PaymentChannelFund');
      expect(tx.Account).toBe(ACCOUNT_A);
      expect(tx.Channel).toBe(CHANNEL_ID);
      expect(tx.Amount).toBe('200000');
    });

    it('passes through optional Expiration', () => {
      const tx = make({ Expiration: 543171558 });
      expect(tx.Expiration).toBe(543171558);
    });

    it('passes through optional Fee/Sequence/Flags', () => {
      const tx = make({ Flags: 0, Fee: '12', Sequence: 8 });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(8);
      expect(tx.Flags).toBe(0);
    });

    it('accepts an uppercase Channel hex (UInt256, mixed case)', () => {
      const tx = paymentChannelFund({
        ...BASE_PROPS,
        Channel: CHANNEL_ID.toUpperCase(),
      });
      expect(tx.Channel).toBe(CHANNEL_ID.toUpperCase());
    });

    it('accepts a low Channel hex (UInt256, all lowercase)', () => {
      const tx = paymentChannelFund({
        ...BASE_PROPS,
        Channel: CHANNEL_ID.toLowerCase(),
      });
      expect(tx.Channel).toBe(CHANNEL_ID.toLowerCase());
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        paymentChannelFund({ ...BASE_PROPS, Account: '' as never }),
      ).toThrow(/Account/);
    });

    it('throws on invalid Account', () => {
      expect(() =>
        paymentChannelFund({ ...BASE_PROPS, Account: 'not-a-classic-address' }),
      ).toThrow(/Account/);
    });
  });

  describe('Channel validation', () => {
    it('throws on missing Channel', () => {
      expect(() =>
        paymentChannelFund({ ...BASE_PROPS, Channel: '' as never }),
      ).toThrow(/Channel/);
    });

    it('throws on a non-string Channel', () => {
      expect(() =>
        paymentChannelFund({ ...BASE_PROPS, Channel: 123 as never }),
      ).toThrow(/Channel/);
    });

    it('throws on a non-hex Channel (rippled UInt256)', () => {
      expect(() =>
        paymentChannelFund({
          ...BASE_PROPS,
          Channel: 'Z'.repeat(64),
        }),
      ).toThrow(/Channel/);
    });

    it('throws on a Channel shorter than 64 hex chars (e.g. 63)', () => {
      expect(() =>
        paymentChannelFund({
          ...BASE_PROPS,
          Channel: 'A'.repeat(63),
        }),
      ).toThrow(/Channel/);
    });

    it('throws on a Channel longer than 64 hex chars (e.g. 65)', () => {
      expect(() =>
        paymentChannelFund({
          ...BASE_PROPS,
          Channel: 'A'.repeat(65),
        }),
      ).toThrow(/Channel/);
    });
  });

  describe('Amount validation', () => {
    it('throws on missing Amount', () => {
      expect(() =>
        paymentChannelFund({ ...BASE_PROPS, Amount: undefined as never }),
      ).toThrow(/Amount/);
    });

    it('throws on a zero Amount (rippled temBAD_AMOUNT)', () => {
      expect(() => make({ Amount: '0' })).toThrow(/strictly-positive/);
    });

    it('throws on a negative Amount (rippled temBAD_AMOUNT)', () => {
      expect(() => make({ Amount: '-1' })).toThrow(/strictly-positive/);
    });

    it('throws on an IOU Amount form (ledger requires XRP-only)', () => {
      expect(() =>
        make({
          Amount: { currency: 'USD', issuer: ACCOUNT_A, value: '10' } as never,
        }),
      ).toThrow(/XRP drops/);
    });

    it('throws on an MPT Amount form (ledger requires XRP-only)', () => {
      expect(() =>
        make({
          Amount: { mpt_issuance_id: '00000001', value: '10' } as never,
        }),
      ).toThrow(/XRP drops/);
    });

    it('throws on a non-numeric Amount', () => {
      expect(() => make({ Amount: 'ten' })).toThrow(/strictly-positive/);
    });
  });

  describe('Expiration validation', () => {
    it('accepts Expiration=0 (valid UInt32; ledger ignores if past)', () => {
      const tx = make({ Expiration: 0 });
      expect(tx.Expiration).toBe(0);
    });

    it('accepts Expiration at the UInt32 boundary', () => {
      const tx = make({ Expiration: 0xffff_ffff });
      expect(tx.Expiration).toBe(0xffff_ffff);
    });

    it('throws on a negative Expiration (UInt32 range)', () => {
      expect(() => make({ Expiration: -1 })).toThrow(/Expiration/);
    });

    it('throws on a non-integer Expiration', () => {
      expect(() => make({ Expiration: 1.5 })).toThrow(/Expiration/);
    });

    it('throws on an Expiration exceeding UInt32', () => {
      expect(() => make({ Expiration: 0x1_0000_0000 })).toThrow(
        /Expiration/,
      );
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
        (tx as unknown as Record<string, unknown>).Amount = '999';
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      const tx = make();
      const tx2 = tx.with({ Expiration: 600000000 });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Expiration).toBe(600000000);
      expect(tx.Expiration).toBeUndefined();
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() => tx.with({ Amount: '0' })).toThrow(/strictly-positive/);
      expect(() => tx.with({ Amount: -1 as never })).toThrow(/XRP drops/);
      expect(() =>
        tx.with({ Channel: 'A'.repeat(63) }),
      ).toThrow(/Channel/);
      expect(() => tx.with({ Expiration: -5 })).toThrow(/Expiration/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({
        Expiration: 543171558,
        Fee: '12',
        Sequence: 8,
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'PaymentChannelFund',
        Account: ACCOUNT_A,
        Channel: CHANNEL_ID,
        Amount: '200000',
        Expiration: 543171558,
        Fee: '12',
        Sequence: 8,
      });
    });

    it('.toJSON() skips methods and undefined fields', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('Expiration' in json).toBe(false);
      expect('Flags' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op after construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });

    it('round-trips through xrpl encode/decode', () => {
      const tx = paymentChannelFund({
        ...BASE_PROPS,
        Expiration: 543171558,
        Fee: '12',
      });
      const encoded = encode(tx.toJSON() as never);
      expect(encoded).toBeDefined();
      const decoded = decode(encoded);
      expect(decoded.TransactionType).toBe('PaymentChannelFund');
      expect(decoded.Account).toBe(ACCOUNT_A);
      expect(decoded.Channel).toBe(CHANNEL_ID);
      expect(decoded.Amount).toBe('200000');
      expect(decoded.Expiration).toBe(543171558);
    });
  });
});
