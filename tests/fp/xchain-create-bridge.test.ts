/**
 * Tests for the functional XChainCreateBridge factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, XChainBridge,
 *      SignatureReward).
 *   2. Spec-mandated guards the class API omits:
 *        a. Account must be a valid XRPL address.
 *        b. XChainBridge shape: 4 keys, both doors as valid XRPL
 *           accounts, both Issues as valid Issue forms.
 *        c. Account must equal LockingChainDoor.
 *        d. SignatureReward must be a non-negative XRP drops string.
 *        e. MinAccountCreateAmount (when present) must be a
 *           non-negative XRP drops string.
 *   3. Frozen-shape contract (mutation throws, .with() returns a new
 *      frozen object, .toJSON() strips methods + undefined fields).
 *   4. .with() re-validates the merged shape.
 *   5. Compatibility with the xrpl.org example JSON shape.
 *
 * Spec sources verified against:
 *   - xrpl.js:  ~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/XChainCreateBridge.ts
 *   - xrpl.org: ~/.mavis/docs.local/xrpl-dev-portal/repo/docs/references/protocol/transactions/types/xchaincreatebridge.md
 *   - XLS-38:   ~/.mavis/docs.local/xrpl-standards/repo/XLS-0038-cross-chain-bridge/README.md §2.2.1
 */
import { describe, it, expect } from 'vitest';
import { xchainCreateBridge } from '../../src/fp/factories/xchain-create-bridge.js';

// Sender / locking-chain door — taken from the xrpl.org example JSON
// (xchaincreatebridge.md lines 28, 30).
const ACCOUNT = 'rhWQzvdmhf5vFS35vtKUSUwNZHGT53qQsg';
// Issuing-chain door — xrpl.org example line 34.
const ISSUING_CHAIN_DOOR = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

// Canonical XRP-XRP bridge (XRP-XRP is one of two supported forms
// per XLS-38 §2.1.1 / xrpl.org example lines 29–38).
const XCHAIN_BRIDGE_XRP = {
  LockingChainDoor: ACCOUNT,
  LockingChainIssue: { currency: 'XRP' },
  IssuingChainDoor: ISSUING_CHAIN_DOOR,
  IssuingChainIssue: { currency: 'XRP' },
};

// IOU-IOU bridge — valid bridge shape per XLS-38 §2.1.1 / §2.2.1.
// Both Issues are IOU objects with `issuer`. Bridge shape itself is
// accepted; SignatureReward/MinAccountCreateAmount remain XRP-only
// (per spec — see Divergences header).
const ISSUER_I = 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B';
const ISSUER_II = 'rNCFjv8Ek5oDrNiMJ3pw6eLLFtMjZLJnf2';
const XCHAIN_BRIDGE_IOU = {
  LockingChainDoor: ACCOUNT,
  LockingChainIssue: { currency: 'USD', issuer: ISSUER_I },
  IssuingChainDoor: ISSUING_CHAIN_DOOR,
  IssuingChainIssue: { currency: 'USD', issuer: ISSUER_II },
};

const SIGNATURE_REWARD = '200';
const MIN_ACCOUNT_CREATE_AMOUNT = '1000000';

function make(extras: Record<string, unknown> = {}) {
  return xchainCreateBridge({
    Account: ACCOUNT,
    XChainBridge: XCHAIN_BRIDGE_XRP,
    SignatureReward: SIGNATURE_REWARD,
    ...extras,
  });
}

// ─── Construction ────────────────────────────────────────────────────

describe('fp/xchainCreateBridge()', () => {
  describe('construction', () => {
    it('constructs with the minimum required field set', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('XChainCreateBridge');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.SignatureReward).toBe(SIGNATURE_REWARD);
      expect(tx.XChainBridge).toEqual(XCHAIN_BRIDGE_XRP);
      expect(tx.MinAccountCreateAmount).toBeUndefined();
    });

    it('matches the xrpl.org example JSON shape (with MinAccountCreateAmount)', () => {
      // xrpl.org xchaincreatebridge.md lines 25–42.
      const tx = xchainCreateBridge({
        Account: ACCOUNT,
        XChainBridge: XCHAIN_BRIDGE_XRP,
        SignatureReward: SIGNATURE_REWARD,
        MinAccountCreateAmount: MIN_ACCOUNT_CREATE_AMOUNT,
      });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'XChainCreateBridge',
        Account: ACCOUNT,
        XChainBridge: XCHAIN_BRIDGE_XRP,
        SignatureReward: SIGNATURE_REWARD,
        MinAccountCreateAmount: MIN_ACCOUNT_CREATE_AMOUNT,
      });
    });

    it('accepts an IOU-IOU bridge shape (bridge shape is permissive)', () => {
      const tx = xchainCreateBridge({
        Account: ACCOUNT,
        XChainBridge: XCHAIN_BRIDGE_IOU,
        SignatureReward: SIGNATURE_REWARD,
      });
      expect(tx.XChainBridge).toEqual(XCHAIN_BRIDGE_IOU);
    });

    it('passes through optional Fee, Sequence, Flags', () => {
      const tx = make({ Fee: '15', Sequence: 10, Flags: 0 });
      expect(tx.Fee).toBe('15');
      expect(tx.Sequence).toBe(10);
      expect(tx.Flags).toBe(0);
    });

    it('accepts zero SignatureReward (≥ 0 — bridge may opt out of witness payment)', () => {
      const tx = make({ SignatureReward: '0' });
      expect(tx.SignatureReward).toBe('0');
    });

    it('accepts zero MinAccountCreateAmount (defaults to 0 when omitted; explicit zero is fine)', () => {
      const tx = make({ MinAccountCreateAmount: '0' });
      expect(tx.MinAccountCreateAmount).toBe('0');
    });
  });

  // ─── Account validation ─────────────────────────────────────────────

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        xchainCreateBridge({
          Account: '' as never,
          XChainBridge: XCHAIN_BRIDGE_XRP,
          SignatureReward: SIGNATURE_REWARD,
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      expect(() =>
        xchainCreateBridge({
          Account: 'not-an-account' as never,
          XChainBridge: XCHAIN_BRIDGE_XRP,
          SignatureReward: SIGNATURE_REWARD,
        }),
      ).toThrow(/Account/);
    });

    it('throws when Account does not equal XChainBridge.LockingChainDoor', () => {
      // xrpl.org line 15: transaction must be submitted by the
      // locking-chain door account. The example JSON (lines 28, 30)
      // sets Account === LockingChainDoor.
      expect(() =>
        xchainCreateBridge({
          Account: ISSUING_CHAIN_DOOR,
          XChainBridge: XCHAIN_BRIDGE_XRP,
          SignatureReward: SIGNATURE_REWARD,
        }),
      ).toThrow(/Account must equal XChainBridge\.LockingChainDoor/);
    });
  });

  // ─── XChainBridge validation ────────────────────────────────────────

  describe('XChainBridge validation', () => {
    it('throws on missing XChainBridge', () => {
      expect(() =>
        xchainCreateBridge({
          Account: ACCOUNT,
          XChainBridge: undefined as never,
          SignatureReward: SIGNATURE_REWARD,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws on non-object XChainBridge', () => {
      expect(() =>
        xchainCreateBridge({
          Account: ACCOUNT,
          XChainBridge: 'not-an-object' as never,
          SignatureReward: SIGNATURE_REWARD,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws on empty-object XChainBridge', () => {
      expect(() =>
        xchainCreateBridge({
          Account: ACCOUNT,
          XChainBridge: {} as never,
          SignatureReward: SIGNATURE_REWARD,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws when XChainBridge has too few keys', () => {
      // 3 keys — missing IssuingChainIssue.
      expect(() =>
        xchainCreateBridge({
          Account: ACCOUNT,
          XChainBridge: {
            LockingChainDoor: ACCOUNT,
            LockingChainIssue: { currency: 'XRP' },
            IssuingChainDoor: ISSUING_CHAIN_DOOR,
          } as never,
          SignatureReward: SIGNATURE_REWARD,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws when XChainBridge has too many keys', () => {
      expect(() =>
        xchainCreateBridge({
          Account: ACCOUNT,
          XChainBridge: {
            LockingChainDoor: ACCOUNT,
            LockingChainIssue: { currency: 'XRP' },
            IssuingChainDoor: ISSUING_CHAIN_DOOR,
            IssuingChainIssue: { currency: 'XRP' },
            ExtraKey: 'foo',
          } as never,
          SignatureReward: SIGNATURE_REWARD,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws when XChainBridge.LockingChainIssue is malformed (1 key, not XRP)', () => {
      // Single-key Issue must be {currency: 'XRP'}; other single keys
      // are rejected by isIssuedCurrency.
      expect(() =>
        xchainCreateBridge({
          Account: ACCOUNT,
          XChainBridge: {
            LockingChainDoor: ACCOUNT,
            LockingChainIssue: { issuer: ISSUER_I } as never,
            IssuingChainDoor: ISSUING_CHAIN_DOOR,
            IssuingChainIssue: { currency: 'XRP' },
          },
          SignatureReward: SIGNATURE_REWARD,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws when XChainBridge.IssuingChainIssue is malformed (2 keys, missing issuer)', () => {
      expect(() =>
        xchainCreateBridge({
          Account: ACCOUNT,
          XChainBridge: {
            LockingChainDoor: ACCOUNT,
            LockingChainIssue: { currency: 'XRP' },
            IssuingChainDoor: ISSUING_CHAIN_DOOR,
            IssuingChainIssue: { currency: 'USD' } as never,
          },
          SignatureReward: SIGNATURE_REWARD,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws when XChainBridge.LockingChainDoor is not a valid XRPL account', () => {
      // isXChainBridge accepts any string for doors; we additionally
      // verify the format. This catches malformed door strings.
      // Use a valid Account so the bridge-check fires (otherwise
      // Account validation rejects first).
      expect(() =>
        xchainCreateBridge({
          Account: ACCOUNT,
          XChainBridge: {
            LockingChainDoor: 'not-an-account',
            LockingChainIssue: { currency: 'XRP' },
            IssuingChainDoor: ISSUING_CHAIN_DOOR,
            IssuingChainIssue: { currency: 'XRP' },
          },
          SignatureReward: SIGNATURE_REWARD,
        }),
      ).toThrow(/LockingChainDoor/);
    });

    it('throws when XChainBridge.IssuingChainDoor is not a valid XRPL account', () => {
      expect(() =>
        xchainCreateBridge({
          Account: ACCOUNT,
          XChainBridge: {
            LockingChainDoor: ACCOUNT,
            LockingChainIssue: { currency: 'XRP' },
            IssuingChainDoor: 'not-an-account',
            IssuingChainIssue: { currency: 'XRP' },
          },
          SignatureReward: SIGNATURE_REWARD,
        }),
      ).toThrow(/IssuingChainDoor/);
    });
  });

  // ─── SignatureReward validation ─────────────────────────────────────

  describe('SignatureReward validation', () => {
    it('throws on missing SignatureReward', () => {
      expect(() =>
        xchainCreateBridge({
          Account: ACCOUNT,
          XChainBridge: XCHAIN_BRIDGE_XRP,
          SignatureReward: undefined as unknown as string,
        }),
      ).toThrow(/SignatureReward/);
    });

    it('throws on non-string SignatureReward', () => {
      expect(() =>
        xchainCreateBridge({
          Account: ACCOUNT,
          XChainBridge: XCHAIN_BRIDGE_XRP,
          SignatureReward: 12345 as never,
        }),
      ).toThrow(/SignatureReward/);
    });

    it('throws on IOU-form SignatureReward', () => {
      // Per XLS-38 §2.1.1.1.3 line 200: SignatureReward is "in XRP".
      // IOU object form is rejected at construction.
      expect(() =>
        xchainCreateBridge({
          Account: ACCOUNT,
          XChainBridge: XCHAIN_BRIDGE_XRP,
          SignatureReward: {
            currency: 'USD',
            issuer: ISSUER_I,
            value: '100',
          } as never,
        }),
      ).toThrow(/SignatureReward/);
    });

    it('throws on negative SignatureReward', () => {
      expect(() => make({ SignatureReward: '-1' })).toThrow(
        /SignatureReward/,
      );
    });

    it('throws on SignatureReward with a decimal point', () => {
      expect(() => make({ SignatureReward: '1.5' })).toThrow(
        /SignatureReward/,
      );
    });

    it('throws on SignatureReward with leading zeros (non-canonical wire form)', () => {
      expect(() => make({ SignatureReward: '0200' })).toThrow(
        /SignatureReward/,
      );
    });
  });

  // ─── MinAccountCreateAmount validation ──────────────────────────────

  describe('MinAccountCreateAmount validation', () => {
    it('accepts MinAccountCreateAmount when present and valid', () => {
      const tx = make({ MinAccountCreateAmount: MIN_ACCOUNT_CREATE_AMOUNT });
      expect(tx.MinAccountCreateAmount).toBe(MIN_ACCOUNT_CREATE_AMOUNT);
    });

    it('throws when MinAccountCreateAmount is an IOU object (XRP-XRP only)', () => {
      // xrpl.org line 49: "This field can only be present on XRP-XRP
      // bridges." The factory rejects non-XRP forms at construction.
      expect(() =>
        make({
          MinAccountCreateAmount: {
            currency: 'USD',
            issuer: ISSUER_I,
            value: '100',
          } as never,
        }),
      ).toThrow(/MinAccountCreateAmount/);
    });

    it('throws on negative MinAccountCreateAmount', () => {
      expect(() => make({ MinAccountCreateAmount: '-1' })).toThrow(
        /MinAccountCreateAmount/,
      );
    });

    it('throws on MinAccountCreateAmount with a decimal point', () => {
      expect(() => make({ MinAccountCreateAmount: '1.5' })).toThrow(
        /MinAccountCreateAmount/,
      );
    });

    it('throws on MinAccountCreateAmount with leading zeros', () => {
      expect(() => make({ MinAccountCreateAmount: '01000' })).toThrow(
        /MinAccountCreateAmount/,
      );
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
        (tx as unknown as Record<string, unknown>).SignatureReward = '999';
      }).toThrow(TypeError);
    });

    it('exposes validate(), toJSON(), with() as own enumerable methods', () => {
      const tx = make();
      expect(typeof tx.validate).toBe('function');
      expect(typeof tx.toJSON).toBe('function');
      expect(typeof tx.with).toBe('function');
    });

    it('.validate() is a no-op after construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      const tx = make();
      const tx2 = tx.with({ Fee: '20' });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Fee).toBe('20');
      expect(tx2.Account).toBe(ACCOUNT);
      expect(tx2.SignatureReward).toBe(SIGNATURE_REWARD);
      expect(tx.Fee).toBeUndefined();
    });

    it('.with() preserves unchanged fields', () => {
      const tx = make({ Fee: '15', Sequence: 5 });
      const tx2 = tx.with({ Fee: '20' });
      expect(tx2.Fee).toBe('20');
      expect(tx2.Sequence).toBe(5);
      expect(tx2.Account).toBe(ACCOUNT);
      expect(tx2.XChainBridge).toEqual(XCHAIN_BRIDGE_XRP);
    });

    it('.with() re-validates on overrides (SignatureReward)', () => {
      const tx = make();
      expect(() => tx.with({ SignatureReward: '-1' })).toThrow(
        /SignatureReward/,
      );
      expect(() => tx.with({ SignatureReward: '0' })).not.toThrow();
    });

    it('.with() re-validates on overrides (Account vs LockingChainDoor)', () => {
      const tx = make();
      expect(() =>
        tx.with({ Account: ISSUING_CHAIN_DOOR }),
      ).toThrow(/Account must equal XChainBridge\.LockingChainDoor/);
    });

    it('.with() re-validates on overrides (MinAccountCreateAmount)', () => {
      const tx = make();
      expect(() =>
        tx.with({ MinAccountCreateAmount: '-1' }),
      ).toThrow(/MinAccountCreateAmount/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({ Fee: '15', Sequence: 5 });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'XChainCreateBridge',
        Account: ACCOUNT,
        XChainBridge: XCHAIN_BRIDGE_XRP,
        SignatureReward: SIGNATURE_REWARD,
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
      expect('MinAccountCreateAmount' in json).toBe(false);
    });
  });

  // ─── Base transaction fields ──────────────────────────────────────────────
  // `XchainCreateBridgeProps` now extends `BasePropsFields`, so the seven shared
  // base fields are part of this props type for the first time. Every factory's
  // props type is being converted to `BasePropsFields` in one library-wide pass.
  //
  // Every accept value below is chosen to be VALID under
  // `validateBaseTransaction` (src/validation/base.ts). The factory now CALLS
  // that validator as its final check, immediately before `buildFrozenTx` and
  // after every XChainCreateBridge-specific check, so the reject cases below
  // reach the shared validator's messages — and a more specific mistake
  // (e.g. a bad XChainBridge) still produces the XChainCreateBridge message.
  describe('BaseTransactionFields', () => {
    const base = {
      Account: ACCOUNT,
      XChainBridge: XCHAIN_BRIDGE_XRP,
      SignatureReward: SIGNATURE_REWARD,
    };

    it('accepts Memos', () => {
      const memos = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
      const tx = xchainCreateBridge({ ...base, Memos: memos });
      expect(tx.Memos).toEqual(memos);
    });

    it('accepts SourceTag', () => {
      const tx = xchainCreateBridge({ ...base, SourceTag: 99 });
      expect(tx.SourceTag).toBe(99);
    });

    it('accepts LastLedgerSequence', () => {
      const tx = xchainCreateBridge({ ...base, LastLedgerSequence: 1234567 });
      expect(tx.LastLedgerSequence).toBe(1234567);
    });

    it('accepts AccountTxnID', () => {
      const tx = xchainCreateBridge({ ...base, AccountTxnID: 'A'.repeat(64) });
      expect(tx.AccountTxnID).toBe('A'.repeat(64));
    });

    it('accepts NetworkID', () => {
      const tx = xchainCreateBridge({ ...base, NetworkID: 1 });
      expect(tx.NetworkID).toBe(1);
    });

    it('accepts a distinct Delegate', () => {
      const tx = xchainCreateBridge({ ...base, Delegate: ISSUING_CHAIN_DOOR });
      expect(tx.Delegate).toBe(ISSUING_CHAIN_DOOR);
    });

    it('accepts TicketSequence (with Sequence 0)', () => {
      const tx = xchainCreateBridge({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.TicketSequence).toBe(42);
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    it('round-trips all seven through .toJSON()', () => {
      const tx = xchainCreateBridge({
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
      const tx = xchainCreateBridge({ ...base, SourceTag: 99 });
      const next = tx.with({ Account: ACCOUNT });
      expect(next.SourceTag).toBe(99);
      expect(next.SignatureReward).toBe(SIGNATURE_REWARD);
    });

    it('rejects a malformed Memos value', () => {
      expect(() =>
        xchainCreateBridge({ ...base, Memos: 'not-an-array' } as any),
      ).toThrow(/invalid Memos/);
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() =>
        xchainCreateBridge({ ...base, SourceTag: 'NaN' } as any),
      ).toThrow(/SourceTag must be a number/);
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() =>
        xchainCreateBridge({ ...base, LastLedgerSequence: 'soon' } as any),
      ).toThrow(/LastLedgerSequence must be a number/);
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() =>
        xchainCreateBridge({ ...base, AccountTxnID: 99 } as any),
      ).toThrow(/AccountTxnID must be a string/);
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() =>
        xchainCreateBridge({ ...base, NetworkID: {} } as any),
      ).toThrow(/NetworkID must be a number/);
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() =>
        xchainCreateBridge({ ...base, TicketSequence: 'nope' } as any),
      ).toThrow(/TicketSequence must be a number/);
    });

    it('rejects a Delegate that is not a valid address', () => {
      expect(() =>
        xchainCreateBridge({ ...base, Delegate: 'not-an-address' } as any),
      ).toThrow(/invalid Delegate/);
    });

    it('rejects Delegate equal to Account', () => {
      expect(() =>
        xchainCreateBridge({ ...base, Delegate: ACCOUNT }),
      ).toThrow(/cannot be the same/);
    });
  });
});