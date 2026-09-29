/**
 * Tests for the functional Batch factory.
 *
 * Validates:
 *   1. Construction with required fields (Account, Flags, RawTransactions).
 *   2. RawTransactions shape, count limits (2–8), inner-tx invariants
 *      (tfInnerBatchTxn flag, Fee="0", SigningPubKey="", no TxnSignature,
 *      no Signers, no Batch nesting, Sequence XOR TicketSequence).
 *   3. BatchSigners validation (shape, sort order, duplicates, outer
 *      Account exclusion, single-sign XOR multi-sign).
 *   4. Outer Flags: exactly one batch-mode flag required.
 *   5. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined fields).
 */
import { describe, it, expect } from 'vitest';
import { batch } from '../../src/fp/factories/batch.js';
import { GlobalFlags } from '../../src/types/flags.js';

// ─── Test fixtures ───────────────────────────────────────────────────

const ACCT_A = 'rJCxK2hX9tDMzbnn3cg1GU2g19Kfmhzxkp';
const ACCT_B = 'rPMh7Pi9ct699iZUTWaytJUoHcJ7cgyziK';
const ACCT_C = 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH';
// Lex order note (base58 alphabet): 'rN' < 'rP', so ACCT_C < ACCT_B.

// Build a minimal-valid inner Payment tx (sequence-based).
function paymentInner(
  account: string,
  sequence: number,
  extras: Record<string, unknown> = {},
) {
  return {
    RawTransaction: {
      TransactionType: 'Payment',
      Account: account,
      Destination: ACCT_A,
      Amount: '1000000',
      Fee: '0',
      SigningPubKey: '',
      Sequence: sequence,
      Flags: GlobalFlags.tfInnerBatchTxn,
      ...extras,
    },
  };
}

// Build a minimal-valid inner Payment tx (ticket-based).
function paymentInnerTicket(account: string, ticketSeq: number) {
  return {
    RawTransaction: {
      TransactionType: 'Payment',
      Account: account,
      Destination: ACCT_A,
      Amount: '1000000',
      Fee: '0',
      SigningPubKey: '',
      TicketSequence: ticketSeq,
      Flags: GlobalFlags.tfInnerBatchTxn,
    },
  };
}

function make(extras: Record<string, unknown> = {}) {
  return batch({
    Account: ACCT_A,
    Flags: 0x00010000, // tfAllOrNothing
    RawTransactions: [paymentInner(ACCT_A, 1), paymentInner(ACCT_A, 2)],
    ...extras,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('fp/batch()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('Batch');
      expect(tx.Account).toBe(ACCT_A);
      expect(tx.Flags).toBe(0x00010000);
      expect(tx.RawTransactions).toHaveLength(2);
    });

    it('accepts each of the four batch-mode flags as a number', () => {
      const flags = [0x00010000, 0x00020000, 0x00040000, 0x00080000];
      for (const f of flags) {
        const tx = make({ Flags: f });
        expect(tx.Flags).toBe(f);
      }
    });

    it('accepts BatchFlagsInterface (boolean map)', () => {
      const tx = batch({
        Account: ACCT_A,
        Flags: { tfOnlyOne: true },
        RawTransactions: [paymentInner(ACCT_A, 1), paymentInner(ACCT_A, 2)],
      });
      expect(tx.Flags).toEqual({ tfOnlyOne: true });
    });

    it('accepts BatchSigners on multi-account batches', () => {
      const tx = batch({
        Account: ACCT_A,
        Flags: 0x00010000,
        RawTransactions: [
          paymentInner(ACCT_A, 1),
          paymentInner(ACCT_B, 1),
        ],
        BatchSigners: [
          {
            BatchSigner: {
              Account: ACCT_B,
              SigningPubKey: 'ED' + 'A'.repeat(71),
              TxnSignature: 'B'.repeat(100),
            },
          },
        ],
      });
      expect(tx.BatchSigners).toHaveLength(1);
    });

    it('passes through Fee/Sequence on the outer tx', () => {
      const tx = make({ Fee: '40', Sequence: 3 });
      expect(tx.Fee).toBe('40');
      expect(tx.Sequence).toBe(3);
    });

    it('accepts inner txs using TicketSequence instead of Sequence', () => {
      const tx = batch({
        Account: ACCT_A,
        Flags: 0x00010000,
        RawTransactions: [
          paymentInnerTicket(ACCT_A, 10),
          paymentInnerTicket(ACCT_A, 11),
        ],
      });
      expect(tx.RawTransactions).toHaveLength(2);
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        batch({
          Account: '',
          Flags: 0x00010000,
          RawTransactions: [paymentInner(ACCT_A, 1), paymentInner(ACCT_A, 2)],
        }),
      ).toThrow(/Account/);
    });

    it('throws on malformed Account', () => {
      expect(() =>
        batch({
          Account: 'not-an-account',
          Flags: 0x00010000,
          RawTransactions: [paymentInner(ACCT_A, 1), paymentInner(ACCT_A, 2)],
        }),
      ).toThrow(/Account/);
    });
  });

  describe('RawTransactions — shape', () => {
    it('throws when RawTransactions is missing', () => {
      expect(() =>
        batch({
          Account: ACCT_A,
          Flags: 0x00010000,
          RawTransactions: undefined as never,
        }),
      ).toThrow(/RawTransactions/);
    });

    it('throws when RawTransactions is not an array', () => {
      expect(() =>
        batch({
          Account: ACCT_A,
          Flags: 0x00010000,
          RawTransactions: 'not-array' as never,
        }),
      ).toThrow(/RawTransactions/);
    });

    it('throws on wrapper that is not an object', () => {
      expect(() =>
        batch({
          Account: ACCT_A,
          Flags: 0x00010000,
          RawTransactions: [42 as never, paymentInner(ACCT_A, 2)],
        }),
      ).toThrow(/RawTransactions\[0\]/);
    });

    it('throws when RawTransaction key is missing', () => {
      expect(() =>
        batch({
          Account: ACCT_A,
          Flags: 0x00010000,
          RawTransactions: [
            { wrongKey: {} } as never,
            paymentInner(ACCT_A, 2),
          ],
        }),
      ).toThrow(/RawTransaction/);
    });

    it('throws when RawTransaction value is not an object', () => {
      expect(() =>
        batch({
          Account: ACCT_A,
          Flags: 0x00010000,
          RawTransactions: [
            { RawTransaction: 'oops' as never },
            paymentInner(ACCT_A, 2),
          ],
        }),
      ).toThrow(/RawTransaction/);
    });
  });

  describe('RawTransactions — count limits (XLS-56 §2.1.2)', () => {
    it('throws on fewer than 2 inner transactions', () => {
      expect(() =>
        batch({
          Account: ACCT_A,
          Flags: 0x00010000,
          RawTransactions: [paymentInner(ACCT_A, 1)],
        }),
      ).toThrow(/at least 2/);
    });

    it('accepts exactly 2 inner transactions', () => {
      const tx = make();
      expect(tx.RawTransactions).toHaveLength(2);
    });

    it('accepts exactly 8 inner transactions', () => {
      const tx = batch({
        Account: ACCT_A,
        Flags: 0x00010000,
        RawTransactions: Array.from({ length: 8 }, (_, i) =>
          paymentInner(ACCT_A, i + 1),
        ),
      });
      expect(tx.RawTransactions).toHaveLength(8);
    });

    it('throws on 9 inner transactions', () => {
      expect(() =>
        batch({
          Account: ACCT_A,
          Flags: 0x00010000,
          RawTransactions: Array.from({ length: 9 }, (_, i) =>
            paymentInner(ACCT_A, i + 1),
          ),
        }),
      ).toThrow(/at most 8/);
    });
  });

  describe('inner-tx invariants', () => {
    it('throws when inner tx has TransactionType="Batch" (no nesting)', () => {
      expect(() =>
        batch({
          Account: ACCT_A,
          Flags: 0x00010000,
          RawTransactions: [
            paymentInner(ACCT_A, 1),
            {
              RawTransaction: {
                TransactionType: 'Batch',
                Account: ACCT_A,
                Flags: GlobalFlags.tfInnerBatchTxn,
                Fee: '0',
                SigningPubKey: '',
                Sequence: 2,
                RawTransactions: [],
              },
            },
          ],
        }),
      ).toThrow(/Cannot nest Batch/);
    });

    it('throws when inner tx is missing the tfInnerBatchTxn flag', () => {
      expect(() =>
        batch({
          Account: ACCT_A,
          Flags: 0x00010000,
          RawTransactions: [
            paymentInner(ACCT_A, 1),
            {
              RawTransaction: {
                TransactionType: 'Payment',
                Account: ACCT_A,
                Destination: ACCT_B,
                Amount: '1000',
                Fee: '0',
                SigningPubKey: '',
                Sequence: 2,
                Flags: 0,
              },
            },
          ],
        }),
      ).toThrow(/tfInnerBatchTxn/);
    });

    it('throws when inner tx Fee is non-zero', () => {
      expect(() =>
        batch({
          Account: ACCT_A,
          Flags: 0x00010000,
          RawTransactions: [
            paymentInner(ACCT_A, 1),
            paymentInner(ACCT_A, 2, { Fee: '10' }),
          ],
        }),
      ).toThrow(/Fee must be "0"/);
    });

    it('accepts inner tx with null Fee (xrpl.js compatibility)', () => {
      const tx = batch({
        Account: ACCT_A,
        Flags: 0x00010000,
        RawTransactions: [
          paymentInner(ACCT_A, 1),
          paymentInner(ACCT_A, 2, { Fee: null }),
        ],
      });
      expect(tx.RawTransactions).toHaveLength(2);
    });

    it('throws when inner tx SigningPubKey is non-empty', () => {
      expect(() =>
        batch({
          Account: ACCT_A,
          Flags: 0x00010000,
          RawTransactions: [
            paymentInner(ACCT_A, 1),
            paymentInner(ACCT_A, 2, { SigningPubKey: 'ED' + 'A'.repeat(71) }),
          ],
        }),
      ).toThrow(/SigningPubKey must be ""/);
    });

    it('throws when inner tx has TxnSignature', () => {
      expect(() =>
        batch({
          Account: ACCT_A,
          Flags: 0x00010000,
          RawTransactions: [
            paymentInner(ACCT_A, 1),
            paymentInner(ACCT_A, 2, { TxnSignature: '3045022100ff' }),
          ],
        }),
      ).toThrow(/TxnSignature must be absent/);
    });

    it('throws when inner tx has Signers', () => {
      expect(() =>
        batch({
          Account: ACCT_A,
          Flags: 0x00010000,
          RawTransactions: [
            paymentInner(ACCT_A, 1),
            paymentInner(ACCT_A, 2, {
              Signers: [
                {
                  Signer: {
                    Account: ACCT_A,
                    SigningPubKey: 'ED' + 'A'.repeat(71),
                    TxnSignature: 'B'.repeat(100),
                  },
                },
              ],
            }),
          ],
        }),
      ).toThrow(/Signers must be absent/);
    });
  });

  describe('inner-tx Sequence XOR TicketSequence (XLS-56 §2.3.2.12)', () => {
    it('throws when both Sequence and TicketSequence are set', () => {
      expect(() =>
        batch({
          Account: ACCT_A,
          Flags: 0x00010000,
          RawTransactions: [
            paymentInner(ACCT_A, 1, { TicketSequence: 99 }),
            paymentInner(ACCT_A, 2),
          ],
        }),
      ).toThrow(/not both/);
    });

    it('throws when neither Sequence nor TicketSequence is set', () => {
      expect(() =>
        batch({
          Account: ACCT_A,
          Flags: 0x00010000,
          RawTransactions: [
            paymentInner(ACCT_A, 1),
            {
              RawTransaction: {
                TransactionType: 'Payment',
                Account: ACCT_A,
                Destination: ACCT_B,
                Amount: '1000',
                Fee: '0',
                SigningPubKey: '',
                Flags: GlobalFlags.tfInnerBatchTxn,
              },
            },
          ],
        }),
      ).toThrow(/must set either Sequence or TicketSequence/);
    });

    it('throws on zero Sequence', () => {
      expect(() =>
        batch({
          Account: ACCT_A,
          Flags: 0x00010000,
          RawTransactions: [
            paymentInner(ACCT_A, 1),
            paymentInner(ACCT_A, 0),
          ],
        }),
      ).toThrow(/Sequence/);
    });

    it('throws on negative TicketSequence', () => {
      expect(() =>
        batch({
          Account: ACCT_A,
          Flags: 0x00010000,
          RawTransactions: [
            paymentInnerTicket(ACCT_A, 1),
            paymentInnerTicket(ACCT_A, -5),
          ],
        }),
      ).toThrow(/TicketSequence/);
    });
  });

  describe('duplicate inner-tx detection (XLS-56 §2.3.2.10)', () => {
    it('throws on two identical inner transactions', () => {
      expect(() =>
        batch({
          Account: ACCT_A,
          Flags: 0x00010000,
          RawTransactions: [
            paymentInner(ACCT_A, 1),
            paymentInner(ACCT_A, 1),
          ],
        }),
      ).toThrow(/duplicate/);
    });

    it('detects duplicates regardless of object key order', () => {
      // Same logical tx, different key order → canonical-JSON-equal.
      const inner1 = paymentInner(ACCT_A, 1);
      const inner2 = {
        RawTransaction: {
          Flags: GlobalFlags.tfInnerBatchTxn,
          SigningPubKey: '',
          Fee: '0',
          Sequence: 1,
          Account: ACCT_A,
          Destination: ACCT_A,
          Amount: '1000000',
          TransactionType: 'Payment',
        },
      };
      expect(() =>
        batch({
          Account: ACCT_A,
          Flags: 0x00010000,
          RawTransactions: [inner1, inner2],
        }),
      ).toThrow(/duplicate/);
    });

    it('does not flag inner txs with different Sequences as duplicates', () => {
      const tx = batch({
        Account: ACCT_A,
        Flags: 0x00010000,
        RawTransactions: [
          paymentInner(ACCT_A, 1),
          paymentInner(ACCT_A, 2),
        ],
      });
      expect(tx.RawTransactions).toHaveLength(2);
    });
  });

  describe('outer Flags validation', () => {
    it('throws when Flags is missing (no batch mode set)', () => {
      expect(() =>
        batch({
          Account: ACCT_A,
          RawTransactions: [paymentInner(ACCT_A, 1), paymentInner(ACCT_A, 2)],
        }),
      ).toThrow(/exactly one/);
    });

    it('throws when Flags is zero', () => {
      expect(() =>
        batch({
          Account: ACCT_A,
          Flags: 0,
          RawTransactions: [paymentInner(ACCT_A, 1), paymentInner(ACCT_A, 2)],
        }),
      ).toThrow(/exactly one/);
    });

    it('throws when two batch-mode flags are set', () => {
      expect(() =>
        batch({
          Account: ACCT_A,
          Flags: 0x00010000 | 0x00020000, // tfAllOrNothing + tfOnlyOne
          RawTransactions: [paymentInner(ACCT_A, 1), paymentInner(ACCT_A, 2)],
        }),
      ).toThrow(/exactly one/);
    });

    it('accepts each of the four mode flags individually', () => {
      const modes = [
        { tfAllOrNothing: true },
        { tfOnlyOne: true },
        { tfUntilFailure: true },
        { tfIndependent: true },
      ];
      for (const f of modes) {
        const tx = batch({
          Account: ACCT_A,
          Flags: f,
          RawTransactions: [
            paymentInner(ACCT_A, 1),
            paymentInner(ACCT_A, 2),
          ],
        });
        expect(tx.Flags).toEqual(f);
      }
    });
  });

  describe('BatchSigners validation — shape', () => {
    it('throws when BatchSigners is not an array', () => {
      expect(() =>
        make({ BatchSigners: 'oops' as never }),
      ).toThrow(/BatchSigners must be an array/);
    });

    it('throws when a BatchSigner entry is not an object', () => {
      expect(() =>
        make({ BatchSigners: [42 as never] }),
      ).toThrow(/BatchSigners\[0\]/);
    });

    it('throws when the inner BatchSigner key is missing', () => {
      expect(() =>
        make({ BatchSigners: [{ wrongKey: { Account: ACCT_B } } as never] }),
      ).toThrow(/BatchSigner/);
    });

    it('throws when BatchSigner.Account is missing', () => {
      expect(() =>
        make({
          BatchSigners: [
            { BatchSigner: { SigningPubKey: 'ED' + 'A'.repeat(71), TxnSignature: 'B'.repeat(100) } },
          ],
        }),
      ).toThrow(/Account/);
    });

    it('throws when BatchSigner.Account is malformed', () => {
      expect(() =>
        make({
          BatchSigners: [
            {
              BatchSigner: {
                Account: 'garbage',
                SigningPubKey: 'ED' + 'A'.repeat(71),
                TxnSignature: 'B'.repeat(100),
              },
            },
          ],
        }),
      ).toThrow(/Account/);
    });
  });

  describe('BatchSigners — single-sign XOR multi-sign (XLS-56 §2.1.3)', () => {
    it('accepts a single-sign BatchSigner (SigningPubKey + TxnSignature)', () => {
      const tx = make({
        BatchSigners: [
          {
            BatchSigner: {
              Account: ACCT_B,
              SigningPubKey: 'ED' + 'A'.repeat(71),
              TxnSignature: 'B'.repeat(100),
            },
          },
        ],
      });
      expect(tx.BatchSigners).toHaveLength(1);
    });

    it('accepts a multi-sign BatchSigner (Signers array)', () => {
      const tx = make({
        BatchSigners: [
          {
            BatchSigner: {
              Account: ACCT_B,
              Signers: [
                {
                  Signer: {
                    Account: ACCT_B,
                    SigningPubKey: 'ED' + 'A'.repeat(71),
                    TxnSignature: 'B'.repeat(100),
                  },
                },
              ],
            },
          },
        ],
      });
      expect(tx.BatchSigners).toHaveLength(1);
    });

    it('throws when only SigningPubKey is set (TxnSignature missing)', () => {
      expect(() =>
        make({
          BatchSigners: [
            {
              BatchSigner: {
                Account: ACCT_B,
                SigningPubKey: 'ED' + 'A'.repeat(71),
              },
            },
          ],
        }),
      ).toThrow(/single-sign form requires both/);
    });

    it('throws when only TxnSignature is set (SigningPubKey missing)', () => {
      expect(() =>
        make({
          BatchSigners: [
            {
              BatchSigner: {
                Account: ACCT_B,
                TxnSignature: 'B'.repeat(100),
              },
            },
          ],
        }),
      ).toThrow(/single-sign form requires both/);
    });

    it('throws when single-sign fields are mixed with Signers', () => {
      expect(() =>
        make({
          BatchSigners: [
            {
              BatchSigner: {
                Account: ACCT_B,
                SigningPubKey: 'ED' + 'A'.repeat(71),
                TxnSignature: 'B'.repeat(100),
                Signers: [
                  {
                    Signer: {
                      Account: ACCT_B,
                      SigningPubKey: 'ED' + 'A'.repeat(71),
                      TxnSignature: 'B'.repeat(100),
                    },
                  },
                ],
              },
            },
          ],
        }),
      ).toThrow(/cannot mix single-sign/);
    });

    it('throws when neither form is supplied', () => {
      expect(() =>
        make({ BatchSigners: [{ BatchSigner: { Account: ACCT_B } }] }),
      ).toThrow(/must carry either/);
    });

    it('throws when Signers is set but not an array', () => {
      expect(() =>
        make({
          BatchSigners: [
            { BatchSigner: { Account: ACCT_B, Signers: 'oops' as never } },
          ],
        }),
      ).toThrow(/Signers must be an array/);
    });

    it('throws when SigningPubKey is set but not a string', () => {
      expect(() =>
        make({
          BatchSigners: [
            {
              BatchSigner: {
                Account: ACCT_B,
                SigningPubKey: 42 as never,
                TxnSignature: 'B'.repeat(100),
              },
            },
          ],
        }),
      ).toThrow(/SigningPubKey must be a string/);
    });
  });

  describe('BatchSigners — ordering + duplicates (XLS-56 §2.1.3)', () => {
    it('accepts multiple BatchSigners in strictly ascending order', () => {
      // Lex order: ACCT_C ('rN...') < ACCT_B ('rP...'), so ACCT_C first.
      const tx = make({
        BatchSigners: [
          {
            BatchSigner: {
              Account: ACCT_C,
              SigningPubKey: 'ED' + 'C'.repeat(71),
              TxnSignature: 'D'.repeat(100),
            },
          },
          {
            BatchSigner: {
              Account: ACCT_B,
              SigningPubKey: 'ED' + 'A'.repeat(71),
              TxnSignature: 'B'.repeat(100),
            },
          },
        ],
      });
      expect(tx.BatchSigners).toHaveLength(2);
    });

    it('throws when BatchSigners are not in ascending order', () => {
      // ACCT_B > ACCT_C in lex order, so ACCT_B then ACCT_C is descending.
      expect(() =>
        make({
          BatchSigners: [
            {
              BatchSigner: {
                Account: ACCT_B,
                SigningPubKey: 'ED' + 'A'.repeat(71),
                TxnSignature: 'B'.repeat(100),
              },
            },
            {
              BatchSigner: {
                Account: ACCT_C,
                SigningPubKey: 'ED' + 'C'.repeat(71),
                TxnSignature: 'D'.repeat(100),
              },
            },
          ],
        }),
      ).toThrow(/strictly ascending/);
    });

    it('throws when two BatchSigners have the same Account', () => {
      expect(() =>
        make({
          BatchSigners: [
            {
              BatchSigner: {
                Account: ACCT_B,
                SigningPubKey: 'ED' + 'A'.repeat(71),
                TxnSignature: 'B'.repeat(100),
              },
            },
            {
              BatchSigner: {
                Account: ACCT_B,
                SigningPubKey: 'ED' + 'C'.repeat(71),
                TxnSignature: 'D'.repeat(100),
              },
            },
          ],
        }),
      ).toThrow(/strictly ascending/);
    });

    it('throws when a BatchSigner.Account equals the outer Account', () => {
      expect(() =>
        make({
          BatchSigners: [
            {
              BatchSigner: {
                Account: ACCT_A, // same as outer
                SigningPubKey: 'ED' + 'A'.repeat(71),
                TxnSignature: 'B'.repeat(100),
              },
            },
          ],
        }),
      ).toThrow(/must not equal the outer Account/);
    });
  });

  describe('BatchSigners — count limit (XLS-56 §2.3.3.1)', () => {
    it('accepts exactly 24 BatchSigners', () => {
      // Generate 24 distinct valid base58 addresses; sort by Account
      // to satisfy the strict-ascending rule. Each address is built from
      // chars in the XRPL base58 alphabet: [1-9A-HJ-NP-Za-km-z].
      // We vary the 2nd char so lexicographic order matches insertion order.
      const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
      const entries = Array.from({ length: 24 }, (_, i) => {
        // Build a 25-char body using the alphabet (i.e., the classic
        // address length 25-1 = 24 body chars after the 'r' prefix).
        // We use the alphabet index for the first body char so the
        // resulting address lex-sorts with `i`.
        const a = alphabet[i]; // first body char encodes index
        const rest = alphabet[(i * 7 + 3) % alphabet.length].repeat(23);
        const acct = `r${a}${rest}`;
        return {
          BatchSigner: {
            Account: acct,
            SigningPubKey: 'ED' + 'A'.repeat(71),
            TxnSignature: 'B'.repeat(100),
          },
        };
      });
      // Sort by Account string to satisfy strict-ascending.
      entries.sort((a, b) =>
        a.BatchSigner.Account.localeCompare(b.BatchSigner.Account),
      );
      const tx = make({ BatchSigners: entries });
      expect(tx.BatchSigners).toHaveLength(24);
    });

    it('throws on 25 BatchSigners', () => {
      const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
      const entries = Array.from({ length: 25 }, (_, i) => {
        const a = alphabet[i % alphabet.length];
        const rest = alphabet[(i * 7 + 3) % alphabet.length].repeat(23);
        const acct = `r${a}${rest}`;
        return {
          BatchSigner: {
            Account: acct,
            SigningPubKey: 'ED' + 'A'.repeat(71),
            TxnSignature: 'B'.repeat(100),
          },
        };
      });
      entries.sort((a, b) =>
        a.BatchSigner.Account.localeCompare(b.BatchSigner.Account),
      );
      expect(() => make({ BatchSigners: entries })).toThrow(/at most 24/);
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
        (tx as unknown as Record<string, unknown>).Flags = 0x00020000;
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      const tx = make();
      const tx2 = tx.with({ Flags: 0x00020000 });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Flags).toBe(0x00020000);
      expect(tx.Flags).toBe(0x00010000);
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      // Override with an empty RawTransactions array → must throw.
      expect(() =>
        tx.with({ RawTransactions: [] as never }),
      ).toThrow(/at least 2/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = make({ Fee: '40', Sequence: 3 });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'Batch',
        Account: ACCT_A,
        Flags: 0x00010000,
        RawTransactions: tx.RawTransactions,
        Fee: '40',
        Sequence: 3,
      });
    });

    it('.toJSON() skips undefined fields and methods', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('BatchSigners' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op (no throw after construction)', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });
});
