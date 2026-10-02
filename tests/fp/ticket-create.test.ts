/**
 * Tests for the functional TicketCreate factory.
 *
 * Validates:
 *   1. Construction with required Account + TicketCount, plus optional
 *      Fee / Sequence / Flags pass-through.
 *   2. Boundary behaviour at the spec-mandated integer range [1, 250].
 *   3. Spec-mandated guards the class API omits:
 *        a. TicketCount must be an integer (xrpl.js ticketCreate.ts).
 *        b. Distinct error messages for missing / wrong-type / out-of-range
 *           (xrpl.js ticketCreate.ts).
 *        c. Account must be a valid XRPL classic or X-address
 *           (xrpl-dev-portal basic-data-types.md).
 *   4. Frozen-shape contract (mutation throws, .with() returns new
 *      frozen object, .toJSON() strips methods and undefined fields).
 */
import { describe, it, expect } from 'vitest';
import { ticketCreate } from '../../src/fp/factories/ticket-create.js';

const ACCOUNT_A = 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn';

function make(extras: Record<string, unknown> = {}) {
  return ticketCreate({
    Account: ACCOUNT_A,
    TicketCount: 10,
    ...extras,
  });
}

describe('fp/ticketCreate()', () => {
  describe('construction', () => {
    it('constructs with Account + TicketCount', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('TicketCreate');
      expect(tx.Account).toBe(ACCOUNT_A);
      expect(tx.TicketCount).toBe(10);
    });

    it('accepts TicketCount = 1 (lower boundary)', () => {
      const tx = ticketCreate({ Account: ACCOUNT_A, TicketCount: 1 });
      expect(tx.TicketCount).toBe(1);
    });

    it('accepts TicketCount = 250 (upper boundary, XLS-0013 max)', () => {
      const tx = ticketCreate({ Account: ACCOUNT_A, TicketCount: 250 });
      expect(tx.TicketCount).toBe(250);
    });

    it('passes through optional Fee / Sequence / Flags', () => {
      const tx = ticketCreate({
        Account: ACCOUNT_A,
        TicketCount: 5,
        Flags: 0,
        Fee: '12',
        Sequence: 8,
      });
      expect(tx.Flags).toBe(0);
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(8);
    });

    it('returns a frozen object', () => {
      const tx = make();
      expect(Object.isFrozen(tx)).toBe(true);
    });
  });

  describe('TicketCount validation — missing', () => {
    it('throws "missing field TicketCount" when TicketCount is undefined', () => {
      expect(() =>
        ticketCreate({ Account: ACCOUNT_A, TicketCount: undefined as never }),
      ).toThrow(/missing field TicketCount/);
    });

    it('throws "missing field TicketCount" when TicketCount is omitted entirely', () => {
      expect(() =>
        ticketCreate({ Account: ACCOUNT_A } as never),
      ).toThrow(/missing field TicketCount/);
    });
  });

  describe('TicketCount validation — wrong type', () => {
    it('throws "TicketCount must be a number" for a string', () => {
      expect(() =>
        ticketCreate({
          Account: ACCOUNT_A,
          TicketCount: '150' as never,
        }),
      ).toThrow(/TicketCount must be a number/);
    });

    it('throws "TicketCount must be a number" for null', () => {
      expect(() =>
        ticketCreate({
          Account: ACCOUNT_A,
          TicketCount: null as never,
        }),
      ).toThrow(/TicketCount must be a number/);
    });

    it('throws "TicketCount must be a number" for a boolean', () => {
      expect(() =>
        ticketCreate({
          Account: ACCOUNT_A,
          TicketCount: true as never,
        }),
      ).toThrow(/TicketCount must be a number/);
    });
  });

  describe('TicketCount validation — integer and range', () => {
    it('throws "must be an integer from 1 to 250" for a non-integer (12.5)', () => {
      expect(() =>
        ticketCreate({ Account: ACCOUNT_A, TicketCount: 12.5 }),
      ).toThrow(/integer from 1 to 250/);
    });

    it('throws "must be an integer from 1 to 250" for 0 (below min)', () => {
      expect(() =>
        ticketCreate({ Account: ACCOUNT_A, TicketCount: 0 }),
      ).toThrow(/integer from 1 to 250/);
    });

    it('throws "must be an integer from 1 to 250" for a negative value', () => {
      expect(() =>
        ticketCreate({ Account: ACCOUNT_A, TicketCount: -1 }),
      ).toThrow(/integer from 1 to 250/);
    });

    it('throws "must be an integer from 1 to 250" for 251 (above max)', () => {
      expect(() =>
        ticketCreate({ Account: ACCOUNT_A, TicketCount: 251 }),
      ).toThrow(/integer from 1 to 250/);
    });

    it('throws on NaN (not an integer, even though typeof NaN === "number")', () => {
      expect(() =>
        ticketCreate({ Account: ACCOUNT_A, TicketCount: Number.NaN }),
      ).toThrow(/integer from 1 to 250/);
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        ticketCreate({ Account: '', TicketCount: 10 }),
      ).toThrow(/Account/);
    });

    it('throws on a non-address string (typo guard)', () => {
      expect(() =>
        ticketCreate({ Account: 'not-an-address', TicketCount: 10 }),
      ).toThrow(/Account/);
    });

    it('accepts a classic r-address', () => {
      const tx = ticketCreate({
        Account: 'rUn84CUYbNjRoTQ6mSW7BVJPSVJNLb1QLo',
        TicketCount: 1,
      });
      expect(tx.Account).toBe('rUn84CUYbNjRoTQ6mSW7BVJPSVJNLb1QLo');
    });
  });

  describe('frozen-shape contract', () => {
    it('mutation throws in strict mode', () => {
      const tx = make();
      expect(() => {
        (tx as unknown as Record<string, unknown>).TicketCount = 99;
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      const tx = make();
      const tx2 = tx.with({ TicketCount: 25 });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.TicketCount).toBe(25);
      expect(tx.TicketCount).toBe(10); // original untouched
      expect(tx2.Account).toBe(ACCOUNT_A); // preserved
    });

    it('.with() re-validates on overrides (cannot bypass guard via with)', () => {
      const tx = make();
      expect(() => tx.with({ TicketCount: 251 })).toThrow(
        /integer from 1 to 250/,
      );
      expect(() => tx.with({ TicketCount: 0 })).toThrow(/integer from 1 to 250/);
      expect(() => tx.with({ TicketCount: 12.5 })).toThrow(
        /integer from 1 to 250/,
      );
      expect(() => tx.with({ Account: '' })).toThrow(/Account/);
    });

    it('.toJSON() produces the wire-format JSON with TransactionType + provided fields', () => {
      const tx = ticketCreate({
        Account: ACCOUNT_A,
        TicketCount: 10,
        Fee: '15',
        Sequence: 4,
      });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'TicketCreate',
        Account: ACCOUNT_A,
        TicketCount: 10,
        Fee: '15',
        Sequence: 4,
      });
    });

    it('.toJSON() strips methods and undefined fields', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
      expect('Flags' in json).toBe(false);
      expect(json.TransactionType).toBe('TicketCreate');
      expect(json.TicketCount).toBe(10);
    });

    it('.validate() is a no-op after construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });

  // TicketCreate is the family where the base-field fix matters most: this
  // factory could always MINT tickets, but before `TicketCreateProps` extended
  // `BaseTransactionFields` no factory could express SPENDING one. See
  // ADM-11 in 173-xrpjson-testing, which hand-merged the field after
  // construction specifically because the factory would not accept it.
  describe('BaseTransactionFields', () => {
    const base = { Account: ACCOUNT_A, TicketCount: 1 };

    it('accepts TicketSequence, so a ticket can be spent via the factory', () => {
      const tx = ticketCreate({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.TicketSequence).toBe(42);
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() => ticketCreate({ ...base, TicketSequence: 'nope' } as any)).toThrow(
        /TicketSequence must be a number/,
      );
    });

    it('accepts a non-numeric Delegate', () => {
      const tx = ticketCreate({ ...base, Delegate: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fz' });
      expect(tx.Delegate).toBe('rN7n7otQDd6FczFgLdSqtcsAUxDkw6fz');
    });

    it('rejects Delegate equal to Account', () => {
      expect(() => ticketCreate({ ...base, Delegate: ACCOUNT_A })).toThrow(
        /cannot be the same/,
      );
    });

    it('rejects a non-string Fee', () => {
      expect(() => ticketCreate({ ...base, Fee: 12 } as any)).toThrow(
        /Fee must be a string/,
      );
    });

    it('still enforces TicketCount range ahead of the base check', () => {
      // Placement matters: the specific message must win over the generic one.
      expect(() => ticketCreate({ ...base, TicketCount: 0 })).toThrow(
        /TicketCount must be an integer from 1 to 250/,
      );
    });
  });
});