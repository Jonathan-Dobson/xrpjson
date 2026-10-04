/**
 * Tests for the functional Clawback factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, Amount).
 *   2. IOU-form clawback: holder is `Amount.issuer`; `Holder` forbidden.
 *   3. MPT-form clawback: holder is `Holder`; `Holder` required.
 *   4. Spec-mandated guards the class API omits:
 *        a. Account must be a valid XRPL classic / X-address.
 *        b. Amount cannot be an XRP drops string.
 *        c. IOU: Account ≠ Amount.issuer; Holder must be omitted.
 *           Docs: temBAD_AMOUNT row + XLS-39 §3.3.1.
 *        d. MPT: Holder must be present and a valid address;
 *           Account ≠ Holder.
 *           Docs: xrpl.js validateClawback lines 58–60, 66–68.
 *        e. IOU/MPT sub-fields validated: currency length/hex,
 *           issuer account shape, mpt_issuance_id length/hex,
 *           value is a positive non-zero base-10 integer string.
 *           Docs: temBAD_AMOUNT row + XLS-39 §3.3.1 "value must not be zero".
 *   5. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined fields).
 *   6. .with() re-validates on overrides.
 */
import { describe, it, expect } from 'vitest';
import { clawback } from '../../src/fp/factories/clawback.js';

// ─── Test fixtures ───────────────────────────────────────────────────

const ISSUER = 'rWYkbWkCeg8dP6rXALnjgZSjjLyih5NXm';
const HOLDER = 'rPyfep3gcLzkosKC9XiE77Y8DZWG6iWDT9';

const IOU_AMOUNT = {
  currency: 'USD',
  issuer: HOLDER, // In Clawback IOU form, Amount.issuer names the HOLDER.
  value: '314',
};

const MPT_ID = '00000000000000000000000001';
const MPT_AMOUNT = {
  mpt_issuance_id: MPT_ID,
  value: '500',
};

function make(extras: Record<string, unknown> = {}) {
  return clawback({
    Account: ISSUER,
    Amount: IOU_AMOUNT,
    ...extras,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('fp/clawback()', () => {
  describe('construction', () => {
    it('constructs an IOU clawback with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('Clawback');
      expect(tx.Account).toBe(ISSUER);
      expect(tx.Amount).toEqual(IOU_AMOUNT);
      expect(tx.Holder).toBeUndefined();
    });

    it('constructs an MPT clawback with Holder', () => {
      const tx = clawback({
        Account: ISSUER,
        Amount: MPT_AMOUNT,
        Holder: HOLDER,
      });
      expect(tx.TransactionType).toBe('Clawback');
      expect(tx.Account).toBe(ISSUER);
      expect(tx.Amount).toEqual(MPT_AMOUNT);
      expect(tx.Holder).toBe(HOLDER);
    });

    it('accepts base-tx fields (Flags, Fee, Sequence)', () => {
      const tx = clawback({
        Account: ISSUER,
        Amount: IOU_AMOUNT,
        Flags: 0,
        Fee: '12',
        Sequence: 8,
      });
      expect(tx.Flags).toBe(0);
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(8);
    });
  });

  describe('Account validation', () => {
    it('throws when Account is missing', () => {
      expect(() =>
        clawback({
          Account: undefined as never,
          Amount: IOU_AMOUNT,
        }),
      ).toThrow(/Account/);
    });

    it('throws when Account is an invalid address', () => {
      expect(() =>
        clawback({
          Account: 'not-an-address',
          Amount: IOU_AMOUNT,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('Amount validation', () => {
    it('throws when Amount is missing', () => {
      expect(() =>
        clawback({
          Account: ISSUER,
          Amount: undefined as never,
        }),
      ).toThrow(/Amount is required/);
    });

    it('throws when Amount is an XRP drops string (clawback cannot target XRP)', () => {
      expect(() =>
        clawback({
          Account: ISSUER,
          Amount: '1000000' as never,
        }),
      ).toThrow(/IssuedCurrency or MPT/);
    });

    it('throws on malformed Amount object', () => {
      expect(() =>
        clawback({
          Account: ISSUER,
          Amount: { foo: 'bar' } as never,
        }),
      ).toThrow(/IssuedCurrency or MPT/);
    });
  });

  describe('IOU-form clawback', () => {
    it('throws when Holder is provided (IOU holders go in Amount.issuer)', () => {
      expect(() =>
        clawback({
          Account: ISSUER,
          Amount: IOU_AMOUNT,
          Holder: HOLDER,
        }),
      ).toThrow(/Holder must not be provided/);
    });

    it('throws when Account equals Amount.issuer', () => {
      expect(() =>
        clawback({
          Account: ISSUER,
          Amount: { currency: 'USD', issuer: ISSUER, value: '1' },
        }),
      ).toThrow(/Account and Amount\.issuer must be distinct/);
    });

    it('throws on invalid Amount.issuer (not a valid XRPL address)', () => {
      expect(() =>
        clawback({
          Account: ISSUER,
          Amount: { currency: 'USD', issuer: 'bogus', value: '1' },
        }),
      ).toThrow(/issuer/);
    });

    it('throws on bad currency length', () => {
      expect(() =>
        clawback({
          Account: ISSUER,
          Amount: { currency: 'USDD', issuer: HOLDER, value: '1' },
        }),
      ).toThrow(/currency/);
    });

    it('throws on 40-char hex currency that is not hex', () => {
      expect(() =>
        clawback({
          Account: ISSUER,
          Amount: {
            currency: 'Z'.repeat(40),
            issuer: HOLDER,
            value: '1',
          },
        }),
      ).toThrow(/hex/);
    });

    it('accepts a 40-char hex currency', () => {
      const hexCcy = '0158415500000000C1F76FFA276C27E60FBC1DAD';
      const tx = clawback({
        Account: ISSUER,
        Amount: { currency: hexCcy, issuer: HOLDER, value: '1' },
      });
      expect(tx.Amount.currency).toBe(hexCcy);
    });

    it('throws on negative Amount.value', () => {
      expect(() =>
        clawback({
          Account: ISSUER,
          Amount: { currency: 'USD', issuer: HOLDER, value: '-1' },
        }),
      ).toThrow(/value/);
    });

    it('throws on non-numeric Amount.value', () => {
      expect(() =>
        clawback({
          Account: ISSUER,
          Amount: { currency: 'USD', issuer: HOLDER, value: 'abc' },
        }),
      ).toThrow(/value/);
    });

    it('throws on Amount.value === "0"', () => {
      expect(() =>
        clawback({
          Account: ISSUER,
          Amount: { currency: 'USD', issuer: HOLDER, value: '0' },
        }),
      ).toThrow(/must not be zero/);
    });
  });

  describe('MPT-form clawback', () => {
    it('throws when Holder is missing', () => {
      expect(() =>
        clawback({
          Account: ISSUER,
          Amount: MPT_AMOUNT,
        }),
      ).toThrow(/Holder is required/);
    });

    it('throws when Holder is an invalid address', () => {
      expect(() =>
        clawback({
          Account: ISSUER,
          Amount: MPT_AMOUNT,
          Holder: 'bogus',
        }),
      ).toThrow(/Holder/);
    });

    it('throws when Account equals Holder', () => {
      expect(() =>
        clawback({
          Account: ISSUER,
          Amount: MPT_AMOUNT,
          Holder: ISSUER,
        }),
      ).toThrow(/Account and Holder must be distinct/);
    });

    it('throws on short mpt_issuance_id', () => {
      expect(() =>
        clawback({
          Account: ISSUER,
          Amount: { mpt_issuance_id: 'abc', value: '1' },
          Holder: HOLDER,
        }),
      ).toThrow(/mpt_issuance_id/);
    });

    it('throws on non-hex mpt_issuance_id', () => {
      expect(() =>
        clawback({
          Account: ISSUER,
          Amount: {
            mpt_issuance_id: 'ZZZZZZZZZZZZZZZZZZZZZZZZ',
            value: '1',
          },
          Holder: HOLDER,
        }),
      ).toThrow(/mpt_issuance_id/);
    });

    it('throws on negative MPT Amount.value', () => {
      expect(() =>
        clawback({
          Account: ISSUER,
          Amount: { mpt_issuance_id: MPT_ID, value: '-5' },
          Holder: HOLDER,
        }),
      ).toThrow(/value/);
    });

    it('throws on MPT Amount.value === "0"', () => {
      expect(() =>
        clawback({
          Account: ISSUER,
          Amount: { mpt_issuance_id: MPT_ID, value: '0' },
          Holder: HOLDER,
        }),
      ).toThrow(/must not be zero/);
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
        (tx as unknown as Record<string, unknown>)['Amount'] = 'changed';
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides', () => {
      const tx = make();
      const tx2 = tx.with({
        Amount: { currency: 'EUR', issuer: HOLDER, value: '50' },
      });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Amount).toEqual({
        currency: 'EUR',
        issuer: HOLDER,
        value: '50',
      });
      expect(tx.Amount).toEqual(IOU_AMOUNT);
    });

    it('.with() can swap IOU → MPT and vice versa', () => {
      const iouTx = make();
      const mptTx = iouTx.with({
        Amount: MPT_AMOUNT,
        Holder: HOLDER,
      });
      expect(mptTx.Amount).toEqual(MPT_AMOUNT);
      expect(mptTx.Holder).toBe(HOLDER);
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() =>
        tx.with({ Amount: '1000000' as never }),
      ).toThrow(/IssuedCurrency or MPT/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = clawback({
        Account: ISSUER,
        Amount: MPT_AMOUNT,
        Holder: HOLDER,
        Fee: '15',
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'Clawback',
        Account: ISSUER,
        Amount: MPT_AMOUNT,
        Holder: HOLDER,
        Fee: '15',
      });
    });

    it('.toJSON() skips undefined fields', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('Holder' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Flags' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op after successful construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });

  // ─── Base transaction fields ──────────────────────────────────────────────
  // `ClawbackProps` now extends `BasePropsFields`, so the seven shared base
  // fields that were previously absent from this factory's prop type — Memos,
  // SourceTag, LastLedgerSequence, AccountTxnID, NetworkID, Delegate and
  // TicketSequence — are part of the type surface and survive onto the frozen
  // transaction.
  //
  // Every value below is chosen to be VALID under `validateBaseTransaction`
  // (src/validation/base.ts), so this block stays green once that call is
  // added. The reject-side assertions are deliberately NOT here yet: unlike
  // payment.ts, this factory does not call `validateBaseTransaction`, so those
  // validator messages are never reached. Adding the call is a runtime change
  // and is out of scope for this type-only conversion.
  describe('BaseTransactionFields', () => {
    // IOU form: `Amount.issuer` names the HOLDER, so `Holder` is omitted.
    const base = {
      Account: ISSUER,
      Amount: IOU_AMOUNT,
    };
    const MEMOS = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
    const TXN_ID = 'AB'.repeat(32);

    it('accepts Memos', () => {
      const tx = clawback({ ...base, Memos: MEMOS });
      expect(tx.Memos).toEqual(MEMOS);
      expect(tx.toJSON().Memos).toEqual(MEMOS);
    });

    it('accepts SourceTag', () => {
      const tx = clawback({ ...base, SourceTag: 99 });
      expect(tx.SourceTag).toBe(99);
      expect(tx.toJSON().SourceTag).toBe(99);
    });

    it('accepts LastLedgerSequence', () => {
      const tx = clawback({ ...base, LastLedgerSequence: 1_000_000 });
      expect(tx.LastLedgerSequence).toBe(1_000_000);
      expect(tx.toJSON().LastLedgerSequence).toBe(1_000_000);
    });

    it('accepts AccountTxnID', () => {
      const tx = clawback({ ...base, AccountTxnID: TXN_ID });
      expect(tx.AccountTxnID).toBe(TXN_ID);
      expect(tx.toJSON().AccountTxnID).toBe(TXN_ID);
    });

    it('accepts NetworkID', () => {
      const tx = clawback({ ...base, NetworkID: 1 });
      expect(tx.NetworkID).toBe(1);
      expect(tx.toJSON().NetworkID).toBe(1);
    });

    it('accepts a Delegate distinct from Account', () => {
      const tx = clawback({ ...base, Delegate: HOLDER });
      expect(tx.Delegate).toBe(HOLDER);
      expect(tx.toJSON().Delegate).toBe(HOLDER);
    });

    it('accepts TicketSequence alongside Sequence: 0', () => {
      const tx = clawback({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.TicketSequence).toBe(42);
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    // ── Reject side ── the runtime backstop. Before the
    // `validateBaseTransaction` call landed, every case below built a frozen
    // transaction silently. The bad values are cast `as any` on purpose: the
    // point under test is the runtime check, and a type error would make the
    // test uncompilable.
    it('rejects a malformed Memos value', () => {
      expect(() => clawback({ ...base, Memos: 'not-an-array' } as any)).toThrow(/invalid Memos/);
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() => clawback({ ...base, SourceTag: 'NaN' } as any)).toThrow(
        /SourceTag must be a number/,
      );
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() => clawback({ ...base, LastLedgerSequence: 'soon' } as any)).toThrow(
        /LastLedgerSequence must be a number/,
      );
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() => clawback({ ...base, AccountTxnID: 99 } as any)).toThrow(
        /AccountTxnID must be a string/,
      );
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() => clawback({ ...base, NetworkID: {} } as any)).toThrow(/NetworkID must be a number/);
    });

    it('rejects a Delegate that is not a valid address', () => {
      expect(() => clawback({ ...base, Delegate: 'not-an-address' } as any)).toThrow(
        /invalid Delegate/,
      );
    });

    it('rejects a Delegate equal to Account', () => {
      expect(() => clawback({ ...base, Delegate: ISSUER })).toThrow(/cannot be the same/);
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() => clawback({ ...base, TicketSequence: 'nope' } as any)).toThrow(
        /TicketSequence must be a number/,
      );
    });

    it('rejects a non-string Fee', () => {
      expect(() => clawback({ ...base, Fee: 12 } as any)).toThrow(/Fee must be a string/);
    });
  });
});
