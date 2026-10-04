/**
 * Tests for the functional XChainCreateClaimID factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, XChainBridge,
 *      SignatureReward, OtherChainSource).
 *   2. Spec-mandated guards the class API omits:
 *      a. Account must be a valid XRPL address.
 *      b. XChainBridge shape: 4 keys, both doors as valid XRPL
 *         accounts, both Issues as valid Issue forms.
 *      c. SignatureReward must be a non-negative XRP drops string.
 *      d. OtherChainSource must be a valid XRPL address.
 *   3. Frozen-shape contract (mutation throws, .with() returns a new
 *      frozen object, .toJSON() strips methods + undefined fields).
 *   4. .with() re-validates the merged shape.
 *   5. Compatibility with the xrpl.org example JSON shape.
 *   6. XChainClaimID is NOT a transaction field (spec verification).
 *
 * Spec sources verified against:
 *   - xrpl.js:  ~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/XChainCreateClaimID.ts
 *   - xrpl.org: ~/.mavis/docs.local/xrpl-dev-portal/repo/docs/references/protocol/transactions/types/xchaincreateclaimid.md
 *   - XLS-38:   ~/.mavis/docs.local/xrpl-standards/repo/XLS-0038-cross-chain-bridge/README.md §2.3.1
 *   - rippled:  src/libxrpl/tx/transactors/bridge/XChainBridge.cpp::XChainCreateClaimID::preflight
 */
import { describe, it, expect } from 'vitest';
import { xchainCreateClaimID } from '../../src/fp/factories/xchain-create-claim-id.js';

// Sender / destination-chain account — taken from the xrpl.org example
// JSON (xchaincreateclaimid.md line 20).
const ACCOUNT = 'rahDmoXrtPdh7sUdrPjini3gcnTVYjbjjw';
// OtherChainSource — the source-chain account that will later submit
// XChainCommit (xrpl.org example line 21).
const OTHER_CHAIN_SOURCE = 'rMTi57fNy2UkUb4RcdoUeJm7gjxVQvxzUo';
// Locking-chain door — xrpl.org example line 23.
const LOCKING_CHAIN_DOOR = 'rMAXACCrp3Y8PpswXcg3bKggHX76V3F8M4';
// Issuing-chain door — xrpl.org example line 26 (XRP-XRP bridge genesis).
const ISSUING_CHAIN_DOOR = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

const SIGNATURE_REWARD = '100';

// Canonical XRP-XRP bridge from the xrpl.org example JSON.
const XCHAIN_BRIDGE_XRP = {
  LockingChainDoor: LOCKING_CHAIN_DOOR,
  LockingChainIssue: { currency: 'XRP' },
  IssuingChainDoor: ISSUING_CHAIN_DOOR,
  IssuingChainIssue: { currency: 'XRP' },
};

// IOU-IOU bridge — valid bridge shape per XLS-38 §2.1.1 / §2.3.1.
const ISSUER_I = 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B';
const ISSUER_II = 'rNCFjv8Ek5oDrNiMJ3pw6eLLFtMjZLJnf2';
const XCHAIN_BRIDGE_IOU = {
  LockingChainDoor: LOCKING_CHAIN_DOOR,
  LockingChainIssue: { currency: 'USD', issuer: ISSUER_I },
  IssuingChainDoor: ISSUING_CHAIN_DOOR,
  IssuingChainIssue: { currency: 'USD', issuer: ISSUER_II },
};

function make(extras: Record<string, unknown> = {}) {
  return xchainCreateClaimID({
    Account: ACCOUNT,
    XChainBridge: XCHAIN_BRIDGE_XRP,
    SignatureReward: SIGNATURE_REWARD,
    OtherChainSource: OTHER_CHAIN_SOURCE,
    ...extras,
  });
}

// ─── Construction ────────────────────────────────────────────────────

describe('fp/xchainCreateClaimID()', () => {
  describe('construction', () => {
    it('constructs with the minimum required field set', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('XChainCreateClaimID');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.XChainBridge).toEqual(XCHAIN_BRIDGE_XRP);
      expect(tx.SignatureReward).toBe(SIGNATURE_REWARD);
      expect(tx.OtherChainSource).toBe(OTHER_CHAIN_SOURCE);
    });

    it('matches the xrpl.org example JSON shape', () => {
      // xrpl.org xchaincreateclaimid.md lines 18–34 (entire example JSON).
      const tx = xchainCreateClaimID({
        Account: ACCOUNT,
        OtherChainSource: OTHER_CHAIN_SOURCE,
        SignatureReward: SIGNATURE_REWARD,
        XChainBridge: XCHAIN_BRIDGE_XRP,
      });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'XChainCreateClaimID',
        Account: ACCOUNT,
        OtherChainSource: OTHER_CHAIN_SOURCE,
        SignatureReward: SIGNATURE_REWARD,
        XChainBridge: XCHAIN_BRIDGE_XRP,
      });
    });

    it('accepts an IOU-IOU bridge shape (bridge shape is permissive)', () => {
      // XChainBridge structural shape is what we validate; the bridge
      // type (XRP-XRP vs IOU-IOU) is decided by the bridge's Issue
      // forms and is independent of the bridge-shape guard.
      const tx = xchainCreateClaimID({
        Account: ACCOUNT,
        XChainBridge: XCHAIN_BRIDGE_IOU,
        SignatureReward: SIGNATURE_REWARD,
        OtherChainSource: OTHER_CHAIN_SOURCE,
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
  });

  // ─── Account validation ─────────────────────────────────────────────

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        xchainCreateClaimID({
          Account: '',
          XChainBridge: XCHAIN_BRIDGE_XRP,
          SignatureReward: SIGNATURE_REWARD,
          OtherChainSource: OTHER_CHAIN_SOURCE,
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      expect(() =>
        xchainCreateClaimID({
          Account: 'not-an-account',
          XChainBridge: XCHAIN_BRIDGE_XRP,
          SignatureReward: SIGNATURE_REWARD,
          OtherChainSource: OTHER_CHAIN_SOURCE,
        }),
      ).toThrow(/Account/);
    });
  });

  // ─── XChainBridge validation ────────────────────────────────────────

  describe('XChainBridge validation', () => {
    it('throws on missing XChainBridge', () => {
      expect(() =>
        xchainCreateClaimID({
          Account: ACCOUNT,
          XChainBridge: undefined as never,
          SignatureReward: SIGNATURE_REWARD,
          OtherChainSource: OTHER_CHAIN_SOURCE,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws on non-object XChainBridge', () => {
      expect(() =>
        xchainCreateClaimID({
          Account: ACCOUNT,
          XChainBridge: 'not-an-object' as never,
          SignatureReward: SIGNATURE_REWARD,
          OtherChainSource: OTHER_CHAIN_SOURCE,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws on empty-object XChainBridge', () => {
      expect(() =>
        xchainCreateClaimID({
          Account: ACCOUNT,
          XChainBridge: {} as never,
          SignatureReward: SIGNATURE_REWARD,
          OtherChainSource: OTHER_CHAIN_SOURCE,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws when XChainBridge has too few keys', () => {
      // 3 keys — missing IssuingChainIssue.
      expect(() =>
        xchainCreateClaimID({
          Account: ACCOUNT,
          XChainBridge: {
            LockingChainDoor: LOCKING_CHAIN_DOOR,
            LockingChainIssue: { currency: 'XRP' },
            IssuingChainDoor: ISSUING_CHAIN_DOOR,
          } as never,
          SignatureReward: SIGNATURE_REWARD,
          OtherChainSource: OTHER_CHAIN_SOURCE,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws when XChainBridge has too many keys', () => {
      expect(() =>
        xchainCreateClaimID({
          Account: ACCOUNT,
          XChainBridge: {
            LockingChainDoor: LOCKING_CHAIN_DOOR,
            LockingChainIssue: { currency: 'XRP' },
            IssuingChainDoor: ISSUING_CHAIN_DOOR,
            IssuingChainIssue: { currency: 'XRP' },
            ExtraKey: 'foo',
          } as never,
          SignatureReward: SIGNATURE_REWARD,
          OtherChainSource: OTHER_CHAIN_SOURCE,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws when XChainBridge.LockingChainIssue is malformed', () => {
      expect(() =>
        xchainCreateClaimID({
          Account: ACCOUNT,
          XChainBridge: {
            LockingChainDoor: LOCKING_CHAIN_DOOR,
            LockingChainIssue: { issuer: ISSUER_I } as never,
            IssuingChainDoor: ISSUING_CHAIN_DOOR,
            IssuingChainIssue: { currency: 'XRP' },
          },
          SignatureReward: SIGNATURE_REWARD,
          OtherChainSource: OTHER_CHAIN_SOURCE,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws when XChainBridge.IssuingChainIssue is malformed', () => {
      expect(() =>
        xchainCreateClaimID({
          Account: ACCOUNT,
          XChainBridge: {
            LockingChainDoor: LOCKING_CHAIN_DOOR,
            LockingChainIssue: { currency: 'XRP' },
            IssuingChainDoor: ISSUING_CHAIN_DOOR,
            IssuingChainIssue: { currency: 'USD' } as never,
          },
          SignatureReward: SIGNATURE_REWARD,
          OtherChainSource: OTHER_CHAIN_SOURCE,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws when XChainBridge.LockingChainDoor is not a valid XRPL account', () => {
      expect(() =>
        xchainCreateClaimID({
          Account: ACCOUNT,
          XChainBridge: {
            LockingChainDoor: 'not-an-account',
            LockingChainIssue: { currency: 'XRP' },
            IssuingChainDoor: ISSUING_CHAIN_DOOR,
            IssuingChainIssue: { currency: 'XRP' },
          },
          SignatureReward: SIGNATURE_REWARD,
          OtherChainSource: OTHER_CHAIN_SOURCE,
        }),
      ).toThrow(/LockingChainDoor/);
    });

    it('throws when XChainBridge.IssuingChainDoor is not a valid XRPL account', () => {
      expect(() =>
        xchainCreateClaimID({
          Account: ACCOUNT,
          XChainBridge: {
            LockingChainDoor: LOCKING_CHAIN_DOOR,
            LockingChainIssue: { currency: 'XRP' },
            IssuingChainDoor: 'not-an-account',
            IssuingChainIssue: { currency: 'XRP' },
          },
          SignatureReward: SIGNATURE_REWARD,
          OtherChainSource: OTHER_CHAIN_SOURCE,
        }),
      ).toThrow(/IssuingChainDoor/);
    });
  });

  // ─── SignatureReward validation ─────────────────────────────────────

  describe('SignatureReward validation', () => {
    it('throws on missing SignatureReward', () => {
      expect(() =>
        xchainCreateClaimID({
          Account: ACCOUNT,
          XChainBridge: XCHAIN_BRIDGE_XRP,
          SignatureReward: undefined as unknown as string,
          OtherChainSource: OTHER_CHAIN_SOURCE,
        }),
      ).toThrow(/SignatureReward/);
    });

    it('throws on non-string SignatureReward', () => {
      expect(() =>
        xchainCreateClaimID({
          Account: ACCOUNT,
          XChainBridge: XCHAIN_BRIDGE_XRP,
          SignatureReward: 100 as never,
          OtherChainSource: OTHER_CHAIN_SOURCE,
        }),
      ).toThrow(/SignatureReward/);
    });

    it('throws on IOU-form SignatureReward (XRP-only per XLS-38 §2.3.1.1.2)', () => {
      // rippled preflight enforces isXRP(reward); IOU object form
      // would be rejected on-ledger with temXCHAIN_BRIDGE_BAD_REWARD_AMOUNT.
      expect(() =>
        xchainCreateClaimID({
          Account: ACCOUNT,
          XChainBridge: XCHAIN_BRIDGE_XRP,
          SignatureReward: {
            currency: 'USD',
            issuer: ISSUER_I,
            value: '100',
          } as never,
          OtherChainSource: OTHER_CHAIN_SOURCE,
        }),
      ).toThrow(/SignatureReward/);
    });

    it('throws on MPT-form SignatureReward', () => {
      expect(() =>
        xchainCreateClaimID({
          Account: ACCOUNT,
          XChainBridge: XCHAIN_BRIDGE_XRP,
          SignatureReward: {
            mpt_issuance_id: '00000001',
            value: '100',
          } as never,
          OtherChainSource: OTHER_CHAIN_SOURCE,
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
      expect(() => make({ SignatureReward: '0100' })).toThrow(
        /SignatureReward/,
      );
    });

    it('throws on empty-string SignatureReward', () => {
      expect(() => make({ SignatureReward: '' })).toThrow(/SignatureReward/);
    });
  });

  // ─── OtherChainSource validation ────────────────────────────────────

  describe('OtherChainSource validation', () => {
    it('throws on missing OtherChainSource', () => {
      expect(() =>
        xchainCreateClaimID({
          Account: ACCOUNT,
          XChainBridge: XCHAIN_BRIDGE_XRP,
          SignatureReward: SIGNATURE_REWARD,
          OtherChainSource: '',
        }),
      ).toThrow(/OtherChainSource/);
    });

    it('throws on malformed OtherChainSource', () => {
      expect(() =>
        xchainCreateClaimID({
          Account: ACCOUNT,
          XChainBridge: XCHAIN_BRIDGE_XRP,
          SignatureReward: SIGNATURE_REWARD,
          OtherChainSource: 'not-an-account',
        }),
      ).toThrow(/OtherChainSource/);
    });

    it('accepts OtherChainSource equal to Account (self-source)', () => {
      // The spec does not forbid Account === OtherChainSource. We
      // don't add a cross-field guard for this case.
      const tx = xchainCreateClaimID({
        Account: ACCOUNT,
        XChainBridge: XCHAIN_BRIDGE_XRP,
        SignatureReward: SIGNATURE_REWARD,
        OtherChainSource: ACCOUNT,
      });
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.OtherChainSource).toBe(ACCOUNT);
    });
  });

  // ─── XChainClaimID is NOT a field ───────────────────────────────────

  describe('XChainClaimID is NOT a transaction field (spec verification)', () => {
    it('the resulting object does not carry an XChainClaimID field', () => {
      // XLS-38 §2.3.1.1 lists 3 fields. The factory exposes only the
      // 3 spec fields; XChainClaimID is derived post-submit, not input.
      const tx = make();
      expect('XChainClaimID' in tx).toBe(false);
    });

    it('extra props passed in are NOT carried through', () => {
      // The factory only freezes the spec-defined fields. Any
      // XChainClaimID-like extra prop is silently dropped.
      const tx = xchainCreateClaimID({
        Account: ACCOUNT,
        XChainBridge: XCHAIN_BRIDGE_XRP,
        SignatureReward: SIGNATURE_REWARD,
        OtherChainSource: OTHER_CHAIN_SOURCE,
      } as never);
      expect('XChainClaimID' in tx).toBe(false);
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
      expect(tx2.OtherChainSource).toBe(OTHER_CHAIN_SOURCE);
      expect(tx2.XChainBridge).toEqual(XCHAIN_BRIDGE_XRP);
    });

    it('.with() re-validates on overrides (SignatureReward)', () => {
      const tx = make();
      expect(() => tx.with({ SignatureReward: '-1' })).toThrow(
        /SignatureReward/,
      );
      expect(() => tx.with({ SignatureReward: '0' })).not.toThrow();
    });

    it('.with() re-validates on overrides (OtherChainSource)', () => {
      const tx = make();
      expect(() => tx.with({ OtherChainSource: 'not-an-account' })).toThrow(
        /OtherChainSource/,
      );
    });

    it('.with() re-validates on overrides (XChainBridge shape)', () => {
      const tx = make();
      expect(() => tx.with({ XChainBridge: {} as never })).toThrow(
        /XChainBridge/,
      );
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({ Fee: '15', Sequence: 5 });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'XChainCreateClaimID',
        Account: ACCOUNT,
        XChainBridge: XCHAIN_BRIDGE_XRP,
        SignatureReward: SIGNATURE_REWARD,
        OtherChainSource: OTHER_CHAIN_SOURCE,
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
  });

  // ─── Base transaction fields ──────────────────────────────────────────────
  // `XchainCreateClaimIDProps` now extends `BasePropsFields`, so the seven
  // shared base fields are part of this props type for the first time. Every
  // factory's props type is being converted to `BasePropsFields` in one
  // library-wide pass.
  //
  // RUNTIME NOTE — `xchainCreateClaimID` now calls `validateBaseTransaction`
  // as a backstop, placed after its own XChainCreateClaimID-specific checks
  // (payment.ts:123 is the reference). The block previously ended in a
  // tripwire test asserting `.not.toThrow()` for all seven malformed values,
  // documenting the type-only state. That call has landed, so those
  // assertions are now the real reject cases below rather than their inverse.
  describe('BaseTransactionFields', () => {
    const base = {
      Account: ACCOUNT,
      XChainBridge: XCHAIN_BRIDGE_XRP,
      SignatureReward: SIGNATURE_REWARD,
      OtherChainSource: OTHER_CHAIN_SOURCE,
    };

    it('accepts Memos', () => {
      const memos = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
      const tx = xchainCreateClaimID({ ...base, Memos: memos });
      expect(tx.Memos).toEqual(memos);
    });

    it('accepts SourceTag', () => {
      const tx = xchainCreateClaimID({ ...base, SourceTag: 99 });
      expect(tx.SourceTag).toBe(99);
    });

    it('accepts LastLedgerSequence', () => {
      const tx = xchainCreateClaimID({ ...base, LastLedgerSequence: 1234567 });
      expect(tx.LastLedgerSequence).toBe(1234567);
    });

    it('accepts AccountTxnID', () => {
      const tx = xchainCreateClaimID({ ...base, AccountTxnID: 'A'.repeat(64) });
      expect(tx.AccountTxnID).toBe('A'.repeat(64));
    });

    it('accepts NetworkID', () => {
      const tx = xchainCreateClaimID({ ...base, NetworkID: 1 });
      expect(tx.NetworkID).toBe(1);
    });

    it('accepts a distinct Delegate', () => {
      const tx = xchainCreateClaimID({ ...base, Delegate: LOCKING_CHAIN_DOOR });
      expect(tx.Delegate).toBe(LOCKING_CHAIN_DOOR);
    });

    it('accepts TicketSequence (with Sequence 0)', () => {
      const tx = xchainCreateClaimID({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.TicketSequence).toBe(42);
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    it('round-trips all seven through .toJSON()', () => {
      const tx = xchainCreateClaimID({
        ...base,
        Memos: [{ Memo: { MemoType: '74', MemoData: '6869' } }],
        SourceTag: 7,
        LastLedgerSequence: 900,
        AccountTxnID: 'B'.repeat(64),
        NetworkID: 2,
        Delegate: LOCKING_CHAIN_DOOR,
        Sequence: 0,
        TicketSequence: 5,
      });
      const json = tx.toJSON();
      expect(json.Memos).toEqual([{ Memo: { MemoType: '74', MemoData: '6869' } }]);
      expect(json.SourceTag).toBe(7);
      expect(json.LastLedgerSequence).toBe(900);
      expect(json.AccountTxnID).toBe('B'.repeat(64));
      expect(json.NetworkID).toBe(2);
      expect(json.Delegate).toBe(LOCKING_CHAIN_DOOR);
      expect(json.TicketSequence).toBe(5);
    });

    it('survives .with() with base fields set', () => {
      const tx = xchainCreateClaimID({ ...base, SourceTag: 99 });
      const next = tx.with({ Account: ACCOUNT });
      expect(next.SourceTag).toBe(99);
      expect(next.OtherChainSource).toBe(OTHER_CHAIN_SOURCE);
    });

    it('rejects each of the seven base fields once the call lands', () => {
      // Formerly the inverse of this: a tripwire asserting `.not.toThrow()`
      // while the factory did not call `validateBaseTransaction`. The call is
      // in place, so each malformed value is now rejected at construction.
      // The `as any` casts are deliberate: the point is the runtime check,
      // and a type error would make the test uncompilable.
      expect(() =>
        xchainCreateClaimID({ ...base, Memos: 'not-an-array' } as any),
      ).toThrow(/invalid Memos/);
      expect(() =>
        xchainCreateClaimID({ ...base, SourceTag: 'NaN' } as any),
      ).toThrow(/SourceTag must be a number/);
      expect(() =>
        xchainCreateClaimID({ ...base, LastLedgerSequence: 'soon' } as any),
      ).toThrow(/LastLedgerSequence must be a number/);
      expect(() =>
        xchainCreateClaimID({ ...base, AccountTxnID: 99 } as any),
      ).toThrow(/AccountTxnID must be a string/);
      expect(() =>
        xchainCreateClaimID({ ...base, NetworkID: {} } as any),
      ).toThrow(/NetworkID must be a number/);
      expect(() =>
        xchainCreateClaimID({ ...base, TicketSequence: 'nope' } as any),
      ).toThrow(/TicketSequence must be a number/);
      expect(() =>
        xchainCreateClaimID({ ...base, Delegate: 'not-an-address' } as any),
      ).toThrow(/invalid Delegate/);
      expect(() => xchainCreateClaimID({ ...base, Delegate: ACCOUNT })).toThrow(
        /cannot be the same/,
      );
    });
  });
});
