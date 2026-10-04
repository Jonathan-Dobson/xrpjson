/**
 * Tests for the functional AMMWithdraw factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, Asset, Asset2) and
 *      the full set of optional amount fields (Amount, Amount2,
 *      EPrice, LPTokenIn).
 *   2. Spec-mandated guards the class API omits:
 *        a. Asset / Asset2 must each be a Currency (XRP / IOU / MPT).
 *        b. Amount2 requires Amount (XLS-0030 §2.4.2.3).
 *        c. EPrice requires Amount (XLS-0030 §2.4.2.3).
 *        d. LPTokenIn must be an IssuedCurrencyAmount (never XRP,
 *           never MPT).
 *        e. Amount / Amount2 / EPrice must each be a valid Amount.
 *        f. Exactly one of the seven AMM-withdraw mode flags must
 *           be set (xrpl.org `ammwithdraw.md` AMMWithdraw Flags).
 *   3. Frozen-shape contract (mutation throws, .with() returns a new
 *      frozen object, .toJSON() strips methods and undefined fields).
 */
import { describe, it, expect } from 'vitest';
import {
  ammWithdraw,
  type AmmWithdraw,
} from '../../src/fp/factories/amm-withdraw.js';

// ─── Test fixtures ───────────────────────────────────────────────────

const ACCOUNT = 'rGFBE8WA2ZKfqGGB7CFkLusVt7hsVT4r8H';
const ISSUER = 'rP9jPyP5kyvFRb6ZiRghAGw5u8SGAmU4bd';

const XRP_ASSET = { currency: 'XRP' };
const IOU_ASSET = { currency: 'TST', issuer: ISSUER };
const MPT_ASSET = { mpt_issuance_id: '00000001' };

const TF_LP_TOKEN = 0x00010000;
const TF_WITHDRAW_ALL = 0x00020000;
const TF_ONE_ASSET_WITHDRAW_ALL = 0x00040000;
const TF_SINGLE_ASSET = 0x00080000;
const TF_TWO_ASSET = 0x00100000;
const TF_ONE_ASSET_LP_TOKEN = 0x00200000;
const TF_LIMIT_LP_TOKEN = 0x00400000;

function make(extras: Record<string, unknown> = {}) {
  return ammWithdraw({
    Account: ACCOUNT,
    Asset: XRP_ASSET,
    Asset2: IOU_ASSET,
    Flags: TF_LP_TOKEN,
    LPTokenIn: {
      currency: 'B3813FCAB4EE68B3D0D735D6849465A9113EE048',
      issuer: 'rH438jEAzTs5PYtV6CHZqpDpwCKQmPW9Cg',
      value: '1000',
    },
    ...extras,
  });
}

describe('fp/ammWithdraw()', () => {
  describe('construction', () => {
    it('constructs with required fields only (Account, Asset, Asset2, Flags)', () => {
      const tx = ammWithdraw({
        Account: ACCOUNT,
        Asset: XRP_ASSET,
        Asset2: IOU_ASSET,
        Flags: TF_WITHDRAW_ALL,
      });
      expect(tx.TransactionType).toBe('AMMWithdraw');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.Asset).toEqual(XRP_ASSET);
      expect(tx.Asset2).toEqual(IOU_ASSET);
      expect(tx.Amount).toBeUndefined();
      expect(tx.Amount2).toBeUndefined();
      expect(tx.EPrice).toBeUndefined();
      expect(tx.LPTokenIn).toBeUndefined();
    });

    it('accepts each of the three Currency forms for Asset and Asset2', () => {
      const variants: ReadonlyArray<{ asset: Currency, asset2: Currency }> = [
        { asset: XRP_ASSET, asset2: IOU_ASSET },
        { asset: IOU_ASSET, asset2: XRP_ASSET },
        { asset: MPT_ASSET, asset2: IOU_ASSET },
        { asset: IOU_ASSET, asset2: MPT_ASSET },
      ];
      for (const { asset, asset2 } of variants) {
        const tx = ammWithdraw({
          Account: ACCOUNT,
          Asset: asset,
          Asset2: asset2,
          Flags: TF_WITHDRAW_ALL,
        });
        expect(tx.Asset).toEqual(asset);
        expect(tx.Asset2).toEqual(asset2);
      }
    });

    it('accepts Amount as XRP drops string (tfSingleAsset)', () => {
      const tx = ammWithdraw({
        Account: ACCOUNT,
        Asset: XRP_ASSET,
        Asset2: IOU_ASSET,
        Amount: '1000',
        Flags: TF_SINGLE_ASSET,
      });
      expect(tx.Amount).toBe('1000');
    });

    it('accepts Amount + Amount2 (tfTwoAsset)', () => {
      const tx = ammWithdraw({
        Account: ACCOUNT,
        Asset: XRP_ASSET,
        Asset2: IOU_ASSET,
        Amount: '1000',
        Amount2: { currency: 'TST', issuer: ISSUER, value: '2.5' },
        Flags: TF_TWO_ASSET,
      });
      expect(tx.Amount).toBe('1000');
      expect(tx.Amount2).toEqual({
        currency: 'TST',
        issuer: ISSUER,
        value: '2.5',
      });
    });

    it('accepts Amount + LPTokenIn (tfOneAssetLPToken)', () => {
      const lpTokenIn = {
        currency: 'B3813FCAB4EE68B3D0D735D6849465A9113EE048',
        issuer: 'rH438jEAzTs5PYtV6CHZqpDpwCKQmPW9Cg',
        value: '500',
      };
      const tx = ammWithdraw({
        Account: ACCOUNT,
        Asset: XRP_ASSET,
        Asset2: IOU_ASSET,
        Amount: '100',
        LPTokenIn: lpTokenIn,
        Flags: TF_ONE_ASSET_LP_TOKEN,
      });
      expect(tx.LPTokenIn).toEqual(lpTokenIn);
    });

    it('accepts Amount + EPrice (tfLimitLPToken)', () => {
      const tx = ammWithdraw({
        Account: ACCOUNT,
        Asset: XRP_ASSET,
        Asset2: IOU_ASSET,
        Amount: '100',
        EPrice: '25',
        Flags: TF_LIMIT_LP_TOKEN,
      });
      expect(tx.EPrice).toBe('25');
    });

    it('passes through Fee / Sequence', () => {
      const tx = ammWithdraw({
        Account: ACCOUNT,
        Asset: XRP_ASSET,
        Asset2: IOU_ASSET,
        Flags: TF_WITHDRAW_ALL,
        Fee: '12',
        Sequence: 7,
      });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(7);
    });

    it('accepts an AMMWithdrawFlagsInterface object for Flags', () => {
      const tx = ammWithdraw({
        Account: ACCOUNT,
        Asset: XRP_ASSET,
        Asset2: IOU_ASSET,
        Flags: { tfSingleAsset: true } as const,
      });
      // The factory doesn't persist the object form — it carries the
      // original props through. We check the numeric Flags was not
      // pre-materialised; toJSON would strip the undefined
      // intermediate object. Just verify construction succeeded.
      expect(tx.TransactionType).toBe('AMMWithdraw');
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        ammWithdraw({
          Account: undefined as never,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          Flags: TF_WITHDRAW_ALL,
        }),
      ).toThrow(/Account/);
    });

    it('throws on invalid Account', () => {
      expect(() =>
        ammWithdraw({
          Account: 'not-an-address',
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          Flags: TF_WITHDRAW_ALL,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('Asset / Asset2 validation', () => {
    it('throws on missing Asset', () => {
      expect(() =>
        ammWithdraw({
          Account: ACCOUNT,
          Asset: undefined as never,
          Asset2: IOU_ASSET,
          Flags: TF_WITHDRAW_ALL,
        }),
      ).toThrow(/Asset/);
    });

    it('throws when Asset is not a Currency (e.g. number)', () => {
      expect(() =>
        ammWithdraw({
          Account: ACCOUNT,
          Asset: 1234 as never,
          Asset2: IOU_ASSET,
          Flags: TF_WITHDRAW_ALL,
        }),
      ).toThrow(/Asset must be a valid Currency/);
    });

    it('throws when Asset is a bare object with no currency / mpt_issuance_id', () => {
      expect(() =>
        ammWithdraw({
          Account: ACCOUNT,
          Asset: { foo: 'bar' } as never,
          Asset2: IOU_ASSET,
          Flags: TF_WITHDRAW_ALL,
        }),
      ).toThrow(/Asset must be a valid Currency/);
    });

    it('throws on missing Asset2', () => {
      expect(() =>
        ammWithdraw({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: undefined as never,
          Flags: TF_WITHDRAW_ALL,
        }),
      ).toThrow(/Asset2/);
    });

    it('throws when Asset2 is not a Currency', () => {
      expect(() =>
        ammWithdraw({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: 1234 as never,
          Flags: TF_WITHDRAW_ALL,
        }),
      ).toThrow(/Asset2 must be a valid Currency/);
    });
  });

  describe('Amount / Amount2 / EPrice validation', () => {
    it('throws when Amount is not a valid Amount', () => {
      expect(() =>
        ammWithdraw({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          Amount: 1234 as never,
          Flags: TF_SINGLE_ASSET,
        }),
      ).toThrow(/Amount must be a valid Amount/);
    });

    it('throws when Amount2 is not a valid Amount', () => {
      expect(() =>
        ammWithdraw({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          Amount: '1000',
          Amount2: 1234 as never,
          Flags: TF_TWO_ASSET,
        }),
      ).toThrow(/Amount2 must be a valid Amount/);
    });

    it('throws on Amount2 without Amount (XLS-0030 §2.4.2.3)', () => {
      expect(() =>
        ammWithdraw({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          Amount2: { currency: 'TST', issuer: ISSUER, value: '2.5' },
          Flags: TF_TWO_ASSET,
        }),
      ).toThrow(/Amount2 requires Amount/);
    });

    it('throws when EPrice is not a valid Amount', () => {
      expect(() =>
        ammWithdraw({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          Amount: '100',
          EPrice: 1234 as never,
          Flags: TF_LIMIT_LP_TOKEN,
        }),
      ).toThrow(/EPrice must be a valid Amount/);
    });

    it('throws on EPrice without Amount (XLS-0030 §2.4.2.3)', () => {
      expect(() =>
        ammWithdraw({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          EPrice: '25',
          Flags: TF_LIMIT_LP_TOKEN,
        }),
      ).toThrow(/EPrice requires Amount/);
    });
  });

  describe('LPTokenIn validation', () => {
    it('throws when LPTokenIn is not an IssuedCurrencyAmount (number)', () => {
      expect(() =>
        ammWithdraw({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          LPTokenIn: 1234 as never,
          Flags: TF_LP_TOKEN,
        }),
      ).toThrow(/LPTokenIn must be an IssuedCurrencyAmount/);
    });

    it('throws when LPTokenIn is an MPTAmount (LP tokens are never MPT)', () => {
      expect(() =>
        ammWithdraw({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          LPTokenIn: { mpt_issuance_id: '00000001', value: '500' } as never,
          Flags: TF_LP_TOKEN,
        }),
      ).toThrow(/LPTokenIn must be an IssuedCurrencyAmount/);
    });

    it('throws when LPTokenIn is an XRP drops string (LP tokens are never XRP)', () => {
      expect(() =>
        ammWithdraw({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          LPTokenIn: '500' as never,
          Flags: TF_LP_TOKEN,
        }),
      ).toThrow(/LPTokenIn must be an IssuedCurrencyAmount/);
    });

    it('throws when LPTokenIn is an IOU object missing the issuer', () => {
      expect(() =>
        ammWithdraw({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          LPTokenIn: { currency: 'TST', value: '500' } as never,
          Flags: TF_LP_TOKEN,
        }),
      ).toThrow(/LPTokenIn must be an IssuedCurrencyAmount/);
    });
  });

  describe('Flags validation (exactly one mode flag)', () => {
    it('throws when no AMM-withdraw mode flag is set', () => {
      expect(() =>
        ammWithdraw({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          Flags: 0,
        }),
      ).toThrow(/exactly one AMM-withdraw mode flag/);
    });

    it('throws when Flags is omitted', () => {
      expect(() =>
        ammWithdraw({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
        }),
      ).toThrow(/exactly one AMM-withdraw mode flag/);
    });

    it('throws when two AMM-withdraw mode flags are set simultaneously', () => {
      expect(() =>
        ammWithdraw({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          Flags: TF_LP_TOKEN | TF_WITHDRAW_ALL,
        }),
      ).toThrow(/got multiple/);
    });

    it('throws when three AMM-withdraw mode flags are set', () => {
      expect(() =>
        ammWithdraw({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          Flags: TF_SINGLE_ASSET | TF_TWO_ASSET | TF_LIMIT_LP_TOKEN,
        }),
      ).toThrow(/got multiple/);
    });

    it('accepts each of the seven mode flags individually', () => {
      const cases: ReadonlyArray<number> = [
        TF_LP_TOKEN,
        TF_WITHDRAW_ALL,
        TF_ONE_ASSET_WITHDRAW_ALL,
        TF_SINGLE_ASSET,
        TF_TWO_ASSET,
        TF_ONE_ASSET_LP_TOKEN,
        TF_LIMIT_LP_TOKEN,
      ];
      for (const flags of cases) {
        const tx = ammWithdraw({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          Flags: flags,
        });
        expect(tx.Flags).toBe(flags);
      }
    });

    it('accepts a mode flag OR-ed with the canonical tfFullyCanonicalSig global flag', () => {
      const TF_FULLY_CANONICAL_SIG = 0x80000000;
      // `>>> 0` is required: JS bitwise OR is signed 32-bit, so
      // 0x00010000 | 0x80000000 evaluates to a NEGATIVE number. Without the
      // coercion this test still passes — both sides use the same expression —
      // but it would be pinning a negative Flags value.
      const flags = (TF_LP_TOKEN | TF_FULLY_CANONICAL_SIG) >>> 0;
      const tx = ammWithdraw({
        Account: ACCOUNT,
        Asset: XRP_ASSET,
        Asset2: IOU_ASSET,
        Flags: flags,
      });
      expect(tx.Flags).toBe(0x80010000);
    });
  });

  // rippled applies MEMBERSHIP before CARDINALITY: `getFlagsMask` returns
  // `tfAMMWithdrawMask` = `~(tfUniversal | the seven withdraw flags)`
  // (TxFlags.h:264-266, 178-186, 43-46) and answers `temINVALID_FLAG` for any
  // bit outside it. Counting modes alone cannot catch a bit that is legal
  // elsewhere in the AMM family but not here.
  describe('Flags membership (bit must be legal on AMMWithdraw)', () => {
    const TF_TWO_ASSET_IF_EMPTY = 0x00800000; // an AMMDeposit-only mode

    it('rejects a deposit-only bit, even alongside a valid mode', () => {
      expect(() =>
        ammWithdraw({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          Flags: TF_SINGLE_ASSET | TF_TWO_ASSET_IF_EMPTY,
        }),
      ).toThrow(/not valid for this transaction type/);
    });

    it('rejects a lone deposit-only bit', () => {
      expect(() =>
        ammWithdraw({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          Flags: TF_TWO_ASSET_IF_EMPTY,
        }),
      ).toThrow(/not valid for this transaction type/);
    });

    it('rejects a bit that is neither a mode nor universal', () => {
      expect(() =>
        ammWithdraw({
          Account: ACCOUNT,
          Asset: XRP_ASSET,
          Asset2: IOU_ASSET,
          Flags: TF_SINGLE_ASSET | 0x00000002,
        }),
      ).toThrow(/not valid for this transaction type/);
    });

    it('accepts tfInnerBatchTxn, the other universal flag', () => {
      const flags = (TF_SINGLE_ASSET | 0x40000000) >>> 0;
      const tx = ammWithdraw({
        Account: ACCOUNT,
        Asset: XRP_ASSET,
        Asset2: IOU_ASSET,
        Flags: flags,
      });
      expect(tx.Flags).toBe(0x40080000);
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
        (tx as unknown as Record<string, unknown>).Asset = XRP_ASSET;
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      const tx = make({ Amount: '100' });
      const tx2 = tx.with({ Amount: '200' });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Amount).toBe('200');
      expect(tx.Amount).toBe('100');
    });

    it('.with() re-validates on overrides (invalid Asset)', () => {
      const tx = make();
      expect(() => tx.with({ Asset: 1234 as never })).toThrow(
        /Asset must be a valid Currency/,
      );
    });

    it('.with() re-validates on overrides (Amount2 without Amount)', () => {
      const tx = make();
      expect(() =>
        tx.with({
          Amount: undefined,
          Amount2: { currency: 'TST', issuer: ISSUER, value: '1' },
        }),
      ).toThrow(/Amount2 requires Amount/);
    });

    it('.with() re-validates on overrides (two mode flags)', () => {
      const tx = make();
      expect(() =>
        tx.with({ Flags: TF_LP_TOKEN | TF_WITHDRAW_ALL }),
      ).toThrow(/got multiple/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = ammWithdraw({
        Account: ACCOUNT,
        Asset: XRP_ASSET,
        Asset2: IOU_ASSET,
        Amount: '5000000',
        LPTokenIn: {
          currency: 'B3813FCAB4EE68B3D0D735D6849465A9113EE048',
          issuer: 'rH438jEAzTs5PYtV6CHZqpDpwCKQmPW9Cg',
          value: '7',
        },
        Flags: TF_LP_TOKEN,
        Fee: '12',
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'AMMWithdraw',
        Account: ACCOUNT,
        Asset: XRP_ASSET,
        Asset2: IOU_ASSET,
        Amount: '5000000',
        LPTokenIn: {
          currency: 'B3813FCAB4EE68B3D0D735D6849465A9113EE048',
          issuer: 'rH438jEAzTs5PYtV6CHZqpDpwCKQmPW9Cg',
          value: '7',
        },
        Flags: TF_LP_TOKEN,
        Fee: '12',
      });
    });

    it('.toJSON() skips undefined fields and methods', () => {
      const tx = ammWithdraw({
        Account: ACCOUNT,
        Asset: XRP_ASSET,
        Asset2: IOU_ASSET,
        Flags: TF_WITHDRAW_ALL,
      });
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('Amount' in json).toBe(false);
      expect('Amount2' in json).toBe(false);
      expect('EPrice' in json).toBe(false);
      expect('LPTokenIn' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op after construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });

    it('AmmWithdraw type narrows the TransactionType literal', () => {
      const tx: AmmWithdraw = make();
      // The literal-narrowing check happens at compile-time; this
      // assertion gives the test a runtime check that the discriminator
      // is correct.
      expect(tx.TransactionType).toBe('AMMWithdraw');
    });
  });

  // ─── Base transaction fields ──────────────────────────────────────────────
  // The props type extends `BasePropsFields`, so the seven shared base fields
  // are part of the type surface. The factory now CALLS
  // `validateBaseTransaction` as its final check, immediately before
  // `buildFrozenTx` and after every AMMWithdraw-specific check, so the reject
  // cases below reach the shared validator's messages — and a more specific
  // mistake (e.g. a bad Flags mode) still produces the AMMWithdraw message.
  describe('BaseTransactionFields', () => {
    const base = {
      Account: ACCOUNT,
      Asset: XRP_ASSET,
      Asset2: IOU_ASSET,
      Flags: TF_LP_TOKEN,
      LPTokenIn: {
        currency: 'B3813FCAB4EE68B3D0D735D6849465A9113EE048',
        issuer: 'rH438jEAzTs5PYtV6CHZqpDpwCKQmPW9Cg',
        value: '1000',
      },
    };
    const MEMOS = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
    const TXN_ID = 'AB'.repeat(32);

    it('accepts Memos', () => {
      const tx = ammWithdraw({ ...base, Memos: MEMOS });
      expect(tx.Memos).toEqual(MEMOS);
      expect(tx.toJSON().Memos).toEqual(MEMOS);
    });

    it('rejects a malformed Memos value', () => {
      expect(() => ammWithdraw({ ...base, Memos: 'not-an-array' } as any)).toThrow(
        /invalid Memos/,
      );
    });

    it('accepts SourceTag', () => {
      const tx = ammWithdraw({ ...base, SourceTag: 99 });
      expect(tx.SourceTag).toBe(99);
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() => ammWithdraw({ ...base, SourceTag: 'NaN' } as any)).toThrow(
        /SourceTag must be a number/,
      );
    });

    it('accepts LastLedgerSequence', () => {
      const tx = ammWithdraw({ ...base, LastLedgerSequence: 1_000_000 });
      expect(tx.LastLedgerSequence).toBe(1_000_000);
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() =>
        ammWithdraw({ ...base, LastLedgerSequence: 'soon' } as any),
      ).toThrow(/LastLedgerSequence must be a number/);
    });

    it('accepts AccountTxnID', () => {
      const tx = ammWithdraw({ ...base, AccountTxnID: TXN_ID });
      expect(tx.AccountTxnID).toBe(TXN_ID);
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() => ammWithdraw({ ...base, AccountTxnID: 12345 } as any)).toThrow(
        /AccountTxnID must be a string/,
      );
    });

    it('accepts NetworkID', () => {
      const tx = ammWithdraw({ ...base, NetworkID: 1 });
      expect(tx.NetworkID).toBe(1);
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() => ammWithdraw({ ...base, NetworkID: {} } as any)).toThrow(
        /NetworkID must be a number/,
      );
    });

    it('accepts a Delegate distinct from Account', () => {
      const tx = ammWithdraw({ ...base, Delegate: ISSUER });
      expect(tx.Delegate).toBe(ISSUER);
    });

    it('rejects a Delegate that is not a valid address', () => {
      expect(() => ammWithdraw({ ...base, Delegate: 'not-an-address' } as any)).toThrow(
        /invalid Delegate/,
      );
    });

    it('rejects Delegate equal to Account', () => {
      expect(() => ammWithdraw({ ...base, Delegate: ACCOUNT })).toThrow(
        /cannot be the same/,
      );
    });

    it('accepts TicketSequence alongside Sequence: 0', () => {
      const tx = ammWithdraw({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.TicketSequence).toBe(42);
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() => ammWithdraw({ ...base, TicketSequence: 'nope' } as any)).toThrow(
        /TicketSequence must be a number/,
      );
    });

    it('rejects a non-string Fee', () => {
      expect(() => ammWithdraw({ ...base, Fee: 12 } as any)).toThrow(
        /Fee must be a string/,
      );
    });
  });
});