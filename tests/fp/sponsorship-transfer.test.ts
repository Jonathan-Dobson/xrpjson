/**
 * Tests for the functional SponsorshipTransfer factory.
 *
 * Validates:
 *   1. Construction for each of the three documented scenarios (End,
 *      Create, Reassign), including object-level and account-level forms.
 *   2. Mode-flag dispatch — exactly one of the three scenario bits must
 *      be set, in both numeric and boolean-map `Flags` forms.
 *   3. Mode-specific required / forbidden fields (Sponsor, SponsorFlags,
 *      Sponsee, SponsorSignature).
 *   4. Sponsor and Sponsee identity checks (must not equal Account, must
 *      be a valid XRPL address).
 *   5. SponsorFlags bit semantics (spfSponsorReserve required, no other
 *      bits allowed).
 *   6. SponsorSignature shape (single-sign fields vs Signers array,
 *      mutual exclusion, non-empty).
 *   7. ObjectID format guard (64-char hex) — the canonical HASH256 form
 *      that the class API skips.
 *   8. Frozen-shape contract (mutation throws, .with() returns a new
 *      frozen tx, .toJSON() strips methods and undefined fields).
 */
import { describe, it, expect } from 'vitest';
import { sponsorshipTransfer } from '../../src/fp/factories/sponsorship-transfer.js';
import { SponsorshipTransferFlags } from '../../src/types/flags.js';

const SPONSEE_ACCOUNT = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const SPONSOR_ACCOUNT = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
const DIFFERENT_ACCOUNT = 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH';
// 64-char hex HASH256 — a non-zero ledger entry ID.
const OBJECT_ID =
  '1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF';

function makeCreateObjectLevel(
  extras: Record<string, unknown> = {},
) {
  return sponsorshipTransfer({
    Account: SPONSEE_ACCOUNT,
    Flags: SponsorshipTransferFlags.tfSponsorshipCreate,
    ObjectID: OBJECT_ID,
    Sponsor: SPONSOR_ACCOUNT,
    SponsorFlags: 0x00000002,
    ...extras,
  });
}

describe('fp/sponsorshipTransfer()', () => {
  describe('construction', () => {
    it('constructs an object-level Create tx (canonical xrpl.org example shape)', () => {
      const tx = makeCreateObjectLevel();
      expect(tx.TransactionType).toBe('SponsorshipTransfer');
      expect(tx.Account).toBe(SPONSEE_ACCOUNT);
      expect(tx.Flags).toBe(SponsorshipTransferFlags.tfSponsorshipCreate);
      expect(tx.ObjectID).toBe(OBJECT_ID);
      expect(tx.Sponsor).toBe(SPONSOR_ACCOUNT);
      expect(tx.SponsorFlags).toBe(0x00000002);
      expect(tx.Sponsee).toBeUndefined();
      expect(tx.SponsorSignature).toBeUndefined();
    });

    it('constructs an account-level Create tx (no ObjectID, SponsorSignature required)', () => {
      const tx = sponsorshipTransfer({
        Account: SPONSEE_ACCOUNT,
        Flags: SponsorshipTransferFlags.tfSponsorshipCreate,
        Sponsor: SPONSOR_ACCOUNT,
        SponsorFlags: 0x00000002,
        SponsorSignature: {
          SigningPubKey: 'ED' + 'A'.repeat(71),
          TxnSignature: 'C0FFEE',
        },
      });
      expect(tx.ObjectID).toBeUndefined();
      expect(tx.SponsorSignature).toEqual({
        SigningPubKey: 'ED' + 'A'.repeat(71),
        TxnSignature: 'C0FFEE',
      });
    });

    it('constructs a Reassign tx', () => {
      const tx = sponsorshipTransfer({
        Account: SPONSEE_ACCOUNT,
        Flags: SponsorshipTransferFlags.tfSponsorshipReassign,
        ObjectID: OBJECT_ID,
        Sponsor: SPONSOR_ACCOUNT,
        SponsorFlags: 0x00000002,
      });
      expect(tx.Flags).toBe(SponsorshipTransferFlags.tfSponsorshipReassign);
    });

    it('constructs an End tx (sponsee ends on its own behalf)', () => {
      const tx = sponsorshipTransfer({
        Account: SPONSEE_ACCOUNT,
        Flags: SponsorshipTransferFlags.tfSponsorshipEnd,
        ObjectID: OBJECT_ID,
      });
      expect(tx.Flags).toBe(SponsorshipTransferFlags.tfSponsorshipEnd);
      expect(tx.Sponsor).toBeUndefined();
      expect(tx.SponsorFlags).toBeUndefined();
      expect(tx.Sponsee).toBeUndefined();
    });

    it('constructs an End tx (sponsor ends on behalf of a sponsee)', () => {
      const tx = sponsorshipTransfer({
        Account: SPONSOR_ACCOUNT,
        Flags: SponsorshipTransferFlags.tfSponsorshipEnd,
        ObjectID: OBJECT_ID,
        Sponsee: SPONSEE_ACCOUNT,
      });
      expect(tx.Sponsee).toBe(SPONSEE_ACCOUNT);
    });

    it('passes through Fee/Sequence', () => {
      const tx = makeCreateObjectLevel({ Fee: '12', Sequence: 43 });
      expect(tx.Fee).toBe('12');
      expect(tx.Sequence).toBe(43);
    });

    it('accepts boolean-map Flags form', () => {
      const tx = sponsorshipTransfer({
        Account: SPONSEE_ACCOUNT,
        Flags: { tfSponsorshipCreate: true },
        ObjectID: OBJECT_ID,
        Sponsor: SPONSOR_ACCOUNT,
        SponsorFlags: 0x00000002,
      });
      // The factory preserves the input form (boolean-map → boolean-map).
      expect(tx.Flags).toEqual({ tfSponsorshipCreate: true });
    });
  });

  describe('Account validation', () => {
    it('throws on missing Account', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: '' as never,
          Flags: SponsorshipTransferFlags.tfSponsorshipEnd,
          ObjectID: OBJECT_ID,
        }),
      ).toThrow(/Account/);
    });

    it('throws on invalid Account address', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: 'not-an-address',
          Flags: SponsorshipTransferFlags.tfSponsorshipEnd,
          ObjectID: OBJECT_ID,
        }),
      ).toThrow(/Account/);
    });
  });

  describe('mode-flag dispatch', () => {
    it('throws when no scenario flag is set', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: SPONSEE_ACCOUNT,
          ObjectID: OBJECT_ID,
        }),
      ).toThrow(/scenario flag/);
    });

    it('throws when Flags is zero', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: SPONSEE_ACCOUNT,
          Flags: 0,
          ObjectID: OBJECT_ID,
        }),
      ).toThrow(/scenario flag/);
    });

    it('throws when more than one scenario flag is set', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: SPONSEE_ACCOUNT,
          Flags:
            SponsorshipTransferFlags.tfSponsorshipCreate |
            SponsorshipTransferFlags.tfSponsorshipEnd,
          ObjectID: OBJECT_ID,
          Sponsor: SPONSOR_ACCOUNT,
          SponsorFlags: 0x00000002,
        }),
      ).toThrow(/mutually exclusive/);
    });

    it('throws when boolean-map Flags sets more than one scenario', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: SPONSEE_ACCOUNT,
          Flags: {
            tfSponsorshipEnd: true,
            tfSponsorshipCreate: true,
          },
          ObjectID: OBJECT_ID,
          Sponsor: SPONSOR_ACCOUNT,
          SponsorFlags: 0x00000002,
        }),
      ).toThrow(/mutually exclusive/);
    });
  });

  describe('ObjectID validation', () => {
    it('throws on non-hex ObjectID', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: SPONSEE_ACCOUNT,
          Flags: SponsorshipTransferFlags.tfSponsorshipEnd,
          ObjectID: 'Z'.repeat(64),
        }),
      ).toThrow(/ObjectID/);
    });

    it('throws on ObjectID of wrong length', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: SPONSEE_ACCOUNT,
          Flags: SponsorshipTransferFlags.tfSponsorshipEnd,
          ObjectID: 'AB',
        }),
      ).toThrow(/ObjectID/);
    });

    it('throws on non-string ObjectID', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: SPONSEE_ACCOUNT,
          Flags: SponsorshipTransferFlags.tfSponsorshipEnd,
          ObjectID: 12345 as never,
        }),
      ).toThrow(/ObjectID/);
    });

    it('accepts ObjectID omitted (account-level scenario)', () => {
      const tx = sponsorshipTransfer({
        Account: SPONSEE_ACCOUNT,
        Flags: SponsorshipTransferFlags.tfSponsorshipCreate,
        Sponsor: SPONSOR_ACCOUNT,
        SponsorFlags: 0x00000002,
        SponsorSignature: {
          SigningPubKey: 'ED' + 'A'.repeat(71),
          TxnSignature: 'SIG',
        },
      });
      expect(tx.ObjectID).toBeUndefined();
    });
  });

  describe('End-mode field constraints', () => {
    it('throws if Sponsor is present for End', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: SPONSEE_ACCOUNT,
          Flags: SponsorshipTransferFlags.tfSponsorshipEnd,
          ObjectID: OBJECT_ID,
          Sponsor: SPONSOR_ACCOUNT,
        }),
      ).toThrow(/tfSponsorshipEnd/);
    });

    it('throws if SponsorFlags is present for End', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: SPONSEE_ACCOUNT,
          Flags: SponsorshipTransferFlags.tfSponsorshipEnd,
          ObjectID: OBJECT_ID,
          SponsorFlags: 0x00000002,
        }),
      ).toThrow(/tfSponsorshipEnd/);
    });

    it('throws if Sponsee equals Account', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: SPONSEE_ACCOUNT,
          Flags: SponsorshipTransferFlags.tfSponsorshipEnd,
          ObjectID: OBJECT_ID,
          Sponsee: SPONSEE_ACCOUNT,
        }),
      ).toThrow(/Sponsee/);
    });

    it('throws on invalid Sponsee address', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: SPONSOR_ACCOUNT,
          Flags: SponsorshipTransferFlags.tfSponsorshipEnd,
          ObjectID: OBJECT_ID,
          Sponsee: 'not-an-address',
        }),
      ).toThrow(/Sponsee/);
    });

    it('accepts a valid Sponsee different from Account', () => {
      const tx = sponsorshipTransfer({
        Account: SPONSOR_ACCOUNT,
        Flags: SponsorshipTransferFlags.tfSponsorshipEnd,
        ObjectID: OBJECT_ID,
        Sponsee: SPONSEE_ACCOUNT,
      });
      expect(tx.Sponsee).toBe(SPONSEE_ACCOUNT);
    });
  });

  describe('Create / Reassign-mode field constraints', () => {
    it('throws if Sponsor is missing for Create', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: SPONSEE_ACCOUNT,
          Flags: SponsorshipTransferFlags.tfSponsorshipCreate,
          ObjectID: OBJECT_ID,
          SponsorFlags: 0x00000002,
        }),
      ).toThrow(/Sponsor field is required/);
    });

    it('throws if Sponsor is missing for Reassign', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: SPONSEE_ACCOUNT,
          Flags: SponsorshipTransferFlags.tfSponsorshipReassign,
          ObjectID: OBJECT_ID,
          SponsorFlags: 0x00000002,
        }),
      ).toThrow(/Sponsor field is required/);
    });

    it('throws if Sponsor equals Account', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: SPONSEE_ACCOUNT,
          Flags: SponsorshipTransferFlags.tfSponsorshipCreate,
          ObjectID: OBJECT_ID,
          Sponsor: SPONSEE_ACCOUNT,
          SponsorFlags: 0x00000002,
        }),
      ).toThrow(/same/);
    });

    it('throws on invalid Sponsor address', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: SPONSEE_ACCOUNT,
          Flags: SponsorshipTransferFlags.tfSponsorshipCreate,
          ObjectID: OBJECT_ID,
          Sponsor: 'not-an-address',
          SponsorFlags: 0x00000002,
        }),
      ).toThrow(/Sponsor/);
    });

    it('throws if Sponsee is present for Create', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: SPONSEE_ACCOUNT,
          Flags: SponsorshipTransferFlags.tfSponsorshipCreate,
          ObjectID: OBJECT_ID,
          Sponsor: SPONSOR_ACCOUNT,
          SponsorFlags: 0x00000002,
          Sponsee: DIFFERENT_ACCOUNT,
        }),
      ).toThrow(/Sponsee field must not be present/);
    });

    it('throws if SponsorFlags is missing for Create', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: SPONSEE_ACCOUNT,
          Flags: SponsorshipTransferFlags.tfSponsorshipCreate,
          ObjectID: OBJECT_ID,
          Sponsor: SPONSOR_ACCOUNT,
        }),
      ).toThrow(/SponsorFlags is required/);
    });

    it('throws if SponsorFlags omits the spfSponsorReserve bit', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: SPONSEE_ACCOUNT,
          Flags: SponsorshipTransferFlags.tfSponsorshipCreate,
          ObjectID: OBJECT_ID,
          Sponsor: SPONSOR_ACCOUNT,
          SponsorFlags: 0x00000001, // spfSponsorFee — wrong bit
        }),
      ).toThrow(/spfSponsorReserve/);
    });

    it('throws if SponsorFlags sets any bit beyond spfSponsorReserve', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: SPONSEE_ACCOUNT,
          Flags: SponsorshipTransferFlags.tfSponsorshipCreate,
          ObjectID: OBJECT_ID,
          Sponsor: SPONSOR_ACCOUNT,
          SponsorFlags: 0x00000006, // spfSponsorReserve | 0x04 (bogus)
        }),
      ).toThrow(/only set the spfSponsorReserve bit/);
    });

    it('throws if SponsorFlags is not a number', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: SPONSEE_ACCOUNT,
          Flags: SponsorshipTransferFlags.tfSponsorshipCreate,
          ObjectID: OBJECT_ID,
          Sponsor: SPONSOR_ACCOUNT,
          SponsorFlags: 'two' as never,
        }),
      ).toThrow(/SponsorFlags/);
    });

    it('requires SponsorSignature when ObjectID is omitted for Create', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: SPONSEE_ACCOUNT,
          Flags: SponsorshipTransferFlags.tfSponsorshipCreate,
          Sponsor: SPONSOR_ACCOUNT,
          SponsorFlags: 0x00000002,
        }),
      ).toThrow(/SponsorSignature is required/);
    });

    it('requires SponsorSignature when ObjectID is omitted for Reassign', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: SPONSEE_ACCOUNT,
          Flags: SponsorshipTransferFlags.tfSponsorshipReassign,
          Sponsor: SPONSOR_ACCOUNT,
          SponsorFlags: 0x00000002,
        }),
      ).toThrow(/SponsorSignature is required/);
    });

    it('accepts a Reassign tx with SponsorSignature absent when ObjectID is present', () => {
      const tx = sponsorshipTransfer({
        Account: SPONSEE_ACCOUNT,
        Flags: SponsorshipTransferFlags.tfSponsorshipReassign,
        ObjectID: OBJECT_ID,
        Sponsor: SPONSOR_ACCOUNT,
        SponsorFlags: 0x00000002,
      });
      expect(tx.SponsorSignature).toBeUndefined();
    });
  });

  describe('SponsorSignature shape', () => {
    it('throws when SponsorSignature combines single-sign and multi-sign', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: SPONSEE_ACCOUNT,
          Flags: SponsorshipTransferFlags.tfSponsorshipCreate,
          Sponsor: SPONSOR_ACCOUNT,
          SponsorFlags: 0x00000002,
          SponsorSignature: {
            SigningPubKey: 'ED' + 'A'.repeat(71),
            TxnSignature: 'SIG',
            Signers: [
              {
                Signer: {
                  Account: DIFFERENT_ACCOUNT,
                  TxnSignature: 'SIG',
                  SigningPubKey: 'ED' + 'B'.repeat(71),
                },
              },
            ],
          },
        }),
      ).toThrow(/must not combine/);
    });

    it('throws when SponsorSignature has neither single-sign nor multi-sign fields', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: SPONSEE_ACCOUNT,
          Flags: SponsorshipTransferFlags.tfSponsorshipCreate,
          Sponsor: SPONSOR_ACCOUNT,
          SponsorFlags: 0x00000002,
          SponsorSignature: {} as never,
        }),
      ).toThrow(/either single-sign fields or Signers/);
    });

    it('throws when SponsorSignature.Signers is empty', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: SPONSEE_ACCOUNT,
          Flags: SponsorshipTransferFlags.tfSponsorshipCreate,
          Sponsor: SPONSOR_ACCOUNT,
          SponsorFlags: 0x00000002,
          SponsorSignature: { Signers: [] } as never,
        }),
      ).toThrow(/non-empty array/);
    });

    it('throws when single-sign SigningPubKey is missing', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: SPONSEE_ACCOUNT,
          Flags: SponsorshipTransferFlags.tfSponsorshipCreate,
          Sponsor: SPONSOR_ACCOUNT,
          SponsorFlags: 0x00000002,
          SponsorSignature: {
            TxnSignature: 'SIG',
          } as never,
        }),
      ).toThrow(/SigningPubKey/);
    });

    it('throws when single-sign TxnSignature is missing', () => {
      expect(() =>
        sponsorshipTransfer({
          Account: SPONSEE_ACCOUNT,
          Flags: SponsorshipTransferFlags.tfSponsorshipCreate,
          Sponsor: SPONSOR_ACCOUNT,
          SponsorFlags: 0x00000002,
          SponsorSignature: {
            SigningPubKey: 'ED' + 'A'.repeat(71),
          } as never,
        }),
      ).toThrow(/TxnSignature/);
    });

    it('accepts a valid multi-sign SponsorSignature', () => {
      const tx = sponsorshipTransfer({
        Account: SPONSEE_ACCOUNT,
        Flags: SponsorshipTransferFlags.tfSponsorshipCreate,
        Sponsor: SPONSOR_ACCOUNT,
        SponsorFlags: 0x00000002,
        SponsorSignature: {
          Signers: [
            {
              Signer: {
                Account: DIFFERENT_ACCOUNT,
                TxnSignature: 'SIG1',
                SigningPubKey: 'ED' + 'A'.repeat(71),
              },
            },
          ],
        },
      });
      expect(tx.SponsorSignature).toEqual({
        Signers: [
          {
            Signer: {
              Account: DIFFERENT_ACCOUNT,
              TxnSignature: 'SIG1',
              SigningPubKey: 'ED' + 'A'.repeat(71),
            },
          },
        ],
      });
    });
  });

  describe('frozen-shape contract', () => {
    it('returns a frozen object', () => {
      const tx = makeCreateObjectLevel();
      expect(Object.isFrozen(tx)).toBe(true);
    });

    it('mutation throws in strict mode', () => {
      const tx = makeCreateObjectLevel();
      expect(() => {
        (tx as unknown as Record<string, unknown>).Sponsor = 'rX';
      }).toThrow(TypeError);
    });

    it('.with() returns a new frozen tx with overrides applied', () => {
      const tx = makeCreateObjectLevel();
      // Override the Sponsor field to undefined so we can change modes
      // (End forbids Sponsor / SponsorFlags).
      const tx2 = tx.with({
        Flags: SponsorshipTransferFlags.tfSponsorshipEnd,
        Sponsor: undefined,
        SponsorFlags: undefined,
      });
      expect(tx2).not.toBe(tx);
      expect(Object.isFrozen(tx2)).toBe(true);
      expect(tx2.Flags).toBe(SponsorshipTransferFlags.tfSponsorshipEnd);
      expect(tx2.Sponsor).toBeUndefined();
      expect(tx2.SponsorFlags).toBeUndefined();
      expect(tx2.ObjectID).toBe(OBJECT_ID);
    });

    it('.with() re-validates on overrides', () => {
      const tx = sponsorshipTransfer({
        Account: SPONSEE_ACCOUNT,
        Flags: SponsorshipTransferFlags.tfSponsorshipEnd,
        ObjectID: OBJECT_ID,
      });
      // Switching to Create without supplying Sponsor / SponsorFlags
      // must re-trigger the required-field errors.
      expect(() =>
        tx.with({ Flags: SponsorshipTransferFlags.tfSponsorshipCreate }),
      ).toThrow(/Sponsor field is required/);
    });

    it('.toJSON() produces a plain object with TransactionType + provided fields', () => {
      const tx = makeCreateObjectLevel({ Fee: '12', Sequence: 43 });
      const json = tx.toJSON();
      expect(json).toEqual({
        TransactionType: 'SponsorshipTransfer',
        Account: SPONSEE_ACCOUNT,
        Flags: SponsorshipTransferFlags.tfSponsorshipCreate,
        ObjectID: OBJECT_ID,
        Sponsor: SPONSOR_ACCOUNT,
        SponsorFlags: 0x00000002,
        Fee: '12',
        Sequence: 43,
      });
    });

    it('.toJSON() skips undefined fields and methods', () => {
      const tx = makeCreateObjectLevel();
      const json = tx.toJSON();
      expect('validate' in json).toBe(false);
      expect('toJSON' in json).toBe(false);
      expect('with' in json).toBe(false);
      expect('Sponsee' in json).toBe(false);
      expect('SponsorSignature' in json).toBe(false);
      expect('Fee' in json).toBe(false);
      expect('Sequence' in json).toBe(false);
    });

    it('.validate() is a no-op after construction', () => {
      const tx = makeCreateObjectLevel();
      expect(() => tx.validate()).not.toThrow();
    });
  });
});
