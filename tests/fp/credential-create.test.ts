/**
 * Tests for the functional CredentialCreate factory.
 *
 * Validates:
 *   1. Construction with required Account + Subject + CredentialType.
 *   2. Optional Expiration (UInt32) and URI (hex, 1–256 bytes) validation.
 *   3. CredentialType validation (hex, non-empty, even-length, ≤ 64 bytes).
 *   4. Subject rejection of ACCOUNT_ZERO.
 *   5. Frozen-shape contract (mutation throws, .with() returns new frozen
 *      object, .toJSON() strips methods and undefined values).
 *   6. Factory-only rules not enforced by the class API (see Divergences
 *      in the factory header).
 */
import { describe, it, expect } from 'vitest';
import { credentialCreate } from '../../src/fp/factories/credential-create.js';

const ISSUER = 'rfmDuhDyLGgx94qiwf3YF8BUV5j6KSvE8';
const SUBJECT = 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH';
const ACCOUNT_ZERO = 'rHb9CJAWyB4rj91VRWn96Dkukn4MRtfQ';
const SAMPLE_TYPE = '6D795F63726564656E7469616C'; // hex for "my_credential"
const SAMPLE_URI = '6874747073'; // hex for "https"

function make(
  extras: Partial<{
    Account: string;
    Subject: string;
    CredentialType: string;
    Expiration: number;
    URI: string;
  }> = {},
) {
  return credentialCreate({
    Account: extras.Account ?? ISSUER,
    Subject: extras.Subject ?? SUBJECT,
    CredentialType: extras.CredentialType ?? SAMPLE_TYPE,
    ...(extras.Expiration !== undefined ? { Expiration: extras.Expiration } : {}),
    ...(extras.URI !== undefined ? { URI: extras.URI } : {}),
  });
}

describe('fp/credentialCreate()', () => {
  describe('construction', () => {
    it('constructs with required fields only', () => {
      const tx = make();
      expect(tx.TransactionType).toBe('CredentialCreate');
      expect(tx.Account).toBe(ISSUER);
      expect(tx.Subject).toBe(SUBJECT);
      expect(tx.CredentialType).toBe(SAMPLE_TYPE);
      expect(tx.Expiration).toBeUndefined();
      expect(tx.URI).toBeUndefined();
    });

    it('accepts every spec field together', () => {
      const tx = credentialCreate({
        Account: ISSUER,
        Subject: SUBJECT,
        CredentialType: SAMPLE_TYPE,
        Expiration: 1735689600,
        URI: SAMPLE_URI,
        Fee: '10',
        Sequence: 390,
        Flags: 0,
      });
      expect(tx.Expiration).toBe(1735689600);
      expect(tx.URI).toBe(SAMPLE_URI);
      expect(tx.Fee).toBe('10');
      expect(tx.Sequence).toBe(390);
      expect(tx.Flags).toBe(0);
    });

    // ── Factory-only divergence: class requires CredentialSequence ──
    it('does NOT expose CredentialSequence (XLS-0070 §3.1)', () => {
      const tx = make();
      expect('CredentialSequence' in tx).toBe(false);
    });
  });

  describe('Account validation', () => {
    it('throws when Account is missing', () => {
      expect(() =>
        credentialCreate({
          Account: undefined as unknown as string,
          Subject: SUBJECT,
          CredentialType: SAMPLE_TYPE,
        }),
      ).toThrow(/Account is required/);
    });

    it('throws when Account is empty', () => {
      expect(() =>
        credentialCreate({
          Account: '',
          Subject: SUBJECT,
          CredentialType: SAMPLE_TYPE,
        }),
      ).toThrow(/Account is required/);
    });
  });

  describe('Subject validation', () => {
    it('throws when Subject is missing', () => {
      expect(() =>
        credentialCreate({
          Account: ISSUER,
          Subject: undefined as unknown as string,
          CredentialType: SAMPLE_TYPE,
        }),
      ).toThrow(/Subject is required/);
    });

    it('throws when Subject is empty', () => {
      expect(() =>
        credentialCreate({
          Account: ISSUER,
          Subject: '',
          CredentialType: SAMPLE_TYPE,
        }),
      ).toThrow(/Subject is required/);
    });

    it('throws when Subject is not a valid XRPL address', () => {
      expect(() =>
        make({ Subject: 'not-an-address!' }),
      ).toThrow(/valid XRPL address/);
    });

    // ── Factory-only divergence: class accepts any isAccount address ──
    it('throws when Subject is ACCOUNT_ZERO', () => {
      expect(() => make({ Subject: ACCOUNT_ZERO })).toThrow(
        /ACCOUNT_ZERO/,
      );
    });
  });

  describe('CredentialType validation', () => {
    it('throws when CredentialType is missing', () => {
      expect(() =>
        credentialCreate({
          Account: ISSUER,
          Subject: SUBJECT,
          CredentialType: undefined as unknown as string,
        }),
      ).toThrow(/CredentialType must be a hex string/);
    });

    it('throws when CredentialType is empty', () => {
      expect(() => make({ CredentialType: '' })).toThrow(
        /cannot be an empty string/,
      );
    });

    it('throws when CredentialType is non-hex', () => {
      expect(() => make({ CredentialType: 'zzzz' })).toThrow(/encoded in hex/);
    });

    it('throws when CredentialType has odd length', () => {
      expect(() => make({ CredentialType: 'ABC' })).toThrow(/even/);
    });

    // ── Factory-only divergence: class does no CredentialType check ──
    it('throws when CredentialType exceeds 64 bytes (XLS-0070 §3.2)', () => {
      const tooLong = 'A'.repeat(130); // 130 hex chars = 65 bytes
      expect(() => make({ CredentialType: tooLong })).toThrow(/64 bytes/);
    });

    it('accepts CredentialType at exactly 64 bytes', () => {
      const ok = 'A'.repeat(128); // 128 hex chars = 64 bytes
      const tx = make({ CredentialType: ok });
      expect(tx.CredentialType).toBe(ok);
    });

    it('accepts CredentialType at 1 byte (smallest non-empty)', () => {
      const tx = make({ CredentialType: '41' });
      expect(tx.CredentialType).toBe('41');
    });
  });

  describe('URI validation', () => {
    it('accepts missing URI (optional)', () => {
      const tx = make();
      expect(tx.URI).toBeUndefined();
    });

    // ── Factory-only divergence: class accepts any string URI ──
    it('throws when URI is empty', () => {
      expect(() => make({ URI: '' })).toThrow(/cannot be an empty string/);
    });

    it('throws when URI is non-hex', () => {
      expect(() => make({ URI: 'not-hex!' })).toThrow(/encoded in hex/);
    });

    it('throws when URI is non-string', () => {
      expect(() =>
        make({ URI: 12345 as unknown as string }),
      ).toThrow(/hex string/);
    });

    // ── Factory-only divergence: class has no URI length check ──
    it('throws when URI exceeds 256 bytes (XLS-0070 §3.2)', () => {
      const tooLong = 'A'.repeat(514); // 514 hex chars = 257 bytes
      expect(() => make({ URI: tooLong })).toThrow(/256 bytes/);
    });

    it('accepts URI at exactly 256 bytes', () => {
      const ok = 'A'.repeat(512); // 512 hex chars = 256 bytes
      const tx = make({ URI: ok });
      expect(tx.URI).toBe(ok);
    });

    it('accepts URI at 1 byte', () => {
      const tx = make({ URI: '41' });
      expect(tx.URI).toBe('41');
    });
  });

  describe('Expiration validation', () => {
    it('accepts missing Expiration (optional)', () => {
      const tx = make();
      expect(tx.Expiration).toBeUndefined();
    });

    it('throws when Expiration is not a number', () => {
      expect(() =>
        make({ Expiration: 'soon' as unknown as number }),
      ).toThrow(/integer/);
    });

    it('throws when Expiration is not an integer', () => {
      expect(() => make({ Expiration: 1.5 })).toThrow(/integer/);
    });

    it('throws when Expiration is negative', () => {
      expect(() => make({ Expiration: -1 })).toThrow(/non-negative/);
    });

    // ── Factory-only divergence: class has no Expiration range check ──
    it('throws when Expiration exceeds UInt32 max', () => {
      expect(() => make({ Expiration: UINT32_PLUS_ONE })).toThrow(/UInt32/);
    });

    it('accepts Expiration at UInt32 max', () => {
      const tx = make({ Expiration: UINT32_MAX });
      expect(tx.Expiration).toBe(UINT32_MAX);
    });

    it('accepts Expiration = 0 (epoch, leaves no expiry gate)', () => {
      const tx = make({ Expiration: 0 });
      expect(tx.Expiration).toBe(0);
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
        (tx as unknown as Record<string, unknown>).Account = 'x';
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides', () => {
      const tx = make();
      const tx2 = tx.with({ URI: SAMPLE_URI });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.URI).toBe(SAMPLE_URI);
      expect(tx.URI).toBeUndefined();
    });

    it('.with() re-validates on overrides', () => {
      const tx = make();
      expect(() => tx.with({ CredentialType: '' })).toThrow(
        /cannot be an empty string/,
      );
      expect(() => tx.with({ Subject: ACCOUNT_ZERO })).toThrow(/ACCOUNT_ZERO/);
      expect(() => tx.with({ URI: 'not-hex!' })).toThrow(/encoded in hex/);
      expect(() => tx.with({ Expiration: -1 })).toThrow(/non-negative/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = credentialCreate({
        Account: ISSUER,
        Subject: SUBJECT,
        CredentialType: SAMPLE_TYPE,
        Expiration: 1735689600,
        URI: SAMPLE_URI,
      });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'CredentialCreate',
        Account: ISSUER,
        Subject: SUBJECT,
        CredentialType: SAMPLE_TYPE,
        Expiration: 1735689600,
        URI: SAMPLE_URI,
      });
    });

    it('.toJSON() skips undefined fields', () => {
      const tx = make();
      const json = tx.toJSON();
      expect('Expiration' in json).toBe(false);
      expect('URI' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
      expect('Flags' in json).toBe(false);
    });

    it('.validate() is a no-op (validation already happened)', () => {
      const tx = make();
      expect(() => tx.validate()).not.toThrow();
    });
  });

  // ─── Base transaction fields ──────────────────────────────────────────────
  // `credentialCreate` now calls `validateBaseTransaction` as a backstop,
  // placed after its own CredentialCreate-specific checks (payment.ts:123 is
  // the reference). Before that call, every REJECT case below built a frozen
  // transaction silently.
  //
  // `CredentialCreateProps` does not yet extend `BasePropsFields`, so the seven
  // shared fields are not on this props type yet — which is why the `as any`
  // casts appear on the ACCEPT cases too, not only the reject ones. That is the
  // type half of the same bug; without the casts these would not compile.
  describe('BaseTransactionFields', () => {
    const base = {
      Account: ISSUER,
      Subject: SUBJECT,
      CredentialType: SAMPLE_TYPE,
    };
    // A valid classic address distinct from ISSUER.
    const DELEGATE = SUBJECT;
    const MEMOS = [{ Memo: { MemoType: '74', MemoData: '6869' } }];
    const TXN_ID = 'AB'.repeat(32);

    it('accepts Memos', () => {
      const tx = credentialCreate({ ...base, Memos: MEMOS } as any);
      expect(tx.toJSON().Memos).toEqual(MEMOS);
    });

    it('rejects a malformed Memos value', () => {
      expect(() =>
        credentialCreate({ ...base, Memos: 'not-an-array' } as any),
      ).toThrow(/invalid Memos/);
    });

    it('accepts SourceTag', () => {
      const tx = credentialCreate({ ...base, SourceTag: 99 } as any);
      expect(tx.toJSON().SourceTag).toBe(99);
    });

    it('rejects a non-numeric SourceTag', () => {
      expect(() =>
        credentialCreate({ ...base, SourceTag: 'NaN' } as any),
      ).toThrow(/SourceTag must be a number/);
    });

    it('accepts LastLedgerSequence', () => {
      const tx = credentialCreate({ ...base, LastLedgerSequence: 1_000_000 } as any);
      expect(tx.toJSON().LastLedgerSequence).toBe(1_000_000);
    });

    it('rejects a non-numeric LastLedgerSequence', () => {
      expect(() =>
        credentialCreate({ ...base, LastLedgerSequence: 'soon' } as any),
      ).toThrow(/LastLedgerSequence must be a number/);
    });

    it('accepts AccountTxnID', () => {
      const tx = credentialCreate({ ...base, AccountTxnID: TXN_ID } as any);
      expect(tx.toJSON().AccountTxnID).toBe(TXN_ID);
    });

    it('rejects a non-string AccountTxnID', () => {
      expect(() =>
        credentialCreate({ ...base, AccountTxnID: 99 } as any),
      ).toThrow(/AccountTxnID must be a string/);
    });

    it('accepts NetworkID', () => {
      const tx = credentialCreate({ ...base, NetworkID: 1 } as any);
      expect(tx.toJSON().NetworkID).toBe(1);
    });

    it('rejects a non-numeric NetworkID', () => {
      expect(() => credentialCreate({ ...base, NetworkID: {} } as any)).toThrow(
        /NetworkID must be a number/,
      );
    });

    it('accepts a Delegate distinct from Account', () => {
      const tx = credentialCreate({ ...base, Delegate: DELEGATE } as any);
      expect(tx.toJSON().Delegate).toBe(DELEGATE);
    });

    it('rejects a Delegate that is not a valid address', () => {
      expect(() =>
        credentialCreate({ ...base, Delegate: 'not-an-address' } as any),
      ).toThrow(/invalid Delegate/);
    });

    it('rejects Delegate equal to Account', () => {
      expect(() => credentialCreate({ ...base, Delegate: ISSUER } as any)).toThrow(
        /cannot be the same/,
      );
    });

    it('accepts TicketSequence alongside Sequence: 0', () => {
      const tx = credentialCreate({
        ...base,
        Sequence: 0,
        TicketSequence: 42,
      } as any);
      expect(tx.toJSON().TicketSequence).toBe(42);
    });

    it('rejects a non-numeric TicketSequence', () => {
      expect(() =>
        credentialCreate({ ...base, TicketSequence: 'nope' } as any),
      ).toThrow(/TicketSequence must be a number/);
    });
  });
});

// Local constants to keep the UInt32 tests readable.
const UINT32_MAX = 0xffffffff;
const UINT32_PLUS_ONE = 0x100000000;
