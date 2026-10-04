/**
 * Tests for the functional LoanBrokerCoverWithdraw factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, LoanBrokerID, Amount).
 *   2. Optional fields (Destination, DestinationTag, CredentialIDs).
 *   3. Spec-mandated guards the class API omits:
 *        a. LoanBrokerID must not be all-zeros HASH256 (XLS-66 §3.6.3.1
 *           check 1).
 *        b. Amount must be strictly positive (XLS-66 §3.6.3.1 check 2).
 *        c. Destination must not be all-zeros AccountID (XLS-66 §3.6.3.1
 *           check 3) — covered implicitly because the all-zeros 40-char
 *           hex string fails `isAccount` (no `r…` / `X…` prefix).
 *        d. CredentialIDs length in [1, 8] (xrpl.js MAX_AUTHORIZED_CREDENTIALS).
 *   4. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined fields).
 */
import { describe, it, expect } from 'vitest';
import { loanBrokerCoverWithdraw } from '../../src/fp/index.js';

// ─── Test fixtures ───────────────────────────────────────────────────

const BROKER_OWNER = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const DESTINATION = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
const ISSUER = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';

// 64-char hex non-zero HASH256 LoanBroker ID.
const LOAN_BROKER_ID =
  'A9470DEFB52F18D1A11C2208D366D575EB4DE5A5D202AFED812F09FDA5B8D614';
// The spec-reserved all-zeros HASH256.
const LOAN_BROKER_ID_ZERO =
  '0000000000000000000000000000000000000000000000000000000000000000';
// The spec-reserved all-zeros AccountID.
const ACCOUNT_ID_ZERO = '0000000000000000000000000000000000000000';

const IOU_AMOUNT = { currency: 'USD', issuer: ISSUER, value: '250' };
const MPT_AMOUNT = {
  mpt_issuance_id: '00000000000000000000000001',
  value: '500',
};

const VALID_CREDENTIAL_ID =
  'A7B7B3ED3F5BD8E58C9064278EB29519CD6475D87A4517707DE108E65AE9C08C';

function make(extras: Record<string, unknown> = {}) {
  return loanBrokerCoverWithdraw({
    Account: BROKER_OWNER,
    LoanBrokerID: LOAN_BROKER_ID,
    Amount: '1000000',
    ...extras,
  });
}

describe('fp/loanBrokerCoverWithdraw()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('LoanBrokerCoverWithdraw');
      expect(tx.Account).toBe(BROKER_OWNER);
      expect(tx.LoanBrokerID).toBe(LOAN_BROKER_ID);
      expect(tx.Amount).toBe('1000000');
      expect(tx.Destination).toBeUndefined();
      expect(tx.DestinationTag).toBeUndefined();
      expect(tx.CredentialIDs).toBeUndefined();
    });

    it('accepts an XRP (drops) Amount as a positive decimal string', () => {
      const tx = loanBrokerCoverWithdraw({
        Account: BROKER_OWNER,
        LoanBrokerID: LOAN_BROKER_ID,
        Amount: '2500000',
      });
      expect(tx.Amount).toBe('2500000');
    });

    it('accepts a trust-line IssuedCurrencyAmount', () => {
      const tx = loanBrokerCoverWithdraw({
        Account: BROKER_OWNER,
        LoanBrokerID: LOAN_BROKER_ID,
        Amount: IOU_AMOUNT,
      });
      expect(tx.Amount).toEqual(IOU_AMOUNT);
    });

    it('accepts an MPTAmount', () => {
      const tx = loanBrokerCoverWithdraw({
        Account: BROKER_OWNER,
        LoanBrokerID: LOAN_BROKER_ID,
        Amount: MPT_AMOUNT,
      });
      expect(tx.Amount).toEqual(MPT_AMOUNT);
    });

    it('passes through optional Fee / Sequence / Flags', () => {
      const tx = loanBrokerCoverWithdraw({
        Account: BROKER_OWNER,
        LoanBrokerID: LOAN_BROKER_ID,
        Amount: '1000',
        Flags: 0,
        Fee: '12',
        Sequence: 8,
      });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(8);
      expect(tx.Flags).toBe(0);
    });

    it('accepts a Destination and DestinationTag', () => {
      const tx = loanBrokerCoverWithdraw({
        Account: BROKER_OWNER,
        LoanBrokerID: LOAN_BROKER_ID,
        Amount: '100',
        Destination: DESTINATION,
        DestinationTag: 42,
      });
      expect(tx.Destination).toBe(DESTINATION);
      expect(tx.DestinationTag).toBe(42);
    });

    it('accepts a CredentialIDs array', () => {
      const tx = loanBrokerCoverWithdraw({
        Account: BROKER_OWNER,
        LoanBrokerID: LOAN_BROKER_ID,
        Amount: '100',
        CredentialIDs: [VALID_CREDENTIAL_ID],
      });
      expect(tx.CredentialIDs).toEqual([VALID_CREDENTIAL_ID]);
    });

    it('accepts every spec field together', () => {
      const tx = loanBrokerCoverWithdraw({
        Account: BROKER_OWNER,
        LoanBrokerID: LOAN_BROKER_ID,
        Amount: IOU_AMOUNT,
        Destination: DESTINATION,
        DestinationTag: 7,
        CredentialIDs: [VALID_CREDENTIAL_ID, VALID_CREDENTIAL_ID.replace(/^./, 'B')],
        Fee: '12',
        Sequence: 42,
      });
      expect(tx.Destination).toBe(DESTINATION);
      expect(tx.DestinationTag).toBe(7);
      expect(tx.CredentialIDs?.length).toBe(2);
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        loanBrokerCoverWithdraw({
          Account: undefined as never,
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: '1000',
        }),
      ).toThrow(/Account/);
    });

    it('throws on invalid Account', () => {
      expect(() =>
        loanBrokerCoverWithdraw({
          Account: 'not-an-address',
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: '1000',
        }),
      ).toThrow(/Account/);
    });
  });

  describe('LoanBrokerID validation', () => {
    it('throws on missing LoanBrokerID', () => {
      expect(() =>
        loanBrokerCoverWithdraw({
          Account: BROKER_OWNER,
          LoanBrokerID: undefined as never,
          Amount: '1000',
        }),
      ).toThrow(/LoanBrokerID/);
    });

    it('throws on non-hex LoanBrokerID', () => {
      expect(() =>
        loanBrokerCoverWithdraw({
          Account: BROKER_OWNER,
          LoanBrokerID: 'Z'.repeat(64),
          Amount: '1000',
        }),
      ).toThrow(/LoanBrokerID/);
    });

    it('throws on LoanBrokerID of wrong length', () => {
      expect(() =>
        loanBrokerCoverWithdraw({
          Account: BROKER_OWNER,
          LoanBrokerID: 'AB',
          Amount: '1000',
        }),
      ).toThrow(/LoanBrokerID/);
    });

    it('throws on the all-zeros HASH256 LoanBrokerID (XLS-66 §3.6.3.1 check 1)', () => {
      expect(() =>
        loanBrokerCoverWithdraw({
          Account: BROKER_OWNER,
          LoanBrokerID: LOAN_BROKER_ID_ZERO,
          Amount: '1000',
        }),
      ).toThrow(/all-zeros/);
    });
  });

  describe('Amount validation', () => {
    it('throws on missing Amount', () => {
      expect(() =>
        loanBrokerCoverWithdraw({
          Account: BROKER_OWNER,
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: undefined as never,
        }),
      ).toThrow(/Amount/);
    });

    it('throws on a malformed Amount (not an Amount form)', () => {
      expect(() =>
        loanBrokerCoverWithdraw({
          Account: BROKER_OWNER,
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: 123 as never,
        }),
      ).toThrow(/Amount/);
    });

    it('throws on a zero XRP drops Amount (XLS-66 §3.6.3.1 check 2)', () => {
      expect(() =>
        loanBrokerCoverWithdraw({
          Account: BROKER_OWNER,
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: '0',
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on a negative XRP drops Amount', () => {
      expect(() =>
        loanBrokerCoverWithdraw({
          Account: BROKER_OWNER,
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: '-1',
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on a zero IOU value Amount', () => {
      expect(() =>
        loanBrokerCoverWithdraw({
          Account: BROKER_OWNER,
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: { currency: 'USD', issuer: ISSUER, value: '0' },
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on a negative IOU value Amount', () => {
      expect(() =>
        loanBrokerCoverWithdraw({
          Account: BROKER_OWNER,
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: { currency: 'USD', issuer: ISSUER, value: '-2.5' },
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on a zero MPT value Amount', () => {
      expect(() =>
        loanBrokerCoverWithdraw({
          Account: BROKER_OWNER,
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: { mpt_issuance_id: '00000001', value: '0' },
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on a negative MPT value Amount', () => {
      expect(() =>
        loanBrokerCoverWithdraw({
          Account: BROKER_OWNER,
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: { mpt_issuance_id: '00000001', value: '-100' },
        }),
      ).toThrow(/strictly positive/);
    });

    it('accepts Amount expressed in scientific mantissa', () => {
      const tx = make({ Amount: '1.5e3' });
      expect(tx.Amount).toBe('1.5e3');
    });
  });

  describe('Destination validation', () => {
    it('throws on an invalid Destination', () => {
      expect(() =>
        loanBrokerCoverWithdraw({
          Account: BROKER_OWNER,
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: '100',
          Destination: 'bogus',
        }),
      ).toThrow(/Destination/);
    });

    it('rejects the all-zeros AccountID Destination (implicit via isAccount, XLS-66 §3.6.3.1 check 3)', () => {
      // The all-zeros 40-char hex string is not a valid XRPL classic
      // address (no `r…` prefix), so isAccount rejects it. This satisfies
      // the XLS check "Destination is zero" at the JSON layer.
      expect(() =>
        loanBrokerCoverWithdraw({
          Account: BROKER_OWNER,
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: '100',
          Destination: ACCOUNT_ID_ZERO,
        }),
      ).toThrow(/valid XRPL account/);
    });

    it('accepts a self-Destination (sender == destination)', () => {
      const tx = loanBrokerCoverWithdraw({
        Account: BROKER_OWNER,
        LoanBrokerID: LOAN_BROKER_ID,
        Amount: '100',
        Destination: BROKER_OWNER,
      });
      expect(tx.Destination).toBe(BROKER_OWNER);
    });
  });

  describe('DestinationTag validation', () => {
    it('throws on a non-number DestinationTag', () => {
      expect(() =>
        loanBrokerCoverWithdraw({
          Account: BROKER_OWNER,
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: '100',
          DestinationTag: '42' as never,
        }),
      ).toThrow(/DestinationTag/);
    });

    it('accepts an integer DestinationTag', () => {
      const tx = loanBrokerCoverWithdraw({
        Account: BROKER_OWNER,
        LoanBrokerID: LOAN_BROKER_ID,
        Amount: '100',
        DestinationTag: 42,
      });
      expect(tx.DestinationTag).toBe(42);
    });
  });

  describe('CredentialIDs validation', () => {
    it('throws when CredentialIDs is not an array', () => {
      expect(() =>
        loanBrokerCoverWithdraw({
          Account: BROKER_OWNER,
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: '100',
          CredentialIDs: 'not-an-array' as never,
        }),
      ).toThrow(/CredentialIDs/);
    });

    it('throws when CredentialIDs is empty (xrpl.js validateCredentialsList)', () => {
      expect(() =>
        loanBrokerCoverWithdraw({
          Account: BROKER_OWNER,
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: '100',
          CredentialIDs: [],
        }),
      ).toThrow(/empty array/);
    });

    it('throws when CredentialIDs exceeds MAX_AUTHORIZED_CREDENTIALS (8)', () => {
      const ids = Array(9).fill(VALID_CREDENTIAL_ID);
      expect(() =>
        loanBrokerCoverWithdraw({
          Account: BROKER_OWNER,
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: '100',
          CredentialIDs: ids,
        }),
      ).toThrow(/cannot exceed 8/);
    });

    it('accepts CredentialIDs at the MAX_AUTHORIZED_CREDENTIALS (8) boundary', () => {
      const ids = Array(8).fill(VALID_CREDENTIAL_ID);
      const tx = loanBrokerCoverWithdraw({
        Account: BROKER_OWNER,
        LoanBrokerID: LOAN_BROKER_ID,
        Amount: '100',
        CredentialIDs: ids,
      });
      expect(tx.CredentialIDs?.length).toBe(8);
    });

    it('throws when a CredentialID is the wrong length', () => {
      expect(() =>
        loanBrokerCoverWithdraw({
          Account: BROKER_OWNER,
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: '100',
          CredentialIDs: ['short'],
        }),
      ).toThrow(/64-character hex/);
    });

    it('throws when a CredentialID is non-hex', () => {
      expect(() =>
        loanBrokerCoverWithdraw({
          Account: BROKER_OWNER,
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: '100',
          CredentialIDs: ['Z'.repeat(64)],
        }),
      ).toThrow(/64-character hex/);
    });

    it('includes the index in the per-entry error message', () => {
      expect(() =>
        loanBrokerCoverWithdraw({
          Account: BROKER_OWNER,
          LoanBrokerID: LOAN_BROKER_ID,
          Amount: '100',
          CredentialIDs: [VALID_CREDENTIAL_ID, 'bogus'],
        }),
      ).toThrow(/CredentialIDs\[1\]/);
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
        (tx as unknown as Record<string, unknown>).Amount = '9999999';
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      const tx = make();
      const tx2 = tx.with({ Amount: '5000000' });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Amount).toBe('5000000');
      expect(tx.Amount).toBe('1000000');
    });

    it('.with() re-validates on overrides (all-zeros LoanBrokerID)', () => {
      const tx = make();
      expect(() => tx.with({ LoanBrokerID: LOAN_BROKER_ID_ZERO })).toThrow(
        /all-zeros/,
      );
    });

    it('.with() re-validates on overrides (zero Amount)', () => {
      const tx = make();
      expect(() => tx.with({ Amount: '0' })).toThrow(/strictly positive/);
    });

    it('.with() re-validates on overrides (short LoanBrokerID)', () => {
      const tx = make();
      expect(() => tx.with({ LoanBrokerID: 'short' })).toThrow(/LoanBrokerID/);
    });

    it('.with() re-validates on overrides (invalid Destination)', () => {
      const tx = make();
      expect(() => tx.with({ Destination: 'bogus' })).toThrow(/Destination/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = loanBrokerCoverWithdraw({
        Account: BROKER_OWNER,
        LoanBrokerID: LOAN_BROKER_ID,
        Amount: '5000000',
        Destination: DESTINATION,
        DestinationTag: 7,
        CredentialIDs: [VALID_CREDENTIAL_ID],
        Fee: '12',
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'LoanBrokerCoverWithdraw',
        Account: BROKER_OWNER,
        LoanBrokerID: LOAN_BROKER_ID,
        Amount: '5000000',
        Destination: DESTINATION,
        DestinationTag: 7,
        CredentialIDs: [VALID_CREDENTIAL_ID],
        Fee: '12',
      });
    });

    it('.toJSON() skips undefined fields and methods', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('Destination' in json).toBe(false);
      expect('DestinationTag' in json).toBe(false);
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

  // ─── Base transaction fields ─────────────────────────────────────────────
  // `LoanBrokerCoverWithdraw`Props accepts the seven shared base fields and the factory now
  // calls `validateBaseTransaction`, so a malformed one is rejected at
  // construction instead of freezing a transaction that would fail at
  // submit. Values below are chosen to be VALID under src/validation/base.ts.
  describe('BaseTransactionFields', () => {
    const base = {
      Account: BROKER_OWNER,
      LoanBrokerID: LOAN_BROKER_ID,
      Amount: '1000000',
    };
    const MEMOS = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
    const TXN_ID = 'AB'.repeat(32);
    // A valid classic address distinct from `base.Account`.
    const DELEGATE = DESTINATION;

    it('accepts Memos', () => {
      const tx = loanBrokerCoverWithdraw({ ...base, Memos: MEMOS });
      expect(tx.toJSON().Memos).toEqual(MEMOS);
    });

    it('accepts SourceTag', () => {
      const tx = loanBrokerCoverWithdraw({ ...base, SourceTag: 99 });
      expect(tx.toJSON().SourceTag).toBe(99);
    });

    it('accepts LastLedgerSequence', () => {
      const tx = loanBrokerCoverWithdraw({ ...base, LastLedgerSequence: 1_000_000 });
      expect(tx.toJSON().LastLedgerSequence).toBe(1_000_000);
    });

    it('accepts AccountTxnID', () => {
      const tx = loanBrokerCoverWithdraw({ ...base, AccountTxnID: TXN_ID });
      expect(tx.toJSON().AccountTxnID).toBe(TXN_ID);
    });

    it('accepts NetworkID', () => {
      const tx = loanBrokerCoverWithdraw({ ...base, NetworkID: 1 });
      expect(tx.toJSON().NetworkID).toBe(1);
    });

    it('accepts a Delegate distinct from Account', () => {
      const tx = loanBrokerCoverWithdraw({ ...base, Delegate: DELEGATE });
      expect(tx.toJSON().Delegate).toBe(DELEGATE);
    });

    it('accepts TicketSequence alongside Sequence: 0', () => {
      const tx = loanBrokerCoverWithdraw({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    // ── Reject side ── the runtime backstop. Before the
    // `validateBaseTransaction` call landed, every case below built a frozen
    // transaction silently. The bad values are cast `as any` on purpose: the
    // point under test is the runtime check, and a type error would make the
    // test uncompilable.
    it('rejects a malformed Memos value', () => {
      expect(() => loanBrokerCoverWithdraw({ ...base, Memos: 'not-an-array' } as any)).toThrow(/invalid Memos/);
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() => loanBrokerCoverWithdraw({ ...base, SourceTag: 'NaN' } as any)).toThrow(
        /SourceTag must be a number/,
      );
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() => loanBrokerCoverWithdraw({ ...base, LastLedgerSequence: 'soon' } as any)).toThrow(
        /LastLedgerSequence must be a number/,
      );
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() => loanBrokerCoverWithdraw({ ...base, AccountTxnID: 99 } as any)).toThrow(
        /AccountTxnID must be a string/,
      );
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() => loanBrokerCoverWithdraw({ ...base, NetworkID: {} } as any)).toThrow(/NetworkID must be a number/);
    });

    it('rejects a Delegate that is not a valid address', () => {
      expect(() => loanBrokerCoverWithdraw({ ...base, Delegate: 'not-an-address' } as any)).toThrow(
        /invalid Delegate/,
      );
    });

    it('rejects a Delegate equal to Account', () => {
      expect(() => loanBrokerCoverWithdraw({ ...base, Delegate: BROKER_OWNER } as any)).toThrow(/cannot be the same/);
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() => loanBrokerCoverWithdraw({ ...base, TicketSequence: 'nope' } as any)).toThrow(
        /TicketSequence must be a number/,
      );
    });

    it('rejects a non-string Fee', () => {
      expect(() => loanBrokerCoverWithdraw({ ...base, Fee: 12 } as any)).toThrow(/Fee must be a string/);
    });
  });
});
