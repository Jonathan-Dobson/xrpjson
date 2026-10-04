/**
 * Tests for the functional VaultSet factory.
 *
 * Validates:
 *   1. Construction with required Account + VaultID + at least one of
 *      Data/AssetsMaximum/DomainID.
 *   2. Optional field handling (Data, AssetsMaximum, DomainID, Flags,
 *      Fee, Sequence).
 *   3. Spec-mandated guards the class API omits:
 *        a. VaultID must not be all-zeros (XLS-65 §3.3.2.1 check 1).
 *        b. At least one mutable field must be provided (XLS-65 §3.3.2.1
 *           check 4).
 *        c. Data must be non-empty (XLS-65 §3.3.2.1 check 2).
 *        d. DomainID all-zeros is accepted to mean "remove DomainID"
 *           (XLS-65 §3.3.3 state change 3).
 *   4. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined fields).
 */
import { describe, it, expect } from 'vitest';
import { vaultSet } from '../../src/fp/index.js';

const OWNER = 'rNGHoQwNG753zyfDrib4qDvvswtmV8Es';

// 64-char hex non-zero HASH256 ledger entry ID.
const VAULT_ID =
  '77D6234D074E505024D39C04C3F262997B773719AB29ACFA83119E4210328776';
// 64-char hex non-zero HASH256 (used as DomainID elsewhere in tests).
const DOMAIN_ID =
  'A730EB18A9D4BB52502C898589558B4CCEB4BE10044500EE5581137A2E80E849';
// The spec-reserved all-zeros HASH256.
const HASH256_ZERO =
  '0000000000000000000000000000000000000000000000000000000000000000';

function make(extras: Record<string, unknown> = {}) {
  return vaultSet({
    Account: OWNER,
    VaultID: VAULT_ID,
    Data: '5661756C74206D65746164617461', // "Vault metadata"
    ...extras,
  });
}

describe('fp/vaultSet()', () => {
  describe('construction', () => {
    it('constructs with Account + VaultID + Data', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('VaultSet');
      expect(tx.Account).toBe(OWNER);
      expect(tx.VaultID).toBe(VAULT_ID);
      expect(tx.Data).toBe('5661756C74206D65746164617461');
    });

    it('constructs with only AssetsMaximum supplied', () => {
      const tx = vaultSet({
        Account: OWNER,
        VaultID: VAULT_ID,
        AssetsMaximum: '5000000',
      });
      expect(tx.AssetsMaximum).toBe('5000000');
      expect(tx.Data).toBeUndefined();
      expect(tx.DomainID).toBeUndefined();
    });

    it('constructs with only DomainID supplied', () => {
      const tx = vaultSet({
        Account: OWNER,
        VaultID: VAULT_ID,
        DomainID: DOMAIN_ID,
      });
      expect(tx.DomainID).toBe(DOMAIN_ID);
      expect(tx.Data).toBeUndefined();
      expect(tx.AssetsMaximum).toBeUndefined();
    });

    it('passes through optional Fee/Sequence/Flags', () => {
      const tx = vaultSet({
        Account: OWNER,
        VaultID: VAULT_ID,
        Data: 'AB',
        Flags: 0,
        Fee: '12',
        Sequence: 8,
      });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(8);
      expect(tx.Flags).toBe(0);
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        vaultSet({
          Account: '' as never,
          VaultID: VAULT_ID,
          Data: 'AB',
        }),
      ).toThrow(/Account/);
    });
  });

  describe('VaultID validation', () => {
    it('throws on missing VaultID', () => {
      expect(() =>
        vaultSet({
          Account: OWNER,
          VaultID: '' as never,
          Data: 'AB',
        }),
      ).toThrow(/VaultID/);
    });

    it('throws on non-hex VaultID', () => {
      expect(() =>
        vaultSet({
          Account: OWNER,
          VaultID: 'Z'.repeat(64),
          Data: 'AB',
        }),
      ).toThrow(/VaultID/);
    });

    it('throws on VaultID of wrong length', () => {
      expect(() =>
        vaultSet({
          Account: OWNER,
          VaultID: 'AB',
          Data: 'AB',
        }),
      ).toThrow(/VaultID/);
    });

    it('throws on the all-zeros HASH256 VaultID (XLS-65 §3.3.2.1 check 1)', () => {
      expect(() =>
        vaultSet({
          Account: OWNER,
          VaultID: HASH256_ZERO,
          Data: 'AB',
        }),
      ).toThrow(/all-zeros/);
    });
  });

  describe('at-least-one-mutable-field rule', () => {
    it('throws when Data, AssetsMaximum, DomainID are all absent (XLS-65 §3.3.2.1 check 4)', () => {
      expect(() =>
        vaultSet({ Account: OWNER, VaultID: VAULT_ID }),
      ).toThrow(/at least one of/);
    });

    it('accepts a tx that supplies only Data', () => {
      const tx = vaultSet({
        Account: OWNER,
        VaultID: VAULT_ID,
        Data: 'AB',
      });
      expect(tx.Data).toBe('AB');
    });

    it('accepts a tx that supplies only AssetsMaximum', () => {
      const tx = vaultSet({
        Account: OWNER,
        VaultID: VAULT_ID,
        AssetsMaximum: '1000',
      });
      expect(tx.AssetsMaximum).toBe('1000');
    });

    it('accepts a tx that supplies only DomainID', () => {
      const tx = vaultSet({
        Account: OWNER,
        VaultID: VAULT_ID,
        DomainID: DOMAIN_ID,
      });
      expect(tx.DomainID).toBe(DOMAIN_ID);
    });
  });

  describe('Data validation', () => {
    it('throws on non-hex Data', () => {
      expect(() =>
        vaultSet({
          Account: OWNER,
          VaultID: VAULT_ID,
          Data: 'not-hex!',
        }),
      ).toThrow(/Data/);
    });

    it('throws on empty Data (XLS-65 §3.3.2.1 check 2)', () => {
      expect(() =>
        vaultSet({
          Account: OWNER,
          VaultID: VAULT_ID,
          Data: '',
        }),
      ).toThrow(/Data/);
    });

    it('throws on odd-length hex Data', () => {
      expect(() =>
        vaultSet({
          Account: OWNER,
          VaultID: VAULT_ID,
          Data: 'ABC',
        }),
      ).toThrow(/even/);
    });

    it('throws on Data > 256 bytes', () => {
      const huge = 'A'.repeat(514); // 514 hex chars = 257 bytes
      expect(() =>
        vaultSet({
          Account: OWNER,
          VaultID: VAULT_ID,
          Data: huge,
        }),
      ).toThrow(/256/);
    });

    it('accepts Data at exactly 256 bytes', () => {
      const ok = 'A'.repeat(512); // 512 hex chars = 256 bytes
      const tx = vaultSet({
        Account: OWNER,
        VaultID: VAULT_ID,
        Data: ok,
      });
      expect(tx.Data).toBe(ok);
    });

    it('accepts Data of exactly 1 byte', () => {
      const tx = vaultSet({
        Account: OWNER,
        VaultID: VAULT_ID,
        Data: 'FF',
      });
      expect(tx.Data).toBe('FF');
    });
  });

  describe('AssetsMaximum validation', () => {
    it('throws on negative AssetsMaximum (XLS-65 §3.3.2.1 check 3)', () => {
      expect(() =>
        vaultSet({
          Account: OWNER,
          VaultID: VAULT_ID,
          AssetsMaximum: '-1',
        }),
      ).toThrow(/AssetsMaximum/);
    });

    it('throws on non-numeric AssetsMaximum', () => {
      expect(() =>
        vaultSet({
          Account: OWNER,
          VaultID: VAULT_ID,
          AssetsMaximum: 'abc',
        }),
      ).toThrow(/AssetsMaximum/);
    });

    it('throws on decimal AssetsMaximum', () => {
      expect(() =>
        vaultSet({
          Account: OWNER,
          VaultID: VAULT_ID,
          AssetsMaximum: '1.5',
        }),
      ).toThrow(/AssetsMaximum/);
    });

    it('accepts AssetsMaximum = "0" (special meaning per spec)', () => {
      const tx = vaultSet({
        Account: OWNER,
        VaultID: VAULT_ID,
        AssetsMaximum: '0',
      });
      expect(tx.AssetsMaximum).toBe('0');
    });

    it('accepts AssetsMaximum = "1000000"', () => {
      const tx = vaultSet({
        Account: OWNER,
        VaultID: VAULT_ID,
        AssetsMaximum: '1000000',
      });
      expect(tx.AssetsMaximum).toBe('1000000');
    });
  });

  describe('DomainID validation', () => {
    it('throws on non-hex DomainID', () => {
      expect(() =>
        vaultSet({
          Account: OWNER,
          VaultID: VAULT_ID,
          DomainID: 'not-hex',
        }),
      ).toThrow(/DomainID/);
    });

    it('throws on DomainID of wrong length', () => {
      expect(() =>
        vaultSet({
          Account: OWNER,
          VaultID: VAULT_ID,
          DomainID: 'AB',
        }),
      ).toThrow(/DomainID/);
    });

    it('throws on non-string DomainID', () => {
      expect(() =>
        vaultSet({
          Account: OWNER,
          VaultID: VAULT_ID,
          DomainID: 1234 as never,
        }),
      ).toThrow(/DomainID/);
    });

    it('accepts a 64-char hex DomainID', () => {
      const tx = vaultSet({
        Account: OWNER,
        VaultID: VAULT_ID,
        DomainID: DOMAIN_ID,
      });
      expect(tx.DomainID).toBe(DOMAIN_ID);
    });

    it('accepts the all-zeros DomainID to remove any existing DomainID (XLS-65 §3.3.3 state change 3)', () => {
      const tx = vaultSet({
        Account: OWNER,
        VaultID: VAULT_ID,
        DomainID: HASH256_ZERO,
      });
      expect(tx.DomainID).toBe(HASH256_ZERO);
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
        (tx as unknown as Record<string, unknown>).VaultID = 'deadbeef';
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      const tx = make();
      const tx2 = tx.with({ Data: '00' });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Data).toBe('00');
      expect(tx.Data).toBe('5661756C74206D65746164617461');
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() => tx.with({ VaultID: HASH256_ZERO })).toThrow(/all-zeros/);
      expect(() => tx.with({ Data: 'not-hex' })).toThrow(/Data/);
      expect(() => tx.with({ AssetsMaximum: '-1' })).toThrow(/AssetsMaximum/);
      // Overriding Data to undefined strips every mutable field and must
      // therefore fail the at-least-one check on re-validation.
      expect(() => tx.with({ Data: undefined })).toThrow(
        /at least one of/,
      );
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = vaultSet({
        Account: OWNER,
        VaultID: VAULT_ID,
        Data: 'AB',
        AssetsMaximum: '500',
        Fee: '12',
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'VaultSet',
        Account: OWNER,
        VaultID: VAULT_ID,
        Data: 'AB',
        AssetsMaximum: '500',
        Fee: '12',
      });
    });

    it('.toJSON() skips undefined fields and methods', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('AssetsMaximum' in json).toBe(false);
      expect('DomainID' in json).toBe(false);
      expect('Flags' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op after construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });

  // ─── Base transaction fields ──────────────────────────────────────────────
  // `vaultSet` now calls `validateBaseTransaction` as a backstop, placed after
  // its own VaultSet-specific checks (payment.ts:123 is the reference). Before
  // that call, every REJECT case below built a frozen transaction silently.
  //
  // `VaultSetProps` does not yet extend `BasePropsFields`, so the seven shared
  // fields are not on this props type yet — which is why the `as any` casts
  // appear on the ACCEPT cases too, not only the reject ones. That is the type
  // half of the same bug; without the casts these would not compile.
  describe('BaseTransactionFields', () => {
    const base = {
      Account: OWNER,
      VaultID: VAULT_ID,
      // VaultSet requires at least one of Data / AssetsMaximum / DomainID;
      // without it the factory's own check throws before the base validator.
      Data: '5661756C74206D65746164617461', // "Vault metadata"
    };
    // A valid classic address distinct from OWNER.
    const DELEGATE = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
    const MEMOS = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
    const TXN_ID = 'AB'.repeat(32);

    it('accepts Memos', () => {
      const tx = vaultSet({ ...base, Memos: MEMOS } as any);
      expect(tx.toJSON().Memos).toEqual(MEMOS);
    });

    it('rejects a malformed Memos value', () => {
      expect(() => vaultSet({ ...base, Memos: 'not-an-array' } as any)).toThrow(
        /invalid Memos/,
      );
    });

    it('accepts SourceTag', () => {
      const tx = vaultSet({ ...base, SourceTag: 99 } as any);
      expect(tx.toJSON().SourceTag).toBe(99);
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() => vaultSet({ ...base, SourceTag: 'NaN' } as any)).toThrow(
        /SourceTag must be a number/,
      );
    });

    it('accepts LastLedgerSequence', () => {
      const tx = vaultSet({ ...base, LastLedgerSequence: 1_000_000 } as any);
      expect(tx.toJSON().LastLedgerSequence).toBe(1_000_000);
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() =>
        vaultSet({ ...base, LastLedgerSequence: 'soon' } as any),
      ).toThrow(/LastLedgerSequence must be a number/);
    });

    it('accepts AccountTxnID', () => {
      const tx = vaultSet({ ...base, AccountTxnID: TXN_ID } as any);
      expect(tx.toJSON().AccountTxnID).toBe(TXN_ID);
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() => vaultSet({ ...base, AccountTxnID: 99 } as any)).toThrow(
        /AccountTxnID must be a string/,
      );
    });

    it('accepts NetworkID', () => {
      const tx = vaultSet({ ...base, NetworkID: 1 } as any);
      expect(tx.toJSON().NetworkID).toBe(1);
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() => vaultSet({ ...base, NetworkID: {} } as any)).toThrow(
        /NetworkID must be a number/,
      );
    });

    it('accepts a Delegate distinct from Account', () => {
      const tx = vaultSet({ ...base, Delegate: DELEGATE } as any);
      expect(tx.toJSON().Delegate).toBe(DELEGATE);
    });

    it('rejects a Delegate that is not a valid address', () => {
      expect(() =>
        vaultSet({ ...base, Delegate: 'not-an-address' } as any),
      ).toThrow(/invalid Delegate/);
    });

    it('rejects Delegate equal to Account', () => {
      expect(() => vaultSet({ ...base, Delegate: OWNER } as any)).toThrow(
        /cannot be the same/,
      );
    });

    it('accepts TicketSequence alongside Sequence: 0', () => {
      const tx = vaultSet({
        ...base,
        Sequence: 0,
        TicketSequence: 42,
      } as any);
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() => vaultSet({ ...base, TicketSequence: 'nope' } as any)).toThrow(
        /TicketSequence must be a number/,
      );
    });
  });
});