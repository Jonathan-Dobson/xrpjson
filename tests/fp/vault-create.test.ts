/**
 * Tests for the functional VaultCreate factory.
 *
 * Validates:
 *   1. Construction with required fields and all 3 Asset forms (XRP, IOU, MPT).
 *   2. Optional field validation (Data, MPTokenMetadata, WithdrawalPolicy,
 *      AssetsMaximum, VaultKind, Scale, DomainID, lifecycle dates).
 *   3. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined).
 *   4. Closed-ended vault lifecycle invariants.
 *   5. DomainID ↔ tfVaultPrivate flag coupling.
 */
import { describe, it, expect } from 'vitest';
import { vaultCreate } from '../../src/fp/index.js';

const OWNER = 'rNGHoQwNG753zyfDrib4qDvvswtmV8Es';
const ISSUER = 'rXJSJiZMxaLuH3kQBUV5DLipnYtrE6iVb';

const XRP_ASSET = { currency: 'XRP' };
const IOU_ASSET = { currency: 'USD', issuer: ISSUER };
const MPT_ASSET = { mpt_issuance_id: '00000001' };

function make(
  asset: Record<string, unknown> = IOU_ASSET,
  extras: Record<string, unknown> = {},
) {
  return vaultCreate({
    Account: OWNER,
    Asset: asset as never,
    ...extras,
  });
}

describe('fp/vaultCreate()', () => {
  describe('construction', () => {
    it('constructs with required Asset only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('VaultCreate');
      expect(tx.Asset).toEqual(IOU_ASSET);
    });

    it('accepts all 3 Asset forms (XRP, trust line, MPT)', () => {
      expect(make(XRP_ASSET).Asset).toEqual(XRP_ASSET);
      expect(make(IOU_ASSET).Asset).toEqual(IOU_ASSET);
      expect(make(MPT_ASSET).Asset).toEqual(MPT_ASSET);
    });

    it('accepts all 10 spec fields + 2 flags', () => {
      const sub = Math.floor(Date.now() / 1000) + 1000;
      const red = sub + 3600;
      const tx = vaultCreate({
        Account: OWNER,
        Asset: IOU_ASSET,
        AssetsMaximum: '1000000',
        Data: '5661756C74206D65746164617461',
        DomainID:
          'A730EB18A9D4BB52502C898589558B4CCEB4BE10044500EE5581137A2E80E849',
        MPTokenMetadata: '7B2274797065223A2274657374227D',
        Scale: 6,
        VaultKind: 1,
        SubscriptionDate: sub,
        RedemptionDate: red,
        WithdrawalPolicy: 0x0001,
        Flags: 0x00010000 | 0x00020000, // tfVaultPrivate | tfVaultShareNonTransferable
      });
      expect(tx.VaultKind).toBe(1);
      expect(tx.Scale).toBe(6);
      expect(tx.AssetsMaximum).toBe('1000000');
      expect(tx.WithdrawalPolicy).toBe(0x0001);
      const flags = tx.Flags as number;
      expect(flags & 0x00010000).toBe(0x00010000);
      expect(flags & 0x00020000).toBe(0x00020000);
    });
  });

  describe('Asset validation', () => {
    it('throws when Asset is missing', () => {
      expect(() =>
        vaultCreate({ Account: OWNER, Asset: undefined as never }),
      ).toThrow(/Asset/);
    });

    it('throws when Asset is invalid', () => {
      expect(() => make({ foo: 'bar' } as never)).toThrow(/Asset/);
    });
  });

  describe('Data validation', () => {
    it('throws on non-hex Data', () => {
      expect(() => make(IOU_ASSET, { Data: 'not-hex!' })).toThrow(/Data/);
    });

    it('throws on odd-length hex', () => {
      expect(() => make(IOU_ASSET, { Data: 'ABC' })).toThrow(/even/);
    });

    it('throws on Data > 256 bytes', () => {
      const huge = 'A'.repeat(514); // 514 hex chars = 257 bytes
      expect(() => make(IOU_ASSET, { Data: huge })).toThrow(/256/);
    });

    it('accepts Data at exactly 256 bytes', () => {
      const ok = 'A'.repeat(512); // 512 hex chars = 256 bytes
      const tx = make(IOU_ASSET, { Data: ok });
      expect(tx.Data).toBe(ok);
    });
  });

  describe('MPTokenMetadata validation', () => {
    it('throws on non-hex MPTokenMetadata', () => {
      expect(() => make(IOU_ASSET, { MPTokenMetadata: 'GG' })).toThrow(
        /MPTokenMetadata/,
      );
    });

    it('throws on MPTokenMetadata > 1024 bytes', () => {
      const huge = 'A'.repeat(2050);
      expect(() => make(IOU_ASSET, { MPTokenMetadata: huge })).toThrow(
        /1024/,
      );
    });
  });

  describe('WithdrawalPolicy validation', () => {
    it('throws on unsupported WithdrawalPolicy', () => {
      expect(() => make(IOU_ASSET, { WithdrawalPolicy: 0x0002 })).toThrow(
        /WithdrawalPolicy/,
      );
    });

    it('accepts 0x0001 (FCFS)', () => {
      const tx = make(IOU_ASSET, { WithdrawalPolicy: 0x0001 });
      expect(tx.WithdrawalPolicy).toBe(0x0001);
    });
  });

  describe('AssetsMaximum validation', () => {
    it('throws on negative AssetsMaximum', () => {
      expect(() => make(IOU_ASSET, { AssetsMaximum: '-1' })).toThrow(
        /AssetsMaximum/,
      );
    });

    it('throws on non-numeric AssetsMaximum', () => {
      expect(() => make(IOU_ASSET, { AssetsMaximum: 'abc' })).toThrow(
        /AssetsMaximum/,
      );
    });
  });

  describe('VaultKind validation', () => {
    it('throws on invalid VaultKind', () => {
      expect(() => make(IOU_ASSET, { VaultKind: 7 })).toThrow(/VaultKind/);
    });

    it('accepts 0 (open-ended)', () => {
      expect(make(IOU_ASSET, { VaultKind: 0 }).VaultKind).toBe(0);
    });

    it('accepts 1 (closed-ended) with both dates', () => {
      const sub = Math.floor(Date.now() / 1000) + 1000;
      const tx = make(IOU_ASSET, {
        VaultKind: 1,
        SubscriptionDate: sub,
        RedemptionDate: sub + 3600,
      });
      expect(tx.VaultKind).toBe(1);
    });
  });

  describe('Scale validation', () => {
    it('throws on Scale < 0', () => {
      expect(() => make(IOU_ASSET, { Scale: -1 })).toThrow(/Scale/);
    });

    it('throws on Scale > 18', () => {
      expect(() => make(IOU_ASSET, { Scale: 19 })).toThrow(/Scale/);
    });

    it('throws on non-integer Scale', () => {
      expect(() => make(IOU_ASSET, { Scale: 1.5 })).toThrow(/Scale/);
    });

    it('throws on Scale with XRP asset', () => {
      expect(() => make(XRP_ASSET, { Scale: 6 })).toThrow(
        /XRP or MPT/,
      );
    });

    it('throws on Scale with MPT asset', () => {
      expect(() => make(MPT_ASSET, { Scale: 6 })).toThrow(
        /XRP or MPT/,
      );
    });

    it('accepts Scale=0..18 for IOU asset', () => {
      const tx = make(IOU_ASSET, { Scale: 6 });
      expect(tx.Scale).toBe(6);
    });
  });

  describe('Closed-ended vault lifecycle', () => {
    it('throws when VaultKind=1 missing SubscriptionDate', () => {
      expect(() =>
        make(IOU_ASSET, { VaultKind: 1, RedemptionDate: 1000000 }),
      ).toThrow(/requires both/);
    });

    it('throws when VaultKind=1 missing RedemptionDate', () => {
      expect(() =>
        make(IOU_ASSET, { VaultKind: 1, SubscriptionDate: 1000000 }),
      ).toThrow(/requires both/);
    });

    it('throws when VaultKind=0 has dates', () => {
      expect(() =>
        make(IOU_ASSET, {
          VaultKind: 0,
          SubscriptionDate: 1000000,
          RedemptionDate: 1003600,
        }),
      ).toThrow(/must not include/);
    });

    it('throws when SubscriptionDate >= RedemptionDate', () => {
      const sub = Math.floor(Date.now() / 1000);
      expect(() =>
        make(IOU_ASSET, {
          VaultKind: 1,
          SubscriptionDate: sub + 3600,
          RedemptionDate: sub + 1000,
        }),
      ).toThrow(/RedemptionDate - SubscriptionDate/);
    });

    it('throws when gap < 180 seconds', () => {
      const sub = Math.floor(Date.now() / 1000);
      expect(() =>
        make(IOU_ASSET, {
          VaultKind: 1,
          SubscriptionDate: sub,
          RedemptionDate: sub + 100,
        }),
      ).toThrow(/\[180, 946708560\)/);
    });

    it('accepts valid closed-ended range', () => {
      const sub = Math.floor(Date.now() / 1000);
      const tx = make(IOU_ASSET, {
        VaultKind: 1,
        SubscriptionDate: sub,
        RedemptionDate: sub + 3600,
      });
      expect(tx.SubscriptionDate).toBe(sub);
      expect(tx.RedemptionDate).toBe(sub + 3600);
    });
  });

  describe('DomainID validation', () => {
    const VALID_DOMAIN =
      'A730EB18A9D4BB52502C898589558B4CCEB4BE10044500EE5581137A2E80E849';

    it('throws on non-hex DomainID', () => {
      expect(() =>
        make(IOU_ASSET, {
          DomainID: 'not-hex',
          Flags: 0x00010000,
        }),
      ).toThrow(/DomainID/);
    });

    it('throws on DomainID without tfVaultPrivate', () => {
      expect(() =>
        make(IOU_ASSET, { DomainID: VALID_DOMAIN }),
      ).toThrow(/tfVaultPrivate/);
    });

    it('accepts DomainID with tfVaultPrivate flag', () => {
      const tx = make(IOU_ASSET, {
        DomainID: VALID_DOMAIN,
        Flags: 0x00010000,
      });
      expect(tx.DomainID).toBe(VALID_DOMAIN);
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
        (tx as any).Asset = XRP_ASSET;
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides', () => {
      const tx = make();
      const tx2 = tx.with({ WithdrawalPolicy: 0x0001 });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.WithdrawalPolicy).toBe(0x0001);
      expect(tx.WithdrawalPolicy).toBeUndefined();
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() =>
        tx.with({ Data: 'not-hex' }),
      ).toThrow(/Data/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make(IOU_ASSET, { Scale: 6 });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'VaultCreate',
        Account: OWNER,
        Asset: IOU_ASSET,
        Scale: 6,
      });
    });

    it('.toJSON() skips undefined fields', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('Scale' in json).toBe(false);
      expect('Data' in json).toBe(false);
      expect('VaultKind' in json).toBe(false);
    });
  });

  // ─── Base transaction fields ─────────────────────────────────────────────
  // `VaultCreate`Props accepts the seven shared base fields and the factory now
  // calls `validateBaseTransaction`, so a malformed one is rejected at
  // construction instead of freezing a transaction that would fail at
  // submit. Values below are chosen to be VALID under src/validation/base.ts.
  describe('BaseTransactionFields', () => {
    const base = {
      Account: OWNER,
      Asset: IOU_ASSET as never,
    };
    const MEMOS = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
    const TXN_ID = 'AB'.repeat(32);
    // A valid classic address distinct from `base.Account`.
    const DELEGATE = ISSUER;

    it('accepts Memos', () => {
      const tx = vaultCreate({ ...base, Memos: MEMOS });
      expect(tx.toJSON().Memos).toEqual(MEMOS);
    });

    it('accepts SourceTag', () => {
      const tx = vaultCreate({ ...base, SourceTag: 99 });
      expect(tx.toJSON().SourceTag).toBe(99);
    });

    it('accepts LastLedgerSequence', () => {
      const tx = vaultCreate({ ...base, LastLedgerSequence: 1_000_000 });
      expect(tx.toJSON().LastLedgerSequence).toBe(1_000_000);
    });

    it('accepts AccountTxnID', () => {
      const tx = vaultCreate({ ...base, AccountTxnID: TXN_ID });
      expect(tx.toJSON().AccountTxnID).toBe(TXN_ID);
    });

    it('accepts NetworkID', () => {
      const tx = vaultCreate({ ...base, NetworkID: 1 });
      expect(tx.toJSON().NetworkID).toBe(1);
    });

    it('accepts a Delegate distinct from Account', () => {
      const tx = vaultCreate({ ...base, Delegate: DELEGATE });
      expect(tx.toJSON().Delegate).toBe(DELEGATE);
    });

    it('accepts TicketSequence alongside Sequence: 0', () => {
      const tx = vaultCreate({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    // ── Reject side ── the runtime backstop. Before the
    // `validateBaseTransaction` call landed, every case below built a frozen
    // transaction silently. The bad values are cast `as any` on purpose: the
    // point under test is the runtime check, and a type error would make the
    // test uncompilable.
    it('rejects a malformed Memos value', () => {
      expect(() => vaultCreate({ ...base, Memos: 'not-an-array' } as any)).toThrow(/invalid Memos/);
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() => vaultCreate({ ...base, SourceTag: 'NaN' } as any)).toThrow(
        /SourceTag must be a number/,
      );
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() => vaultCreate({ ...base, LastLedgerSequence: 'soon' } as any)).toThrow(
        /LastLedgerSequence must be a number/,
      );
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() => vaultCreate({ ...base, AccountTxnID: 99 } as any)).toThrow(
        /AccountTxnID must be a string/,
      );
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() => vaultCreate({ ...base, NetworkID: {} } as any)).toThrow(/NetworkID must be a number/);
    });

    it('rejects a Delegate that is not a valid address', () => {
      expect(() => vaultCreate({ ...base, Delegate: 'not-an-address' } as any)).toThrow(
        /invalid Delegate/,
      );
    });

    it('rejects a Delegate equal to Account', () => {
      expect(() => vaultCreate({ ...base, Delegate: OWNER } as any)).toThrow(/cannot be the same/);
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() => vaultCreate({ ...base, TicketSequence: 'nope' } as any)).toThrow(
        /TicketSequence must be a number/,
      );
    });

    it('rejects a non-string Fee', () => {
      expect(() => vaultCreate({ ...base, Fee: 12 } as any)).toThrow(/Fee must be a string/);
    });
  });
});