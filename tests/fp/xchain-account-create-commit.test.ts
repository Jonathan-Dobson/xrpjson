/**
 * Tests for the functional XChainAccountCreateCommit factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, Amount,
 *      SignatureReward, Destination, XChainBridge).
 *   2. Spec-mandated guards the class API omits:
 *        a. Account / Destination must be valid XRPL addresses.
 *        b. XChainBridge shape: 4 keys, both doors as valid XRPL
 *           accounts, both Issues as valid Issue forms.
 *        c. Amount must be a strictly-positive XRP drops string.
 *        d. SignatureReward must be a non-negative XRP drops string.
 *   3. Frozen-shape contract (mutation throws, .with() returns a new
 *      frozen object, .toJSON() strips methods + undefined fields).
 *   4. .with() re-validates the merged shape.
 *   5. Compatibility with the xrpl.org example JSON shape.
 *
 * Spec sources verified against:
 *   - xrpl.js:  ~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/XChainAccountCreateCommit.ts
 *   - xrpl.org: ~/.mavis/docs.local/xrpl-dev-portal/repo/docs/references/protocol/transactions/types/xchainaccountcreatecommit.md
 *   - XLS-38:   ~/.mavis/docs.local/xrpl-standards/repo/XLS-0038-cross-chain-bridge/README.md §2.4.1
 */
import { describe, it, expect } from 'vitest';
import { xchainAccountCreateCommit } from '../../src/fp/factories/xchain-account-create-commit.js';

// Sender — taken from the xrpl.org example JSON (line 24).
const ACCOUNT = 'rwEqJ2UaQHe7jihxGqmx6J4xdbGiiyMaGa';
// Destination on the destination chain — xrpl.org example (line 25).
const DESTINATION = 'rD323VyRjgzzhY4bFpo44rmyh2neB5d8Mo';
// Door accounts — xrpl.org example (lines 30, 34).
const LOCKING_CHAIN_DOOR = 'rMAXACCrp3Y8PpswXcg3bKggHX76V3F8M4';
const ISSUING_CHAIN_DOOR = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

// Canonical XRP-XRP bridge (XRP-XRP is the only supported form per
// XLS-38 §2.4.1 line 571).
const XCHAIN_BRIDGE_XRP = {
  LockingChainDoor: LOCKING_CHAIN_DOOR,
  LockingChainIssue: { currency: 'XRP' },
  IssuingChainDoor: ISSUING_CHAIN_DOOR,
  IssuingChainIssue: { currency: 'XRP' },
};

// IOU-IOU bridge — valid shape even though XChainAccountCreateCommit
// is "XRP-XRP only" per XLS-38 §2.4.1. The factory validates bridge
// shape but enforces Amount/SignatureReward XRP-only. (See divergence
// doc.)
const ISSUER_I = 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B';
const ISSUER_II = 'rNCFjv8Ek5oDrNiMJ3pw6eLLFtMjZLJnf2';
const XCHAIN_BRIDGE_IOU = {
  LockingChainDoor: LOCKING_CHAIN_DOOR,
  LockingChainIssue: { currency: 'USD', issuer: ISSUER_I },
  IssuingChainDoor: ISSUING_CHAIN_DOOR,
  IssuingChainIssue: { currency: 'USD', issuer: ISSUER_II },
};

const AMOUNT = '20000000';
const SIGNATURE_REWARD = '100';

function make(extras: Record<string, unknown> = {}) {
  return xchainAccountCreateCommit({
    Account: ACCOUNT,
    XChainBridge: XCHAIN_BRIDGE_XRP,
    Amount: AMOUNT,
    SignatureReward: SIGNATURE_REWARD,
    Destination: DESTINATION,
    ...extras,
  });
}

// ─── Construction ────────────────────────────────────────────────────

describe('fp/xchainAccountCreateCommit()', () => {
  describe('construction', () => {
    it('constructs with all required fields (XRP-XRP bridge)', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('XChainAccountCreateCommit');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.Amount).toBe(AMOUNT);
      expect(tx.SignatureReward).toBe(SIGNATURE_REWARD);
      expect(tx.Destination).toBe(DESTINATION);
      expect(tx.XChainBridge).toEqual(XCHAIN_BRIDGE_XRP);
    });

    it('matches the xrpl.org example JSON shape', () => {
      // xrpl.org xchainaccountcreatecommit.md lines 22–40.
      const tx = xchainAccountCreateCommit({
        Account: ACCOUNT,
        XChainBridge: XCHAIN_BRIDGE_XRP,
        Amount: AMOUNT,
        SignatureReward: SIGNATURE_REWARD,
        Destination: DESTINATION,
      });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'XChainAccountCreateCommit',
        Account: ACCOUNT,
        Amount: AMOUNT,
        SignatureReward: SIGNATURE_REWARD,
        Destination: DESTINATION,
        XChainBridge: XCHAIN_BRIDGE_XRP,
      });
    });

    it('accepts an IOU-IOU bridge shape (bridge shape is permissive; Amount/SignatureReward remain XRP-only)', () => {
      const tx = xchainAccountCreateCommit({
        Account: ACCOUNT,
        XChainBridge: XCHAIN_BRIDGE_IOU,
        Amount: AMOUNT,
        SignatureReward: SIGNATURE_REWARD,
        Destination: DESTINATION,
      });
      expect(tx.XChainBridge).toEqual(XCHAIN_BRIDGE_IOU);
    });

    it('passes through optional Fee, Sequence, Flags', () => {
      const tx = make({ Fee: '15', Sequence: 10, Flags: 0 });
      expect(tx.Fee).toBe('15');
      expect(tx.Sequence).toBe(10);
      expect(tx.Flags).toBe(0);
    });
  });

  // ─── Account validation ─────────────────────────────────────────────

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        xchainAccountCreateCommit({
          Account: '' as never,
          XChainBridge: XCHAIN_BRIDGE_XRP,
          Amount: AMOUNT,
          SignatureReward: SIGNATURE_REWARD,
          Destination: DESTINATION,
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      expect(() =>
        xchainAccountCreateCommit({
          Account: 'not-an-account' as never,
          XChainBridge: XCHAIN_BRIDGE_XRP,
          Amount: AMOUNT,
          SignatureReward: SIGNATURE_REWARD,
          Destination: DESTINATION,
        }),
      ).toThrow(/Account/);
    });
  });

  // ─── XChainBridge validation ────────────────────────────────────────

  describe('XChainBridge validation', () => {
    it('throws on missing XChainBridge', () => {
      expect(() =>
        xchainAccountCreateCommit({
          Account: ACCOUNT,
          XChainBridge: undefined as never,
          Amount: AMOUNT,
          SignatureReward: SIGNATURE_REWARD,
          Destination: DESTINATION,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws on non-object XChainBridge', () => {
      expect(() =>
        xchainAccountCreateCommit({
          Account: ACCOUNT,
          XChainBridge: 'not-an-object' as never,
          Amount: AMOUNT,
          SignatureReward: SIGNATURE_REWARD,
          Destination: DESTINATION,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws on empty-object XChainBridge', () => {
      expect(() =>
        xchainAccountCreateCommit({
          Account: ACCOUNT,
          XChainBridge: {} as never,
          Amount: AMOUNT,
          SignatureReward: SIGNATURE_REWARD,
          Destination: DESTINATION,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws when XChainBridge has too few keys', () => {
      // 3 keys — missing IssuingChainIssue.
      expect(() =>
        xchainAccountCreateCommit({
          Account: ACCOUNT,
          XChainBridge: {
            LockingChainDoor: LOCKING_CHAIN_DOOR,
            LockingChainIssue: { currency: 'XRP' },
            IssuingChainDoor: ISSUING_CHAIN_DOOR,
          } as never,
          Amount: AMOUNT,
          SignatureReward: SIGNATURE_REWARD,
          Destination: DESTINATION,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws when XChainBridge has too many keys', () => {
      expect(() =>
        xchainAccountCreateCommit({
          Account: ACCOUNT,
          XChainBridge: {
            LockingChainDoor: LOCKING_CHAIN_DOOR,
            LockingChainIssue: { currency: 'XRP' },
            IssuingChainDoor: ISSUING_CHAIN_DOOR,
            IssuingChainIssue: { currency: 'XRP' },
            ExtraKey: 'foo',
          } as never,
          Amount: AMOUNT,
          SignatureReward: SIGNATURE_REWARD,
          Destination: DESTINATION,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws when XChainBridge.LockingChainIssue is malformed (1 key, not XRP)', () => {
      // Single-key Issue must be {currency: 'XRP'}; other single keys
      // are rejected by isIssuedCurrency.
      expect(() =>
        xchainAccountCreateCommit({
          Account: ACCOUNT,
          XChainBridge: {
            LockingChainDoor: LOCKING_CHAIN_DOOR,
            LockingChainIssue: { issuer: ISSUER_I } as never,
            IssuingChainDoor: ISSUING_CHAIN_DOOR,
            IssuingChainIssue: { currency: 'XRP' },
          },
          Amount: AMOUNT,
          SignatureReward: SIGNATURE_REWARD,
          Destination: DESTINATION,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws when XChainBridge.IssuingChainIssue is malformed (2 keys, missing issuer)', () => {
      expect(() =>
        xchainAccountCreateCommit({
          Account: ACCOUNT,
          XChainBridge: {
            LockingChainDoor: LOCKING_CHAIN_DOOR,
            LockingChainIssue: { currency: 'XRP' },
            IssuingChainDoor: ISSUING_CHAIN_DOOR,
            IssuingChainIssue: { currency: 'USD' } as never,
          },
          Amount: AMOUNT,
          SignatureReward: SIGNATURE_REWARD,
          Destination: DESTINATION,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws when XChainBridge.LockingChainDoor is not a valid XRPL account', () => {
      // isXChainBridge accepts any string for doors; we additionally
      // verify the format. This catches malformed door strings.
      expect(() =>
        xchainAccountCreateCommit({
          Account: ACCOUNT,
          XChainBridge: {
            LockingChainDoor: 'not-an-account',
            LockingChainIssue: { currency: 'XRP' },
            IssuingChainDoor: ISSUING_CHAIN_DOOR,
            IssuingChainIssue: { currency: 'XRP' },
          },
          Amount: AMOUNT,
          SignatureReward: SIGNATURE_REWARD,
          Destination: DESTINATION,
        }),
      ).toThrow(/LockingChainDoor/);
    });

    it('throws when XChainBridge.IssuingChainDoor is not a valid XRPL account', () => {
      expect(() =>
        xchainAccountCreateCommit({
          Account: ACCOUNT,
          XChainBridge: {
            LockingChainDoor: LOCKING_CHAIN_DOOR,
            LockingChainIssue: { currency: 'XRP' },
            IssuingChainDoor: 'not-an-account',
            IssuingChainIssue: { currency: 'XRP' },
          },
          Amount: AMOUNT,
          SignatureReward: SIGNATURE_REWARD,
          Destination: DESTINATION,
        }),
      ).toThrow(/IssuingChainDoor/);
    });
  });

  // ─── Amount validation ──────────────────────────────────────────────

  describe('Amount validation', () => {
    it('throws on missing Amount', () => {
      expect(() =>
        xchainAccountCreateCommit({
          Account: ACCOUNT,
          XChainBridge: XCHAIN_BRIDGE_XRP,
          Amount: undefined as unknown as string,
          SignatureReward: SIGNATURE_REWARD,
          Destination: DESTINATION,
        }),
      ).toThrow(/Amount/);
    });

    it('throws on non-string Amount', () => {
      expect(() =>
        xchainAccountCreateCommit({
          Account: ACCOUNT,
          XChainBridge: XCHAIN_BRIDGE_XRP,
          Amount: 12345 as never,
          SignatureReward: SIGNATURE_REWARD,
          Destination: DESTINATION,
        }),
      ).toThrow(/Amount/);
    });

    it('throws on IOU-form Amount (XRP-XRP only)', () => {
      // Per xrpl.org line 47: "in XRP". IOU object form is rejected.
      expect(() =>
        xchainAccountCreateCommit({
          Account: ACCOUNT,
          XChainBridge: XCHAIN_BRIDGE_XRP,
          Amount: { currency: 'USD', issuer: ISSUER_I, value: '100' } as never,
          SignatureReward: SIGNATURE_REWARD,
          Destination: DESTINATION,
        }),
      ).toThrow(/Amount/);
    });

    it('throws on zero Amount (XLS-38: Amount > MinAccountCreateAmount, which is positive)', () => {
      // Amount must be strictly positive: 0 is rejected.
      expect(() => make({ Amount: '0' })).toThrow(/Amount/);
    });

    it('throws on negative Amount', () => {
      expect(() => make({ Amount: '-1' })).toThrow(/Amount/);
    });

    it('throws on Amount with leading zeros (non-canonical wire form)', () => {
      // XRPL drops wire format rejects leading zeros ('01', '00100').
      expect(() => make({ Amount: '01000' })).toThrow(/Amount/);
    });

    it('throws on Amount with a decimal point (drops wire form is integer-only)', () => {
      expect(() => make({ Amount: '1.5' })).toThrow(/Amount/);
    });

    it('throws on Amount with exponent notation', () => {
      expect(() => make({ Amount: '1e3' })).toThrow(/Amount/);
    });
  });

  // ─── SignatureReward validation ─────────────────────────────────────

  describe('SignatureReward validation', () => {
    it('throws on missing SignatureReward', () => {
      expect(() =>
        xchainAccountCreateCommit({
          Account: ACCOUNT,
          XChainBridge: XCHAIN_BRIDGE_XRP,
          Amount: AMOUNT,
          SignatureReward: undefined as unknown as string,
          Destination: DESTINATION,
        }),
      ).toThrow(/SignatureReward/);
    });

    it('throws on non-string SignatureReward', () => {
      expect(() =>
        xchainAccountCreateCommit({
          Account: ACCOUNT,
          XChainBridge: XCHAIN_BRIDGE_XRP,
          Amount: AMOUNT,
          SignatureReward: 12345 as never,
          Destination: DESTINATION,
        }),
      ).toThrow(/SignatureReward/);
    });

    it('throws on IOU-form SignatureReward', () => {
      expect(() =>
        xchainAccountCreateCommit({
          Account: ACCOUNT,
          XChainBridge: XCHAIN_BRIDGE_XRP,
          Amount: AMOUNT,
          SignatureReward: {
            currency: 'USD',
            issuer: ISSUER_I,
            value: '100',
          } as never,
          Destination: DESTINATION,
        }),
      ).toThrow(/SignatureReward/);
    });

    it('throws on negative SignatureReward', () => {
      expect(() => make({ SignatureReward: '-1' })).toThrow(/SignatureReward/);
    });

    it('accepts zero SignatureReward (≥ 0 — bridge may opt out of witness payment)', () => {
      const tx = make({ SignatureReward: '0' });
      expect(tx.SignatureReward).toBe('0');
    });

    it('accepts a non-zero SignatureReward', () => {
      const tx = make({ SignatureReward: '500' });
      expect(tx.SignatureReward).toBe('500');
    });

    it('throws on SignatureReward with a decimal point', () => {
      expect(() => make({ SignatureReward: '1.5' })).toThrow(/SignatureReward/);
    });
  });

  // ─── Destination validation ─────────────────────────────────────────

  describe('Destination validation', () => {
    it('throws on missing Destination', () => {
      expect(() =>
        xchainAccountCreateCommit({
          Account: ACCOUNT,
          XChainBridge: XCHAIN_BRIDGE_XRP,
          Amount: AMOUNT,
          SignatureReward: SIGNATURE_REWARD,
          Destination: '' as never,
        }),
      ).toThrow(/Destination/);
    });

    it('throws on malformed Destination', () => {
      expect(() =>
        xchainAccountCreateCommit({
          Account: ACCOUNT,
          XChainBridge: XCHAIN_BRIDGE_XRP,
          Amount: AMOUNT,
          SignatureReward: SIGNATURE_REWARD,
          Destination: 'not-an-account' as never,
        }),
      ).toThrow(/Destination/);
    });
  });

  // ─── Frozen-shape contract ──────────────────────────────────────────

  describe('frozen-shape contract', () => {
    it('returns a frozen object', () => {
      const tx = make();
      expect(Object.isFrozen(tx)).toBe(true);
    });

    it('mutation throws in strict mode', () => {
      const tx = make();
      expect(() => {
        (tx as unknown as Record<string, unknown>).Amount = '999';
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      const tx = make();
      const tx2 = tx.with({ Amount: '30000000' });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Amount).toBe('30000000');
      expect(tx.Amount).toBe(AMOUNT);
    });

    it('.with() preserves unchanged fields', () => {
      const tx = make({ Fee: '15', Sequence: 5 });
      const tx2 = tx.with({ Fee: '20' });
      expect(tx2.Fee).toBe('20');
      expect(tx2.Sequence).toBe(5);
      expect(tx2.Account).toBe(ACCOUNT);
      expect(tx2.XChainBridge).toEqual(XCHAIN_BRIDGE_XRP);
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() => tx.with({ Amount: '0' })).toThrow(/Amount/);
      expect(() => tx.with({ Amount: '-1' })).toThrow(/Amount/);
      expect(() =>
        tx.with({ Destination: 'bad' as never }),
      ).toThrow(/Destination/);
      expect(() =>
        tx.with({
          XChainBridge: {
            LockingChainDoor: LOCKING_CHAIN_DOOR,
            LockingChainIssue: { currency: 'XRP' },
            IssuingChainDoor: ISSUING_CHAIN_DOOR,
            IssuingChainIssue: { currency: 'USD' }, // missing issuer
          } as never,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({ Fee: '15', Sequence: 5 });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'XChainAccountCreateCommit',
        Account: ACCOUNT,
        Amount: AMOUNT,
        SignatureReward: SIGNATURE_REWARD,
        Destination: DESTINATION,
        XChainBridge: XCHAIN_BRIDGE_XRP,
        Fee: '15',
        Sequence: 5,
      });
    });

    it('.toJSON() skips undefined fields and methods', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
      expect('Flags' in json).toBe(false);
    });

    it('.validate() is a no-op after construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });

  // ─── Base transaction fields ──────────────────────────────────────────────
  // `XchainAccountCreateCommitProps` now extends `BasePropsFields`, so the seven
  // shared base fields are part of this props type for the first time. Every
  // factory's props type is being converted to `BasePropsFields` in one
  // library-wide pass.
  //
  // SCOPE NOTE — this factory now CALLS `validateBaseTransaction` as its last
  // check before `buildFrozenTx`, so the seven base fields are runtime-checked,
  // not just TYPE-checked. The block previously ended in a tripwire asserting
  // `.not.toThrow()`; that tripwire has fired and the assertions are now
  // inverted to the real validator messages from src/validation/base.ts.
  // Bad values are cast `as any` deliberately — the point is the runtime
  // check, and a type error would make the tests uncompilable.
  describe('BaseTransactionFields', () => {
    const base = {
      Account: ACCOUNT,
      XChainBridge: XCHAIN_BRIDGE_XRP,
      Amount: AMOUNT,
      SignatureReward: SIGNATURE_REWARD,
      Destination: DESTINATION,
    };

    it('accepts Memos', () => {
      const memos = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
      const tx = xchainAccountCreateCommit({ ...base, Memos: memos });
      expect(tx.Memos).toEqual(memos);
    });

    it('accepts SourceTag', () => {
      const tx = xchainAccountCreateCommit({ ...base, SourceTag: 99 });
      expect(tx.SourceTag).toBe(99);
    });

    it('accepts LastLedgerSequence', () => {
      const tx = xchainAccountCreateCommit({
        ...base,
        LastLedgerSequence: 1234567,
      });
      expect(tx.LastLedgerSequence).toBe(1234567);
    });

    it('accepts AccountTxnID', () => {
      const tx = xchainAccountCreateCommit({
        ...base,
        AccountTxnID: 'A'.repeat(64),
      });
      expect(tx.AccountTxnID).toBe('A'.repeat(64));
    });

    it('accepts NetworkID', () => {
      const tx = xchainAccountCreateCommit({ ...base, NetworkID: 1 });
      expect(tx.NetworkID).toBe(1);
    });

    it('accepts a distinct Delegate', () => {
      const tx = xchainAccountCreateCommit({
        ...base,
        Delegate: ISSUING_CHAIN_DOOR,
      });
      expect(tx.Delegate).toBe(ISSUING_CHAIN_DOOR);
    });

    it('accepts TicketSequence (with Sequence 0)', () => {
      const tx = xchainAccountCreateCommit({
        ...base,
        Sequence: 0,
        TicketSequence: 42,
      });
      expect(tx.TicketSequence).toBe(42);
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    it('round-trips all seven through .toJSON()', () => {
      const tx = xchainAccountCreateCommit({
        ...base,
        Memos: [{ Memo: { MemoType: '74', MemoData: '6869' } }],
        SourceTag: 7,
        LastLedgerSequence: 900,
        AccountTxnID: 'B'.repeat(64),
        NetworkID: 2,
        Delegate: ISSUING_CHAIN_DOOR,
        Sequence: 0,
        TicketSequence: 5,
      });
      const json = tx.toJSON();
      expect(json.Memos).toEqual([{ Memo: { MemoType: '74', MemoData: '6869' } }]);
      expect(json.SourceTag).toBe(7);
      expect(json.LastLedgerSequence).toBe(900);
      expect(json.AccountTxnID).toBe('B'.repeat(64));
      expect(json.NetworkID).toBe(2);
      expect(json.Delegate).toBe(ISSUING_CHAIN_DOOR);
      expect(json.TicketSequence).toBe(5);
    });

    it('survives .with() with base fields set', () => {
      const tx = xchainAccountCreateCommit({ ...base, SourceTag: 99 });
      const next = tx.with({ Account: ACCOUNT });
      expect(next.SourceTag).toBe(99);
      expect(next.Amount).toBe(AMOUNT);
    });

    it('runtime-validates every base field (the gap is closed)', () => {
      // This test used to assert `.not.toThrow()` for all eight cases: a
      // deliberate tripwire documenting that the factory did NOT call
      // `validateBaseTransaction`. The factory now calls it, so the tripwire
      // has fired and the assertions are inverted to the real behaviour.
      expect(() =>
        xchainAccountCreateCommit({ ...base, Memos: 'not-an-array' } as any),
      ).toThrow(/invalid Memos/);
      expect(() =>
        xchainAccountCreateCommit({ ...base, SourceTag: 'NaN' } as any),
      ).toThrow(/SourceTag must be a number/);
      expect(() =>
        xchainAccountCreateCommit({ ...base, LastLedgerSequence: 'soon' } as any),
      ).toThrow(/LastLedgerSequence must be a number/);
      expect(() =>
        xchainAccountCreateCommit({ ...base, AccountTxnID: 99 } as any),
      ).toThrow(/AccountTxnID must be a string/);
      expect(() =>
        xchainAccountCreateCommit({ ...base, NetworkID: {} } as any),
      ).toThrow(/NetworkID must be a number/);
      expect(() =>
        xchainAccountCreateCommit({ ...base, TicketSequence: 'nope' } as any),
      ).toThrow(/TicketSequence must be a number/);
      expect(() =>
        xchainAccountCreateCommit({ ...base, Delegate: 'not-an-address' } as any),
      ).toThrow(/invalid Delegate/);
      expect(() =>
        xchainAccountCreateCommit({ ...base, Delegate: ACCOUNT }),
      ).toThrow(/cannot be the same/);
    });

    it('still checks Destination before the shared base fields', () => {
      // Ordering check: a factory-specific mistake still produces the
      // factory's own message, not the base validator's backstop message.
      expect(() =>
        xchainAccountCreateCommit({
          ...base,
          Destination: 'not-an-address',
          SourceTag: 'NaN',
        } as any),
      ).toThrow(/Destination/);
    });

    it('rejects a non-string Fee', () => {
      expect(() =>
        xchainAccountCreateCommit({ ...base, Fee: 12 } as any),
      ).toThrow(/Fee must be a string/);
    });
  });
});