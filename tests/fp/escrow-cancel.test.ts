/**
 * Tests for the functional EscrowCancel factory.
 *
 * Validates:
 *   1. Construction with required Account + Owner + OfferSequence.
 *   2. OfferSequence is UInt32 (not just any number).
 *   3. Account / Owner format check (classic or X-address).
 *   4. Cross-field invariant: OfferSequence != Sequence (temBAD_SEQUENCE).
 *   5. Optional fields (Fee, Sequence, Flags) pass through.
 *   6. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined values).
 *   7. Factory-only rules not enforced by the class API:
 *      - non-integer / negative / > UInt32 OfferSequence rejected
 *      - malformed Account rejected (class API never checks Account here)
 *      - OfferSequence == Sequence rejected (temBAD_SEQUENCE)
 */
import { describe, it, expect } from 'vitest';
import { escrowCancel } from '../../src/fp/factories/escrow-cancel.js';

const ACCOUNT_A = 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn';
const ACCOUNT_B = 'rsA2LpzuawewSBQXkiju3YQTMzW13pAAdW';
const OFFER_SEQ = 7;

function make(extras: Record<string, unknown> = {}) {
  return escrowCancel({
    Account: ACCOUNT_A,
    Owner: ACCOUNT_B,
    OfferSequence: OFFER_SEQ,
    ...extras,
  });
}

describe('fp/escrowCancel()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('EscrowCancel');
      expect(tx.Account).toBe(ACCOUNT_A);
      expect(tx.Owner).toBe(ACCOUNT_B);
      expect(tx.OfferSequence).toBe(OFFER_SEQ);
      expect(tx.Fee).toBeUndefined();
      expect(tx.Sequence).toBeUndefined();
      expect(tx.Flags).toBeUndefined();
    });

    it('accepts every spec field together', () => {
      const tx = escrowCancel({
        Account: ACCOUNT_A,
        Owner: ACCOUNT_B,
        OfferSequence: 6,
        Flags: 0,
        Fee: '12',
        Sequence: 8,
      });
      expect(tx.Flags).toBe(0);
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(8);
      expect(tx.OfferSequence).toBe(6);
    });

    it('accepts OfferSequence = 0 (UInt32 minimum)', () => {
      const tx = make({ OfferSequence: 0 });
      expect(tx.OfferSequence).toBe(0);
    });

    it('accepts OfferSequence at UInt32 maximum', () => {
      const tx = make({ OfferSequence: 0xffffffff });
      expect(tx.OfferSequence).toBe(0xffffffff);
    });

    it('accepts Owner equal to Account (any account may cancel)', () => {
      const tx = escrowCancel({
        Account: ACCOUNT_A,
        Owner: ACCOUNT_A,
        OfferSequence: OFFER_SEQ,
      });
      expect(tx.Owner).toBe(tx.Account);
    });
  });

  describe('Account validation', () => {
    it('throws when Account is missing', () => {
      expect(() =>
        escrowCancel({
          Account: undefined as unknown as string,
          Owner: ACCOUNT_B,
          OfferSequence: OFFER_SEQ,
        }),
      ).toThrow(/Account is required/);
    });

    it('throws when Account is empty', () => {
      expect(() =>
        escrowCancel({
          Account: '' as never,
          Owner: ACCOUNT_B,
          OfferSequence: OFFER_SEQ,
        }),
      ).toThrow(/Account/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws when Account is not account-shaped', () => {
      expect(() =>
        escrowCancel({
          Account: 'not-an-address',
          Owner: ACCOUNT_B,
          OfferSequence: OFFER_SEQ,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('Owner validation', () => {
    it('throws when Owner is missing', () => {
      expect(() =>
        escrowCancel({
          Account: ACCOUNT_A,
          Owner: undefined as unknown as string,
          OfferSequence: OFFER_SEQ,
        }),
      ).toThrow(/Owner/);
    });

    it('throws when Owner is not account-shaped', () => {
      expect(() =>
        escrowCancel({
          Account: ACCOUNT_A,
          Owner: 'not-an-address',
          OfferSequence: OFFER_SEQ,
        }),
      ).toThrow(/Owner/);
    });
  });

  describe('OfferSequence validation', () => {
    it('throws when OfferSequence is missing', () => {
      expect(() =>
        escrowCancel({
          Account: ACCOUNT_A,
          Owner: ACCOUNT_B,
          OfferSequence: undefined as unknown as number,
        }),
      ).toThrow(/OfferSequence/);
    });

    it('throws when OfferSequence is a non-number', () => {
      expect(() =>
        escrowCancel({
          Account: ACCOUNT_A,
          Owner: ACCOUNT_B,
          OfferSequence: '7' as unknown as number,
        }),
      ).toThrow(/OfferSequence/);
    });

    it('throws when OfferSequence is NaN', () => {
      expect(() =>
        escrowCancel({
          Account: ACCOUNT_A,
          Owner: ACCOUNT_B,
          OfferSequence: Number.NaN,
        }),
      ).toThrow(/OfferSequence/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws when OfferSequence is negative', () => {
      expect(() => make({ OfferSequence: -1 })).toThrow(/UInt32/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws when OfferSequence is not an integer', () => {
      expect(() => make({ OfferSequence: 6.5 })).toThrow(/UInt32/);
    });

    // ── Factory-only divergence from the class API ──
    it('throws when OfferSequence exceeds UInt32', () => {
      expect(() => make({ OfferSequence: 0x100000000 })).toThrow(/UInt32/);
    });
  });

  describe('cross-field validation', () => {
    // ── Factory-only divergence from the class API ──
    it('throws when OfferSequence equals Sequence (temBAD_SEQUENCE)', () => {
      expect(() =>
        escrowCancel({
          Account: ACCOUNT_A,
          Owner: ACCOUNT_B,
          OfferSequence: 7,
          Sequence: 7,
        }),
      ).toThrow(/temBAD_SEQUENCE/);
    });

    it('allows OfferSequence < Sequence', () => {
      const tx = escrowCancel({
        Account: ACCOUNT_A,
        Owner: ACCOUNT_B,
        OfferSequence: 5,
        Sequence: 7,
      });
      expect(tx.OfferSequence).toBe(5);
      expect(tx.Sequence).toBe(7);
    });

    it('allows OfferSequence > Sequence', () => {
      const tx = escrowCancel({
        Account: ACCOUNT_A,
        Owner: ACCOUNT_B,
        OfferSequence: 12,
        Sequence: 7,
      });
      expect(tx.OfferSequence).toBe(12);
      expect(tx.Sequence).toBe(7);
    });

    it('does not trigger temBAD_SEQUENCE when Sequence is absent', () => {
      const tx = escrowCancel({
        Account: ACCOUNT_A,
        Owner: ACCOUNT_B,
        OfferSequence: 7,
      });
      expect(tx.Sequence).toBeUndefined();
      expect(tx.OfferSequence).toBe(7);
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
        (tx as unknown as Record<string, unknown>).OfferSequence = 999;
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides', () => {
      const tx = make();
      const tx2 = tx.with({ OfferSequence: 10 });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.OfferSequence).toBe(10);
      expect(tx.OfferSequence).toBe(OFFER_SEQ);
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() => tx.with({ OfferSequence: -1 })).toThrow(/UInt32/);
      expect(() => tx.with({ OfferSequence: 6.5 })).toThrow(/UInt32/);
      expect(() =>
        tx.with({ OfferSequence: OFFER_SEQ, Sequence: OFFER_SEQ }),
      ).toThrow(/temBAD_SEQUENCE/);
      expect(() => tx.with({ Owner: 'not-an-address' })).toThrow(/Owner/);
      expect(() =>
        tx.with({ Account: 'not-an-address' }),
      ).toThrow(/Account/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = escrowCancel({
        Account: ACCOUNT_A,
        Owner: ACCOUNT_B,
        OfferSequence: 6,
        Fee: '12',
        Sequence: 8,
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'EscrowCancel',
        Account: ACCOUNT_A,
        Owner: ACCOUNT_B,
        OfferSequence: 6,
        Fee: '12',
        Sequence: 8,
      });
    });

    it('.toJSON() skips undefined fields', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
      expect('Flags' in json).toBe(false);
    });

    it('.toJSON() does not contain method names', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
    });

    it('.validate() is a no-op (no throw after construction)', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });
});