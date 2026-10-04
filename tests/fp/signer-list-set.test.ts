/**
 * Tests for the functional SignerListSet factory.
 *
 * Mirrors the contract used by the other fp tests — construction-time
 * validation, frozen shape, .with() re-validation, .toJSON() shape,
 * round-trip through xrpl encode/decode. Specific to SignerListSet,
 * we exhaustively cover the canonical rippled guard list (see
 * Divergences header on the factory):
 *
 *   - Account required + isAccount format
 *   - SignerQuorum required + isNumber
 *   - Deletion path: SignerQuorum === 0 AND no SignerEntries
 *   - Non-zero quorum: SignerEntries required, non-empty, ≤ 32
 *   - Each entry: shape { SignerEntry: { Account, SignerWeight, WalletLocator? } }
 *   - SignerEntry.Account is a valid XRPL address
 *   - SignerEntry.Account must NOT equal the sending Account (temBAD_SIGNER)
 *   - No duplicate signer accounts (temBAD_SIGNER)
 *   - SignerWeight is a positive integer (temBAD_WEIGHT)
 *   - SignerQuorum <= sum of SignerWeights (temBAD_QUORUM)
 *   - WalletLocator, when present, is 64-char hex
 */
import { describe, it, expect } from 'vitest';
import { decode, encode } from 'xrpl';
import { signerListSet } from '../../src/fp/factories/signer-list-set.js';

// Sender — owner of the signer list.
const ACCOUNT = 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn';
// Distinct, well-formed XRPL classic addresses used as signer entries.
const SIGNER_A = 'rsA2LpzuawewSBQXkiju3YQTMzW13pAAdW';
const SIGNER_B = 'rUpy3eEg8rqjqfUoLeBnZkscbKbFsKXC3v';
const SIGNER_C = 'raKEEVSGnKSD9Zyvxu4z6Pqpm4ABH8FS6n';

const TWO_OF_FOUR: {
  SignerEntry: {
    Account: string;
    SignerWeight: number;
  };
} = {
  SignerEntry: {
    Account: SIGNER_A,
    SignerWeight: 2,
  },
};

const ONE_OF_THREE: {
  SignerEntry: {
    Account: string;
    SignerWeight: number;
  };
} = {
  SignerEntry: {
    Account: SIGNER_B,
    SignerWeight: 1,
  },
};

const ANOTHER_ONE: {
  SignerEntry: {
    Account: string;
    SignerWeight: number;
  };
} = {
  SignerEntry: {
    Account: SIGNER_C,
    SignerWeight: 1,
  },
};

const THREE_ENTRY_LIST = [TWO_OF_FOUR, ONE_OF_THREE, ANOTHER_ONE];

function make(
  extras: Record<string, unknown> = {},
): ReturnType<typeof signerListSet> {
  return signerListSet({
    Account: ACCOUNT,
    SignerQuorum: 3,
    SignerEntries: THREE_ENTRY_LIST,
    ...extras,
  });
}

describe('fp/signerListSet()', () => {
  describe('construction (create/replace path)', () => {
    it('constructs with the minimum valid field set', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('SignerListSet');
      expect(tx.Account).toBe(ACCOUNT);
      expect(tx.SignerQuorum).toBe(3);
      expect(tx.SignerEntries).toEqual(THREE_ENTRY_LIST);
    });

    it('returns a frozen object', () => {
      const tx = make();
      expect(Object.isFrozen(tx)).toBe(true);
    });

    it('throws on mutation (strict mode — frozen at every layer)', () => {
      const tx = make();
      expect(() => {
        (tx as unknown as { SignerQuorum: number }).SignerQuorum = 99;
      }).toThrow(TypeError);
      expect(tx.SignerQuorum).toBe(3);
    });

    it('exposes validate(), toJSON(), with() as own enumerable methods', () => {
      const tx = make();
      expect(typeof tx.validate).toBe('function');
      expect(typeof tx.toJSON).toBe('function');
      expect(typeof tx.with).toBe('function');
    });

    it('passes Fee and Sequence through unchanged', () => {
      const tx = make({ Fee: '12', Sequence: 7 });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(7);
    });

    it('throws when Account is missing (undefined)', () => {
      expect(() =>
        signerListSet({
          Account: undefined as unknown as string,
          SignerQuorum: 3,
          SignerEntries: THREE_ENTRY_LIST,
        }),
      ).toThrow(/Account/);
    });

    it('throws when Account is an invalid XRPL address format', () => {
      expect(() =>
        signerListSet({
          Account: 'not-an-address',
          SignerQuorum: 3,
          SignerEntries: THREE_ENTRY_LIST,
        }),
      ).toThrow(/Account/);
    });

    it('throws when SignerQuorum is missing (undefined)', () => {
      expect(() =>
        signerListSet({
          Account: ACCOUNT,
          SignerQuorum: undefined as unknown as number,
          SignerEntries: THREE_ENTRY_LIST,
        }),
      ).toThrow(/SignerQuorum/);
    });

    it('throws when SignerQuorum is not a number', () => {
      expect(() =>
        signerListSet({
          Account: ACCOUNT,
          SignerQuorum: '3' as unknown as number,
          SignerEntries: THREE_ENTRY_LIST,
        }),
      ).toThrow(/SignerQuorum/);
    });
  });

  describe('deletion path (SignerQuorum === 0)', () => {
    it('constructs with SignerQuorum === 0 and no SignerEntries (delete)', () => {
      const tx = signerListSet({
        Account: ACCOUNT,
        SignerQuorum: 0,
      });
      expect(tx.TransactionType).toBe('SignerListSet');
      expect(tx.SignerQuorum).toBe(0);
      expect(tx.SignerEntries).toBeUndefined();
    });

    it('throws when SignerQuorum === 0 but SignerEntries is non-empty', () => {
      expect(() =>
        signerListSet({
          Account: ACCOUNT,
          SignerQuorum: 0,
          SignerEntries: [TWO_OF_FOUR],
        }),
      ).toThrow(/SignerQuorum must be > 0 when SignerEntries are present/);
    });

    it('allows SignerQuorum === 0 with an empty SignerEntries array', () => {
      // An empty array carries no entries — equivalent to omitting it.
      const tx = signerListSet({
        Account: ACCOUNT,
        SignerQuorum: 0,
        SignerEntries: [],
      });
      expect(tx.SignerQuorum).toBe(0);
      expect(tx.SignerEntries).toEqual([]);
    });
  });

  describe('SignerEntries guards (non-zero quorum)', () => {
    it('throws when SignerEntries is missing (undefined) with SignerQuorum > 0', () => {
      expect(() =>
        signerListSet({
          Account: ACCOUNT,
          SignerQuorum: 3,
        }),
      ).toThrow(/SignerEntries/);
    });

    it('throws when SignerEntries is an empty array', () => {
      expect(() =>
        signerListSet({
          Account: ACCOUNT,
          SignerQuorum: 3,
          SignerEntries: [],
        }),
      ).toThrow(/at least 1 member/);
    });

    it('throws when SignerEntries exceeds the 32-member cap', () => {
      // Build 33 distinct well-formed signers. The address format is
      // /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/ — exclude '0','O','I','l'.
      // We use a 30-char lowercase base58 prefix with no 'i'/'o'/'l'
      // and vary the last 2 chars per index using a base58 alphabet
      // that excludes the forbidden chars.
      const BASE58 =
        'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ123456789';
      const list = Array.from({ length: 33 }, (_, i) => {
        const a = Math.floor(i / BASE58.length);
        const b = i % BASE58.length;
        const suffix = 'a'.repeat(28) + BASE58[a] + BASE58[b];
        return {
          SignerEntry: {
            Account: 'r' + suffix,
            SignerWeight: 1,
          },
        };
      });
      expect(() =>
        signerListSet({
          Account: ACCOUNT,
          SignerQuorum: 33,
          SignerEntries: list,
        }),
      ).toThrow(/maximum of 32/);
    });

    it('accepts exactly the maximum 32 entries', () => {
      const BASE58 =
        'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ123456789';
      const list = Array.from({ length: 32 }, (_, i) => {
        const a = Math.floor(i / BASE58.length);
        const b = i % BASE58.length;
        const suffix = 'a'.repeat(28) + BASE58[a] + BASE58[b];
        return {
          SignerEntry: {
            Account: 'r' + suffix,
            SignerWeight: 1,
          },
        };
      });
      const tx = signerListSet({
        Account: ACCOUNT,
        SignerQuorum: 32,
        SignerEntries: list,
      });
      expect(tx.SignerEntries).toHaveLength(32);
    });

    it('throws when a SignerEntry is missing the SignerEntry inner object', () => {
      expect(() =>
        signerListSet({
          Account: ACCOUNT,
          SignerQuorum: 3,
          SignerEntries: [
            {
              NotASignerEntry: {
                Account: SIGNER_A,
                SignerWeight: 1,
              },
            } as unknown as typeof THREE_ENTRY_LIST[number],
          ],
        }),
      ).toThrow(/SignerEntry must be an object/);
    });

    it('throws when SignerEntry.Account is not a valid XRPL address', () => {
      expect(() =>
        signerListSet({
          Account: ACCOUNT,
          SignerQuorum: 3,
          SignerEntries: [
            {
              SignerEntry: {
                Account: 'rINVALID',
                SignerWeight: 1,
              },
            },
          ],
        }),
      ).toThrow(/Account must be a valid XRPL address/);
    });

    it('throws when SignerEntry.Account equals the sending Account (temBAD_SIGNER)', () => {
      expect(() =>
        signerListSet({
          Account: ACCOUNT,
          SignerQuorum: 3,
          SignerEntries: [
            {
              SignerEntry: {
                Account: ACCOUNT,
                SignerWeight: 1,
              },
            },
          ],
        }),
      ).toThrow(/must not equal the sending Account/);
    });

    it('throws when SignerEntries contain duplicate Account values (temBAD_SIGNER)', () => {
      expect(() =>
        signerListSet({
          Account: ACCOUNT,
          SignerQuorum: 3,
          SignerEntries: [TWO_OF_FOUR, TWO_OF_FOUR],
        }),
      ).toThrow(/duplicate signer Account/);
    });

    it('throws when SignerWeight is zero (temBAD_WEIGHT)', () => {
      expect(() =>
        signerListSet({
          Account: ACCOUNT,
          SignerQuorum: 1,
          SignerEntries: [
            {
              SignerEntry: {
                Account: SIGNER_A,
                SignerWeight: 0,
              },
            },
          ],
        }),
      ).toThrow(/SignerWeight must be a positive integer/);
    });

    it('throws when SignerWeight is negative (temBAD_WEIGHT)', () => {
      expect(() =>
        signerListSet({
          Account: ACCOUNT,
          SignerQuorum: 1,
          SignerEntries: [
            {
              SignerEntry: {
                Account: SIGNER_A,
                SignerWeight: -1,
              },
            },
          ],
        }),
      ).toThrow(/SignerWeight must be a positive integer/);
    });

    it('throws when SignerWeight is not an integer', () => {
      expect(() =>
        signerListSet({
          Account: ACCOUNT,
          SignerQuorum: 1,
          SignerEntries: [
            {
              SignerEntry: {
                Account: SIGNER_A,
                SignerWeight: 1.5,
              },
            },
          ],
        }),
      ).toThrow(/SignerWeight must be a positive integer/);
    });

    it('throws when SignerQuorum exceeds the sum of SignerWeights (temBAD_QUORUM)', () => {
      // Sum = 4 (2+1+1). Quorum = 5 violates the cap.
      expect(() =>
        signerListSet({
          Account: ACCOUNT,
          SignerQuorum: 5,
          SignerEntries: THREE_ENTRY_LIST,
        }),
      ).toThrow(/SignerQuorum.*must not exceed the sum of SignerWeights/);
    });

    it('accepts SignerQuorum exactly equal to the sum of SignerWeights', () => {
      const tx = signerListSet({
        Account: ACCOUNT,
        SignerQuorum: 4, // 2+1+1
        SignerEntries: THREE_ENTRY_LIST,
      });
      expect(tx.SignerQuorum).toBe(4);
    });

    it('throws when WalletLocator is present but not 64 hex characters', () => {
      expect(() =>
        signerListSet({
          Account: ACCOUNT,
          SignerQuorum: 3,
          SignerEntries: [
            {
              SignerEntry: {
                Account: SIGNER_A,
                SignerWeight: 1,
                WalletLocator: 'not-hex',
              },
            },
          ],
        }),
      ).toThrow(/WalletLocator must be a 256-bit/);
    });

    it('accepts a valid 64-char hex WalletLocator (ExpandedSignerList)', () => {
      const tx = signerListSet({
        Account: ACCOUNT,
        SignerQuorum: 1,
        SignerEntries: [
          {
            SignerEntry: {
              Account: SIGNER_A,
              SignerWeight: 1,
              WalletLocator:
                'CAFECAFECAFECAFECAFECAFECAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE',
            },
          },
        ],
      });
      expect(tx.SignerEntries?.[0].SignerEntry.WalletLocator).toBe(
        'CAFECAFECAFECAFECAFECAFECAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE',
      );
    });
  });

  describe('.with()', () => {
    it('returns a new frozen tx with overrides applied', () => {
      const tx = make();
      const tx2 = tx.with({ Fee: '20' });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Fee).toBe('20');
      expect(tx2.Account).toBe(ACCOUNT);
      expect(tx2.SignerQuorum).toBe(3);
      expect(tx.Fee).toBeUndefined();
    });

    it('re-validates: cannot bypass Account via overrides', () => {
      const tx = make();
      expect(() => tx.with({ Account: 'bad' as unknown as string })).toThrow(
        /Account/,
      );
    });

    it('re-validates: cannot bypass SignerQuorum via overrides', () => {
      const tx = make();
      expect(() =>
        tx.with({ SignerQuorum: undefined as unknown as number }),
      ).toThrow(/SignerQuorum/);
    });

    it('re-validates: cannot bypass quorum cap via overrides', () => {
      const tx = make();
      // sum = 4; bumping SignerQuorum above 4 must be rejected.
      expect(() => tx.with({ SignerQuorum: 99 })).toThrow(
        /SignerQuorum.*must not exceed/,
      );
    });

    it('re-validates: cannot introduce a self-signed Account via overrides', () => {
      const tx = make();
      expect(() =>
        tx.with({
          SignerEntries: [
            {
              SignerEntry: {
                Account: ACCOUNT,
                SignerWeight: 1,
              },
            },
          ],
        }),
      ).toThrow(/must not equal the sending Account/);
    });
  });

  describe('.toJSON()', () => {
    it('produces a plain object matching xrpl.js shape', () => {
      const tx = signerListSet({
        Account: ACCOUNT,
        SignerQuorum: 3,
        SignerEntries: THREE_ENTRY_LIST,
        Fee: '12',
        Sequence: 42,
      });
      expect(tx.toJSON()).toEqual({
        TransactionType: 'SignerListSet',
        Account: ACCOUNT,
        SignerQuorum: 3,
        SignerEntries: THREE_ENTRY_LIST,
        Fee: '12',
        Sequence: 42,
      });
    });

    it('strips methods and undefined fields', () => {
      const tx = make();
      const json = tx.toJSON();
      expect(json).not.toHaveProperty('validate');
      expect(json).not.toHaveProperty('toJSON');
      expect(json).not.toHaveProperty('with');
      expect(json).not.toHaveProperty('Fee'); // undefined
      expect(json).not.toHaveProperty('Sequence');
      expect(json).not.toHaveProperty('Flags');
    });

    it('omits SignerEntries in the deletion path', () => {
      const tx = signerListSet({
        Account: ACCOUNT,
        SignerQuorum: 0,
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'SignerListSet',
        Account: ACCOUNT,
        SignerQuorum: 0,
      });
      expect(json).not.toHaveProperty('SignerEntries');
    });

    it('.validate() is a no-op (validation already happened)', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });

  describe('round-trip through xrpl encode/decode', () => {
    it('decodes back to a SignerListSet with the same shape', () => {
      const tx = signerListSet({
        Account: ACCOUNT,
        SignerQuorum: 3,
        SignerEntries: THREE_ENTRY_LIST,
        Fee: '12',
      });
      const encoded = encode(
        tx.toJSON() as unknown as Parameters<typeof encode>[0],
      );
      expect(encoded).toBeDefined();
      const decoded = decode(encoded);
      expect(decoded.TransactionType).toBe('SignerListSet');
      expect((decoded as { Account: string }).Account).toBe(ACCOUNT);
      expect((decoded as { SignerQuorum: number }).SignerQuorum).toBe(3);
    });

    it('round-trips a deletion tx (SignerQuorum === 0, no SignerEntries)', () => {
      const tx = signerListSet({
        Account: ACCOUNT,
        SignerQuorum: 0,
      });
      const encoded = encode(
        tx.toJSON() as unknown as Parameters<typeof encode>[0],
      );
      expect(encoded).toBeDefined();
      const decoded = decode(encoded);
      expect(decoded.TransactionType).toBe('SignerListSet');
      expect((decoded as { Account: string }).Account).toBe(ACCOUNT);
      expect((decoded as { SignerQuorum: number }).SignerQuorum).toBe(0);
    });
  });

  // ─── Base transaction fields ──────────────────────────────────────────────
  // `SignerListSetProps` now extends `BasePropsFields`, so the seven shared
  // base fields are part of this props type for the first time. Every factory's
  // props type is being converted to `BasePropsFields` in one library-wide pass.
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
      SignerQuorum: 1,
      SignerEntries: [{ SignerEntry: { Account: SIGNER_A, SignerWeight: 1 } }],
    };

    it('accepts Memos', () => {
      const memos = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
      const tx = signerListSet({ ...base, Memos: memos });
      expect(tx.Memos).toEqual(memos);
    });

    it('accepts SourceTag', () => {
      const tx = signerListSet({ ...base, SourceTag: 99 });
      expect(tx.SourceTag).toBe(99);
    });

    it('accepts LastLedgerSequence', () => {
      const tx = signerListSet({ ...base, LastLedgerSequence: 1234567 });
      expect(tx.LastLedgerSequence).toBe(1234567);
    });

    it('accepts AccountTxnID', () => {
      const tx = signerListSet({ ...base, AccountTxnID: 'A'.repeat(64) });
      expect(tx.AccountTxnID).toBe('A'.repeat(64));
    });

    it('accepts NetworkID', () => {
      const tx = signerListSet({ ...base, NetworkID: 1 });
      expect(tx.NetworkID).toBe(1);
    });

    it('accepts a distinct Delegate', () => {
      const tx = signerListSet({ ...base, Delegate: SIGNER_B });
      expect(tx.Delegate).toBe(SIGNER_B);
    });

    it('accepts TicketSequence (with Sequence 0)', () => {
      const tx = signerListSet({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.TicketSequence).toBe(42);
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    it('round-trips all seven through .toJSON()', () => {
      const tx = signerListSet({
        ...base,
        Memos: [{ Memo: { MemoType: '74', MemoData: '6869' } }],
        SourceTag: 7,
        LastLedgerSequence: 900,
        AccountTxnID: 'B'.repeat(64),
        NetworkID: 2,
        Delegate: SIGNER_B,
        Sequence: 0,
        TicketSequence: 5,
      });
      const json = tx.toJSON();
      expect(json.Memos).toEqual([{ Memo: { MemoType: '74', MemoData: '6869' } }]);
      expect(json.SourceTag).toBe(7);
      expect(json.LastLedgerSequence).toBe(900);
      expect(json.AccountTxnID).toBe('B'.repeat(64));
      expect(json.NetworkID).toBe(2);
      expect(json.Delegate).toBe(SIGNER_B);
      expect(json.TicketSequence).toBe(5);
    });

    it('survives .with() with base fields set', () => {
      const tx = signerListSet({ ...base, SourceTag: 99 });
      const next = tx.with({ Account: ACCOUNT });
      expect(next.SourceTag).toBe(99);
      expect(next.SignerQuorum).toBe(1);
    });

    it('runtime-validates every base field (the gap is closed)', () => {
      // This test used to assert `.not.toThrow()` for all eight cases: a
      // deliberate tripwire documenting that the factory did NOT call
      // `validateBaseTransaction`. The factory now calls it, so the tripwire
      // has fired and the assertions are inverted to the real behaviour.
      expect(() =>
        signerListSet({ ...base, Memos: 'not-an-array' } as any),
      ).toThrow(/invalid Memos/);
      expect(() => signerListSet({ ...base, SourceTag: 'NaN' } as any)).toThrow(
        /SourceTag must be a number/,
      );
      expect(() =>
        signerListSet({ ...base, LastLedgerSequence: 'soon' } as any),
      ).toThrow(/LastLedgerSequence must be a number/);
      expect(() => signerListSet({ ...base, AccountTxnID: 99 } as any)).toThrow(
        /AccountTxnID must be a string/,
      );
      expect(() => signerListSet({ ...base, NetworkID: {} } as any)).toThrow(
        /NetworkID must be a number/,
      );
      expect(() =>
        signerListSet({ ...base, TicketSequence: 'nope' } as any),
      ).toThrow(/TicketSequence must be a number/);
      expect(() =>
        signerListSet({ ...base, Delegate: 'not-an-address' } as any),
      ).toThrow(/invalid Delegate/);
      expect(() => signerListSet({ ...base, Delegate: ACCOUNT })).toThrow(
        /cannot be the same/,
      );
    });

    it('still checks SignerQuorum before the shared base fields', () => {
      // Ordering check: a factory-specific mistake still produces the
      // factory's own message, not the base validator's backstop message.
      expect(() =>
        signerListSet({ ...base, SignerQuorum: 99, SourceTag: 'NaN' } as any),
      ).toThrow(/SignerQuorum/);
    });

    it('rejects a non-string Fee', () => {
      expect(() => signerListSet({ ...base, Fee: 12 } as any)).toThrow(
        /Fee must be a string/,
      );
    });
  });
});