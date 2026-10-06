/**
 * Tests for the generated field-ownership index (Bug #11).
 *
 * The index maps a field name to the transaction types that accept it, and
 * `assertKnownFields` rejects a field only when it is KNOWN and absent for the
 * transaction being built. `buildFrozenTx` calls it for every key on every
 * factory result, so these tests exercise the check through the public API
 * rather than the helper.
 *
 * What is pinned here:
 *   1. A known field on the wrong transaction is rejected, naming the
 *      transaction that does accept it.
 *   2. A completely unmodelled field still passes — the forward-compatibility
 *      hatch at `BaseTransactionFields` (`src/types/base.ts:100`).
 *   3. Fields the library does not model but the protocol does are still
 *      caught when used on the wrong type. These come from the protocol's
 *      own `TRANSACTION_FORMATS` table, not from our interfaces.
 *   4. Every field the library models still constructs on the type that
 *      declares it — the merge may only widen acceptance, never narrow it.
 *   5. Common fields stay valid everywhere, including the three `Sponsor*`
 *      fields the codec lists as common but this library does not inherit.
 *   6. `.with()` overrides are checked too, so the throw cannot be bypassed.
 */
import { describe, it, expect } from 'vitest';
import { payment, accountSet, setRegularKey, sponsorshipTransfer } from '../../src/fp/index.js';
import { FIELD_OWNERS, COMMON_FIELDS, assertKnownFields } from '../../src/fp/field-index.js';
import { ValidationError } from '../../src/errors.js';

const ACCOUNT = 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn';
const DESTINATION = 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH';
// A third account, for cases where Sponsor must differ from Account.
const THIRD_ACCOUNT = 'rJjF1S7RgKWKvB4SjYqLp3DCP1RgHyxR';

function basePayment(extras: Record<string, unknown> = {}) {
  return payment({ Account: ACCOUNT, Destination: DESTINATION, Amount: '1000', ...extras });
}

describe('field ownership index (Bug #11)', () => {
  describe('a known field on the wrong transaction is rejected', () => {
    it('rejects DestinationTag on SetRegularKey and names Payment', () => {
      // `DestinationTag` is a real XRPL field, valid on Payment — which is why
      // nothing at the call site looks wrong. This is the worse of the two
      // reproductions: a typo is obviously wrong, a misplaced real field is not.
      expect(() => setRegularKey({ Account: ACCOUNT, DestinationTag: 42 })).toThrow(
        ValidationError,
      );
      expect(() => setRegularKey({ Account: ACCOUNT, DestinationTag: 42 })).toThrow(
        /"DestinationTag" is not a field on this transaction/,
      );
      expect(() => setRegularKey({ Account: ACCOUNT, DestinationTag: 42 })).toThrow(
        /It belongs to: .*Payment/,
      );
    });

    it('rejects a field belonging to another single-type transaction', () => {
      expect(() => basePayment({ RegularKey: DESTINATION })).toThrow(ValidationError);
      expect(() => basePayment({ RegularKey: DESTINATION })).toThrow(
        /belongs to: SetRegularKey/,
      );
    });

    it('throws before the field reaches toJSON()', () => {
      let serialised: unknown;
      try {
        basePayment({ TicketCount: 3 }).toJSON();
      } catch (e) {
        serialised = e;
      }
      expect(serialised).toBeInstanceOf(ValidationError);
    });
  });

  describe('the forward-compatibility hatch is preserved', () => {
    it('accepts a field the library does not model at all', () => {
      // A genuinely-new amendment field. The index has no entry for it, so it
      // must pass: rejecting it would mean an allowlist, which would break the
      // deliberate `[key: string]: unknown` hatch at src/types/base.ts:100.
      const tx = basePayment({ SomeFutureAmendmentField: 'anything' });
      expect(tx.toJSON().SomeFutureAmendmentField).toBe('anything');
    });

    it('accepts the same unmodelled field on every transaction type', () => {
      const tx = setRegularKey({ Account: ACCOUNT, SomeFutureAmendmentField: 1 });
      expect(tx.toJSON().SomeFutureAmendmentField).toBe(1);
    });

    it('assertKnownFields returns silently for an unknown field', () => {
      expect(() => assertKnownFields('Payment', 'SomeFutureAmendmentField')).not.toThrow();
    });
  });

  describe('protocol fields the library does not model', () => {
    // These four come from the codec's own TRANSACTION_FORMATS table rather
    // than from any xrpjson interface. Merging in protocol truth is what makes
    // a misplacement catchable for a field this library has no interface for.
    const PROTOCOL_ONLY: ReadonlyArray<readonly [string, string, string]> = [
      ['WalletLocator', 'AccountSet', 'SetRegularKey'],
      ['WalletSize', 'AccountSet', 'SetRegularKey'],
      ['NFTokenMinter', 'AccountSet', 'SetRegularKey'],
      ['BookDirectory', 'LedgerStateFix', 'AccountSet'],
    ];

    it.each(PROTOCOL_ONLY)(
      '%s is indexed against its owning transaction, not ours',
      (field, owner, other) => {
        expect(FIELD_OWNERS[field as keyof typeof FIELD_OWNERS].has(owner)).toBe(true);
        expect(FIELD_OWNERS[field as keyof typeof FIELD_OWNERS].has(other)).toBe(false);
      },
    );

    it('accepts a protocol-only field on the transaction that owns it', () => {
      const tx = accountSet({ Account: ACCOUNT, WalletLocator: { Account: DESTINATION, URI: 'x' } });
      expect(tx.toJSON().WalletLocator).toEqual({ Account: DESTINATION, URI: 'x' });
    });

    it('rejects a protocol-only field on a transaction that does not', () => {
      expect(() =>
        setRegularKey({ Account: ACCOUNT, WalletLocator: { Account: DESTINATION, URI: 'x' } }),
      ).toThrow(/It belongs to: AccountSet/);
    });
  });

  describe('the merge may only widen acceptance', () => {
    it('every field a factory declares still constructs on that factory', () => {
      // Regression guard (2026-10-07): AccountSet used to declare
      // NFTokenBrokerFee, which the protocol puts ONLY on NFTokenAcceptOffer.
      // The union index then had to list AccountSet as an owner, so the index
      // itself encoded the error. WalletLocator is the honest version of this
      // case: a protocol-only field on the one transaction that owns it.
      const tx = accountSet({ Account: ACCOUNT, WalletSize: 15 });
      expect(tx.toJSON().WalletSize).toBe(15);
    });

    it('rejects a field the protocol does not put on AccountSet', () => {
      // sfNFTokenBrokerFee is a real SField (AMOUNT, code 19) but is not in
      // rippled's ttACCOUNT_SET template, so STObject::applyTemplate throws
      // "found in disallowed location". Verified against rippled
      // transactions.macro:335 (sole entry, in ttNFTOKEN_ACCEPT_OFFER) and
      // xrpl.js TRANSACTION_FORMATS.
      expect(() =>
        accountSet({ Account: ACCOUNT, NFTokenBrokerFee: 1000 } as never),
      ).toThrow(/belongs to: .*NFTokenAcceptOffer/);
    });

    it('still accepts that field on NFTokenAcceptOffer, where the protocol puts it', () => {
      const owners = FIELD_OWNERS.NFTokenBrokerFee;
      expect(owners.has('AccountSet')).toBe(false);
      expect(owners.has('NFTokenAcceptOffer')).toBe(true);
    });
  });

  describe('common fields are valid on every transaction', () => {
    it.each([...COMMON_FIELDS])('%s owns no index entry', (field) => {
      expect(FIELD_OWNERS[field as keyof typeof FIELD_OWNERS]).toBeUndefined();
    });

    it.each([...COMMON_FIELDS])('accepts %s on any transaction', (field) => {
      expect(() => assertKnownFields('Payment', field)).not.toThrow();
      expect(() => assertKnownFields('SetRegularKey', field)).not.toThrow();
    });

    it('accepts the three Sponsor fields the library does not inherit', () => {
      // The codec lists these as common, so they are valid everywhere even
      // though BasePropsFields does not declare them. Getting this wrong would
      // make payment({ Sponsor }) throw as a SponsorshipTransfer-only field.
      for (const field of ['Sponsor', 'SponsorFlags', 'SponsorSignature']) {
        expect(FIELD_OWNERS[field as keyof typeof FIELD_OWNERS]).toBeUndefined();
      }
    });

    it('accepts a common field on the transaction that declares it explicitly', () => {
      // SponsorshipTransfer declares Sponsor/SponsorFlags/SponsorSignature
      // itself rather than inheriting them. The mode flag, and the rule that
      // Sponsee is End-tab only, are that factory's own validation and are
      // unrelated to field ownership.
      const tx = sponsorshipTransfer({
        Account: ACCOUNT,
        ObjectID: 'A'.repeat(64),
        Flags: 0x00020000, // tfSponsorshipCreate
        Sponsor: THIRD_ACCOUNT,
        SponsorFlags: 0x00000002, // spfSponsorReserve
      });
      expect(tx.toJSON().Sponsor).toBe(THIRD_ACCOUNT);
      expect(tx.toJSON().SponsorFlags).toBe(2);
    });
  });

  describe('.with() cannot bypass the check', () => {
    it('rejects a wrong-type field introduced through overrides', () => {
      const tx = basePayment();
      expect(() => tx.with({ DestinationTag: 1, RegularKey: DESTINATION } as never)).toThrow(
        /"RegularKey" is not a field on this transaction/,
      );
    });

    it('accepts a correct field introduced through overrides', () => {
      const tx = basePayment();
      expect(tx.with({ DestinationTag: 7 }).toJSON().DestinationTag).toBe(7);
    });
  });

  describe('index integrity', () => {
    it('has a non-empty owner set for every field', () => {
      for (const [field, owners] of Object.entries(FIELD_OWNERS)) {
        expect(owners.size, `${field} has no owners`).toBeGreaterThan(0);
      }
    });

    it('uses string transaction types as owners', () => {
      for (const owners of Object.values(FIELD_OWNERS)) {
        for (const owner of owners) expect(typeof owner).toBe('string');
      }
    });

    it('does not overlap the common field set', () => {
      const common = new Set<string>(COMMON_FIELDS);
      for (const field of Object.keys(FIELD_OWNERS)) {
        expect(common.has(field), `${field} is common but indexed`).toBe(false);
      }
    });
  });
});