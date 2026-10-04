/**
 * Tests for the functional PaymentChannelClaim factory.
 *
 * Validates:
 *   1. Construction with required Account + Channel.
 *   2. Optional fields (Amount, Balance, PublicKey, Signature,
 *      CredentialIDs, Flags, Fee, Sequence).
 *   3. Spec-mandated guards the class API omits:
 *        a. Channel must be 64-char hex (UInt256) — not just a string.
 *        b. Amount / Balance must be strictly-positive XRP drops
 *           (no IOU/MPT forms, no zero/negative).
 *        c. PublicKey hex must be 32 or 33 bytes (Ed25519 or
 *           compressed secp256k1) when provided.
 *        d. Signature must be a hex string when provided.
 *        e. CredentialIDs must be supported, length in
 *           [1, MAX_AUTHORIZED_CREDENTIALS = 8], 64-char hex entries,
 *           no duplicates.
 *        f. Account must be a valid XRPL classic or X-address.
 *   4. Frozen-shape contract (mutation throws, .with() returns new
 *      frozen object, .toJSON() strips methods and undefined fields).
 *   5. Round-trip through xrpl encode/decode.
 */
import { describe, it, expect } from 'vitest';
import { decode, encode } from 'xrpl';
import { paymentChannelClaim } from '../../src/fp/factories/payment-channel-claim.js';

const ACCOUNT_A = 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn';
const ACCOUNT_B = 'rsA2LpzuawewSBQXkiju3YQTMzW13pAAdW';

// 64-char hex (UInt256) — typical PayChannel ledger object hash.
const CHANNEL_ID =
  'C1AE6DDDEEC05CF2978C0BAD6FE302948E9533691DC749DCDD3B9E5992CA6198';

// 33-byte (66 hex) compressed secp256k1 public key.
const PUBLIC_KEY_SECP =
  '32D2471DB72B27E3310F355BB33E339BF26F8392D5A93D3BC0FC3B566612DA0F0A';

// 32-byte (64 hex) Ed25519 public key.
const PUBLIC_KEY_ED25519 =
  'ED5C4EC5A6E6E6E6E6E6E6E6E6E6E6E6E6E6E6E6E6E6E6E6E6E6E6E6E6E6E6E6E6';

// Realistic DER-style signature (hex).
const SIGNATURE_OK =
  '30440220718D264EF05CAED7C781FF6DE298DCAC68D002562C9BF3A07C1E721B420C0DAB02203A5A4779EF4D2CCC7BC3EF886676D803A9981B928D3B8ACA483B80ECA3CD7B9B';

const BASE_PROPS = {
  Account: ACCOUNT_A,
  Channel: CHANNEL_ID,
};

function make(
  extras: Record<string, unknown> = {},
): ReturnType<typeof paymentChannelClaim> {
  return paymentChannelClaim({ ...BASE_PROPS, ...extras });
}

function hex64(seed: number): string {
  // Deterministic 64-char hex string from a small integer.
  const hex = seed.toString(16).padStart(2, '0');
  return (hex + '0'.repeat(64 - hex.length)).slice(0, 64);
}

describe('fp/paymentChannelClaim()', () => {
  describe('construction', () => {
    it('constructs with required Account + Channel only', () => {
      const tx = paymentChannelClaim(BASE_PROPS);
      expect(tx.TransactionType).toBe('PaymentChannelClaim');
      expect(tx.Account).toBe(ACCOUNT_A);
      expect(tx.Channel).toBe(CHANNEL_ID);
    });

    it('passes through Amount / Balance / PublicKey / Signature', () => {
      const tx = paymentChannelClaim({
        ...BASE_PROPS,
        Amount: '1000000',
        Balance: '1000000',
        PublicKey: PUBLIC_KEY_SECP,
        Signature: SIGNATURE_OK,
      });
      expect(tx.Amount).toBe('1000000');
      expect(tx.Balance).toBe('1000000');
      expect(tx.PublicKey).toBe(PUBLIC_KEY_SECP);
      expect(tx.Signature).toBe(SIGNATURE_OK);
    });

    it('passes through optional Fee/Sequence/Flags', () => {
      const tx = make({ Flags: 0, Fee: '12', Sequence: 8 });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(8);
      expect(tx.Flags).toBe(0);
    });

    it('passes through CredentialIDs', () => {
      const creds = [hex64(1), hex64(2)];
      const tx = make({ CredentialIDs: creds });
      expect(tx.CredentialIDs).toEqual(creds);
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        paymentChannelClaim({ ...BASE_PROPS, Account: '' as never }),
      ).toThrow(/Account/);
    });

    it('throws on invalid Account format', () => {
      expect(() =>
        paymentChannelClaim({
          ...BASE_PROPS,
          Account: 'not-a-classic-address',
        }),
      ).toThrow(/Account/);
    });
  });

  describe('Channel validation', () => {
    it('throws on missing Channel', () => {
      expect(() =>
        paymentChannelClaim({ ...BASE_PROPS, Channel: '' as never }),
      ).toThrow(/Channel/);
    });

    it('throws on a non-string Channel', () => {
      expect(() =>
        paymentChannelClaim({
          ...BASE_PROPS,
          Channel: 12345 as never,
        }),
      ).toThrow(/Channel/);
    });

    it('throws on a Channel of wrong length (too short)', () => {
      expect(() => make({ Channel: 'A'.repeat(63) })).toThrow(/Channel/);
    });

    it('throws on a Channel of wrong length (too long)', () => {
      expect(() => make({ Channel: 'A'.repeat(65) })).toThrow(/Channel/);
    });

    it('throws on a non-hex Channel', () => {
      expect(() =>
        make({ Channel: 'Z'.repeat(64) }),
      ).toThrow(/Channel/);
    });

    it('accepts a 64-char hex Channel (any hex content)', () => {
      const tx = make({ Channel: 'a'.repeat(64) });
      expect(tx.Channel).toBe('a'.repeat(64));
    });
  });

  describe('Amount validation', () => {
    it('throws on zero Amount (rippled temBAD_AMOUNT)', () => {
      expect(() => make({ Amount: '0' })).toThrow(/strictly-positive/);
    });

    it('throws on negative Amount (rippled temBAD_AMOUNT)', () => {
      expect(() => make({ Amount: '-1' })).toThrow(/strictly-positive/);
    });

    it('throws on a non-numeric Amount', () => {
      expect(() => make({ Amount: 'ten' })).toThrow(/strictly-positive/);
    });

    it('throws on an IOU Amount form (ledger is XRP-only)', () => {
      expect(() =>
        make({
          Amount: {
            currency: 'USD',
            issuer: ACCOUNT_B,
            value: '10',
          } as never,
        }),
      ).toThrow(/strictly-positive/);
    });

    it('throws on an MPT Amount form (ledger is XRP-only)', () => {
      expect(() =>
        make({
          Amount: { mpt_issuance_id: '00000001', value: '10' } as never,
        }),
      ).toThrow(/strictly-positive/);
    });

    it('accepts a scientific-mantissa Amount (canonical STAmount)', () => {
      const tx = make({ Amount: '1.5e3' });
      expect(tx.Amount).toBe('1.5e3');
    });
  });

  describe('Balance validation', () => {
    it('throws on zero Balance (rippled temBAD_AMOUNT)', () => {
      expect(() => make({ Balance: '0' })).toThrow(/strictly-positive/);
    });

    it('throws on negative Balance', () => {
      expect(() => make({ Balance: '-100' })).toThrow(/strictly-positive/);
    });

    it('throws on an IOU Balance form (ledger is XRP-only)', () => {
      expect(() =>
        make({
          Balance: {
            currency: 'USD',
            issuer: ACCOUNT_B,
            value: '10',
          } as never,
        }),
      ).toThrow(/strictly-positive/);
    });
  });

  describe('PublicKey validation', () => {
    it('throws on a non-hex PublicKey', () => {
      expect(() => make({ PublicKey: 'Z'.repeat(66) })).toThrow(
        /PublicKey/,
      );
    });

    it('throws on a PublicKey of wrong length (e.g. 31 bytes / 62 hex)', () => {
      expect(() => make({ PublicKey: 'A'.repeat(62) })).toThrow(
        /PublicKey hex must be/,
      );
    });

    it('throws on a PublicKey of wrong length (e.g. 34 bytes / 68 hex)', () => {
      expect(() => make({ PublicKey: 'A'.repeat(68) })).toThrow(
        /PublicKey hex must be/,
      );
    });

    it('accepts an Ed25519 PublicKey (32 bytes / 64 hex chars)', () => {
      const tx = make({ PublicKey: PUBLIC_KEY_ED25519 });
      expect(tx.PublicKey).toBe(PUBLIC_KEY_ED25519);
    });

    it('accepts a secp256k1 PublicKey (33 bytes / 66 hex chars)', () => {
      const tx = make({ PublicKey: PUBLIC_KEY_SECP });
      expect(tx.PublicKey).toBe(PUBLIC_KEY_SECP);
    });
  });

  describe('Signature validation', () => {
    it('throws on a non-hex Signature', () => {
      expect(() => make({ Signature: 'Z'.repeat(72) })).toThrow(
        /Signature/,
      );
    });

    it('accepts an arbitrary-length hex Signature', () => {
      const sig = 'A'.repeat(72);
      const tx = make({ Signature: sig });
      expect(tx.Signature).toBe(sig);
    });
  });

  describe('CredentialIDs validation', () => {
    it('throws on an empty CredentialIDs array', () => {
      expect(() => make({ CredentialIDs: [] })).toThrow(
        /must not be an empty array/,
      );
    });

    it('throws on CredentialIDs longer than MAX_AUTHORIZED_CREDENTIALS (8)', () => {
      const tooMany = Array.from({ length: 9 }, (_, i) => hex64(i + 1));
      expect(() => make({ CredentialIDs: tooMany })).toThrow(
        /cannot exceed 8 elements/,
      );
    });

    it('throws on a non-hex CredentialIDs entry', () => {
      expect(() =>
        make({
          CredentialIDs: ['Z'.repeat(64)],
        }),
      ).toThrow(/CredentialIDs\[0\]/);
    });

    it('throws on a CredentialIDs entry of wrong length', () => {
      expect(() =>
        make({
          CredentialIDs: ['A'.repeat(63)],
        }),
      ).toThrow(/CredentialIDs\[0\]/);
    });

    it('throws on a duplicate CredentialIDs entry', () => {
      const dup = hex64(1);
      expect(() =>
        make({ CredentialIDs: [dup, dup] }),
      ).toThrow(/duplicate of an earlier entry/);
    });

    it('accepts exactly 8 unique CredentialIDs (boundary)', () => {
      const eight = Array.from({ length: 8 }, (_, i) => hex64(i + 1));
      const tx = make({ CredentialIDs: eight });
      expect(tx.CredentialIDs).toEqual(eight);
    });

    it('accepts a single valid CredentialIDs entry', () => {
      const cred = hex64(7);
      const tx = make({ CredentialIDs: [cred] });
      expect(tx.CredentialIDs).toEqual([cred]);
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
        (tx as unknown as Record<string, unknown>).Channel =
          'A'.repeat(64);
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      const tx = make({ Amount: '1000' });
      const tx2 = tx.with({ Balance: '2000' });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Balance).toBe('2000');
      expect(tx.Amount).toBe('1000');
      expect(tx.Balance).toBeUndefined();
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() => tx.with({ Amount: '0' })).toThrow(/strictly-positive/);
      expect(() => tx.with({ Balance: '-1' })).toThrow(
        /strictly-positive/,
      );
      expect(() =>
        tx.with({ Channel: 'too-short' }),
      ).toThrow(/Channel/);
      expect(() =>
        tx.with({ PublicKey: 'A'.repeat(8) }),
      ).toThrow(/PublicKey hex must be/);
      expect(() =>
        tx.with({ Signature: 'not-hex!' }),
      ).toThrow(/Signature/);
      expect(() =>
        tx.with({ CredentialIDs: [] }),
      ).toThrow(/must not be an empty array/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({
        Amount: '1000000',
        Balance: '1000000',
        Fee: '12',
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'PaymentChannelClaim',
        Account: ACCOUNT_A,
        Channel: CHANNEL_ID,
        Amount: '1000000',
        Balance: '1000000',
        Fee: '12',
      });
    });

    it('.toJSON() skips methods and undefined fields', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('Amount' in json).toBe(false);
      expect('Balance' in json).toBe(false);
      expect('PublicKey' in json).toBe(false);
      expect('Signature' in json).toBe(false);
      expect('CredentialIDs' in json).toBe(false);
      expect('Flags' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op after construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });

    it('round-trips through xrpl encode/decode', () => {
      const tx = paymentChannelClaim({
        Account: ACCOUNT_A,
        Channel: CHANNEL_ID,
        Amount: '1000000',
        Balance: '1000000',
        PublicKey: PUBLIC_KEY_SECP,
        Signature: SIGNATURE_OK,
        Fee: '12',
      });
      const encoded = encode(tx.toJSON() as never);
      expect(encoded).toBeDefined();
      const decoded = decode(encoded);
      expect(decoded.TransactionType).toBe('PaymentChannelClaim');
      expect(decoded.Account).toBe(ACCOUNT_A);
      expect(decoded.Channel).toBe(CHANNEL_ID);
      expect(decoded.Amount).toBe('1000000');
      expect(decoded.Balance).toBe('1000000');
      expect(decoded.PublicKey).toBe(PUBLIC_KEY_SECP);
      expect(decoded.Signature).toBe(SIGNATURE_OK);
    });
  });

  // ─── Base transaction fields ──────────────────────────────────────────────
  // `paymentChannelClaim` now calls `validateBaseTransaction` as a backstop,
  // placed after its own PaymentChannelClaim-specific checks (payment.ts:123
  // is the reference). Before that call, every REJECT case below built a
  // frozen transaction silently.
  //
  // `PaymentChannelClaimProps` does not yet extend `BasePropsFields`, so the
  // seven shared fields are not on this props type yet — which is why the
  // `as any` casts appear on the ACCEPT cases too, not only the reject ones.
  // That is the type half of the same bug; without the casts these would not
  // compile.
  describe('BaseTransactionFields', () => {
    const base = {
      Account: ACCOUNT_A,
      Channel: CHANNEL_ID,
    };
    // A valid classic address distinct from ACCOUNT_A.
    const DELEGATE = ACCOUNT_B;
    const MEMOS = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
    const TXN_ID = 'AB'.repeat(32);

    it('accepts Memos', () => {
      const tx = paymentChannelClaim({ ...base, Memos: MEMOS } as any);
      expect(tx.toJSON().Memos).toEqual(MEMOS);
    });

    it('rejects a malformed Memos value', () => {
      expect(() =>
        paymentChannelClaim({ ...base, Memos: 'not-an-array' } as any),
      ).toThrow(/invalid Memos/);
    });

    it('accepts SourceTag', () => {
      const tx = paymentChannelClaim({ ...base, SourceTag: 99 } as any);
      expect(tx.toJSON().SourceTag).toBe(99);
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() =>
        paymentChannelClaim({ ...base, SourceTag: 'NaN' } as any),
      ).toThrow(/SourceTag must be a number/);
    });

    it('accepts LastLedgerSequence', () => {
      const tx = paymentChannelClaim({
        ...base,
        LastLedgerSequence: 1_000_000,
      } as any);
      expect(tx.toJSON().LastLedgerSequence).toBe(1_000_000);
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() =>
        paymentChannelClaim({ ...base, LastLedgerSequence: 'soon' } as any),
      ).toThrow(/LastLedgerSequence must be a number/);
    });

    it('accepts AccountTxnID', () => {
      const tx = paymentChannelClaim({ ...base, AccountTxnID: TXN_ID } as any);
      expect(tx.toJSON().AccountTxnID).toBe(TXN_ID);
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() =>
        paymentChannelClaim({ ...base, AccountTxnID: 99 } as any),
      ).toThrow(/AccountTxnID must be a string/);
    });

    it('accepts NetworkID', () => {
      const tx = paymentChannelClaim({ ...base, NetworkID: 1 } as any);
      expect(tx.toJSON().NetworkID).toBe(1);
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() =>
        paymentChannelClaim({ ...base, NetworkID: {} } as any),
      ).toThrow(/NetworkID must be a number/);
    });

    it('accepts a Delegate distinct from Account', () => {
      const tx = paymentChannelClaim({ ...base, Delegate: DELEGATE } as any);
      expect(tx.toJSON().Delegate).toBe(DELEGATE);
    });

    it('rejects a Delegate that is not a valid address', () => {
      expect(() =>
        paymentChannelClaim({ ...base, Delegate: 'not-an-address' } as any),
      ).toThrow(/invalid Delegate/);
    });

    it('rejects Delegate equal to Account', () => {
      expect(() =>
        paymentChannelClaim({ ...base, Delegate: ACCOUNT_A } as any),
      ).toThrow(/cannot be the same/);
    });

    it('accepts TicketSequence alongside Sequence: 0', () => {
      const tx = paymentChannelClaim({
        ...base,
        Sequence: 0,
        TicketSequence: 42,
      } as any);
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() =>
        paymentChannelClaim({ ...base, TicketSequence: 'nope' } as any),
      ).toThrow(/TicketSequence must be a number/);
    });
  });
});