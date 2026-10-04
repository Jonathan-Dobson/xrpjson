/**
 * Tests for the functional LoanBrokerSet factory.
 *
 * Validates:
 *   1. Construction (required + all-fields + update mode).
 *   2. Ledger-specific preclaim checks the class skips:
 *      - VaultID must not be all-zeros HASH256 (XLS-66 §3.3.3.1 check 1)
 *      - LoanBrokerID must not be all-zeros HASH256 (check 8)
 *      - Fixed fields rejected when LoanBrokerID is set (check 9)
 *      - Rate fields must be integers (UINT16/UINT32)
 *   3. Cover-rate coupling rule (XLS-66 §3.3.3.1 check 7).
 *   4. Frozen-shape contract (mutation throws, .with() returns new
 *      frozen object, .toJSON() strips methods and undefined values).
 */
import { describe, it, expect } from 'vitest';
// Import directly from the factory file so this test is self-contained;
// the parent integrates this factory into `src/fp/index.ts` after all
// factories land. Once integrated, this line can be changed to:
//   `import { loanBrokerSet } from '../../src/fp/index.js';`
import { loanBrokerSet } from '../../src/fp/factories/loan-broker-set.js';

const LENDER = 'rDNs1puRWQh4ezekGfVmtoEHAJ6WbqCEA';

// 64-char hex ledger entry IDs.
const VAULT_ID =
  '4AF1FD30BFAB1CDF10CF6783B37BA96873CBB7C4CE5DDFC89D9B8DB50BD29F54';
const LOAN_BROKER_ID =
  'E9A08C918E26407493CC4ADD381BA979CFEB7E440D0863B01FB31C231D167E42';

// All-zeros HASH256 — must be rejected per XLS-66 §3.3.3.1.
const HASH256_ZERO =
  '0000000000000000000000000000000000000000000000000000000000000000';

function make(extras: Record<string, unknown> = {}) {
  return loanBrokerSet({
    Account: LENDER,
    VaultID: VAULT_ID,
    ...extras,
  });
}

describe('fp/loanBrokerSet()', () => {
  describe('construction', () => {
    it('constructs with required fields only (creation mode)', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('LoanBrokerSet');
      expect(tx.Account).toBe(LENDER);
      expect(tx.VaultID).toBe(VAULT_ID);
    });

    it('accepts every spec field together', () => {
      const tx = loanBrokerSet({
        Account: LENDER,
        VaultID: VAULT_ID,
        Data: '48656C6C6F20576F726C64',
        ManagementFeeRate: 500,
        DebtMaximum: '1000000000',
        CoverRateMinimum: 1000,
        CoverRateLiquidation: 2000,
        Flags: 0,
        Fee: '12',
        Sequence: 42,
      });
      expect(tx.Data).toBe('48656C6C6F20576F726C64');
      expect(tx.ManagementFeeRate).toBe(500);
      expect(tx.DebtMaximum).toBe('1000000000');
      expect(tx.CoverRateMinimum).toBe(1000);
      expect(tx.CoverRateLiquidation).toBe(2000);
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(42);
    });

    it('constructs in update mode with LoanBrokerID', () => {
      const tx = loanBrokerSet({
        Account: LENDER,
        VaultID: VAULT_ID,
        LoanBrokerID: LOAN_BROKER_ID,
        Data: '7B2274797065223A2274657374227D',
        DebtMaximum: '0',
      });
      expect(tx.LoanBrokerID).toBe(LOAN_BROKER_ID);
      expect(tx.Data).toBe('7B2274797065223A2274657374227D');
      expect(tx.DebtMaximum).toBe('0');
    });

    it('accepts zero-value cover rates (the defaults)', () => {
      const tx = make({ CoverRateMinimum: 0, CoverRateLiquidation: 0 });
      expect(tx.CoverRateMinimum).toBe(0);
      expect(tx.CoverRateLiquidation).toBe(0);
    });

    it('accepts DebtMaximum "0" (unlimited, the default)', () => {
      const tx = make({ DebtMaximum: '0' });
      expect(tx.DebtMaximum).toBe('0');
    });

    it('accepts Flags as a boolean-map GlobalFlagsInterface', () => {
      const tx = make({ Flags: { tfInnerBatchTxn: true } });
      expect((tx.Flags as { tfInnerBatchTxn?: boolean }).tfInnerBatchTxn).toBe(
        true,
      );
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        loanBrokerSet({
          Account: '',
          VaultID: VAULT_ID,
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      expect(() =>
        loanBrokerSet({
          Account: 'not-an-account',
          VaultID: VAULT_ID,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('VaultID validation', () => {
    it('throws on missing VaultID', () => {
      expect(() =>
        loanBrokerSet({
          Account: LENDER,
          VaultID: '' as never,
        }),
      ).toThrow(/VaultID/);
    });

    it('throws on non-hex VaultID', () => {
      expect(() =>
        loanBrokerSet({
          Account: LENDER,
          VaultID: 'Z'.repeat(64),
        }),
      ).toThrow(/VaultID/);
    });

    it('throws on too-short VaultID', () => {
      expect(() =>
        loanBrokerSet({
          Account: LENDER,
          VaultID: 'AB',
        }),
      ).toThrow(/VaultID/);
    });

    it('throws on too-long VaultID', () => {
      expect(() =>
        loanBrokerSet({
          Account: LENDER,
          VaultID: 'A'.repeat(66),
        }),
      ).toThrow(/VaultID/);
    });

    it('throws on all-zeros VaultID (XLS-66 §3.3.3.1 check 1)', () => {
      expect(() =>
        loanBrokerSet({
          Account: LENDER,
          VaultID: HASH256_ZERO,
        }),
      ).toThrow(/VaultID.*zero/i);
    });
  });

  describe('LoanBrokerID validation (update mode)', () => {
    it('accepts absent LoanBrokerID (creation mode)', () => {
      const tx = make();
      expect(tx.LoanBrokerID).toBeUndefined();
    });

    it('throws on non-hex LoanBrokerID', () => {
      expect(() => make({ LoanBrokerID: 'Z'.repeat(64) })).toThrow(
        /LoanBrokerID/,
      );
    });

    it('throws on wrong-length LoanBrokerID', () => {
      expect(() => make({ LoanBrokerID: 'AB' })).toThrow(/LoanBrokerID/);
    });

    it('throws on all-zeros LoanBrokerID (XLS-66 §3.3.3.1 check 8)', () => {
      expect(() => make({ LoanBrokerID: HASH256_ZERO })).toThrow(
        /LoanBrokerID.*zero/i,
      );
    });

    it('accepts a non-zero 64-char hex LoanBrokerID', () => {
      const tx = make({ LoanBrokerID: LOAN_BROKER_ID });
      expect(tx.LoanBrokerID).toBe(LOAN_BROKER_ID);
    });
  });

  describe('fixed-field guard for update mode (XLS-66 §3.3.3.1 check 9)', () => {
    it('rejects ManagementFeeRate when LoanBrokerID is present', () => {
      expect(() =>
        make({
          LoanBrokerID: LOAN_BROKER_ID,
          ManagementFeeRate: 100,
        }),
      ).toThrow(/fixed field.*ManagementFeeRate/);
    });

    it('rejects CoverRateMinimum when LoanBrokerID is present', () => {
      expect(() =>
        make({
          LoanBrokerID: LOAN_BROKER_ID,
          CoverRateMinimum: 100,
        }),
      ).toThrow(/fixed field.*CoverRateMinimum/);
    });

    it('rejects CoverRateLiquidation when LoanBrokerID is present', () => {
      expect(() =>
        make({
          LoanBrokerID: LOAN_BROKER_ID,
          CoverRateLiquidation: 100,
        }),
      ).toThrow(/fixed field.*CoverRateLiquidation/);
    });

    it('rejects all three fixed fields together when LoanBrokerID is present', () => {
      expect(() =>
        make({
          LoanBrokerID: LOAN_BROKER_ID,
          ManagementFeeRate: 100,
          CoverRateMinimum: 1000,
          CoverRateLiquidation: 2000,
        }),
      ).toThrow(/fixed field/);
    });

    it('accepts Data + DebtMaximum (mutable fields) when LoanBrokerID is present', () => {
      const tx = loanBrokerSet({
        Account: LENDER,
        VaultID: VAULT_ID,
        LoanBrokerID: LOAN_BROKER_ID,
        Data: '48656C6C6F',
        DebtMaximum: '500',
      });
      expect(tx.Data).toBe('48656C6C6F');
      expect(tx.DebtMaximum).toBe('500');
    });

    it('does NOT enforce fixed-field guard in creation mode (no LoanBrokerID)', () => {
      const tx = loanBrokerSet({
        Account: LENDER,
        VaultID: VAULT_ID,
        ManagementFeeRate: 100,
        CoverRateMinimum: 1000,
        CoverRateLiquidation: 2000,
      });
      expect(tx.ManagementFeeRate).toBe(100);
      expect(tx.CoverRateMinimum).toBe(1000);
      expect(tx.CoverRateLiquidation).toBe(2000);
    });
  });

  describe('Data validation', () => {
    it('throws on non-hex Data', () => {
      expect(() => make({ Data: 'not-hex!' })).toThrow(/Data/);
    });

    it('throws on empty Data', () => {
      expect(() => make({ Data: '' })).toThrow(/Data/);
    });

    it('throws on Data > 512 characters', () => {
      const huge = 'A'.repeat(514);
      expect(() => make({ Data: huge })).toThrow(/512/);
    });

    it('accepts Data at exactly 512 characters', () => {
      const ok = 'A'.repeat(512);
      const tx = make({ Data: ok });
      expect(tx.Data).toBe(ok);
    });

    it('accepts a valid short hex Data', () => {
      const tx = make({ Data: '48656C6C6F' });
      expect(tx.Data).toBe('48656C6C6F');
    });
  });

  describe('ManagementFeeRate validation', () => {
    it('throws on negative ManagementFeeRate', () => {
      expect(() => make({ ManagementFeeRate: -1 })).toThrow(
        /ManagementFeeRate/,
      );
    });

    it('throws on ManagementFeeRate > 10000', () => {
      expect(() => make({ ManagementFeeRate: 10_001 })).toThrow(
        /ManagementFeeRate/,
      );
    });

    it('throws on non-integer ManagementFeeRate (UINT16)', () => {
      expect(() => make({ ManagementFeeRate: 1.5 })).toThrow(
        /ManagementFeeRate/,
      );
    });

    it('throws on non-number ManagementFeeRate', () => {
      expect(() => make({ ManagementFeeRate: '500' as never })).toThrow(
        /ManagementFeeRate/,
      );
    });

    it('accepts ManagementFeeRate at boundary 0', () => {
      const tx = make({ ManagementFeeRate: 0 });
      expect(tx.ManagementFeeRate).toBe(0);
    });

    it('accepts ManagementFeeRate at boundary 10000', () => {
      const tx = make({ ManagementFeeRate: 10_000 });
      expect(tx.ManagementFeeRate).toBe(10_000);
    });
  });

  describe('DebtMaximum validation', () => {
    it('throws on negative DebtMaximum string', () => {
      expect(() => make({ DebtMaximum: '-1' })).toThrow(/DebtMaximum/);
    });

    it('throws on non-numeric DebtMaximum string', () => {
      expect(() => make({ DebtMaximum: 'abc' })).toThrow(/DebtMaximum/);
    });

    it('throws on floating-point DebtMaximum string', () => {
      expect(() => make({ DebtMaximum: '1.5' })).toThrow(/DebtMaximum/);
    });

    it('throws on non-string DebtMaximum', () => {
      expect(() => make({ DebtMaximum: 100 as never })).toThrow(/DebtMaximum/);
    });

    it('accepts DebtMaximum "0" (unlimited)', () => {
      const tx = make({ DebtMaximum: '0' });
      expect(tx.DebtMaximum).toBe('0');
    });

    it('accepts a large non-negative DebtMaximum', () => {
      const tx = make({ DebtMaximum: '99999999999999999' });
      expect(tx.DebtMaximum).toBe('99999999999999999');
    });
  });

  describe('cover-rate range validation', () => {
    it('throws on CoverRateMinimum > 100000', () => {
      expect(() => make({ CoverRateMinimum: 100_001 })).toThrow(
        /CoverRateMinimum/,
      );
    });

    it('throws on CoverRateMinimum < 0', () => {
      expect(() => make({ CoverRateMinimum: -1 })).toThrow(/CoverRateMinimum/);
    });

    it('throws on non-integer CoverRateMinimum (UINT32)', () => {
      expect(() => make({ CoverRateMinimum: 1.5 })).toThrow(
        /CoverRateMinimum/,
      );
    });

    it('throws on CoverRateLiquidation > 100000', () => {
      expect(() => make({ CoverRateLiquidation: 100_001 })).toThrow(
        /CoverRateLiquidation/,
      );
    });

    it('throws on negative CoverRateLiquidation', () => {
      expect(() => make({ CoverRateLiquidation: -5 })).toThrow(
        /CoverRateLiquidation/,
      );
    });

    it('throws on non-integer CoverRateLiquidation (UINT32)', () => {
      expect(() => make({ CoverRateLiquidation: 2.5 })).toThrow(
        /CoverRateLiquidation/,
      );
    });

    it('accepts CoverRateMinimum at boundary 100000', () => {
      const tx = make({ CoverRateMinimum: 100_000, CoverRateLiquidation: 100_000 });
      expect(tx.CoverRateMinimum).toBe(100_000);
      expect(tx.CoverRateLiquidation).toBe(100_000);
    });
  });

  describe('cover-rate coupling rule (XLS-66 §3.3.3.1 check 7)', () => {
    it('accepts both cover rates zero', () => {
      const tx = make({ CoverRateMinimum: 0, CoverRateLiquidation: 0 });
      expect(tx.CoverRateMinimum).toBe(0);
      expect(tx.CoverRateLiquidation).toBe(0);
    });

    it('rejects CoverRateMinimum non-zero with CoverRateLiquidation zero', () => {
      expect(() =>
        make({ CoverRateMinimum: 100, CoverRateLiquidation: 0 }),
      ).toThrow(/both be zero or both be non-zero/);
    });

    it('rejects CoverRateMinimum zero with CoverRateLiquidation non-zero', () => {
      expect(() =>
        make({ CoverRateMinimum: 0, CoverRateLiquidation: 100 }),
      ).toThrow(/both be zero or both be non-zero/);
    });

    it('accepts both cover rates non-zero', () => {
      const tx = make({
        CoverRateMinimum: 500,
        CoverRateLiquidation: 1500,
      });
      expect(tx.CoverRateMinimum).toBe(500);
      expect(tx.CoverRateLiquidation).toBe(1500);
    });

    it('coupling rule applies when one rate is provided (treated as zero for the other)', () => {
      expect(() =>
        make({ CoverRateMinimum: 500 } as Record<string, unknown>),
      ).toThrow(/both be zero or both be non-zero/);
    });
  });

  describe('Flags pass-through', () => {
    it('accepts numeric Flags 0', () => {
      const tx = make({ Flags: 0 });
      expect(tx.Flags).toBe(0);
    });

    it('passes through arbitrary numeric Flags (spec is open-ended)', () => {
      const tx = make({ Flags: 0x80000000 });
      expect(tx.Flags).toBe(0x80000000);
    });
  });

  describe('Fee + Sequence pass-through', () => {
    it('accepts Fee + Sequence', () => {
      const tx = make({ Fee: '15', Sequence: 99 });
      expect(tx.Fee).toBe('15');
      expect(tx.Sequence).toBe(99);
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
        (tx as unknown as Record<string, unknown>).VaultID =
          'B'.repeat(64);
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      const tx = make();
      const tx2 = tx.with({ ManagementFeeRate: 500 });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.ManagementFeeRate).toBe(500);
      expect(tx.ManagementFeeRate).toBeUndefined();
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() => tx.with({ ManagementFeeRate: 1.5 })).toThrow(
        /ManagementFeeRate/,
      );
    });

    it('.with() re-validates all-zeros VaultID override', () => {
      const tx = make();
      expect(() => tx.with({ VaultID: HASH256_ZERO })).toThrow(
        /VaultID.*zero/i,
      );
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({
        ManagementFeeRate: 500,
        CoverRateMinimum: 1000,
        CoverRateLiquidation: 1500,
        Fee: '12',
        Sequence: 7,
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'LoanBrokerSet',
        Account: LENDER,
        VaultID: VAULT_ID,
        ManagementFeeRate: 500,
        CoverRateMinimum: 1000,
        CoverRateLiquidation: 1500,
        Fee: '12',
        Sequence: 7,
      });
    });

    it('.toJSON() skips undefined fields and methods', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('Data' in json).toBe(false);
      expect('ManagementFeeRate' in json).toBe(false);
      expect('DebtMaximum' in json).toBe(false);
      expect('LoanBrokerID' in json).toBe(false);
    });

    it('.validate() is a no-op (no throw after construction)', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });

  // ─── Base transaction fields ──────────────────────────────────────────────
  // The props type extends `BasePropsFields`, so the seven shared base fields
  // are part of the type surface. The factory now CALLS
  // `validateBaseTransaction` as its final check, immediately before
  // `buildFrozenTx` and after every LoanBrokerSet-specific check, so the
  // reject cases below reach the shared validator's messages — and a more
  // specific mistake (e.g. a bad VaultID) still produces the LoanBrokerSet
  // message.
  describe('BaseTransactionFields', () => {
    const base = { Account: LENDER, VaultID: VAULT_ID };
    const MEMOS = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
    const TXN_ID = 'AB'.repeat(32);
    // A valid classic address distinct from LENDER.
    const DELEGATE = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';

    it('accepts Memos', () => {
      const tx = loanBrokerSet({ ...base, Memos: MEMOS });
      expect(tx.Memos).toEqual(MEMOS);
      expect(tx.toJSON().Memos).toEqual(MEMOS);
    });

    it('rejects a malformed Memos value', () => {
      expect(() => loanBrokerSet({ ...base, Memos: 'not-an-array' } as any)).toThrow(
        /invalid Memos/,
      );
    });

    it('accepts SourceTag', () => {
      const tx = loanBrokerSet({ ...base, SourceTag: 99 });
      expect(tx.SourceTag).toBe(99);
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() => loanBrokerSet({ ...base, SourceTag: 'NaN' } as any)).toThrow(
        /SourceTag must be a number/,
      );
    });

    it('accepts LastLedgerSequence', () => {
      const tx = loanBrokerSet({ ...base, LastLedgerSequence: 1_000_000 });
      expect(tx.LastLedgerSequence).toBe(1_000_000);
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() => loanBrokerSet({ ...base, LastLedgerSequence: 'soon' } as any)).toThrow(
        /LastLedgerSequence must be a number/,
      );
    });

    it('accepts AccountTxnID', () => {
      const tx = loanBrokerSet({ ...base, AccountTxnID: TXN_ID });
      expect(tx.AccountTxnID).toBe(TXN_ID);
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() => loanBrokerSet({ ...base, AccountTxnID: 12345 } as any)).toThrow(
        /AccountTxnID must be a string/,
      );
    });

    it('accepts NetworkID', () => {
      const tx = loanBrokerSet({ ...base, NetworkID: 1 });
      expect(tx.NetworkID).toBe(1);
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() => loanBrokerSet({ ...base, NetworkID: {} } as any)).toThrow(
        /NetworkID must be a number/,
      );
    });

    it('accepts a Delegate distinct from Account', () => {
      const tx = loanBrokerSet({ ...base, Delegate: DELEGATE });
      expect(tx.Delegate).toBe(DELEGATE);
    });

    it('rejects a Delegate that is not a valid address', () => {
      expect(() => loanBrokerSet({ ...base, Delegate: 'not-an-address' } as any)).toThrow(
        /invalid Delegate/,
      );
    });

    it('rejects Delegate equal to Account', () => {
      expect(() => loanBrokerSet({ ...base, Delegate: LENDER })).toThrow(
        /cannot be the same/,
      );
    });

    it('accepts TicketSequence alongside Sequence: 0', () => {
      const tx = loanBrokerSet({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.TicketSequence).toBe(42);
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() => loanBrokerSet({ ...base, TicketSequence: 'nope' } as any)).toThrow(
        /TicketSequence must be a number/,
      );
    });

    it('rejects a non-string Fee', () => {
      expect(() => loanBrokerSet({ ...base, Fee: 12 } as any)).toThrow(
        /Fee must be a string/,
      );
    });
  });
});