/**
 * Tests for the functional AMMDeposit factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, Asset, Asset2, Amount)
 *      and acceptance of all spec-defined flag combinations
 *      (tfLPToken, tfSingleAsset, tfTwoAsset, tfOneAssetLPToken,
 *      tfLimitLPToken, tfTwoAssetIfEmpty).
 *   2. Optional field handling (Fee, Sequence, Flags).
 *   3. Spec-mandated guards the class API omits:
 *        a. Asset / Asset2 must be an IssuedCurrency (NOT MPT).
 *           xrpl.js `validateAMMDeposit` lines 92–102.
 *        b. LPTokenOut, if present, must be an IssuedCurrencyAmount.
 *           xrpl.js lines 114–118.
 *        c. Amount / Amount2 / EPrice, if present, must be a valid Amount.
 *           xrpl.js lines 120–130.
 *        d. Amount2 and EPrice require Amount.
 *           xrpl.js lines 104–107.
 *        e. Must set at least LPTokenOut or Amount.
 *           xrpl.js lines 108–112.
 *        f. Flags must set exactly one AMM-deposit mode flag.
 *           xrpl.org `ammdeposit.md` line 129. The xrpl.js class API has
 *           no flag validation at all.
 *   4. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined fields).
 */
import { describe, it, expect } from 'vitest';
import { ammDeposit } from '../../src/fp/factories/amm-deposit.js';
import { AMMDepositFlags } from '../../src/types/flags.js';

const LP = 'rWYkbWkCeg8dP6rXALnjgZSjjLyih5NXm';
const ETH_ISSUER = 'rP9jPyP5kyvFRb6ZiRghAGw5u8SGAmU4bd';
const LP_TOKEN_OUT = {
  currency: 'B3813FCAB4EE68B3D0D735D6849465A9113EE048',
  issuer: 'rH438jEAzTs5PYtV6CHZqpDpwCKQmPW9Cg',
  value: '1000',
};

function make(extras: Record<string, unknown> = {}) {
  return ammDeposit({
    Account: LP,
    Asset: { currency: 'XRP' },
    Asset2: { currency: 'ETH', issuer: ETH_ISSUER },
    Amount: '1000',
    // A deposit mode flag is mandatory (xrpl.org `ammdeposit.md` line
    // 129: "exactly one"). Default it here so the tests below exercise
    // the field they are actually about rather than tripping the flag
    // check first; pass `Flags` in `extras` to override.
    Flags: AMMDepositFlags.tfSingleAsset,
    ...extras,
  });
}

describe('fp/ammDeposit()', () => {
  describe('construction', () => {
    it('constructs with required fields only (Amount + tfSingleAsset)', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('AMMDeposit');
      expect(tx.Account).toBe(LP);
      expect(tx.Asset).toEqual({ currency: 'XRP' });
      expect(tx.Asset2).toEqual({ currency: 'ETH', issuer: ETH_ISSUER });
      expect(tx.Amount).toBe('1000');
    });

    it('accepts a tfLPToken deposit (LPTokenOut only)', () => {
      const tx = ammDeposit({
        Account: LP,
        Asset: { currency: 'XRP' },
        Asset2: { currency: 'ETH', issuer: ETH_ISSUER },
        LPTokenOut: LP_TOKEN_OUT,
        Flags: AMMDepositFlags.tfLPToken,
      });
      expect(tx.LPTokenOut).toEqual(LP_TOKEN_OUT);
      expect(tx.Flags).toBe(AMMDepositFlags.tfLPToken);
    });

    it('accepts a tfSingleAsset deposit (Amount only)', () => {
      const tx = ammDeposit({
        Account: LP,
        Asset: { currency: 'XRP' },
        Asset2: { currency: 'ETH', issuer: ETH_ISSUER },
        Amount: '5000',
        Flags: AMMDepositFlags.tfSingleAsset,
      });
      expect(tx.Amount).toBe('5000');
      expect(tx.Flags).toBe(AMMDepositFlags.tfSingleAsset);
    });

    it('accepts a tfTwoAsset deposit (Amount + Amount2)', () => {
      const tx = ammDeposit({
        Account: LP,
        Asset: { currency: 'XRP' },
        Asset2: { currency: 'ETH', issuer: ETH_ISSUER },
        Amount: '5000',
        Amount2: { currency: 'ETH', issuer: ETH_ISSUER, value: '2.5' },
        Flags: AMMDepositFlags.tfTwoAsset,
      });
      expect(tx.Amount2).toEqual({
        currency: 'ETH',
        issuer: ETH_ISSUER,
        value: '2.5',
      });
    });

    it('accepts a tfOneAssetLPToken deposit (Amount + LPTokenOut)', () => {
      const tx = ammDeposit({
        Account: LP,
        Asset: { currency: 'XRP' },
        Asset2: { currency: 'ETH', issuer: ETH_ISSUER },
        Amount: '5000',
        LPTokenOut: LP_TOKEN_OUT,
        Flags: AMMDepositFlags.tfOneAssetLPToken,
      });
      expect(tx.Amount).toBe('5000');
      expect(tx.LPTokenOut).toEqual(LP_TOKEN_OUT);
    });

    it('accepts a tfLimitLPToken deposit (Amount + EPrice)', () => {
      const tx = ammDeposit({
        Account: LP,
        Asset: { currency: 'XRP' },
        Asset2: { currency: 'ETH', issuer: ETH_ISSUER },
        Amount: '5000',
        EPrice: '25',
        Flags: AMMDepositFlags.tfLimitLPToken,
      });
      expect(tx.Amount).toBe('5000');
      expect(tx.EPrice).toBe('25');
    });

    it('accepts a tfTwoAssetIfEmpty deposit (Amount + Amount2)', () => {
      const tx = ammDeposit({
        Account: LP,
        Asset: { currency: 'XRP' },
        Asset2: { currency: 'ETH', issuer: ETH_ISSUER },
        Amount: '5000',
        Amount2: { currency: 'ETH', issuer: ETH_ISSUER, value: '2.5' },
        Flags: AMMDepositFlags.tfTwoAssetIfEmpty,
      });
      expect(tx.Flags).toBe(AMMDepositFlags.tfTwoAssetIfEmpty);
    });

    it('accepts IOU Asset + IOU Asset2', () => {
      const tx = ammDeposit({
        Account: LP,
        Asset: { currency: 'USD', issuer: ETH_ISSUER },
        Asset2: { currency: 'BTC', issuer: ETH_ISSUER },
        Amount: { currency: 'USD', issuer: ETH_ISSUER, value: '100' },
        Flags: AMMDepositFlags.tfSingleAsset,
      });
      expect(tx.Asset).toEqual({ currency: 'USD', issuer: ETH_ISSUER });
      expect(tx.Asset2).toEqual({ currency: 'BTC', issuer: ETH_ISSUER });
    });

    it('accepts IssuedCurrency form for Amount / Amount2 / EPrice', () => {
      const tx = ammDeposit({
        Account: LP,
        Asset: { currency: 'USD', issuer: ETH_ISSUER },
        Asset2: { currency: 'XRP' },
        Amount: { currency: 'USD', issuer: ETH_ISSUER, value: '100' },
        Amount2: '500', // XRP form is a string
        EPrice: { currency: 'USD', issuer: ETH_ISSUER, value: '25' },
        Flags: AMMDepositFlags.tfTwoAsset,
      });
      expect(tx.Amount).toEqual({
        currency: 'USD',
        issuer: ETH_ISSUER,
        value: '100',
      });
      expect(tx.Amount2).toBe('500');
      expect(tx.EPrice).toEqual({
        currency: 'USD',
        issuer: ETH_ISSUER,
        value: '25',
      });
    });

    it('accepts MPT form for Amount (xrpl.js Amount allows MPT)', () => {
      const tx = ammDeposit({
        Account: LP,
        Asset: { currency: 'XRP' },
        Asset2: { currency: 'ETH', issuer: ETH_ISSUER },
        Amount: { mpt_issuance_id: '00000001', value: '100' },
        Flags: AMMDepositFlags.tfSingleAsset,
      });
      expect(tx.Amount).toEqual({
        mpt_issuance_id: '00000001',
        value: '100',
      });
    });

    it('passes through optional Fee/Sequence', () => {
      const tx = make({ Fee: '12', Sequence: 7 });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(7);
    });
  });

  // xrpl.org `ammdeposit.md` line 129: "You must specify **exactly one**
  // of these flags, plus any global flags." The sentence is byte-identical
  // to `ammwithdraw.md` line 107, and `ammWithdraw` has always enforced it.
  // These cases are the reason they are not symmetric: before this check
  // existed, `ammDeposit` silently accepted zero, one, or many mode flags.
  describe('Flags validation (exactly one deposit mode)', () => {
    it('throws when Flags is absent', () => {
      expect(() =>
        ammDeposit({
          Account: LP,
          Asset: { currency: 'XRP' },
          Asset2: { currency: 'ETH', issuer: ETH_ISSUER },
          Amount: '1000',
        }),
      ).toThrow(/exactly one AMM-deposit mode flag/);
    });

    it('throws when Flags is explicitly undefined', () => {
      expect(() => make({ Flags: undefined })).toThrow(
        /exactly one AMM-deposit mode flag/,
      );
    });

    it('throws on Flags: 0 (no mode flag set)', () => {
      expect(() => make({ Flags: 0 })).toThrow(
        /exactly one AMM-deposit mode flag/,
      );
    });

    it('throws when two mode flags are combined', () => {
      expect(() =>
        make({
          Flags:
            AMMDepositFlags.tfSingleAsset | AMMDepositFlags.tfTwoAsset,
        }),
      ).toThrow(/got multiple/);
    });

    it('accepts a single mode flag combined with a universal flag', () => {
      // tfFullyCanonicalSig (0x80000000) is in rippled's `tfUniversal`
      // (TxFlags.h:43-46), so it is legal on AMMDeposit and must not count
      // toward the exactly-one rule.
      //
      // `>>> 0` is required: JS bitwise OR is signed 32-bit, so
      // 0x00080000 | 0x80000000 evaluates to a NEGATIVE number. Without the
      // coercion this test would silently pin a negative Flags value — it
      // still passes, but for the wrong reason, exactly as suite [14]'s
      // first AMM-4 run did against the live ledger.
      const flags = (AMMDepositFlags.tfSingleAsset | 0x80000000) >>> 0;
      expect(flags).toBe(0x80080000);
      const tx = make({ Flags: flags });
      expect(tx.Flags).toBe(0x80080000);
    });

    it('rejects a withdraw-only bit, even alongside a valid mode', () => {
      // Membership, not cardinality. rippled runs `getFlagsMask` FIRST and
      // answers `temINVALID_FLAG` for any bit that is not legal on an
      // AMMDeposit (TxFlags.h:264-266, 169-176, 43-46). `tfWithdrawAll`
      // (0x00020000) is an AMMWithdraw mode, so this tx still contains
      // exactly one *deposit* mode — but the ledger refuses the whole
      // transaction anyway. Verified live against testnet: the ledger
      // returns `temINVALID_FLAG`, not `temMALFORMED`.
      //
      // This test previously asserted the opposite. It pinned the Bug #7
      // gap; it is kept (inverted) because it is the one that proves the
      // membership check exists.
      expect(() =>
        make({ Flags: AMMDepositFlags.tfSingleAsset | 0x00020000 }),
      ).toThrow(/not valid for this transaction type/);
    });

    it('rejects a lone bit that is neither a mode nor universal', () => {
      expect(() => make({ Flags: 0x00000002 })).toThrow(
        /not valid for this transaction type/);
    });

    it('accepts a mode flag plus a universal flag that is a mode bit of another tx', () => {
      // tfInnerBatchTxn (0x40000000) is in tfUniversal (TxFlags.h:45), so it is
      // legal on any transaction and must not trip the membership check.
      const flags = (AMMDepositFlags.tfSingleAsset | 0x40000000) >>> 0;
      const tx = make({ Flags: flags });
      expect(tx.Flags).toBe(0x40080000);
    });

    it('accepts a boolean AMMDepositFlagsInterface with one mode', () => {
      const tx = make({
        Flags: { tfSingleAsset: true } as const,
      });
      expect(tx.Flags).toEqual({ tfSingleAsset: true });
    });

    it('throws on a boolean interface with two modes', () => {
      expect(() =>
        make({
          Flags: { tfSingleAsset: true, tfTwoAsset: true } as const,
        }),
      ).toThrow(/got multiple/);
    });

    it('throws on a boolean interface with no modes', () => {
      expect(() => make({ Flags: {} as const })).toThrow(
        /exactly one AMM-deposit mode flag/,
      );
    });

    it('accepts each of the six mode flags individually', () => {
      const modes = [
        AMMDepositFlags.tfLPToken,
        AMMDepositFlags.tfSingleAsset,
        AMMDepositFlags.tfTwoAsset,
        AMMDepositFlags.tfOneAssetLPToken,
        AMMDepositFlags.tfLimitLPToken,
        AMMDepositFlags.tfTwoAssetIfEmpty,
      ];
      for (const flag of modes) {
        expect(() => make({ Flags: flag })).not.toThrow();
      }
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        ammDeposit({
          Account: '' as never,
          Asset: { currency: 'XRP' },
          Asset2: { currency: 'ETH', issuer: ETH_ISSUER },
          Amount: '1000',
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      expect(() =>
        ammDeposit({
          Account: 'not-an-account',
          Asset: { currency: 'XRP' },
          Asset2: { currency: 'ETH', issuer: ETH_ISSUER },
          Amount: '1000',
        }),
      ).toThrow(/Account/);
    });
  });

  describe('Asset / Asset2 validation', () => {
    it('throws on missing Asset', () => {
      expect(() =>
        ammDeposit({
          Account: LP,
          Asset: undefined as never,
          Asset2: { currency: 'ETH', issuer: ETH_ISSUER },
          Amount: '1000',
        }),
      ).toThrow(/Asset/);
    });

    it('throws on a non-record Asset', () => {
      expect(() =>
        ammDeposit({
          Account: LP,
          Asset: 1234 as never,
          Asset2: { currency: 'ETH', issuer: ETH_ISSUER },
          Amount: '1000',
        }),
      ).toThrow(/Asset/);
    });

    it('throws on an MPT Asset (divergence #1)', () => {
      // Asset must be an IssuedCurrency (XRP form OR IOU form), NOT MPT.
      expect(() =>
        ammDeposit({
            Account: LP,
            Asset: { mpt_issuance_id: '00000001' } as never,
            Asset2: { currency: 'ETH', issuer: ETH_ISSUER },
            Amount: '1000',
          }),
      ).toThrow(/Asset must be a Currency/);
    });

    it('throws on a malformed IOU Asset (missing issuer)', () => {
      expect(() =>
        ammDeposit({
            Account: LP,
            Asset: { currency: 'USD' } as never,
            Asset2: { currency: 'ETH', issuer: ETH_ISSUER },
            Amount: '1000',
          }),
      ).toThrow(/Asset must be a Currency/);
    });

    it('throws on missing Asset2', () => {
      expect(() =>
        ammDeposit({
          Account: LP,
          Asset: { currency: 'XRP' },
          Asset2: undefined as never,
          Amount: '1000',
        }),
      ).toThrow(/Asset2/);
    });

    it('throws on a non-record Asset2', () => {
      expect(() =>
        ammDeposit({
          Account: LP,
          Asset: { currency: 'XRP' },
          Asset2: 1234 as never,
          Amount: '1000',
        }),
      ).toThrow(/Asset2/);
    });

    it('throws on an MPT Asset2 (divergence #2)', () => {
      expect(() =>
        ammDeposit({
            Account: LP,
            Asset: { currency: 'XRP' },
            Asset2: { mpt_issuance_id: '00000001' } as never,
            Amount: '1000',
          }),
      ).toThrow(/Asset2 must be a Currency/);
    });
  });

  describe('LPTokenOut / Amount presence validation', () => {
    it('throws when neither LPTokenOut nor Amount is set (divergence #8)', () => {
      expect(() =>
        ammDeposit({
          Account: LP,
          Asset: { currency: 'XRP' },
          Asset2: { currency: 'ETH', issuer: ETH_ISSUER },
        }),
      ).toThrow(/LPTokenOut or Amount/);
    });

    it('throws when Amount2 is set without Amount (divergence #7)', () => {
      expect(() =>
        ammDeposit({
          Account: LP,
          Asset: { currency: 'XRP' },
          Asset2: { currency: 'ETH', issuer: ETH_ISSUER },
          LPTokenOut: LP_TOKEN_OUT,
          Amount2: { currency: 'ETH', issuer: ETH_ISSUER, value: '2.5' },
        }),
      ).toThrow(/Amount with Amount2/);
    });

    it('throws when EPrice is set without Amount (divergence #7)', () => {
      expect(() =>
        ammDeposit({
          Account: LP,
          Asset: { currency: 'XRP' },
          Asset2: { currency: 'ETH', issuer: ETH_ISSUER },
          LPTokenOut: LP_TOKEN_OUT,
          EPrice: '25',
        }),
      ).toThrow(/Amount with EPrice/);
    });
  });

  describe('LPTokenOut type validation', () => {
    it('throws when LPTokenOut is not an IssuedCurrencyAmount (divergence #3)', () => {
      // A bare string is not an IssuedCurrencyAmount.
      expect(() =>
        ammDeposit({
          Account: LP,
          Asset: { currency: 'XRP' },
          Asset2: { currency: 'ETH', issuer: ETH_ISSUER },
          LPTokenOut: '1000' as never,
        }),
      ).toThrow(/LPTokenOut must be an IssuedCurrencyAmount/);
    });

    it('throws when LPTokenOut is an MPT (not IssuedCurrencyAmount)', () => {
      expect(() =>
        ammDeposit({
            Account: LP,
            Asset: { currency: 'XRP' },
            Asset2: { currency: 'ETH', issuer: ETH_ISSUER },
            LPTokenOut: { mpt_issuance_id: '00000001', value: '1000' } as never,
          }),
      ).toThrow(/LPTokenOut must be an IssuedCurrencyAmount/);
    });
  });

  describe('Amount / Amount2 / EPrice type validation', () => {
    it('throws on a non-Amount Amount (divergence #4)', () => {
      expect(() =>
        ammDeposit({
          Account: LP,
          Asset: { currency: 'XRP' },
          Asset2: { currency: 'ETH', issuer: ETH_ISSUER },
          Amount: 1234 as never,
        }),
      ).toThrow(/Amount must be an Amount/);
    });

    it('throws on a non-Amount Amount2 (divergence #5)', () => {
      expect(() =>
        ammDeposit({
          Account: LP,
          Asset: { currency: 'XRP' },
          Asset2: { currency: 'ETH', issuer: ETH_ISSUER },
          Amount: '1000',
          Amount2: 1234 as never,
        }),
      ).toThrow(/Amount2 must be an Amount/);
    });

    it('throws on a non-Amount EPrice (divergence #6)', () => {
      expect(() =>
        ammDeposit({
          Account: LP,
          Asset: { currency: 'XRP' },
          Asset2: { currency: 'ETH', issuer: ETH_ISSUER },
          Amount: '1000',
          EPrice: 1234 as never,
        }),
      ).toThrow(/EPrice must be an Amount/);
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
      const tx2 = tx.with({ Amount: '2000000' });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Amount).toBe('2000000');
      expect(tx.Amount).toBe('1000');
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      // Override Asset → MPT form (rejected by divergence #1).
      expect(() =>
        tx.with({
          Asset: { mpt_issuance_id: '00000001' } as never,
        }),
      ).toThrow(/Asset must be a Currency/);
      // Override Amount → number (rejected by divergence #4).
      expect(() => tx.with({ Amount: 1234 as never })).toThrow(
        /Amount must be an Amount/,
      );
      // Drop Amount entirely (rejected by divergence #8).
      expect(() =>
        tx.with({ Amount: undefined as never }),
      ).toThrow(/LPTokenOut or Amount/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({ Flags: AMMDepositFlags.tfSingleAsset, Fee: '12' });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'AMMDeposit',
        Account: LP,
        Asset: { currency: 'XRP' },
        Asset2: { currency: 'ETH', issuer: ETH_ISSUER },
        Amount: '1000',
        Flags: AMMDepositFlags.tfSingleAsset,
        Fee: '12',
      });
    });

    it('.toJSON() skips undefined fields and methods', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('Amount2' in json).toBe(false);
      expect('EPrice' in json).toBe(false);
      expect('LPTokenOut' in json).toBe(false);
      // `Flags` is the one field that is always present: a deposit must
      // name exactly one mode (xrpl.org `ammdeposit.md` line 129), so it
      // can no longer be omitted the way Fee / Sequence can.
      expect('Flags' in json).toBe(true);
      expect(json.Flags).toBe(AMMDepositFlags.tfSingleAsset);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op after construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });

  // ─── Base transaction fields ─────────────────────────────────────────────
  // `AmmDeposit`Props accepts the seven shared base fields and the factory now
  // calls `validateBaseTransaction`, so a malformed one is rejected at
  // construction instead of freezing a transaction that would fail at
  // submit. Values below are chosen to be VALID under src/validation/base.ts.
  describe('BaseTransactionFields', () => {
    const base = {
      Account: LP,
      Asset: { currency: 'XRP' },
      Asset2: { currency: 'ETH', issuer: ETH_ISSUER },
      Amount: '1000',
      // Exactly one AMM-deposit mode flag is mandatory; without it the
      // factory's own flag check throws before the base backstop is reached.
      Flags: AMMDepositFlags.tfSingleAsset,
    };
    const MEMOS = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
    const TXN_ID = 'AB'.repeat(32);
    // A valid classic address distinct from `base.Account`.
    const DELEGATE = ETH_ISSUER;

    it('accepts Memos', () => {
      const tx = ammDeposit({ ...base, Memos: MEMOS });
      expect(tx.toJSON().Memos).toEqual(MEMOS);
    });

    it('accepts SourceTag', () => {
      const tx = ammDeposit({ ...base, SourceTag: 99 });
      expect(tx.toJSON().SourceTag).toBe(99);
    });

    it('accepts LastLedgerSequence', () => {
      const tx = ammDeposit({ ...base, LastLedgerSequence: 1_000_000 });
      expect(tx.toJSON().LastLedgerSequence).toBe(1_000_000);
    });

    it('accepts AccountTxnID', () => {
      const tx = ammDeposit({ ...base, AccountTxnID: TXN_ID });
      expect(tx.toJSON().AccountTxnID).toBe(TXN_ID);
    });

    it('accepts NetworkID', () => {
      const tx = ammDeposit({ ...base, NetworkID: 1 });
      expect(tx.toJSON().NetworkID).toBe(1);
    });

    it('accepts a Delegate distinct from Account', () => {
      const tx = ammDeposit({ ...base, Delegate: DELEGATE });
      expect(tx.toJSON().Delegate).toBe(DELEGATE);
    });

    it('accepts TicketSequence alongside Sequence: 0', () => {
      const tx = ammDeposit({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    // ── Reject side ── the runtime backstop. Before the
    // `validateBaseTransaction` call landed, every case below built a frozen
    // transaction silently. The bad values are cast `as any` on purpose: the
    // point under test is the runtime check, and a type error would make the
    // test uncompilable.
    it('rejects a malformed Memos value', () => {
      expect(() => ammDeposit({ ...base, Memos: 'not-an-array' } as any)).toThrow(/invalid Memos/);
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() => ammDeposit({ ...base, SourceTag: 'NaN' } as any)).toThrow(
        /SourceTag must be a number/,
      );
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() => ammDeposit({ ...base, LastLedgerSequence: 'soon' } as any)).toThrow(
        /LastLedgerSequence must be a number/,
      );
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() => ammDeposit({ ...base, AccountTxnID: 99 } as any)).toThrow(
        /AccountTxnID must be a string/,
      );
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() => ammDeposit({ ...base, NetworkID: {} } as any)).toThrow(/NetworkID must be a number/);
    });

    it('rejects a Delegate that is not a valid address', () => {
      expect(() => ammDeposit({ ...base, Delegate: 'not-an-address' } as any)).toThrow(
        /invalid Delegate/,
      );
    });

    it('rejects a Delegate equal to Account', () => {
      expect(() => ammDeposit({ ...base, Delegate: LP } as any)).toThrow(/cannot be the same/);
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() => ammDeposit({ ...base, TicketSequence: 'nope' } as any)).toThrow(
        /TicketSequence must be a number/,
      );
    });

    it('rejects a non-string Fee', () => {
      expect(() => ammDeposit({ ...base, Fee: 12 } as any)).toThrow(/Fee must be a string/);
    });
  });
});