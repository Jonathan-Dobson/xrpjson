/**
 * Tests for the functional Payment factory.
 *
 * What we're validating:
 *   1. Validation happens at construction (no separate .validate() needed).
 *   2. The returned tx is frozen — mutation throws in strict mode, fails
 *      silently in sloppy mode.
 *   3. .with() returns a new frozen tx with overrides applied, and
 *      re-validates.
 *   4. .toJSON() produces a plain object matching xrpl.js shape.
 *   5. Round-trip through xrpl.encode/decode works (the same oracle the
 *      class-based integration.offline test uses).
 */
import { describe, it, expect } from 'vitest';
import { decode, encode } from 'xrpl';
import { payment } from '../../src/fp/index.js';

const ACCOUNT_A = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const ACCOUNT_B = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';

describe('fp/payment()', () => {
  it('constructs with required fields', () => {
    const tx = payment({
      Account: ACCOUNT_A,
      Destination: ACCOUNT_B,
      Amount: '1000000',
    });
    expect(tx.TransactionType).toBe('Payment');
    expect(tx.Account).toBe(ACCOUNT_A);
    expect(tx.Amount).toBe('1000000');
  });

  it('throws at construction on missing Account', () => {
    expect(() =>
      payment({ Account: '', Destination: ACCOUNT_B, Amount: '1000000' } as any),
    ).toThrow(/Account/);
  });

  it('throws at construction on missing Amount', () => {
    expect(() =>
      payment({ Account: ACCOUNT_A, Destination: ACCOUNT_B, Amount: undefined as any }),
    ).toThrow(/Amount/);
  });

  it('throws at construction on missing Destination', () => {
    expect(() =>
      payment({ Account: ACCOUNT_A, Destination: '', Amount: '1000000' } as any),
    ).toThrow(/Destination/);
  });

  it('returns a frozen object', () => {
    const tx = payment({
      Account: ACCOUNT_A,
      Destination: ACCOUNT_B,
      Amount: '1000000',
    });
    expect(Object.isFrozen(tx)).toBe(true);
  });

  it('mutation throws in strict mode (frozen at every layer)', () => {
    const tx = payment({
      Account: ACCOUNT_A,
      Destination: ACCOUNT_B,
      Amount: '1000000',
    });
    // ESM runs in strict mode, so Object.freeze produces a TypeError
    // on attempted assignment rather than silently dropping it.
    // (This is BETTER for users — they get a clear error.)
    expect(() => {
      (tx as any).Amount = '9999999';
    }).toThrow(TypeError);
    expect(tx.Amount).toBe('1000000');
  });

  it('.with() returns a new frozen tx with overrides', () => {
    const tx = payment({
      Account: ACCOUNT_A,
      Destination: ACCOUNT_B,
      Amount: '1000000',
    });
    const tx2 = tx.with({ Fee: '12', Sequence: 42 });
    expect(tx2).not.toBe(tx); // new object identity
    expect(Object.isFrozen(tx2)).toBe(true);
    expect(tx2.Fee).toBe('12');
    expect(tx2.Sequence).toBe(42);
    expect(tx2.Amount).toBe('1000000'); // preserved
    expect(tx.Fee).toBeUndefined(); // original untouched
  });

  it('.with() re-validates on overrides', () => {
    const tx = payment({
      Account: ACCOUNT_A,
      Destination: ACCOUNT_B,
      Amount: '1000000',
    });
    expect(() => tx.with({ Destination: '' } as any)).toThrow(/Destination/);
  });

  it('.toJSON() produces a plain object matching xrpl.js shape', () => {
    const tx = payment({
      Account: ACCOUNT_A,
      Destination: ACCOUNT_B,
      Amount: '1000000',
      Fee: '12',
      Sequence: 42,
    });
    const json = tx.toJSON();
    expect(json).toEqual({
      TransactionType: 'Payment',
      Account: ACCOUNT_A,
      Destination: ACCOUNT_B,
      Amount: '1000000',
      Fee: '12',
      Sequence: 42,
    });
  });

  it('.toJSON() skips methods and undefined fields', () => {
    const tx = payment({
      Account: ACCOUNT_A,
      Destination: ACCOUNT_B,
      Amount: '1000000',
    });
    const json = tx.toJSON();
    expect(json).not.toHaveProperty('validate');
    expect(json).not.toHaveProperty('toJSON');
    expect(json).not.toHaveProperty('with');
    expect(json).not.toHaveProperty('DestinationTag'); // undefined
  });

  it('.validate() is a no-op (validation already happened)', () => {
    const tx = payment({
      Account: ACCOUNT_A,
      Destination: ACCOUNT_B,
      Amount: '1000000',
    });
    expect(() => tx.validate()).not.toThrow();
  });

  it('round-trips through xrpl encode/decode', () => {
    const tx = payment({
      Account: ACCOUNT_A,
      Destination: ACCOUNT_B,
      Amount: '1000000',
      Fee: '12',
    });
    const encoded = encode(tx.toJSON() as any);
    expect(encoded).toBeDefined();
    const decoded = decode(encoded);
    expect(decoded.TransactionType).toBe('Payment');
    expect(decoded.Account).toBe(ACCOUNT_A);
  });

  it('rejects DeliverMin without tfPartialPayment flag at construction', () => {
    expect(() =>
      payment({
        Account: ACCOUNT_A,
        Destination: ACCOUNT_B,
        Amount: '1000000',
        DeliverMin: '500000',
      } as any),
    ).toThrow(/tfPartialPayment/);
  });

  it('accepts DeliverMin with tfPartialPayment flag (numeric)', () => {
    const tx = payment({
      Account: ACCOUNT_A,
      Destination: ACCOUNT_B,
      Amount: '1000000',
      DeliverMin: '500000',
      Flags: 0x00020000,
    } as any);
    expect(tx.DeliverMin).toBe('500000');
  });
});