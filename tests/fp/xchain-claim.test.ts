/**
 * Tests for the functional XChainClaim factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, Amount, XChainClaimID,
 *      Destination, XChainBridge).
 *   2. Spec-mandated guards the class API omits:
 *        a. Account / Destination must be valid XRPL addresses.
 *        b. XChainBridge shape: 4 keys, both doors as valid XRPL
 *           accounts, both Issues as valid Issue forms.
 *        c. XChainClaimID accepts number or decimal string; UInt64 range.
 *        d. DestinationTag is UInt32 when present (XLS-38 §2.3.4.1.4).
 *        e. Amount must be strictly positive across all three Amount
 *           forms (XRP / IOU / MPT).
 *   3. Frozen-shape contract (mutation throws, .with() returns a new
 *      frozen object, .toJSON() strips methods + undefined fields).
 *   4. .with() re-validates the merged shape.
 *   5. Compatibility with the xrpl.org example JSON shape.
 *
 * Spec sources verified against:
 *   - xrpl.js:  ~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/XChainClaim.ts
 *   - xrpl.org: ~/.mavis/docs.local/xrpl-dev-portal/repo/docs/references/protocol/transactions/types/xchainclaim.md
 *   - XLS-38:   ~/.mavis/docs.local/xrpl-standards/repo/XLS-0038-cross-chain-bridge/README.md §2.3.4
 */
import { describe, it, expect } from 'vitest';
import { xchainClaim } from '../../src/fp/factories/xchain-claim.js';

// Account that owns the XChainOwnedClaimID on the destination chain
// (xrpl.org example line 23).
const ACCOUNT = 'rahDmoXrtPdh7sUdrPjini3gcnTVYjbjjw';
// Destination on the destination chain (xrpl.org example line 27).
const DESTINATION = 'rahDmoXrtPdh7sUdrPjini3gcnTVYjbjjw';
// Door accounts (xrpl.org example lines 30, 34).
const LOCKING_CHAIN_DOOR = 'rMAXACCrp3Y8PpswXcg3bKggHX76V3F8M4';
const ISSUING_CHAIN_DOOR = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

// XRP-XRP bridge (from the xrpl.org example JSON).
const XCHAIN_BRIDGE = {
  LockingChainDoor: LOCKING_CHAIN_DOOR,
  LockingChainIssue: { currency: 'XRP' },
  IssuingChainDoor: ISSUING_CHAIN_DOOR,
  IssuingChainIssue: { currency: 'XRP' },
};

// IOU-IOU bridge — XChainClaim is bridge-agnostic, so IOU forms are
// in spec (XLS-38 §2.3.4 has no XRP-only restriction, unlike
// XChainAccountCreateCommit §2.4.1).
const ISSUER_I = 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B';
const ISSUER_II = 'rNCFjv8Ek5oDrNiMJ3pw6eLLFtMjZLJnf2';
const XCHAIN_BRIDGE_IOU = {
  LockingChainDoor: LOCKING_CHAIN_DOOR,
  LockingChainIssue: { currency: 'USD', issuer: ISSUER_I },
  IssuingChainDoor: ISSUING_CHAIN_DOOR,
  IssuingChainIssue: { currency: 'USD', issuer: ISSUER_II },
};

// XChainClaimID examples taken from canonical sources:
//   xrpl.org example line 26: "13f" — note this is NOT a valid decimal
//     integer (the XRPL wire format encodes UInt64 as a decimal string,
//     so we use the decimal equivalent "319"). The literal "13f" form
//     is rejected by the factory (see "rejects hex-like strings" test).
//   xrpl.js test fixture line 35: "0000000000000001"
//   XLS-38 §2.3.4.1.2 line 543: "the unique integer ID"
const XCHAIN_CLAIM_ID_HEX_STRING = '319'; // decimal equivalent of 0x13f
const XCHAIN_CLAIM_ID_NUMBER = 319;
const XCHAIN_CLAIM_ID_PADDED = '0000000000000001';

const AMOUNT_XRP = '10000';
const AMOUNT_IOU = { currency: 'USD', issuer: ISSUER_I, value: '250' };
const AMOUNT_MPT = { mpt_issuance_id: '00000000000000000000000004', value: '75' };

function make(extras: Record<string, unknown> = {}) {
  return xchainClaim({
    Account: ACCOUNT,
    XChainBridge: XCHAIN_BRIDGE,
    XChainClaimID: XCHAIN_CLAIM_ID_HEX_STRING,
    Destination: DESTINATION,
    Amount: AMOUNT_XRP,
    ...extras,
  });
}

// ─── Construction ────────────────────────────────────────────────────

describe('fp/xchainClaim()', () => {
  describe('construction', () => {
    it('constructs with all required fields (XRP-XRP bridge, string XChainClaimID)', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('XChainClaim');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.Amount).toBe(AMOUNT_XRP);
      expect(tx.XChainClaimID).toBe(XCHAIN_CLAIM_ID_HEX_STRING);
      expect(tx.Destination).toBe(DESTINATION);
      expect(tx.XChainBridge).toEqual(XCHAIN_BRIDGE);
    });

    it('matches the xrpl.org example JSON shape (modulo XChainClaimID format)', () => {
      // xrpl.org xchainclaim.md lines 22–38. The example uses
      // XChainClaimID="13f", which is NOT a valid decimal integer
      // (XRPL wire format encodes UInt64 as a decimal string). The
      // factory rejects the literal "13f"; this test uses the decimal
      // equivalent "319".
      const tx = xchainClaim({
        Account: ACCOUNT,
        Amount: '10000',
        XChainClaimID: '319',
        Destination: DESTINATION,
        XChainBridge: XCHAIN_BRIDGE,
      });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'XChainClaim',
        Account: ACCOUNT,
        Amount: '10000',
        XChainClaimID: '319',
        Destination: DESTINATION,
        XChainBridge: XCHAIN_BRIDGE,
      });
    });

    it('accepts an IOU-IOU bridge shape (XChainClaim is bridge-agnostic)', () => {
      const tx = xchainClaim({
        Account: ACCOUNT,
        XChainBridge: XCHAIN_BRIDGE_IOU,
        XChainClaimID: XCHAIN_CLAIM_ID_NUMBER,
        Destination: DESTINATION,
        Amount: AMOUNT_IOU,
      });
      expect(tx.XChainBridge).toEqual(XCHAIN_BRIDGE_IOU);
      expect(tx.Amount).toEqual(AMOUNT_IOU);
    });

    it('accepts numeric XChainClaimID (XRPL wire also encodes UInt64 as decimal string)', () => {
      const tx = make({ XChainClaimID: XCHAIN_CLAIM_ID_NUMBER });
      expect(tx.XChainClaimID).toBe(XCHAIN_CLAIM_ID_NUMBER);
    });

    it('accepts optional DestinationTag (UInt32)', () => {
      const tx = make({ DestinationTag: 12345 });
      expect(tx.DestinationTag).toBe(12345);
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
        xchainClaim({
          Account: '' as never,
          XChainBridge: XCHAIN_BRIDGE,
          XChainClaimID: XCHAIN_CLAIM_ID_HEX_STRING,
          Destination: DESTINATION,
          Amount: AMOUNT_XRP,
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      expect(() =>
        xchainClaim({
          Account: 'not-an-account' as never,
          XChainBridge: XCHAIN_BRIDGE,
          XChainClaimID: XCHAIN_CLAIM_ID_HEX_STRING,
          Destination: DESTINATION,
          Amount: AMOUNT_XRP,
        }),
      ).toThrow(/Account/);
    });
  });

  // ─── XChainBridge validation ────────────────────────────────────────

  describe('XChainBridge validation', () => {
    it('throws on missing XChainBridge', () => {
      expect(() =>
        xchainClaim({
          Account: ACCOUNT,
          XChainBridge: undefined as never,
          XChainClaimID: XCHAIN_CLAIM_ID_HEX_STRING,
          Destination: DESTINATION,
          Amount: AMOUNT_XRP,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws on empty-object XChainBridge', () => {
      expect(() =>
        xchainClaim({
          Account: ACCOUNT,
          XChainBridge: {} as never,
          XChainClaimID: XCHAIN_CLAIM_ID_HEX_STRING,
          Destination: DESTINATION,
          Amount: AMOUNT_XRP,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws when XChainBridge has too few keys', () => {
      expect(() =>
        xchainClaim({
          Account: ACCOUNT,
          XChainBridge: {
            LockingChainDoor: LOCKING_CHAIN_DOOR,
            LockingChainIssue: { currency: 'XRP' },
            IssuingChainDoor: ISSUING_CHAIN_DOOR,
          } as never,
          XChainClaimID: XCHAIN_CLAIM_ID_HEX_STRING,
          Destination: DESTINATION,
          Amount: AMOUNT_XRP,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws when XChainBridge has too many keys', () => {
      expect(() =>
        xchainClaim({
          Account: ACCOUNT,
          XChainBridge: {
            LockingChainDoor: LOCKING_CHAIN_DOOR,
            LockingChainIssue: { currency: 'XRP' },
            IssuingChainDoor: ISSUING_CHAIN_DOOR,
            IssuingChainIssue: { currency: 'XRP' },
            ExtraKey: 'foo',
          } as never,
          XChainClaimID: XCHAIN_CLAIM_ID_HEX_STRING,
          Destination: DESTINATION,
          Amount: AMOUNT_XRP,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws when XChainBridge.LockingChainIssue is malformed (single non-XRP key)', () => {
      expect(() =>
        xchainClaim({
          Account: ACCOUNT,
          XChainBridge: {
            LockingChainDoor: LOCKING_CHAIN_DOOR,
            LockingChainIssue: { issuer: ISSUER_I } as never,
            IssuingChainDoor: ISSUING_CHAIN_DOOR,
            IssuingChainIssue: { currency: 'XRP' },
          },
          XChainClaimID: XCHAIN_CLAIM_ID_HEX_STRING,
          Destination: DESTINATION,
          Amount: AMOUNT_XRP,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws when XChainBridge.LockingChainDoor is not a valid XRPL account', () => {
      expect(() =>
        xchainClaim({
          Account: ACCOUNT,
          XChainBridge: {
            LockingChainDoor: 'not-an-account',
            LockingChainIssue: { currency: 'XRP' },
            IssuingChainDoor: ISSUING_CHAIN_DOOR,
            IssuingChainIssue: { currency: 'XRP' },
          },
          XChainClaimID: XCHAIN_CLAIM_ID_HEX_STRING,
          Destination: DESTINATION,
          Amount: AMOUNT_XRP,
        }),
      ).toThrow(/LockingChainDoor/);
    });

    it('throws when XChainBridge.IssuingChainDoor is not a valid XRPL account', () => {
      expect(() =>
        xchainClaim({
          Account: ACCOUNT,
          XChainBridge: {
            LockingChainDoor: LOCKING_CHAIN_DOOR,
            LockingChainIssue: { currency: 'XRP' },
            IssuingChainDoor: 'not-an-account',
            IssuingChainIssue: { currency: 'XRP' },
          },
          XChainClaimID: XCHAIN_CLAIM_ID_HEX_STRING,
          Destination: DESTINATION,
          Amount: AMOUNT_XRP,
        }),
      ).toThrow(/IssuingChainDoor/);
    });
  });

  // ─── XChainClaimID validation ──────────────────────────────────────

  describe('XChainClaimID validation', () => {
    it('accepts a decimal integer string (XRP wire form)', () => {
      const tx = make({ XChainClaimID: XCHAIN_CLAIM_ID_PADDED });
      expect(tx.XChainClaimID).toBe(XCHAIN_CLAIM_ID_PADDED);
    });

    it('accepts a hex-like string ("13f" — same as xrpl.org example) ⇒ rejected (must be decimal)', () => {
      // xrpl.org example uses "13f" but XRPL wire format encodes UInt64
      // as a decimal string. The factory enforces the wire-format
      // decimal rule; callers copying the xrpl.org example verbatim
      // (or passing hex) get a clear validation error at construction.
      expect(() => make({ XChainClaimID: '13f' })).toThrow(/XChainClaimID/);
    });

    it('accepts an integer Number', () => {
      const tx = make({ XChainClaimID: 12345 });
      expect(tx.XChainClaimID).toBe(12345);
    });

    it('accepts 0 (UInt64 boundary)', () => {
      const tx = make({ XChainClaimID: '0' });
      expect(tx.XChainClaimID).toBe('0');
    });

    it('throws on missing XChainClaimID', () => {
      expect(() =>
        xchainClaim({
          Account: ACCOUNT,
          XChainBridge: XCHAIN_BRIDGE,
          XChainClaimID: undefined as unknown as string,
          Destination: DESTINATION,
          Amount: AMOUNT_XRP,
        }),
      ).toThrow(/XChainClaimID/);
    });

    it('throws when XChainClaimID is an object (not number or string)', () => {
      expect(() =>
        xchainClaim({
          Account: ACCOUNT,
          XChainBridge: XCHAIN_BRIDGE,
          XChainClaimID: { currency: 'ETH' } as never,
          Destination: DESTINATION,
          Amount: AMOUNT_XRP,
        }),
      ).toThrow(/XChainClaimID/);
    });

    it('throws on non-decimal XChainClaimID string', () => {
      expect(() => make({ XChainClaimID: 'not-a-number' })).toThrow(
        /XChainClaimID/,
      );
    });

    it('throws on negative numeric XChainClaimID', () => {
      expect(() => make({ XChainClaimID: -1 })).toThrow(/XChainClaimID/);
    });

    it('throws on non-integer numeric XChainClaimID', () => {
      expect(() => make({ XChainClaimID: 1.5 })).toThrow(/XChainClaimID/);
    });
  });

  // ─── Destination / DestinationTag validation ───────────────────────

  describe('Destination validation', () => {
    it('throws on missing Destination', () => {
      expect(() =>
        xchainClaim({
          Account: ACCOUNT,
          XChainBridge: XCHAIN_BRIDGE,
          XChainClaimID: XCHAIN_CLAIM_ID_HEX_STRING,
          Destination: '' as never,
          Amount: AMOUNT_XRP,
        }),
      ).toThrow(/Destination/);
    });

    it('throws on malformed Destination', () => {
      expect(() =>
        xchainClaim({
          Account: ACCOUNT,
          XChainBridge: XCHAIN_BRIDGE,
          XChainClaimID: XCHAIN_CLAIM_ID_HEX_STRING,
          Destination: 'not-an-account' as never,
          Amount: AMOUNT_XRP,
        }),
      ).toThrow(/Destination/);
    });
  });

  describe('DestinationTag validation', () => {
    it('accepts DestinationTag = 0 (UInt32 boundary)', () => {
      const tx = make({ DestinationTag: 0 });
      expect(tx.DestinationTag).toBe(0);
    });

    it('accepts DestinationTag at UInt32 max', () => {
      const tx = make({ DestinationTag: 0xffffffff });
      expect(tx.DestinationTag).toBe(0xffffffff);
    });

    it('throws on negative DestinationTag', () => {
      expect(() => make({ DestinationTag: -1 })).toThrow(/DestinationTag/);
    });

    it('throws on DestinationTag > UInt32 max', () => {
      expect(() => make({ DestinationTag: 0x100000000 })).toThrow(
        /DestinationTag/,
      );
    });

    it('throws on non-integer DestinationTag', () => {
      expect(() => make({ DestinationTag: 1.5 })).toThrow(/DestinationTag/);
    });

    it('throws on string DestinationTag (must be a Number, not a string)', () => {
      // xrpl.js validateOptionalField(tx, 'DestinationTag', isNumber)
      // rejects strings. XLS-38 §2.3.4.1.4 marks it `UInt32` (Number).
      expect(() => make({ DestinationTag: '12345' as never })).toThrow(
        /DestinationTag/,
      );
    });
  });

  // ─── Amount validation ──────────────────────────────────────────────

  describe('Amount validation', () => {
    it('throws on missing Amount', () => {
      expect(() =>
        xchainClaim({
          Account: ACCOUNT,
          XChainBridge: XCHAIN_BRIDGE,
          XChainClaimID: XCHAIN_CLAIM_ID_HEX_STRING,
          Destination: DESTINATION,
          Amount: undefined as unknown as string,
        }),
      ).toThrow(/Amount/);
    });

    it('throws on Amount = "0" (XRP — must be strictly positive)', () => {
      // XLS-38 §2.3.4.1.5: Amount must match the attestation amount,
      // which itself is the XChainCommit amount (always positive).
      expect(() => make({ Amount: '0' })).toThrow(/strictly positive/);
    });

    it('throws on IOU Amount with value="0"', () => {
      expect(() =>
        make({
          Amount: { currency: 'USD', issuer: ISSUER_I, value: '0' },
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on MPT Amount with value="0"', () => {
      expect(() =>
        make({
          Amount: { mpt_issuance_id: '00000000000000000000000004', value: '0' },
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on negative XRP Amount', () => {
      expect(() => make({ Amount: '-1' })).toThrow(/XRP/);
    });

    it('throws on negative IOU Amount value', () => {
      expect(() =>
        make({
          Amount: { currency: 'USD', issuer: ISSUER_I, value: '-1' },
        }),
      ).toThrow(/value/);
    });

    it('accepts MPT Amount', () => {
      const tx = make({ Amount: AMOUNT_MPT });
      expect(tx.Amount).toEqual(AMOUNT_MPT);
    });

    it('throws on completely malformed Amount', () => {
      expect(() => make({ Amount: { foo: 'bar' } as never })).toThrow(/Amount/);
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
      expect(tx.Amount).toBe(AMOUNT_XRP);
    });

    it('.with() preserves unchanged fields', () => {
      const tx = make({ Fee: '15', Sequence: 5, DestinationTag: 42 });
      const tx2 = tx.with({ Fee: '20' });
      expect(tx2.Fee).toBe('20');
      expect(tx2.Sequence).toBe(5);
      expect(tx2.DestinationTag).toBe(42);
      expect(tx2.Account).toBe(ACCOUNT);
      expect(tx2.XChainBridge).toEqual(XCHAIN_BRIDGE);
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() => tx.with({ Amount: '0' })).toThrow(/strictly positive/);
      expect(() => tx.with({ Amount: '-1' })).toThrow(/XRP/);
      expect(() =>
        tx.with({ Destination: 'bad' as never }),
      ).toThrow(/Destination/);
      expect(() =>
        tx.with({ DestinationTag: 0x100000000 }),
      ).toThrow(/DestinationTag/);
      expect(() =>
        tx.with({ XChainClaimID: -1 }),
      ).toThrow(/XChainClaimID/);
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
      const tx = make({
        Fee: '15',
        Sequence: 5,
        DestinationTag: 999,
        Flags: 0,
      });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'XChainClaim',
        Account: ACCOUNT,
        Amount: AMOUNT_XRP,
        XChainClaimID: XCHAIN_CLAIM_ID_HEX_STRING,
        Destination: DESTINATION,
        XChainBridge: XCHAIN_BRIDGE,
        DestinationTag: 999,
        Fee: '15',
        Sequence: 5,
        Flags: 0,
      });
    });

    it('.toJSON() skips undefined fields and methods', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('DestinationTag' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
      expect('Flags' in json).toBe(false);
    });

    it('.validate() is a no-op after construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });
});
