/**
 * Tests for the functional XChainModifyBridge factory.
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
 *   3. Flags handling: numeric + boolean-map form with
 *      `tfClearAccountCreateAmount`.
 *   4. Frozen-shape contract (mutation throws, .with() returns a new
 *      frozen object, .toJSON() strips methods + undefined fields).
 *   5. .with() re-validates the merged shape.
 *   6. Compatibility with the xrpl.org example JSON shape.
 *
 * Spec sources verified against:
 *   - xrpl.js:  ~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/XChainModifyBridge.ts
 *   - xrpl.org: ~/.mavis/docs.local/xrpl-dev-portal/repo/docs/references/protocol/transactions/types/xchainmodifybridge.md
 *   - XLS-38:   ~/.mavis/docs.local/xrpl-standards/repo/XLS-0038-cross-chain-bridge/README.md §2.2.2
 */
import { describe, it, expect } from 'vitest';
import type { XChainModifyBridgeFlagsInterface } from '../../src/types/flags.js';
import { xchainModifyBridge } from '../../src/fp/factories/xchain-modify-bridge.js';

// Sender / locking-chain door — taken from the xrpl.org example JSON
// (xchainmodifybridge.md lines 26, 28).
const ACCOUNT = 'rhWQzvdmhf5vFS35vtKUSUwNZHGT53qQsg';
// Issuing-chain door — xrpl.org example line 32.
const ISSUING_CHAIN_DOOR = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

// Canonical XRP-XRP bridge (XRP-XRP is one of two supported forms
// per XLS-38 §2.1.1 / xrpl.org example lines 29–38).
const XCHAIN_BRIDGE_XRP = {
  LockingChainDoor: ACCOUNT,
  LockingChainIssue: { currency: 'XRP' },
  IssuingChainDoor: ISSUING_CHAIN_DOOR,
  IssuingChainIssue: { currency: 'XRP' },
};

// IOU-IOU bridge — valid bridge shape per XLS-38 §2.1.1 / §2.2.2.
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

const SIGNATURE_REWARD = '250';
const MIN_ACCOUNT_CREATE_AMOUNT = '500000';
// XLS-38 §2.2.2.1.4 line 372; xrpl.org line 69.
const TF_CLEAR_ACCOUNT_CREATE_AMOUNT = 0x00010000;

function make(extras: Record<string, unknown> = {}) {
  return xchainModifyBridge({
    Account: ACCOUNT,
    XChainBridge: XCHAIN_BRIDGE_XRP,
    SignatureReward: SIGNATURE_REWARD,
    ...extras,
  });
}

// ─── Construction ────────────────────────────────────────────────────

describe('fp/xchainModifyBridge()', () => {
  describe('construction', () => {
    it('constructs with the minimum required field set', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('XChainModifyBridge');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.SignatureReward).toBe(SIGNATURE_REWARD);
      expect(tx.XChainBridge).toEqual(XCHAIN_BRIDGE_XRP);
      expect(tx.MinAccountCreateAmount).toBeUndefined();
    });

    it('matches the xrpl.org example JSON shape (with MinAccountCreateAmount)', () => {
      // xrpl.org xchainmodifybridge.md lines 25–39.
      const tx = xchainModifyBridge({
        Account: ACCOUNT,
        XChainBridge: XCHAIN_BRIDGE_XRP,
        SignatureReward: '200',
        MinAccountCreateAmount: '1000000',
      });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'XChainModifyBridge',
        Account: ACCOUNT,
        XChainBridge: XCHAIN_BRIDGE_XRP,
        SignatureReward: '200',
        MinAccountCreateAmount: '1000000',
      });
    });

    it('accepts an IOU-IOU bridge shape (bridge shape is permissive)', () => {
      const tx = xchainModifyBridge({
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
        xchainModifyBridge({
          Account: '' as never,
          XChainBridge: XCHAIN_BRIDGE_XRP,
          SignatureReward: SIGNATURE_REWARD,
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      expect(() =>
        xchainModifyBridge({
          Account: 'not-an-account' as never,
          XChainBridge: XCHAIN_BRIDGE_XRP,
          SignatureReward: SIGNATURE_REWARD,
        }),
      ).toThrow(/Account/);
    });

    it('throws when Account does not equal XChainBridge.LockingChainDoor', () => {
      // xrpl.org line 15: transaction must be sent by the door account.
      // The example JSON (lines 26, 28) sets Account === LockingChainDoor.
      expect(() =>
        xchainModifyBridge({
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
        xchainModifyBridge({
          Account: ACCOUNT,
          XChainBridge: undefined as never,
          SignatureReward: SIGNATURE_REWARD,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws on non-object XChainBridge', () => {
      expect(() =>
        xchainModifyBridge({
          Account: ACCOUNT,
          XChainBridge: 'not-an-object' as never,
          SignatureReward: SIGNATURE_REWARD,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws on empty-object XChainBridge', () => {
      expect(() =>
        xchainModifyBridge({
          Account: ACCOUNT,
          XChainBridge: {} as never,
          SignatureReward: SIGNATURE_REWARD,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws when XChainBridge has too few keys', () => {
      // 3 keys — missing IssuingChainIssue.
      expect(() =>
        xchainModifyBridge({
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
        xchainModifyBridge({
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
        xchainModifyBridge({
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
        xchainModifyBridge({
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
        xchainModifyBridge({
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
        xchainModifyBridge({
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
        xchainModifyBridge({
          Account: ACCOUNT,
          XChainBridge: XCHAIN_BRIDGE_XRP,
          SignatureReward: undefined as unknown as string,
        }),
      ).toThrow(/SignatureReward/);
    });

    it('throws on non-string SignatureReward', () => {
      expect(() =>
        xchainModifyBridge({
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
        xchainModifyBridge({
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
      expect(() => make({ SignatureReward: '0250' })).toThrow(
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
      // xrpl.org line 48: "This field can only be present on XRP-XRP
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
      expect(() => make({ MinAccountCreateAmount: '0500000' })).toThrow(
        /MinAccountCreateAmount/,
      );
    });
  });

  // ─── Flag handling ──────────────────────────────────────────────────

  describe('Flag handling', () => {
    it('accepts numeric Flags = 0 (no flags)', () => {
      const tx = make({ Flags: 0 });
      expect(tx.Flags).toBe(0);
    });

    it('accepts numeric Flags with tfClearAccountCreateAmount (0x00010000)', () => {
      // xrpl.org line 69; XLS-38 §2.2.2.1.4 line 372.
      const tx = make({ Flags: TF_CLEAR_ACCOUNT_CREATE_AMOUNT });
      expect(tx.Flags).toBe(TF_CLEAR_ACCOUNT_CREATE_AMOUNT);
    });

    it('accepts boolean-map Flags with tfClearAccountCreateAmount=true', () => {
      const flags: XChainModifyBridgeFlagsInterface = {
        tfClearAccountCreateAmount: true,
      };
      const tx = make({ Flags: flags });
      // Factory stores the original (object) form — same as
      // nftokenMint / vaultCreate pattern.
      expect(tx.Flags).toEqual(flags);
    });

    it('accepts boolean-map Flags with tfClearAccountCreateAmount=false', () => {
      const tx = make({ Flags: { tfClearAccountCreateAmount: false } });
      expect(tx.Flags).toEqual({ tfClearAccountCreateAmount: false });
    });

    it('round-trips Flags through .toJSON()', () => {
      const tx = make({ Flags: TF_CLEAR_ACCOUNT_CREATE_AMOUNT });
      expect(tx.toJSON().Flags).toBe(TF_CLEAR_ACCOUNT_CREATE_AMOUNT);
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

    it('.with() re-validates on overrides (XChainBridge shape)', () => {
      const tx = make();
      expect(() =>
        tx.with({ XChainBridge: { foo: 'bar' } as never }),
      ).toThrow(/XChainBridge/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({
        Fee: '15',
        Sequence: 5,
        MinAccountCreateAmount: MIN_ACCOUNT_CREATE_AMOUNT,
      });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'XChainModifyBridge',
        Account: ACCOUNT,
        XChainBridge: XCHAIN_BRIDGE_XRP,
        SignatureReward: SIGNATURE_REWARD,
        MinAccountCreateAmount: MIN_ACCOUNT_CREATE_AMOUNT,
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
});
