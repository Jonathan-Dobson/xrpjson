/**
 * Tests for the functional AccountSet factory.
 * Companion to tests/fp/payment.test.ts — same frozen-shape contract,
 * different field set and validation rules.
 */
import { describe, it, expect } from 'vitest';
import { accountSet } from '../../src/fp/index.js';

const ACCOUNT_A = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

describe('fp/accountSet()', () => {
  it('constructs with minimal fields', () => {
    const tx = accountSet({
      Account: ACCOUNT_A,
      SetFlag: 8, // asfReceiveAMM
    });
    expect(tx.TransactionType).toBe('AccountSet');
    expect(tx.Account).toBe(ACCOUNT_A);
    expect(tx.SetFlag).toBe(8);
    expect(Object.isFrozen(tx)).toBe(true);
  });

  it('throws on TickSize out of range at construction', () => {
    expect(() =>
      accountSet({ Account: ACCOUNT_A, TickSize: 16 }),
    ).toThrow(/TickSize/);
  });

  it('throws on TickSize below minimum at construction', () => {
    expect(() =>
      accountSet({ Account: ACCOUNT_A, TickSize: 2 }),
    ).toThrow(/TickSize/);
  });

  it('accepts TickSize of 0 (disable)', () => {
    const tx = accountSet({ Account: ACCOUNT_A, TickSize: 0 });
    expect(tx.TickSize).toBe(0);
  });

  it('throws on TransferRate of wrong type', () => {
    expect(() =>
      accountSet({ Account: ACCOUNT_A, TransferRate: '12' as any }),
    ).toThrow(/TransferRate/);
  });

  it('throws on Domain of wrong type', () => {
    expect(() =>
      accountSet({ Account: ACCOUNT_A, Domain: 12345 as any }),
    ).toThrow(/Domain/);
  });

  it('.with() returns a new frozen tx', () => {
    const tx = accountSet({ Account: ACCOUNT_A, SetFlag: 8 });
    const tx2 = tx.with({ ClearFlag: 9 });
    expect(tx2).not.toBe(tx);
    expect(Object.isFrozen(tx2)).toBe(true);
    expect(tx2.ClearFlag).toBe(9);
    expect(tx2.SetFlag).toBe(8); // preserved
    expect(tx.ClearFlag).toBeUndefined(); // original untouched
  });

  it('.with() re-validates (cannot bypass via overrides)', () => {
    const tx = accountSet({ Account: ACCOUNT_A, SetFlag: 8 });
    expect(() => tx.with({ TickSize: 99 })).toThrow(/TickSize/);
  });

  it('.toJSON() strips methods and undefined fields', () => {
    const tx = accountSet({ Account: ACCOUNT_A, SetFlag: 8 });
    const json = tx.toJSON();
    expect(json).toEqual({
      TransactionType: 'AccountSet',
      Account: ACCOUNT_A,
      SetFlag: 8,
    });
  });
});