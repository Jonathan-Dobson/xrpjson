/**
 * Tests for the functional PaymentChannelCreate factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, Amount, Destination,
 *      SettleDelay, PublicKey).
 *   2. Optional fields (CancelAfter, DestinationTag, Flags, Fee, Sequence).
 *   3. Spec-mandated guards the class API omits:
 *        a. Amount must be XRP-drops AND strictly positive
 *           (rippled preflight `temBAD_AMOUNT`).
 *        b. Destination must not equal Account (rippled `temDST_IS_SRC`).
 *        c. PublicKey hex must be 32 or 33 bytes
 *           (rippled preflight `temMALFORMED` via `publicKeyType`).
 *        d. SettleDelay must fit UInt32 (xrpl.org doc).
 *        e. CancelAfter must fit UInt32 (xrpl.org doc).
 *        f. DestinationTag must fit UInt32 (xrpl.org doc).
 *   4. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined fields).
 *   5. Round-trip through xrpl encode/decode.
 */
import { describe, it, expect } from 'vitest';
import { decode, encode } from 'xrpl';
import { paymentChannelCreate } from '../../src/fp/factories/payment-channel-create.js';

const ACCOUNT_A = 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn';
const ACCOUNT_B = 'rsA2LpzuawewSBQXkiju3YQTMzW13pAAdW';
// 33-byte secp256k1 compressed public key (66 hex chars).
const PUBLIC_KEY_SECP =
  '32D2471DB72B27E3310F355BB33E339BF26F8392D5A93D3BC0FC3B566612DA0F0A';
// 32-byte Ed25519 public key (64 hex chars) — different leading byte.
const PUBLIC_KEY_ED25519 =
  'ED5C4EC5A6E6E6E6E6E6E6E6E6E6E6E6E6E6E6E6E6E6E6E6E6E6E6E6E6E6E6E6E6';

const BASE_PROPS = {
  Account: ACCOUNT_A,
  Amount: '10000',
  Destination: ACCOUNT_B,
  SettleDelay: 86400,
  PublicKey: PUBLIC_KEY_SECP,
};

function make(
  extras: Record<string, unknown> = {},
): ReturnType<typeof paymentChannelCreate> {
  return paymentChannelCreate({ ...BASE_PROPS, ...extras });
}

describe('fp/paymentChannelCreate()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = paymentChannelCreate(BASE_PROPS);
      expect(tx.TransactionType).toBe('PaymentChannelCreate');
      expect(tx.Account).toBe(ACCOUNT_A);
      expect(tx.Amount).toBe('10000');
      expect(tx.Destination).toBe(ACCOUNT_B);
      expect(tx.SettleDelay).toBe(86400);
      expect(tx.PublicKey).toBe(PUBLIC_KEY_SECP);
    });

    it('passes through optional CancelAfter / DestinationTag', () => {
      const tx = make({
        CancelAfter: 533171558,
        DestinationTag: 23480,
      });
      expect(tx.CancelAfter).toBe(533171558);
      expect(tx.DestinationTag).toBe(23480);
    });

    it('passes through optional Fee/Sequence/Flags', () => {
      const tx = make({ Flags: 0, Fee: '12', Sequence: 8 });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(8);
      expect(tx.Flags).toBe(0);
    });

    it('accepts an Ed25519 PublicKey (32 bytes / 64 hex chars)', () => {
      const tx = paymentChannelCreate({
        ...BASE_PROPS,
        PublicKey: PUBLIC_KEY_ED25519,
      });
      expect(tx.PublicKey).toBe(PUBLIC_KEY_ED25519);
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        paymentChannelCreate({ ...BASE_PROPS, Account: '' as never }),
      ).toThrow(/Account/);
    });

    it('throws on invalid Account', () => {
      expect(() =>
        paymentChannelCreate({
          ...BASE_PROPS,
          Account: 'not-a-classic-address',
        }),
      ).toThrow(/Account/);
    });
  });

  describe('Destination validation', () => {
    it('throws on missing Destination', () => {
      expect(() =>
        paymentChannelCreate({ ...BASE_PROPS, Destination: '' as never }),
      ).toThrow(/Destination/);
    });

    it('throws on invalid Destination', () => {
      expect(() =>
        paymentChannelCreate({
          ...BASE_PROPS,
          Destination: 'not-an-address',
        }),
      ).toThrow(/Destination/);
    });

    it('throws when Destination equals Account (rippled temDST_IS_SRC)', () => {
      expect(() =>
        paymentChannelCreate({
          ...BASE_PROPS,
          Destination: ACCOUNT_A,
        }),
      ).toThrow(/Destination must not equal Account/);
    });
  });

  describe('Amount validation', () => {
    it('throws on missing Amount', () => {
      expect(() =>
        paymentChannelCreate({ ...BASE_PROPS, Amount: undefined as never }),
      ).toThrow(/Amount/);
    });

    it('throws on a zero Amount (rippled temBAD_AMOUNT)', () => {
      expect(() => make({ Amount: '0' })).toThrow(/strictly-positive/);
    });

    it('throws on a negative Amount (rippled temBAD_AMOUNT)', () => {
      expect(() => make({ Amount: '-1' })).toThrow(/strictly-positive/);
    });

    it('throws on an IOU Amount form (ledger requires XRP-only)', () => {
      expect(() =>
        make({
          Amount: { currency: 'USD', issuer: ACCOUNT_B, value: '10' } as never,
        }),
      ).toThrow(/XRP drops/);
    });

    it('throws on an MPT Amount form (ledger requires XRP-only)', () => {
      expect(() =>
        make({
          Amount: { mpt_issuance_id: '00000001', value: '10' } as never,
        }),
      ).toThrow(/XRP drops/);
    });

    it('throws on a non-numeric Amount', () => {
      expect(() => make({ Amount: 'ten' })).toThrow(/strictly-positive/);
    });
  });

  describe('SettleDelay validation', () => {
    it('throws on missing SettleDelay', () => {
      expect(() =>
        paymentChannelCreate({
          ...BASE_PROPS,
          SettleDelay: undefined as never,
        }),
      ).toThrow(/SettleDelay/);
    });

    it('throws on a negative SettleDelay (UInt32 range)', () => {
      expect(() => make({ SettleDelay: -1 })).toThrow(/SettleDelay/);
    });

    it('throws on a non-integer SettleDelay', () => {
      expect(() => make({ SettleDelay: 1.5 })).toThrow(/SettleDelay/);
    });

    it('throws on a SettleDelay exceeding UInt32', () => {
      expect(() => make({ SettleDelay: 0x1_0000_0000 })).toThrow(
        /SettleDelay/,
      );
    });

    it('accepts SettleDelay=0 (zero is a valid UInt32)', () => {
      const tx = make({ SettleDelay: 0 });
      expect(tx.SettleDelay).toBe(0);
    });

    it('accepts SettleDelay at the UInt32 boundary', () => {
      const tx = make({ SettleDelay: 0xffff_ffff });
      expect(tx.SettleDelay).toBe(0xffff_ffff);
    });
  });

  describe('PublicKey validation', () => {
    it('throws on missing PublicKey', () => {
      expect(() =>
        paymentChannelCreate({
          ...BASE_PROPS,
          PublicKey: undefined as never,
        }),
      ).toThrow(/PublicKey/);
    });

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

    it('throws on a PublicKey shorter than 32 bytes (e.g. 16 bytes / 32 hex)', () => {
      expect(() => make({ PublicKey: 'A'.repeat(32) })).toThrow(
        /PublicKey hex must be/,
      );
    });
  });

  describe('CancelAfter validation', () => {
    it('throws on a negative CancelAfter (UInt32 range)', () => {
      expect(() => make({ CancelAfter: -1 })).toThrow(/CancelAfter/);
    });

    it('throws on a non-integer CancelAfter', () => {
      expect(() => make({ CancelAfter: 1.5 })).toThrow(/CancelAfter/);
    });

    it('throws on a CancelAfter exceeding UInt32', () => {
      expect(() => make({ CancelAfter: 0x1_0000_0000 })).toThrow(
        /CancelAfter/,
      );
    });

    it('accepts CancelAfter=0 (valid UInt32; ledger ignores if past)', () => {
      const tx = make({ CancelAfter: 0 });
      expect(tx.CancelAfter).toBe(0);
    });
  });

  describe('DestinationTag validation', () => {
    it('throws on a negative DestinationTag', () => {
      expect(() => make({ DestinationTag: -1 })).toThrow(/DestinationTag/);
    });

    it('throws on a non-integer DestinationTag', () => {
      expect(() => make({ DestinationTag: 1.5 })).toThrow(/DestinationTag/);
    });

    it('accepts DestinationTag=0', () => {
      const tx = make({ DestinationTag: 0 });
      expect(tx.DestinationTag).toBe(0);
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
        (tx as unknown as Record<string, unknown>).Amount = '999';
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      const tx = make();
      const tx2 = tx.with({ SettleDelay: 60 });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.SettleDelay).toBe(60);
      expect(tx.SettleDelay).toBe(86400);
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() => tx.with({ Destination: ACCOUNT_A })).toThrow(
        /Destination must not equal Account/,
      );
      expect(() => tx.with({ Amount: '0' })).toThrow(/strictly-positive/);
      expect(() => tx.with({ SettleDelay: -5 })).toThrow(/SettleDelay/);
      expect(() => tx.with({ PublicKey: 'A'.repeat(8) })).toThrow(
        /PublicKey hex must be/,
      );
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({ CancelAfter: 533171558, Fee: '12' });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'PaymentChannelCreate',
        Account: ACCOUNT_A,
        Amount: '10000',
        Destination: ACCOUNT_B,
        SettleDelay: 86400,
        PublicKey: PUBLIC_KEY_SECP,
        CancelAfter: 533171558,
        Fee: '12',
      });
    });

    it('.toJSON() skips methods and undefined fields', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('CancelAfter' in json).toBe(false);
      expect('DestinationTag' in json).toBe(false);
      expect('Flags' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op after construction', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });

    it('round-trips through xrpl encode/decode', () => {
      const tx = paymentChannelCreate({
        ...BASE_PROPS,
        CancelAfter: 533171558,
        DestinationTag: 23480,
        Fee: '12',
      });
      const encoded = encode(tx.toJSON() as never);
      expect(encoded).toBeDefined();
      const decoded = decode(encoded);
      expect(decoded.TransactionType).toBe('PaymentChannelCreate');
      expect(decoded.Account).toBe(ACCOUNT_A);
      expect(decoded.Destination).toBe(ACCOUNT_B);
      expect(decoded.Amount).toBe('10000');
      expect(decoded.SettleDelay).toBe(86400);
      expect(decoded.PublicKey).toBe(PUBLIC_KEY_SECP);
      expect(decoded.CancelAfter).toBe(533171558);
      expect(decoded.DestinationTag).toBe(23480);
    });
  });

  // ─── Base transaction fields ─────────────────────────────────────────────
  // `PaymentChannelCreate`Props accepts the seven shared base fields and the factory now
  // calls `validateBaseTransaction`, so a malformed one is rejected at
  // construction instead of freezing a transaction that would fail at
  // submit. Values below are chosen to be VALID under src/validation/base.ts.
  describe('BaseTransactionFields', () => {
    const base = { ...BASE_PROPS };
    const MEMOS = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
    const TXN_ID = 'AB'.repeat(32);
    // A valid classic address distinct from `base.Account`.
    const DELEGATE = ACCOUNT_B;

    it('accepts Memos', () => {
      const tx = paymentChannelCreate({ ...base, Memos: MEMOS });
      expect(tx.toJSON().Memos).toEqual(MEMOS);
    });

    it('accepts SourceTag', () => {
      const tx = paymentChannelCreate({ ...base, SourceTag: 99 });
      expect(tx.toJSON().SourceTag).toBe(99);
    });

    it('accepts LastLedgerSequence', () => {
      const tx = paymentChannelCreate({ ...base, LastLedgerSequence: 1_000_000 });
      expect(tx.toJSON().LastLedgerSequence).toBe(1_000_000);
    });

    it('accepts AccountTxnID', () => {
      const tx = paymentChannelCreate({ ...base, AccountTxnID: TXN_ID });
      expect(tx.toJSON().AccountTxnID).toBe(TXN_ID);
    });

    it('accepts NetworkID', () => {
      const tx = paymentChannelCreate({ ...base, NetworkID: 1 });
      expect(tx.toJSON().NetworkID).toBe(1);
    });

    it('accepts a Delegate distinct from Account', () => {
      const tx = paymentChannelCreate({ ...base, Delegate: DELEGATE });
      expect(tx.toJSON().Delegate).toBe(DELEGATE);
    });

    it('accepts TicketSequence alongside Sequence: 0', () => {
      const tx = paymentChannelCreate({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    // ── Reject side ── the runtime backstop. Before the
    // `validateBaseTransaction` call landed, every case below built a frozen
    // transaction silently. The bad values are cast `as any` on purpose: the
    // point under test is the runtime check, and a type error would make the
    // test uncompilable.
    it('rejects a malformed Memos value', () => {
      expect(() => paymentChannelCreate({ ...base, Memos: 'not-an-array' } as any)).toThrow(/invalid Memos/);
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() => paymentChannelCreate({ ...base, SourceTag: 'NaN' } as any)).toThrow(
        /SourceTag must be a number/,
      );
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() => paymentChannelCreate({ ...base, LastLedgerSequence: 'soon' } as any)).toThrow(
        /LastLedgerSequence must be a number/,
      );
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() => paymentChannelCreate({ ...base, AccountTxnID: 99 } as any)).toThrow(
        /AccountTxnID must be a string/,
      );
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() => paymentChannelCreate({ ...base, NetworkID: {} } as any)).toThrow(/NetworkID must be a number/);
    });

    it('rejects a Delegate that is not a valid address', () => {
      expect(() => paymentChannelCreate({ ...base, Delegate: 'not-an-address' } as any)).toThrow(
        /invalid Delegate/,
      );
    });

    it('rejects a Delegate equal to Account', () => {
      expect(() => paymentChannelCreate({ ...base, Delegate: ACCOUNT_A } as any)).toThrow(/cannot be the same/);
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() => paymentChannelCreate({ ...base, TicketSequence: 'nope' } as any)).toThrow(
        /TicketSequence must be a number/,
      );
    });

    it('rejects a non-string Fee', () => {
      expect(() => paymentChannelCreate({ ...base, Fee: 12 } as any)).toThrow(/Fee must be a string/);
    });
  });
});