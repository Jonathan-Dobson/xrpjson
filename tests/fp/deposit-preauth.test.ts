/**
 * Tests for the functional DepositPreauth factory.
 *
 * Mirrors the contract used by the other fp tests — construction-time
 * validation, frozen shape, .with() re-validation, .toJSON() shape,
 * round-trip through xrpl encode/decode. Specific to DepositPreauth,
 * we exhaustively cover:
 *
 *   - Account required + isAccount (classic or X-address)
 *   - Exactly-one-of-four payload XOR (Authorize / Unauthorize /
 *     AuthorizeCredentials / UnauthorizeCredentials)
 *   - Each account field must be a valid XRPL address when present
 *   - Self-preauth (Authorize === Account) rejected (temCANNOT_PREAUTH_SELF)
 *   - Self-unauth (Unauthorize === Account) rejected
 *   - AuthorizeCredentials / UnauthorizeCredentials list shape:
 *       non-empty array, length ≤ 8, no duplicates
 *   - Each credential entry: object form (not string ID), Issuer is
 *     a valid address, CredentialType is non-empty hex ≤ 64 bytes
 */
import { describe, it, expect } from 'vitest';
import { decode, encode } from 'xrpl';
import { depositPreauth } from '../../src/fp/factories/deposit-preauth.js';

const ACCOUNT_A = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const ACCOUNT_B = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
const ISSUER_A = 'ra5nK24KXen9AHvsdFTKHSANinZseWnPcX';
const ISSUER_B = 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH';
const CRED_TYPE_A = '6D795F63726564656E7469616C'; // hex "my_credential"
const CRED_TYPE_B = '6F746865725F63726564656E7469616C'; // hex "other_credential"

function makeCred(args: {
  Issuer?: string;
  CredentialType?: string;
}): { Credential: { Issuer: string; CredentialType: string } } {
  return {
    Credential: {
      Issuer: args.Issuer ?? ISSUER_A,
      CredentialType: args.CredentialType ?? CRED_TYPE_A,
    },
  };
}

describe('fp/depositPreauth()', () => {
  // ─── Happy paths (single-account fields) ────────────────────────

  it('constructs with Authorize', () => {
    const tx = depositPreauth({ Account: ACCOUNT_A, Authorize: ACCOUNT_B });
    expect(tx.TransactionType).toBe('DepositPreauth');
    expect(tx.Account).toBe(ACCOUNT_A);
    expect(tx.Authorize).toBe(ACCOUNT_B);
  });

  it('constructs with Unauthorize', () => {
    const tx = depositPreauth({
      Account: ACCOUNT_A,
      Unauthorize: ACCOUNT_B,
    });
    expect(tx.TransactionType).toBe('DepositPreauth');
    expect(tx.Account).toBe(ACCOUNT_A);
    expect(tx.Unauthorize).toBe(ACCOUNT_B);
  });

  // ─── Happy paths (XLS-70 credential fields) ─────────────────────

  it('constructs with AuthorizeCredentials', () => {
    const tx = depositPreauth({
      Account: ACCOUNT_A,
      AuthorizeCredentials: [makeCred({ Issuer: ISSUER_A })],
    });
    expect(tx.TransactionType).toBe('DepositPreauth');
    expect(tx.AuthorizeCredentials).toHaveLength(1);
  });

  it('constructs with UnauthorizeCredentials', () => {
    const tx = depositPreauth({
      Account: ACCOUNT_A,
      UnauthorizeCredentials: [makeCred({ Issuer: ISSUER_B })],
    });
    expect(tx.TransactionType).toBe('DepositPreauth');
    expect(tx.UnauthorizeCredentials).toHaveLength(1);
  });

  // ─── Frozen shape contract ──────────────────────────────────────

  it('returns a frozen object', () => {
    const tx = depositPreauth({ Account: ACCOUNT_A, Authorize: ACCOUNT_B });
    expect(Object.isFrozen(tx)).toBe(true);
  });

  it('mutation throws in strict mode (frozen at every layer)', () => {
    const tx = depositPreauth({ Account: ACCOUNT_A, Authorize: ACCOUNT_B });
    expect(() => {
      (tx as unknown as { Account: string }).Account = ACCOUNT_B;
    }).toThrow(TypeError);
    expect(tx.Account).toBe(ACCOUNT_A);
  });

  // ─── Account validation ─────────────────────────────────────────

  it('throws at construction on missing Account', () => {
    expect(() =>
      depositPreauth({
        Account: '',
        Authorize: ACCOUNT_B,
      } as unknown as Parameters<typeof depositPreauth>[0]),
    ).toThrow(/Account/);
  });

  it('throws at construction on malformed Account', () => {
    expect(() =>
      depositPreauth({
        Account: 'not-an-address',
        Authorize: ACCOUNT_B,
      }),
    ).toThrow(/Account/);
  });

  it('accepts an X-address for Account', () => {
    const X_ADDR = 'X7Acg9t9WtR2Y4HXUsScrU5KhH4PmgBxX3RcL8soFpPJz8X';
    const tx = depositPreauth({ Account: X_ADDR, Authorize: ACCOUNT_B });
    expect(tx.Account).toBe(X_ADDR);
  });

  // ─── "Exactly one of four" payload XOR (XLS-9d + XLS-70) ────────

  it('throws when no payload is provided', () => {
    expect(() => depositPreauth({ Account: ACCOUNT_A })).toThrow(
      /exactly one of Authorize, Unauthorize, AuthorizeCredentials, or UnauthorizeCredentials/,
    );
  });

  it('throws when both Authorize AND Unauthorize are provided', () => {
    expect(() =>
      depositPreauth({
        Account: ACCOUNT_A,
        Authorize: ACCOUNT_B,
        Unauthorize: ACCOUNT_B,
      }),
    ).toThrow(/exactly one of/);
  });

  it('throws when Authorize AND AuthorizeCredentials are provided', () => {
    expect(() =>
      depositPreauth({
        Account: ACCOUNT_A,
        Authorize: ACCOUNT_B,
        AuthorizeCredentials: [makeCred({})],
      }),
    ).toThrow(/exactly one of/);
  });

  it('throws when both AuthorizeCredentials AND UnauthorizeCredentials are provided', () => {
    expect(() =>
      depositPreauth({
        Account: ACCOUNT_A,
        AuthorizeCredentials: [makeCred({ Issuer: ISSUER_A })],
        UnauthorizeCredentials: [makeCred({ Issuer: ISSUER_B })],
      }),
    ).toThrow(/exactly one of/);
  });

  // ─── Authorize / Unauthorize format ─────────────────────────────

  it('throws on malformed Authorize', () => {
    expect(() =>
      depositPreauth({ Account: ACCOUNT_A, Authorize: 'not-an-address' }),
    ).toThrow(/Authorize must be a valid XRPL address/);
  });

  it('throws on malformed Unauthorize', () => {
    expect(() =>
      depositPreauth({ Account: ACCOUNT_A, Unauthorize: 'not-an-address' }),
    ).toThrow(/Unauthorize must be a valid XRPL address/);
  });

  // ─── temCANNOT_PREAUTH_SELF guards (xrpl.js) ─────────────────────

  it('throws when Authorize === Account (temCANNOT_PREAUTH_SELF)', () => {
    expect(() =>
      depositPreauth({ Account: ACCOUNT_A, Authorize: ACCOUNT_A }),
    ).toThrow(/cannot preauthorize itself/);
  });

  it('throws when Unauthorize === Account (temCANNOT_PREAUTH_SELF)', () => {
    expect(() =>
      depositPreauth({ Account: ACCOUNT_A, Unauthorize: ACCOUNT_A }),
    ).toThrow(/cannot unauthorize itself/);
  });

  // ─── AuthorizeCredentials list validation ──────────────────────

  it('throws when AuthorizeCredentials is empty', () => {
    expect(() =>
      depositPreauth({
        Account: ACCOUNT_A,
        AuthorizeCredentials: [],
      }),
    ).toThrow(/AuthorizeCredentials cannot be an empty array/);
  });

  it('throws when AuthorizeCredentials is not an array', () => {
    expect(() =>
      depositPreauth({
        Account: ACCOUNT_A,
        AuthorizeCredentials: 'not-an-array' as unknown as ReturnType<typeof makeCred>[],
      }),
    ).toThrow(/AuthorizeCredentials must be an array/);
  });

  it('throws when AuthorizeCredentials exceeds 8 entries', () => {
    const nine = Array.from({ length: 9 }, (_, i) =>
      makeCred({ CredentialType: `00${i.toString(16).padStart(2, '0')}` }),
    );
    expect(() =>
      depositPreauth({
        Account: ACCOUNT_A,
        AuthorizeCredentials: nine,
      }),
    ).toThrow(/cannot exceed 8 elements/);
  });

  it('throws when AuthorizeCredentials contains a duplicate', () => {
    expect(() =>
      depositPreauth({
        Account: ACCOUNT_A,
        AuthorizeCredentials: [
          makeCred({ Issuer: ISSUER_A, CredentialType: CRED_TYPE_A }),
          makeCred({ Issuer: ISSUER_A, CredentialType: CRED_TYPE_A }),
        ],
      }),
    ).toThrow(/duplicate elements/);
  });

  // ─── Per-credential validation ──────────────────────────────────

  it('throws on malformed credential entry (wrong shape)', () => {
    expect(() =>
      depositPreauth({
        Account: ACCOUNT_A,
        AuthorizeCredentials: [
          { Credential: { Issuer: ISSUER_A } } as unknown as ReturnType<
            typeof makeCred
          >,
        ],
      }),
    ).toThrow(/not a valid AuthorizeCredential/);
  });

  it('throws when credential Issuer is not a valid XRPL address', () => {
    expect(() =>
      depositPreauth({
        Account: ACCOUNT_A,
        AuthorizeCredentials: [
          makeCred({ Issuer: 'not-an-address' }),
        ],
      }),
    ).toThrow(/Issuer must be a valid XRPL address/);
  });

  it('throws when CredentialType is not valid hex', () => {
    expect(() =>
      depositPreauth({
        Account: ACCOUNT_A,
        AuthorizeCredentials: [
          makeCred({ CredentialType: 'not-hex' }),
        ],
      }),
    ).toThrow(/CredentialType must be a hex string/);
  });

  it('throws when CredentialType is empty', () => {
    expect(() =>
      depositPreauth({
        Account: ACCOUNT_A,
        AuthorizeCredentials: [
          makeCred({ CredentialType: '' }),
        ],
      }),
    ).toThrow(/CredentialType must not be empty/);
  });

  it('throws when CredentialType exceeds 64 bytes', () => {
    const tooLong = 'AB'.repeat(65); // 65 bytes (130 hex chars)
    expect(() =>
      depositPreauth({
        Account: ACCOUNT_A,
        AuthorizeCredentials: [
          makeCred({ CredentialType: tooLong }),
        ],
      }),
    ).toThrow(/exceeds 64 bytes/);
  });

  it('accepts the maximum 8 distinct credentials', () => {
    const eight = Array.from({ length: 8 }, (_, i) =>
      makeCred({ CredentialType: `00${i.toString(16).padStart(2, '0')}` }),
    );
    const tx = depositPreauth({
      Account: ACCOUNT_A,
      AuthorizeCredentials: eight,
    });
    expect(tx.AuthorizeCredentials).toHaveLength(8);
  });

  // ─── UnauthorizeCredentials mirrors AuthorizeCredentials ────────

  it('throws when UnauthorizeCredentials is empty', () => {
    expect(() =>
      depositPreauth({
        Account: ACCOUNT_A,
        UnauthorizeCredentials: [],
      }),
    ).toThrow(/UnauthorizeCredentials cannot be an empty array/);
  });

  it('throws on duplicate UnauthorizeCredentials', () => {
    expect(() =>
      depositPreauth({
        Account: ACCOUNT_A,
        UnauthorizeCredentials: [
          makeCred({ Issuer: ISSUER_A, CredentialType: CRED_TYPE_A }),
          makeCred({ Issuer: ISSUER_A, CredentialType: CRED_TYPE_A }),
        ],
      }),
    ).toThrow(/duplicate elements/);
  });

  // ─── .with() — re-validates ─────────────────────────────────────

  it('.with() returns a new frozen tx with overrides applied', () => {
    const tx = depositPreauth({
      Account: ACCOUNT_A,
      Authorize: ACCOUNT_B,
    });
    const tx2 = tx.with({ Fee: '12', Sequence: 42 });
    expect(tx2).not.toBe(tx);
    expect(Object.isFrozen(tx2)).toBe(true);
    expect(tx2.Fee).toBe('12');
    expect(tx2.Sequence).toBe(42);
    expect(tx2.Account).toBe(ACCOUNT_A);
    expect(tx.Fee).toBeUndefined();
  });

  it('.with() re-validates "exactly one of four" on override', () => {
    const tx = depositPreauth({
      Account: ACCOUNT_A,
      Authorize: ACCOUNT_B,
    });
    expect(() =>
      tx.with({
        Authorize: ACCOUNT_B,
        Unauthorize: ACCOUNT_B,
      }),
    ).toThrow(/exactly one of/);
  });

  it('.with() re-validates self-preauth on override', () => {
    const tx = depositPreauth({
      Account: ACCOUNT_A,
      Authorize: ACCOUNT_B,
    });
    expect(() => tx.with({ Authorize: ACCOUNT_A })).toThrow(
      /cannot preauthorize itself/,
    );
  });

  it('.with() re-validates credential list on override', () => {
    const tx = depositPreauth({
      Account: ACCOUNT_A,
      Authorize: ACCOUNT_B,
    });
    expect(() =>
      tx.with({
        Authorize: undefined as unknown as string,
        AuthorizeCredentials: [], // empty array
      }),
    ).toThrow(/AuthorizeCredentials cannot be an empty array/);
  });

  // ─── .toJSON() ──────────────────────────────────────────────────

  it('.toJSON() produces a plain object matching xrpl.js shape', () => {
    const tx = depositPreauth({
      Account: ACCOUNT_A,
      Authorize: ACCOUNT_B,
      Fee: '12',
      Sequence: 42,
    });
    expect(tx.toJSON()).toEqual({
      TransactionType: 'DepositPreauth',
      Account: ACCOUNT_A,
      Authorize: ACCOUNT_B,
      Fee: '12',
      Sequence: 42,
    });
  });

  it('.toJSON() skips methods and undefined fields', () => {
    const tx = depositPreauth({
      Account: ACCOUNT_A,
      Authorize: ACCOUNT_B,
    });
    const json = tx.toJSON();
    expect(json).not.toHaveProperty('validate');
    expect(json).not.toHaveProperty('toJSON');
    expect(json).not.toHaveProperty('with');
    expect(json).not.toHaveProperty('Unauthorize');
    expect(json).not.toHaveProperty('AuthorizeCredentials');
    expect(json).not.toHaveProperty('UnauthorizeCredentials');
    expect(json).not.toHaveProperty('Flags');
    expect(json).not.toHaveProperty('Fee');
  });

  it('.validate() is a no-op (validation already happened)', () => {
    const tx = depositPreauth({
      Account: ACCOUNT_A,
      Authorize: ACCOUNT_B,
    });
    expect(() => tx.validate()).not.toThrow();
  });

  // ─── Wire round-trip ────────────────────────────────────────────

  it('round-trips through xrpl encode/decode (Authorize)', () => {
    const tx = depositPreauth({
      Account: ACCOUNT_A,
      Authorize: ACCOUNT_B,
      Fee: '10',
    });
    const encoded = encode(tx.toJSON() as unknown as Parameters<typeof encode>[0]);
    expect(encoded).toBeDefined();
    const decoded = decode(encoded);
    expect(decoded.TransactionType).toBe('DepositPreauth');
    expect((decoded as { Account: string }).Account).toBe(ACCOUNT_A);
    expect((decoded as { Authorize: string }).Authorize).toBe(ACCOUNT_B);
  });

  it('round-trips through xrpl encode/decode (AuthorizeCredentials)', () => {
    const tx = depositPreauth({
      Account: ACCOUNT_A,
      AuthorizeCredentials: [
        makeCred({ Issuer: ISSUER_A, CredentialType: CRED_TYPE_A }),
        makeCred({ Issuer: ISSUER_B, CredentialType: CRED_TYPE_B }),
      ],
      Fee: '10',
    });
    const encoded = encode(tx.toJSON() as unknown as Parameters<typeof encode>[0]);
    const decoded = decode(encoded);
    expect(decoded.TransactionType).toBe('DepositPreauth');
    const d = decoded as {
      Account: string;
      AuthorizeCredentials: Array<{
        Credential: { Issuer: string; CredentialType: string };
      }>;
    };
    expect(d.Account).toBe(ACCOUNT_A);
    expect(d.AuthorizeCredentials).toHaveLength(2);
    expect(d.AuthorizeCredentials[0]?.Credential.Issuer).toBe(ISSUER_A);
    expect(d.AuthorizeCredentials[0]?.Credential.CredentialType).toBe(
      CRED_TYPE_A,
    );
    expect(d.AuthorizeCredentials[1]?.Credential.Issuer).toBe(ISSUER_B);
    expect(d.AuthorizeCredentials[1]?.Credential.CredentialType).toBe(
      CRED_TYPE_B,
    );
  });
});
