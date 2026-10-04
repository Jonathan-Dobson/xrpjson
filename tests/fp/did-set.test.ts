/**
 * Tests for the functional DIDSet factory.
 *
 * Mirrors the contract used by the other fp tests — construction-time
 * validation, frozen shape, .with() re-validation, .toJSON() shape,
 * round-trip through xrpl encode/decode. Specific to DIDSet, we
 * exhaustively cover the canonical xrpl.js / XLS-40 guard list plus
 * the factory's stricter hex/length/Account-format checks:
 *
 *   - Account required + isAccount (classic or X-address)
 *   - At least one of Data/DIDDocument/URI must be present
 *   - Empty string ("") is the canonical "clear" payload
 *   - Each present Blob field must be valid hex
 *   - Each present Blob field must have even length (whole bytes)
 *   - Flags must be a finite number if provided
 *   - .with() re-validates all guards on override
 *   - .toJSON() skips methods and undefined fields
 *   - Round-trips through xrpl encode/decode
 */
import { describe, it, expect } from 'vitest';
import { decode, encode } from 'xrpl';
import { didSet } from '../../src/fp/factories/did-set.js';

const ACCOUNT_A = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const ACCOUNT_B = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';

// Realistic hex payloads. The spec example shows `URI` as a hex-encoded
// `ipfs://...` URL; same format applies to `Data` and `DIDDocument`.
const HEX_URI = '697066733A2F2F62616679626569676479727A7435'; // "ipfs://..." (truncated)
const HEX_DATA = 'A1B2C3D4'; // even length, valid hex
const HEX_DID_DOC = '0A0B0C'; // even length, valid hex
const ODD_HEX = 'A1B2C'; // 5 chars — odd; would be rejected by codec

describe('fp/didSet()', () => {
  // ─── Happy paths ─────────────────────────────────────────────────

  it('constructs with URI only', () => {
    const tx = didSet({ Account: ACCOUNT_A, URI: HEX_URI });
    expect(tx.TransactionType).toBe('DIDSet');
    expect(tx.Account).toBe(ACCOUNT_A);
    expect(tx.URI).toBe(HEX_URI);
  });

  it('constructs with Data only', () => {
    const tx = didSet({ Account: ACCOUNT_A, Data: HEX_DATA });
    expect(tx.TransactionType).toBe('DIDSet');
    expect(tx.Data).toBe(HEX_DATA);
    expect(tx.DIDDocument).toBeUndefined();
    expect(tx.URI).toBeUndefined();
  });

  it('constructs with DIDDocument only', () => {
    const tx = didSet({ Account: ACCOUNT_A, DIDDocument: HEX_DID_DOC });
    expect(tx.TransactionType).toBe('DIDSet');
    expect(tx.DIDDocument).toBe(HEX_DID_DOC);
  });

  it('constructs with all three Blob fields populated', () => {
    const tx = didSet({
      Account: ACCOUNT_A,
      Data: HEX_DATA,
      DIDDocument: HEX_DID_DOC,
      URI: HEX_URI,
    });
    expect(tx.Data).toBe(HEX_DATA);
    expect(tx.DIDDocument).toBe(HEX_DID_DOC);
    expect(tx.URI).toBe(HEX_URI);
  });

  // ─── Frozen shape contract ──────────────────────────────────────

  it('returns a frozen object', () => {
    const tx = didSet({ Account: ACCOUNT_A, Data: HEX_DATA });
    expect(Object.isFrozen(tx)).toBe(true);
  });

  it('mutation throws in strict mode (frozen at every layer)', () => {
    const tx = didSet({ Account: ACCOUNT_A, Data: HEX_DATA });
    expect(() => {
      (tx as unknown as { Account: string }).Account = ACCOUNT_B;
    }).toThrow(TypeError);
    expect(tx.Account).toBe(ACCOUNT_A);
  });

  // ─── Account validation ─────────────────────────────────────────

  it('throws at construction on missing Account', () => {
    expect(() =>
      didSet({
        Account: '',
        URI: HEX_URI,
      } as unknown as Parameters<typeof didSet>[0]),
    ).toThrow(/Account/);
  });

  it('throws at construction on malformed Account', () => {
    expect(() =>
      didSet({
        Account: 'not-an-address',
        URI: HEX_URI,
      }),
    ).toThrow(/Account/);
  });

  it('accepts an X-address for Account', () => {
    const X_ADDR = 'X7Acg9t9WtR2Y4HXUsScrU5KhH4PmgBxX3RcL8soFpPJz8X';
    const tx = didSet({ Account: X_ADDR, URI: HEX_URI });
    expect(tx.Account).toBe(X_ADDR);
  });

  // ─── "at least one Blob" guard (XLS-40 / xrpl.js / class) ─────

  it('throws when all of Data/DIDDocument/URI are missing (XLS-40)', () => {
    expect(() => didSet({ Account: ACCOUNT_A })).toThrow(
      /at least one of Data, DIDDocument, or URI/,
    );
  });

  // ─── Empty-string "clear" payload (xrpl.org `didset.md:41`) ─────

  it('accepts empty string for Data (canonical clear)', () => {
    const tx = didSet({ Account: ACCOUNT_A, Data: '' });
    expect(tx.Data).toBe('');
  });

  it('accepts empty string for DIDDocument (canonical clear)', () => {
    const tx = didSet({ Account: ACCOUNT_A, DIDDocument: '' });
    expect(tx.DIDDocument).toBe('');
  });

  it('accepts empty string for URI (canonical clear)', () => {
    const tx = didSet({ Account: ACCOUNT_A, URI: '' });
    expect(tx.URI).toBe('');
  });

  // ─── Per-field hex validation ───────────────────────────────────

  it('throws on non-hex Data', () => {
    expect(() => didSet({ Account: ACCOUNT_A, Data: 'not-hex-zzz' })).toThrow(
      /Data must be valid hex/,
    );
  });

  it('throws on non-hex URI', () => {
    expect(() => didSet({ Account: ACCOUNT_A, URI: 'ipfs://plain' })).toThrow(
      /URI must be valid hex/,
    );
  });

  it('throws on non-hex DIDDocument', () => {
    expect(() =>
      didSet({ Account: ACCOUNT_A, DIDDocument: '!!malformed!!' }),
    ).toThrow(/DIDDocument must be valid hex/);
  });

  it('throws when Data is not a string', () => {
    expect(() =>
      didSet({ Account: ACCOUNT_A, Data: 0xdeadbeef as unknown as string }),
    ).toThrow(/Data must be a string/);
  });

  it('throws when URI is not a string', () => {
    expect(() =>
      didSet({ Account: ACCOUNT_A, URI: 42 as unknown as string }),
    ).toThrow(/URI must be a string/);
  });

  // ─── Hex length must be even (whole-byte Blob encoding) ─────────

  it('throws when Data hex has odd length', () => {
    expect(() => didSet({ Account: ACCOUNT_A, Data: ODD_HEX })).toThrow(
      /Data hex must have even length/,
    );
  });

  it('throws when URI hex has odd length', () => {
    expect(() => didSet({ Account: ACCOUNT_A, URI: 'ABC' })).toThrow(
      /URI hex must have even length/,
    );
  });

  it('accepts mixed-case hex (uppercase/lowercase)', () => {
    const tx = didSet({ Account: ACCOUNT_A, Data: 'aA1bB2' });
    expect(tx.Data).toBe('aA1bB2');
  });

  // ─── Flags ──────────────────────────────────────────────────────

  it('accepts Flags = 0', () => {
    const tx = didSet({ Account: ACCOUNT_A, URI: HEX_URI, Flags: 0 });
    expect(tx.Flags).toBe(0);
  });

  it('accepts Flags = tfFullyCanonicalSig (0x80000000)', () => {
    const tx = didSet({
      Account: ACCOUNT_A,
      URI: HEX_URI,
      Flags: 0x80000000,
    });
    expect(tx.Flags).toBe(0x80000000);
  });

  it('throws when Flags is a non-number', () => {
    expect(() =>
      didSet({
        Account: ACCOUNT_A,
        URI: HEX_URI,
        Flags: '0' as unknown as number,
      }),
    ).toThrow(/Flags must be a finite number/);
  });

  it('throws when Flags is NaN', () => {
    expect(() =>
      didSet({
        Account: ACCOUNT_A,
        URI: HEX_URI,
        Flags: Number.NaN,
      }),
    ).toThrow(/Flags must be a finite number/);
  });

  // ─── .with() — re-validates ─────────────────────────────────────

  it('.with() returns a new frozen tx with overrides applied', () => {
    const tx = didSet({ Account: ACCOUNT_A, URI: HEX_URI });
    const tx2 = tx.with({ Fee: '12', Sequence: 42 });
    expect(tx2).not.toBe(tx);
    expect(Object.isFrozen(tx2)).toBe(true);
    expect(tx2.Fee).toBe('12');
    expect(tx2.Sequence).toBe(42);
    expect(tx2.Account).toBe(ACCOUNT_A);
    expect(tx.Fee).toBeUndefined();
  });

  it('.with() re-validates Account on override', () => {
    const tx = didSet({ Account: ACCOUNT_A, URI: HEX_URI });
    expect(() => tx.with({ Account: 'garbage' })).toThrow(/Account/);
  });

  it('.with() re-validates "at least one Blob" when overrides remove all', () => {
    const tx = didSet({ Account: ACCOUNT_A, URI: HEX_URI });
    // Cannot strip URI via .with() without providing a replacement
    // because the prop is set to undefined → all three undefined → reject.
    expect(() => tx.with({ URI: undefined as unknown as string })).toThrow(
      /at least one of Data, DIDDocument, or URI/,
    );
  });

  it('.with() re-validates Blob hex on override', () => {
    const tx = didSet({ Account: ACCOUNT_A, URI: HEX_URI });
    expect(() => tx.with({ URI: 'not-hex' })).toThrow(/URI must be valid hex/);
  });

  it('.with() preserves existing Blob fields and merges with new ones', () => {
    const tx = didSet({ Account: ACCOUNT_A, Data: HEX_DATA });
    const tx2 = tx.with({ URI: HEX_URI });
    expect(tx2.Data).toBe(HEX_DATA);
    expect(tx2.URI).toBe(HEX_URI);
    expect(tx2.Account).toBe(ACCOUNT_A);
  });

  // ─── .toJSON() ──────────────────────────────────────────────────

  it('.toJSON() produces a plain object matching xrpl.js shape', () => {
    const tx = didSet({
      Account: ACCOUNT_A,
      URI: HEX_URI,
      Fee: '12',
      Sequence: 42,
    });
    const json = tx.toJSON();
    expect(json).toEqual({
      TransactionType: 'DIDSet',
      Account: ACCOUNT_A,
      URI: HEX_URI,
      Fee: '12',
      Sequence: 42,
    });
  });

  it('.toJSON() skips methods and undefined fields', () => {
    const tx = didSet({ Account: ACCOUNT_A, URI: HEX_URI });
    const json = tx.toJSON();
    expect(json).not.toHaveProperty('validate');
    expect(json).not.toHaveProperty('toJSON');
    expect(json).not.toHaveProperty('with');
    expect(json).not.toHaveProperty('Data');
    expect(json).not.toHaveProperty('DIDDocument');
    expect(json).not.toHaveProperty('Flags');
    expect(json).not.toHaveProperty('Fee');
  });

  it('.validate() is a no-op (validation already happened)', () => {
    const tx = didSet({ Account: ACCOUNT_A, URI: HEX_URI });
    expect(() => tx.validate()).not.toThrow();
  });

  // ─── Wire round-trip ────────────────────────────────────────────

  it('round-trips through xrpl encode/decode (URI only)', () => {
    const tx = didSet({ Account: ACCOUNT_A, URI: HEX_URI, Fee: '10' });
    const encoded = encode(tx.toJSON() as unknown as Parameters<typeof encode>[0]);
    expect(encoded).toBeDefined();
    const decoded = decode(encoded);
    expect(decoded.TransactionType).toBe('DIDSet');
    expect((decoded as { Account: string }).Account).toBe(ACCOUNT_A);
    expect((decoded as { URI: string }).URI).toBe(HEX_URI);
  });

  it('round-trips through xrpl encode/decode (all three blobs)', () => {
    const tx = didSet({
      Account: ACCOUNT_A,
      Data: HEX_DATA,
      DIDDocument: HEX_DID_DOC,
      URI: HEX_URI,
      Fee: '10',
    });
    const encoded = encode(tx.toJSON() as unknown as Parameters<typeof encode>[0]);
    const decoded = decode(encoded);
    expect(decoded.TransactionType).toBe('DIDSet');
    expect((decoded as { Account: string }).Account).toBe(ACCOUNT_A);
    expect((decoded as { Data: string }).Data).toBe(HEX_DATA);
    expect((decoded as { DIDDocument: string }).DIDDocument).toBe(HEX_DID_DOC);
    expect((decoded as { URI: string }).URI).toBe(HEX_URI);
  });
  // ─── Base transaction fields ──────────────────────────────────────────────
  // `DIDSetProps` extends `BasePropsFields`, so the seven shared base
  // transaction fields are part of this factory's prop type and are checked
  // by `validateBaseTransaction` at construction.
  describe('BaseTransactionFields', () => {

    const base = {
      Account: ACCOUNT_A,
      Data: HEX_DATA,
    };

    it('accepts a valid Memos array', () => {
      const memos = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
      const tx = didSet({ ...base, Memos: memos });
      expect(tx.Memos).toEqual(memos);
    });

    it('rejects a malformed Memos value', () => {
      expect(() => didSet({ ...base, Memos: 'not-an-array' } as any)).toThrow(
        /invalid Memos/,
      );
    });

    it('accepts SourceTag', () => {
      const tx = didSet({ ...base, SourceTag: 99 });
      expect(tx.SourceTag).toBe(99);
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() => didSet({ ...base, SourceTag: 'NaN' } as any)).toThrow(
        /SourceTag must be a number/,
      );
    });

    it('accepts LastLedgerSequence', () => {
      const tx = didSet({ ...base, LastLedgerSequence: 900000 });
      expect(tx.LastLedgerSequence).toBe(900000);
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() =>
        didSet({ ...base, LastLedgerSequence: 'soon' } as any),
      ).toThrow(/LastLedgerSequence must be a number/);
    });

    it('accepts AccountTxnID', () => {
      const tx = didSet({ ...base, AccountTxnID: 'ABC123' });
      expect(tx.AccountTxnID).toBe('ABC123');
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() => didSet({ ...base, AccountTxnID: 42 } as any)).toThrow(
        /AccountTxnID must be a string/,
      );
    });

    it('accepts NetworkID', () => {
      const tx = didSet({ ...base, NetworkID: 1 });
      expect(tx.NetworkID).toBe(1);
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() => didSet({ ...base, NetworkID: {} } as any)).toThrow(
        /NetworkID must be a number/,
      );
    });

    it('accepts a distinct Delegate', () => {
      const tx = didSet({ ...base, Delegate: ACCOUNT_B });
      expect(tx.Delegate).toBe(ACCOUNT_B);
    });

    it('rejects a Delegate that is not a valid account address', () => {
      expect(() =>
        didSet({ ...base, Delegate: 'not-an-address' } as any),
      ).toThrow(/invalid Delegate/);
    });

    it('rejects Delegate equal to Account', () => {
      expect(() => didSet({ ...base, Delegate: base.Account })).toThrow(
        /cannot be the same/,
      );
    });

    it('accepts TicketSequence (the field that made tickets unspendable)', () => {
      const tx = didSet({ ...base, Sequence: 0, TicketSequence: 42 });
      expect(tx.TicketSequence).toBe(42);
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() => didSet({ ...base, TicketSequence: 'nope' } as any)).toThrow(
        /TicketSequence must be a number/,
      );
    });
  });
});
