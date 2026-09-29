/**
 * Tests for the functional XChainCommit factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, Amount, XChainClaimID,
 *      XChainBridge). OtherChainDestination is OPTIONAL per XLS-38.
 *   2. Spec-mandated guards the class API omits:
 *        a. Account must be a valid XRPL address.
 *        b. XChainBridge shape: 4 keys, both doors as valid XRPL
 *           accounts, both Issues as valid Issue forms.
 *        c. XChainClaimID accepts number or decimal string; UInt64 range.
 *        d. Amount must be strictly positive across all three Amount
 *           forms (XRP / IOU / MPT); IOU issuer must be a valid XRPL
 *           account; IOU/MPT value must be a non-negative decimal int
 *           string.
 *        e. OtherChainDestination (optional) must be a valid XRPL
 *           address when present.
 *   3. Frozen-shape contract (mutation throws, .with() returns a new
 *      frozen object, .toJSON() strips methods + undefined fields).
 *   4. .with() re-validates the merged shape.
 *   5. Compatibility with the xrpl.org example JSON shape.
 *
 * Spec sources verified against:
 *   - xrpl.js:  /Users/jdobson/developer/128-xrp-tx-builder/node_modules/xrpl/src/models/transactions/XChainCommit.ts
 *   - xrpl.org: https://xrpl.org/docs/references/protocol/transactions/types/xchaincommit
 *   - XLS-38:   https://github.com/XRPLF/XRPL-Standards/blob/master/XLS-0038-cross-chain-bridge/README.md
 */
import { describe, it, expect } from 'vitest';
import { xchainCommit } from '../../src/fp/factories/xchain-commit.js';

// Sender of the XChainCommit on the locking chain (xrpl.org example).
const ACCOUNT = 'rMTi57fNy2UkUb4RcdoUeJm7gjxVQvxzUo';
// Destination account on the destination chain (when supplied).
const OTHER_CHAIN_DESTINATION = 'rahDmoXrtPdh7sUdrPjini3gcnTVYjbjjw';
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

// IOU-IOU bridge — XChainCommit is bridge-agnostic per XLS-38 §2.3.2.1.3
// line 440 ("must match the door account's LockingChainIssue or
// IssuingChainIssue"), so IOU forms are in spec.
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
//     integer (XRPL wire format encodes UInt64 as decimal). The literal
//     "13f" form is rejected by the factory. We use the decimal
//     equivalent "319" instead.
//   XLS-38 §2.3.2.1.2 line 432: "the unique integer ID" (UInt64).
const XCHAIN_CLAIM_ID_DECIMAL = '319'; // decimal equivalent of 0x13f
const XCHAIN_CLAIM_ID_NUMBER = 319;
const XCHAIN_CLAIM_ID_PADDED = '0000000000000001';

const AMOUNT_XRP = '10000';
const AMOUNT_IOU = { currency: 'USD', issuer: ISSUER_I, value: '250' };
const AMOUNT_MPT = {
  mpt_issuance_id: '00000000000000000000000004',
  value: '75',
};

function make(extras: Record<string, unknown> = {}) {
  return xchainCommit({
    Account: ACCOUNT,
    XChainBridge: XCHAIN_BRIDGE,
    XChainClaimID: XCHAIN_CLAIM_ID_DECIMAL,
    Amount: AMOUNT_XRP,
    ...extras,
  });
}

// ─── Construction ────────────────────────────────────────────────────

describe('fp/xchainCommit()', () => {
  describe('construction', () => {
    it('constructs with all required fields (XRP-XRP bridge, string XChainClaimID)', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('XChainCommit');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.Amount).toBe(AMOUNT_XRP);
      expect(tx.XChainClaimID).toBe(XCHAIN_CLAIM_ID_DECIMAL);
      expect(tx.XChainBridge).toEqual(XCHAIN_BRIDGE);
    });

    it('constructs without OtherChainDestination (XLS-38 §2.3.2.1.4 marks it optional)', () => {
      const tx = make();
      expect('OtherChainDestination' in tx).toBe(false);
    });

    it('matches the xrpl.org example JSON shape (modulo XChainClaimID format)', () => {
      // xrpl.org xchaincommit.md lines 16–29. The example uses
      // XChainClaimID="13f", which is NOT a valid decimal integer
      // (XRPL wire format encodes UInt64 as a decimal string). The
      // factory rejects the literal "13f"; this test uses the decimal
      // equivalent "319".
      const tx = xchainCommit({
        Account: ACCOUNT,
        Amount: '10000',
        XChainClaimID: '319',
        XChainBridge: XCHAIN_BRIDGE,
      });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'XChainCommit',
        Account: ACCOUNT,
        Amount: '10000',
        XChainClaimID: '319',
        XChainBridge: XCHAIN_BRIDGE,
      });
    });

    it('accepts an IOU-IOU bridge shape (XChainCommit is bridge-agnostic)', () => {
      const tx = xchainCommit({
        Account: ACCOUNT,
        XChainBridge: XCHAIN_BRIDGE_IOU,
        XChainClaimID: XCHAIN_CLAIM_ID_NUMBER,
        Amount: AMOUNT_IOU,
      });
      expect(tx.XChainBridge).toEqual(XCHAIN_BRIDGE_IOU);
      expect(tx.Amount).toEqual(AMOUNT_IOU);
    });

    it('accepts an MPT Amount', () => {
      const tx = make({ Amount: AMOUNT_MPT });
      expect(tx.Amount).toEqual(AMOUNT_MPT);
    });

    it('accepts Fee / Sequence / numeric Flags as base transaction fields', () => {
      const tx = make({
        Fee: '10',
        Sequence: 42,
        Flags: 0,
      });
      expect(tx.Fee).toBe('10');
      expect(tx.Sequence).toBe(42);
      expect(tx.Flags).toBe(0);
    });
  });

  // ─── Account validation ─────────────────────────────────────────────

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        xchainCommit({
          Account: '',
          XChainBridge: XCHAIN_BRIDGE,
          XChainClaimID: XCHAIN_CLAIM_ID_DECIMAL,
          Amount: AMOUNT_XRP,
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      expect(() =>
        xchainCommit({
          Account: 'not-an-account',
          XChainBridge: XCHAIN_BRIDGE,
          XChainClaimID: XCHAIN_CLAIM_ID_DECIMAL,
          Amount: AMOUNT_XRP,
        }),
      ).toThrow(/Account/);
    });
  });

  // ─── XChainBridge validation ────────────────────────────────────────

  describe('XChainBridge validation', () => {
    it('throws on missing XChainBridge', () => {
      expect(() =>
        xchainCommit({
          Account: ACCOUNT,
          XChainBridge: undefined as unknown as Record<string, unknown>,
          XChainClaimID: XCHAIN_CLAIM_ID_DECIMAL,
          Amount: AMOUNT_XRP,
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws on XChainBridge with wrong shape (empty object)', () => {
      expect(() =>
        make({ XChainBridge: {} }),
      ).toThrow(/XChainBridge/);
    });

    it('throws on XChainBridge with extra keys', () => {
      expect(() =>
        make({
          XChainBridge: {
            ...XCHAIN_BRIDGE,
            ExtraKey: 'value',
          },
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws when LockingChainDoor is not a valid XRPL account', () => {
      expect(() =>
        make({
          XChainBridge: {
            ...XCHAIN_BRIDGE,
            LockingChainDoor: 'not-an-account',
          },
        }),
      ).toThrow(/LockingChainDoor/);
    });

    it('throws when IssuingChainDoor is not a valid XRPL account', () => {
      expect(() =>
        make({
          XChainBridge: {
            ...XCHAIN_BRIDGE,
            IssuingChainDoor: 'bad-door',
          },
        }),
      ).toThrow(/IssuingChainDoor/);
    });

    it('throws when LockingChainIssue has the wrong shape (non-string currency)', () => {
      expect(() =>
        make({
          XChainBridge: {
            ...XCHAIN_BRIDGE,
            LockingChainIssue: { currency: 123 as unknown as string },
          },
        }),
      ).toThrow(/XChainBridge/);
    });

    it('throws when IssuingChainIssue is missing the issuer on an IOU bridge', () => {
      expect(() =>
        make({
          XChainBridge: {
            LockingChainDoor: LOCKING_CHAIN_DOOR,
            LockingChainIssue: { currency: 'USD' }, // missing issuer
            IssuingChainDoor: ISSUING_CHAIN_DOOR,
            IssuingChainIssue: { currency: 'USD', issuer: ISSUER_II },
          },
        }),
      ).toThrow(/XChainBridge/);
    });
  });

  // ─── XChainClaimID validation ───────────────────────────────────────

  describe('XChainClaimID validation', () => {
    it('throws on missing XChainClaimID', () => {
      expect(() =>
        xchainCommit({
          Account: ACCOUNT,
          XChainBridge: XCHAIN_BRIDGE,
          XChainClaimID: undefined as unknown as number,
          Amount: AMOUNT_XRP,
        }),
      ).toThrow(/XChainClaimID/);
    });

    it('accepts XChainClaimID as a non-negative integer number', () => {
      const tx = make({ XChainClaimID: XCHAIN_CLAIM_ID_NUMBER });
      expect(tx.XChainClaimID).toBe(XCHAIN_CLAIM_ID_NUMBER);
    });

    it('accepts XChainClaimID as a zero-padded decimal string', () => {
      const tx = make({ XChainClaimID: XCHAIN_CLAIM_ID_PADDED });
      expect(tx.XChainClaimID).toBe(XCHAIN_CLAIM_ID_PADDED);
    });

    it('accepts XChainClaimID as the value 0', () => {
      const tx = make({ XChainClaimID: 0 });
      expect(tx.XChainClaimID).toBe(0);
    });

    it('throws on negative XChainClaimID number', () => {
      expect(() => make({ XChainClaimID: -1 })).toThrow(/XChainClaimID/);
    });

    it('throws on non-integer XChainClaimID number', () => {
      expect(() => make({ XChainClaimID: 1.5 })).toThrow(/XChainClaimID/);
    });

    it('throws on hex-like string XChainClaimID (XRPL wire format is decimal)', () => {
      // xrpl.org example uses "13f"; we reject the hex form because the
      // factory follows the XRPL wire format (decimal string).
      expect(() => make({ XChainClaimID: '13f' })).toThrow(
        /decimal integer/,
      );
    });

    it('throws on non-numeric string XChainClaimID', () => {
      expect(() => make({ XChainClaimID: 'abc' })).toThrow(/XChainClaimID/);
    });

    it('throws on XChainClaimID exceeding Number.MAX_SAFE_INTEGER', () => {
      // 2^53 + 1 — fits in UInt64 but not in a JS number.
      expect(() =>
        make({ XChainClaimID: Number.MAX_SAFE_INTEGER + 1 }),
      ).toThrow(/safe integer/);
    });
  });

  // ─── Amount validation ──────────────────────────────────────────────

  describe('Amount validation', () => {
    it('accepts a strictly-positive XRP drops string Amount', () => {
      const tx = make({ Amount: '1' });
      expect(tx.Amount).toBe('1');
    });

    it('accepts a large XRP drops string Amount', () => {
      const tx = make({ Amount: '100000000000000000' });
      expect(tx.Amount).toBe('100000000000000000');
    });

    it('throws on missing Amount', () => {
      expect(() =>
        xchainCommit({
          Account: ACCOUNT,
          XChainBridge: XCHAIN_BRIDGE,
          XChainClaimID: XCHAIN_CLAIM_ID_DECIMAL,
          Amount: undefined as unknown as string,
        }),
      ).toThrow(/Amount/);
    });

    it('throws on Amount = "0" (XRP drops string)', () => {
      expect(() => make({ Amount: '0' })).toThrow(/strictly positive/);
    });

    it('throws on Amount = "-1" (XRP drops string)', () => {
      expect(() => make({ Amount: '-1' })).toThrow(/Amount/);
    });

    it('throws on Amount = "1.5" (decimal form not valid for XRP drops)', () => {
      expect(() => make({ Amount: '1.5' })).toThrow(/Amount/);
    });

    it('throws on malformed Amount (no recognized shape)', () => {
      expect(() =>
        make({ Amount: { foo: 'bar' } as never }),
      ).toThrow(/Amount/);
    });

    it('throws on IOU Amount with malformed issuer (not a valid XRPL account)', () => {
      expect(() =>
        make({
          Amount: {
            currency: 'USD',
            issuer: 'not-an-account',
            value: '100',
          } as never,
        }),
      ).toThrow(/issuer/);
    });

    it('throws on IOU Amount with negative value string', () => {
      expect(() =>
        make({
          Amount: { currency: 'USD', issuer: ISSUER_I, value: '-1' } as never,
        }),
      ).toThrow(/value/);
    });

    it('throws on IOU Amount with decimal value string', () => {
      expect(() =>
        make({
          Amount: {
            currency: 'USD',
            issuer: ISSUER_I,
            value: '1.5',
          } as never,
        }),
      ).toThrow(/value/);
    });

    it('throws on IOU Amount with value "0"', () => {
      expect(() =>
        make({
          Amount: { currency: 'USD', issuer: ISSUER_I, value: '0' } as never,
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on MPT Amount with value "0"', () => {
      expect(() =>
        make({
          Amount: {
            mpt_issuance_id: '00000000000000000000000004',
            value: '0',
          } as never,
        }),
      ).toThrow(/strictly positive/);
    });

    it('throws on MPT Amount with malformed value', () => {
      expect(() =>
        make({
          Amount: {
            mpt_issuance_id: '00000000000000000000000004',
            value: 'not-a-number',
          } as never,
        }),
      ).toThrow(/value/);
    });
  });

  // ─── OtherChainDestination validation ───────────────────────────────

  describe('OtherChainDestination validation', () => {
    it('accepts a valid XRPL classic address OtherChainDestination', () => {
      const tx = make({ OtherChainDestination: OTHER_CHAIN_DESTINATION });
      expect(tx.OtherChainDestination).toBe(OTHER_CHAIN_DESTINATION);
    });

    it('throws on malformed OtherChainDestination', () => {
      expect(() =>
        make({ OtherChainDestination: 'not-an-account' }),
      ).toThrow(/OtherChainDestination/);
    });

    it('throws on empty OtherChainDestination', () => {
      // Empty string is technically optional-omittable; the factory
      // treats "" as a present-but-invalid address (rejected).
      expect(() => make({ OtherChainDestination: '' })).toThrow(
        /OtherChainDestination/,
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
        (tx as unknown as { Amount: string }).Amount = '0';
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides', () => {
      const tx = make();
      const tx2 = tx.with({ Amount: '20000' });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Amount).toBe('20000');
      expect(tx.Amount).toBe(AMOUNT_XRP);
    });

    it('.with() preserves unchanged fields', () => {
      const tx = make({ OtherChainDestination: OTHER_CHAIN_DESTINATION });
      const tx2 = tx.with({ Sequence: 7 });
      expect(tx2.OtherChainDestination).toBe(OTHER_CHAIN_DESTINATION);
      expect(tx2.Sequence).toBe(7);
    });

    it('.with() re-validates the merged shape (Amount = 0)', () => {
      const tx = make();
      expect(() => tx.with({ Amount: '0' })).toThrow(/strictly positive/);
    });

    it('.with() re-validates the merged shape (malformed OtherChainDestination)', () => {
      const tx = make();
      expect(() =>
        tx.with({ OtherChainDestination: 'bad-address' }),
      ).toThrow(/OtherChainDestination/);
    });

    it('.with() re-validates the merged shape (malformed XChainBridge)', () => {
      const tx = make();
      expect(() => tx.with({ XChainBridge: {} })).toThrow(/XChainBridge/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({
        OtherChainDestination: OTHER_CHAIN_DESTINATION,
        Fee: '10',
        Sequence: 1,
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'XChainCommit',
        Account: ACCOUNT,
        XChainBridge: XCHAIN_BRIDGE,
        XChainClaimID: XCHAIN_CLAIM_ID_DECIMAL,
        Amount: AMOUNT_XRP,
        OtherChainDestination: OTHER_CHAIN_DESTINATION,
        Fee: '10',
        Sequence: 1,
      });
    });

    it('.toJSON() skips undefined fields', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('OtherChainDestination' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
      expect('Flags' in json).toBe(false);
    });

    it('.toJSON() omits the bound methods', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
    });

    it('.validate() is a no-op (already validated at construction)', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });
});