/**
 * Tests for the functional TrustSet factory.
 *
 * Validates:
 *   1. Construction with required Account + LimitAmount, plus optional
 *      QualityIn/QualityOut/Flags/Fee/Sequence.
 *   2. LimitAmount shape — must be an IssuedCurrencyAmount (not XRP
 *      drops string, not MPTAmount), per xrpl-dev-portal `trustset.md`.
 *   3. Spec-mandated guards the class API omits:
 *        a. LimitAmount must be IssuedCurrencyAmount, not generic Amount
 *           (currency code != 'XRP'; MPT objects rejected).
 *        b. LimitAmount.currency must not be 'XRP'.
 *        c. LimitAmount.issuer must be a valid XRPL address.
 *        d. LimitAmount.value must be a non-negative XRPL string-number.
 *        e. QualityIn / QualityOut must be a UInt32 in [0, 0xFFFFFFFF].
 *   4. Frozen-shape contract (mutation throws, .with() returns new
 *      frozen object, .toJSON() strips methods and undefined fields).
 */
import { describe, it, expect } from 'vitest';
import { trustSet } from '../../src/fp/factories/trust-set.js';

const TRUSTOR = 'rUn84CUYbNjRoTQ6mSW7BVJPSVJNLb1QLo';
const GATEWAY = 'rcXY84C4g14iFp6taFXjjQGVeHqSCh9RX';
// 40-char hex non-standard currency code (arbitrary bytes; not 'XRP').
const NONSTD_CURRENCY =
  '444F4C4C415259444F4F00000000000000000000'; // "DOLLARYDOO" with zero padding

function makeLimit(extras: Record<string, unknown> = {}) {
  return {
    currency: 'USD',
    issuer: GATEWAY,
    value: '100',
    ...extras,
  };
}

function make(extras: Record<string, unknown> = {}) {
  return trustSet({
    Account: TRUSTOR,
    LimitAmount: makeLimit(),
    ...extras,
  });
}

describe('fp/trustSet()', () => {
  describe('construction', () => {
    it('constructs with required Account + LimitAmount', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('TrustSet');
      expect(tx.Account).toBe(TRUSTOR);
      expect(tx.LimitAmount).toEqual({
        currency: 'USD',
        issuer: GATEWAY,
        value: '100',
      });
    });

    it('accepts a non-standard 40-char hex currency code', () => {
      const tx = trustSet({
        Account: TRUSTOR,
        LimitAmount: {
          currency: NONSTD_CURRENCY,
          issuer: GATEWAY,
          value: '5',
        },
      });
      expect(tx.LimitAmount.currency).toBe(NONSTD_CURRENCY);
    });

    it('accepts LimitAmount.value = "0" (deletion path per spec)', () => {
      const tx = trustSet({
        Account: TRUSTOR,
        LimitAmount: { currency: 'USD', issuer: GATEWAY, value: '0' },
      });
      expect(tx.LimitAmount.value).toBe('0');
    });

    it('accepts scientific-notation LimitAmount.value', () => {
      const tx = trustSet({
        Account: TRUSTOR,
        LimitAmount: {
          currency: 'USD',
          issuer: GATEWAY,
          value: '1.23e11',
        },
      });
      expect(tx.LimitAmount.value).toBe('1.23e11');
    });

    it('passes through QualityIn / QualityOut', () => {
      const tx = make({ QualityIn: 1234, QualityOut: 4321 });
      expect(tx.QualityIn).toBe(1234);
      expect(tx.QualityOut).toBe(4321);
    });

    it('passes through optional Fee / Sequence / Flags', () => {
      const tx = make({ Flags: 0, Fee: '12', Sequence: 8 });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(8);
      expect(tx.Flags).toBe(0);
    });

    it('accepts a boolean-map Flags shape', () => {
      const tx = make({ Flags: { tfSetNoRipple: true, tfSetFreeze: true } });
      expect(tx.Flags).toEqual({ tfSetNoRipple: true, tfSetFreeze: true });
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        trustSet({
          Account: '' as never,
          LimitAmount: makeLimit(),
        }),
      ).toThrow(/Account/);
    });

    it('throws on a malformed Account address', () => {
      expect(() =>
        trustSet({
          Account: 'not-an-address' as never,
          LimitAmount: makeLimit(),
        }),
      ).toThrow(/Account/);
    });
  });

  describe('LimitAmount validation', () => {
    it('throws on missing LimitAmount', () => {
      expect(() =>
        trustSet({
          Account: TRUSTOR,
          LimitAmount: undefined as never,
        }),
      ).toThrow(/LimitAmount/);
    });

    it('throws on an XRP drops string LimitAmount (rejected by spec)', () => {
      expect(() =>
        trustSet({
          Account: TRUSTOR,
          LimitAmount: '1000000' as never,
        }),
      ).toThrow(/LimitAmount/);
    });

    it('throws on an MPTAmount LimitAmount (rejected by spec)', () => {
      expect(() =>
        trustSet({
          Account: TRUSTOR,
          LimitAmount: {
            mpt_issuance_id: '00000001',
            value: '100',
          } as never,
        }),
      ).toThrow(/LimitAmount/);
    });

    it('throws on a non-object LimitAmount (e.g. a number)', () => {
      expect(() =>
        trustSet({
          Account: TRUSTOR,
          LimitAmount: 100 as never,
        }),
      ).toThrow(/LimitAmount/);
    });

    it('throws on LimitAmount.currency = "XRP" (xrpl.org trustset.md line 38)', () => {
      expect(() =>
        trustSet({
          Account: TRUSTOR,
          LimitAmount: { currency: 'XRP', issuer: GATEWAY, value: '100' },
        }),
      ).toThrow(/"XRP"/);
    });

    it('throws on a currency of wrong length (not 3 or 40 chars)', () => {
      expect(() =>
        trustSet({
          Account: TRUSTOR,
          LimitAmount: {
            currency: 'DOLLAR',
            issuer: GATEWAY,
            value: '100',
          },
        }),
      ).toThrow(/currency/);
    });

    it('throws on a non-hex non-standard currency of wrong length', () => {
      expect(() =>
        trustSet({
          Account: TRUSTOR,
          LimitAmount: {
            currency: 'XX', // 2 chars: too short for both
            issuer: GATEWAY,
            value: '100',
          },
        }),
      ).toThrow(/currency/);
    });

    it('throws on a malformed LimitAmount.issuer (not an XRPL address)', () => {
      expect(() =>
        trustSet({
          Account: TRUSTOR,
          LimitAmount: {
            currency: 'USD',
            issuer: 'not-an-address',
            value: '100',
          },
        }),
      ).toThrow(/issuer/);
    });

    it('throws on a negative LimitAmount.value', () => {
      expect(() =>
        trustSet({
          Account: TRUSTOR,
          LimitAmount: {
            currency: 'USD',
            issuer: GATEWAY,
            value: '-1',
          },
        }),
      ).toThrow(/value/);
    });

    it('throws on a non-numeric LimitAmount.value', () => {
      expect(() =>
        trustSet({
          Account: TRUSTOR,
          LimitAmount: {
            currency: 'USD',
            issuer: GATEWAY,
            value: 'abc',
          },
        }),
      ).toThrow(/value/);
    });

    it('throws on a LimitAmount.value with leading +', () => {
      expect(() =>
        trustSet({
          Account: TRUSTOR,
          LimitAmount: {
            currency: 'USD',
            issuer: GATEWAY,
            value: '+100',
          },
        }),
      ).toThrow(/value/);
    });

    it('throws on a LimitAmount.value missing digits (e.g. ".")', () => {
      expect(() =>
        trustSet({
          Account: TRUSTOR,
          LimitAmount: {
            currency: 'USD',
            issuer: GATEWAY,
            value: '.5',
          },
        }),
      ).toThrow(/value/);
    });

    it('accepts LimitAmount.value with fractional decimals (e.g. "0.5")', () => {
      const tx = trustSet({
        Account: TRUSTOR,
        LimitAmount: { currency: 'USD', issuer: GATEWAY, value: '0.5' },
      });
      expect(tx.LimitAmount.value).toBe('0.5');
    });
  });

  describe('QualityIn validation (UInt32)', () => {
    it('throws on a negative QualityIn', () => {
      expect(() => make({ QualityIn: -1 })).toThrow(/QualityIn/);
    });

    it('throws on a non-integer QualityIn', () => {
      expect(() => make({ QualityIn: 1.5 })).toThrow(/QualityIn/);
    });

    it('throws on a QualityIn above UInt32 max', () => {
      expect(() => make({ QualityIn: 0x1_0000_0000 })).toThrow(/QualityIn/);
    });

    it('accepts QualityIn = 0 (xrpl.org lower bound; "face value")', () => {
      const tx = make({ QualityIn: 0 });
      expect(tx.QualityIn).toBe(0);
    });

    it('accepts QualityIn = UInt32 max', () => {
      const tx = make({ QualityIn: 0xffffffff });
      expect(tx.QualityIn).toBe(0xffffffff);
    });
  });

  describe('QualityOut validation (UInt32)', () => {
    it('throws on a negative QualityOut', () => {
      expect(() => make({ QualityOut: -1 })).toThrow(/QualityOut/);
    });

    it('throws on a non-integer QualityOut', () => {
      expect(() => make({ QualityOut: 1.5 })).toThrow(/QualityOut/);
    });

    it('throws on a QualityOut above UInt32 max', () => {
      expect(() => make({ QualityOut: 0x1_0000_0000 })).toThrow(/QualityOut/);
    });

    it('accepts QualityOut = 0 (xrpl.org lower bound; "face value")', () => {
      const tx = make({ QualityOut: 0 });
      expect(tx.QualityOut).toBe(0);
    });

    it('accepts QualityOut = UInt32 max', () => {
      const tx = make({ QualityOut: 0xffffffff });
      expect(tx.QualityOut).toBe(0xffffffff);
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
        (tx as unknown as Record<string, unknown>).Account =
          'rAnotherAddressXXXXXXXXXXXXXXXXX';
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      const tx = make();
      const tx2 = tx.with({ QualityIn: 1000 });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.QualityIn).toBe(1000);
      expect(tx.QualityIn).toBeUndefined();
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() =>
        tx.with({
          LimitAmount: { currency: 'XRP', issuer: GATEWAY, value: '100' },
        }),
      ).toThrow(/"XRP"/);
      expect(() =>
        tx.with({
          LimitAmount: { currency: 'USD', issuer: GATEWAY, value: '-1' },
        }),
      ).toThrow(/value/);
      expect(() => tx.with({ QualityIn: -1 })).toThrow(/QualityIn/);
      expect(() => tx.with({ QualityOut: 0x1_0000_0000 })).toThrow(
        /QualityOut/,
      );
      // Overriding Account to an invalid string must fail on re-validation.
      expect(() => tx.with({ Account: 'oops' })).toThrow(/Account/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = trustSet({
        Account: TRUSTOR,
        LimitAmount: { currency: 'USD', issuer: GATEWAY, value: '100' },
        QualityIn: 1000,
        QualityOut: 2000,
        Flags: 0x00020000, // tfSetNoRipple
        Fee: '12',
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'TrustSet',
        Account: TRUSTOR,
        LimitAmount: { currency: 'USD', issuer: GATEWAY, value: '100' },
        QualityIn: 1000,
        QualityOut: 2000,
        Flags: 0x00020000,
        Fee: '12',
      });
    });

    it('.toJSON() skips undefined fields and methods', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('QualityIn' in json).toBe(false);
      expect('QualityOut' in json).toBe(false);
      expect('Flags' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op after construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });

  // ─── BaseTransactionFields ───
  // The props type now extends
  // `Omit<BaseTransactionFields, 'TransactionType' | 'Flags'>`, so the seven
  // fields that were absent from every factory's prop type are accepted here,
  // and `validateBaseTransaction` checks them. Before this, each REJECT case
  // below built a frozen transaction silently.
  //
  // Scope: this asserts the shared base-field contract for this one factory.
  // It is not a claim about the factories that have not been converted.
  describe('BaseTransactionFields', () => {
    const A = make({}).Account;

    it('accepts TicketSequence (the field that made tickets unspendable)', () => {
      const tx = make({ TicketSequence: 42 });
      expect(tx.TicketSequence).toBe(42);
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() => make({ TicketSequence: 'nope' } as any)).toThrow(
        /TicketSequence must be a number/,
      );
    });

    it('accepts a valid Memos array', () => {
      const tx = make({ Memos: [{"Memo":{"MemoType":"74","MemoData":"6869"}}] });
      expect(tx.Memos).toEqual([{"Memo":{"MemoType":"74","MemoData":"6869"}}]);
    });

    it('rejects a malformed Memos value', () => {
      expect(() => make({ Memos: 'not-an-array' } as any)).toThrow(
        /invalid Memos/,
      );
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() => make({ SourceTag: 'NaN' } as any)).toThrow(
        /SourceTag must be a number/,
      );
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() => make({ NetworkID: {} } as any)).toThrow(
        /NetworkID must be a number/,
      );
    });

    it('rejects Delegate equal to Account', () => {
      expect(() => make({ Delegate: A })).toThrow(/cannot be the same/);
    });

    it('rejects a non-string Fee', () => {
      expect(() => make({ Fee: 12 } as any)).toThrow(/Fee must be a string/);
    });

    it('survives .with() with a base field set', () => {
      const tx = make({ SourceTag: 99 });
      const next = tx.with({ SourceTag: 100 } as any);
      expect(next.SourceTag).toBe(100);
    });
  });

});