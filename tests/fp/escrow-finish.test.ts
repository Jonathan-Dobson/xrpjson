/**
 * Tests for the functional EscrowFinish factory.
 *
 * Validates:
 *   1. Construction with required Account + Owner + OfferSequence.
 *   2. Optional field handling (Condition, Fulfillment, CredentialIDs,
 *      Fee, Sequence, Flags).
 *   3. Spec-mandated guards the class API omits:
 *      a. CredentialIDs is supported (Credentials amendment).
 *      b. CredentialIDs length is in [1, MAX_AUTHORIZED_CREDENTIALS=8].
 *      c. CredentialIDs[i] is a 64-char hex string.
 *      d. CredentialIDs has no duplicates.
 *      e. Condition must be a hex string (xrpl.org fields table).
 *      f. Fulfillment must be a hex string (xrpl.org fields table).
 *      g. OfferSequence must be a UInt32 (xrpl.org fields table).
 *   4. Frozen-shape contract (mutation throws, .with() returns new
 *      frozen object, .toJSON() strips methods and undefined fields).
 */
import { describe, it, expect } from 'vitest';
import { escrowFinish } from '../../src/fp/factories/escrow-finish.js';

const ACCOUNT_A = 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn';
const ACCOUNT_B = 'rsA2LpzuawewSBQXkiju3YQTMzW13pAAdW';

// 80-hex PREIMAGE-SHA-256 crypto-condition (the same example used in
// the xrpl.org docs).
const CONDITION_OK =
  'A0258020E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855810100';

// Realistic fulfillment: the smallest valid fulfillment is "A0028000".
const FULFILLMENT_OK = 'A0028000';

function make(extras: Record<string, unknown> = {}) {
  return escrowFinish({
    Account: ACCOUNT_A,
    Owner: ACCOUNT_B,
    OfferSequence: 7,
    ...extras,
  });
}

function hex64(seed: number): string {
  // Deterministic 64-char hex string from a small integer.
  const hex = seed.toString(16).padStart(2, '0');
  return (hex + '0'.repeat(64 - hex.length)).slice(0, 64);
}

describe('fp/escrowFinish()', () => {
  describe('construction', () => {
    it('constructs with Account + Owner + OfferSequence (time-only escrow)', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('EscrowFinish');
      expect(tx.Account).toBe(ACCOUNT_A);
      expect(tx.Owner).toBe(ACCOUNT_B);
      expect(tx.OfferSequence).toBe(7);
    });

    it('constructs with Condition + Fulfillment (conditional escrow)', () => {
      const tx = escrowFinish({
        Account: ACCOUNT_A,
        Owner: ACCOUNT_B,
        OfferSequence: 7,
        Condition: CONDITION_OK,
        Fulfillment: FULFILLMENT_OK,
      });
      expect(tx.Condition).toBe(CONDITION_OK);
      expect(tx.Fulfillment).toBe(FULFILLMENT_OK);
    });

    it('passes through optional Fee/Sequence/Flags', () => {
      const tx = escrowFinish({
        Account: ACCOUNT_A,
        Owner: ACCOUNT_B,
        OfferSequence: 7,
        Flags: 0,
        Fee: '12',
        Sequence: 8,
      });
      expect(tx.Flags).toBe(0);
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(8);
    });

    it('constructs with a single CredentialID', () => {
      const tx = make({ CredentialIDs: [hex64(1)] });
      expect(tx.CredentialIDs).toEqual([hex64(1)]);
    });

    it('constructs with multiple CredentialIDs up to the cap', () => {
      const ids = [hex64(1), hex64(2), hex64(3), hex64(4)];
      const tx = make({ CredentialIDs: ids });
      expect(tx.CredentialIDs).toEqual(ids);
    });
  });

  describe('Account / Owner validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        escrowFinish({
          Account: '' as never,
          Owner: ACCOUNT_B,
          OfferSequence: 7,
        }),
      ).toThrow(/Account/);
    });

    it('throws on invalid Account format', () => {
      expect(() =>
        escrowFinish({
          Account: 'not-an-address',
          Owner: ACCOUNT_B,
          OfferSequence: 7,
        }),
      ).toThrow(/Account/);
    });

    it('throws on missing Owner', () => {
      expect(() =>
        escrowFinish({
          Account: ACCOUNT_A,
          Owner: '' as never,
          OfferSequence: 7,
        }),
      ).toThrow(/Owner/);
    });

    it('throws on invalid Owner format', () => {
      expect(() =>
        escrowFinish({
          Account: ACCOUNT_A,
          Owner: 'not-an-address',
          OfferSequence: 7,
        }),
      ).toThrow(/Owner/);
    });

    it('accepts Owner equal to Account (anyone may finish; Owner is the escrow creator, not the finisher)', () => {
      const tx = escrowFinish({
        Account: ACCOUNT_A,
        Owner: ACCOUNT_A,
        OfferSequence: 7,
      });
      expect(tx.Owner).toBe(tx.Account);
    });
  });

  describe('OfferSequence validation', () => {
    it('throws when OfferSequence is missing', () => {
      expect(() =>
        escrowFinish({
          Account: ACCOUNT_A,
          Owner: ACCOUNT_B,
          OfferSequence: undefined as never,
        }),
      ).toThrow(/OfferSequence/);
    });

    it('throws when OfferSequence is negative', () => {
      expect(() =>
        escrowFinish({
          Account: ACCOUNT_A,
          Owner: ACCOUNT_B,
          OfferSequence: -1,
        }),
      ).toThrow(/UInt32/);
    });

    it('throws when OfferSequence is a non-integer', () => {
      expect(() =>
        escrowFinish({
          Account: ACCOUNT_A,
          Owner: ACCOUNT_B,
          OfferSequence: 1.5,
        }),
      ).toThrow(/UInt32/);
    });

    it('throws when OfferSequence is a string', () => {
      expect(() =>
        escrowFinish({
          Account: ACCOUNT_A,
          Owner: ACCOUNT_B,
          OfferSequence: '7' as never,
        }),
      ).toThrow(/UInt32/);
    });
  });

  describe('Condition / Fulfillment validation', () => {
    it('accepts a hex Condition (any length is valid — length is not locally checked)', () => {
      const tx = make({ Condition: CONDITION_OK });
      expect(tx.Condition).toBe(CONDITION_OK);
    });

    it('throws when Condition is non-hex', () => {
      expect(() => make({ Condition: 'Z'.repeat(80) })).toThrow(/Condition/);
    });

    it('throws when Condition is not a string', () => {
      expect(() => make({ Condition: 0x141243 as never })).toThrow(/Condition/);
    });

    it('accepts a hex Fulfillment', () => {
      const tx = make({ Fulfillment: FULFILLMENT_OK });
      expect(tx.Fulfillment).toBe(FULFILLMENT_OK);
    });

    it('throws when Fulfillment is non-hex', () => {
      expect(() => make({ Fulfillment: 'ZZZZ' })).toThrow(/Fulfillment/);
    });

    it('throws when Fulfillment is not a string', () => {
      expect(() => make({ Fulfillment: 42 as never })).toThrow(/Fulfillment/);
    });
  });

  describe('CredentialIDs validation', () => {
    it('throws when CredentialIDs is not an array', () => {
      expect(() => make({ CredentialIDs: 'not-an-array' as never })).toThrow(
        /CredentialIDs/,
      );
    });

    it('throws when CredentialIDs is an empty array', () => {
      expect(() => make({ CredentialIDs: [] })).toThrow(/empty/);
    });

    it('throws when CredentialIDs has 9 entries (over MAX_AUTHORIZED_CREDENTIALS=8)', () => {
      const ids = Array.from({ length: 9 }, (_, i) => hex64(i + 1));
      expect(() => make({ CredentialIDs: ids })).toThrow(/exceed 8/);
    });

    it('accepts CredentialIDs with exactly 8 entries (at the cap)', () => {
      const ids = Array.from({ length: 8 }, (_, i) => hex64(i + 1));
      const tx = make({ CredentialIDs: ids });
      expect(tx.CredentialIDs).toEqual(ids);
    });

    it('throws when a CredentialID is not 64 characters', () => {
      expect(() => make({ CredentialIDs: ['AB'] })).toThrow(/64-character/);
    });

    it('throws when a CredentialID is non-hex', () => {
      const bad = 'Z'.repeat(64);
      expect(() => make({ CredentialIDs: [bad] })).toThrow(/64-character/);
    });

    it('throws when CredentialIDs contains a duplicate', () => {
      const dup = hex64(1);
      expect(() => make({ CredentialIDs: [dup, dup] })).toThrow(/duplicate/);
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
        (tx as unknown as Record<string, unknown>).OfferSequence = 99;
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      const tx = make();
      const tx2 = tx.with({ OfferSequence: 99 });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.OfferSequence).toBe(99);
      expect(tx.OfferSequence).toBe(7);
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() => tx.with({ OfferSequence: -1 })).toThrow(/UInt32/);
      expect(() => tx.with({ Owner: 'not-an-address' })).toThrow(/Owner/);
      expect(() => tx.with({ Fulfillment: 'not-hex' })).toThrow(/Fulfillment/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = escrowFinish({
        Account: ACCOUNT_A,
        Owner: ACCOUNT_B,
        OfferSequence: 7,
        Condition: CONDITION_OK,
        Fulfillment: FULFILLMENT_OK,
        CredentialIDs: [hex64(1)],
        Fee: '12',
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'EscrowFinish',
        Account: ACCOUNT_A,
        Owner: ACCOUNT_B,
        OfferSequence: 7,
        Condition: CONDITION_OK,
        Fulfillment: FULFILLMENT_OK,
        CredentialIDs: [hex64(1)],
        Fee: '12',
      });
    });

    it('.toJSON() skips undefined fields and methods', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('Condition' in json).toBe(false);
      expect('Fulfillment' in json).toBe(false);
      expect('CredentialIDs' in json).toBe(false);
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
