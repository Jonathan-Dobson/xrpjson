/**
 * Functional AccountSet factory — frozen-object style.
 *
 * Companion prototype to payment.ts. Validates at construction, returns
 * a frozen object with bound validate/toJSON/with methods.
 *
 * ## Divergences
 *
 * - **`NFTokenBrokerFee` is deliberately NOT accepted here.** It is a real
 *   protocol field (`sfNFTokenBrokerFee`, AMOUNT, field code 19) but
 *   rippled accepts it on **NFTokenAcceptOffer only** — not on AccountSet,
 *   and not as an AccountRoot ledger field either.
 *   Source: rippled `include/xrpl/protocol/detail/transactions.macro:335`
 *   (the sole `{sfNFTokenBrokerFee, SoeOptional}` entry, in the
 *   `ttNFTOKEN_ACCEPT_OFFER` block) and the `ttACCOUNT_SET` block at
 *   line 93ff, which lists only EmailHash, WalletLocator, WalletSize,
 *   MessageKey, Domain, TransferRate, SetFlag, ClearFlag, TickSize and
 *   NFTokenMinter.
 *   Source: rippled `src/libxrpl/tx/transactors/account/AccountSet.cpp` —
 *   preflight reads sfSetFlag, sfClearFlag, sfTransferRate, sfTickSize,
 *   sfMessageKey, sfDomain, sfNFTokenMinter; no BrokerFee reference.
 *   Source: rippled `include/xrpl/protocol/detail/ledger_entries.macro` —
 *   no BrokerFee on ACCOUNT_ROOT, so it cannot be a per-account setting.
 *   Source: xrpl.js `packages/ripple-binary-codec/src/enums/definitions.json`
 *   `TRANSACTION_FORMATS` — `AccountSet` lists ten fields and
 *   `NFTokenBrokerFee` is absent; only `NFTokenAcceptOffer` carries it.
 *   Sending it on AccountSet makes `STObject::applyTemplate` throw
 *   `FieldErr: "Field 'NFTokenBrokerFee' found in disallowed location."`
 *   (`src/libxrpl/protocol/STObject.cpp:194-199`), because the field's
 *   code is ≤ 256 and therefore not discardable
 *   (`include/xrpl/protocol/SField.h:242-246`).
 *
 * - **`NFTokenMinter` must accompany `SetFlag: asfAuthorizedNFTokenMinter`,
 *   and must be absent when `ClearFlag` carries that flag.** The class API's
 *   base validator checks `Account` with `isString` only and models no
 *   AccountSet flag semantics at all, so it accepts both mistakes.
 *   rippled requires the minter when the flag is set ("if
 *   `uSetFlag == asfAuthorizedNFTokenMinter && !tx.isFieldPresent(sfNFTokenMinter)`
 *   → `temMALFORMED`") and forbids it when the flag is cleared ("if
 *   `uClearFlag == asfAuthorizedNFTokenMinter && tx.isFieldPresent(sfNFTokenMinter)`
 *   → `temMALFORMED`").
 *   - Source: rippled `src/libxrpl/tx/transactors/account/AccountSet.cpp:159–163`;
 *   - xrpl.js `models/transactions/accountSet.ts:165,181`
 *     (`NFTokenMinter?: Account`, `validateOptionalField(tx, 'NFTokenMinter', isAccount)`)
 *     — xrpl.js models the field and checks its shape, but not the flag coupling;
 *   - Class API `src/validation/base.ts:40–41`.
 *
 * - **`WalletLocator` must be a 256-bit hex value.** The class API and xrpl.js
 *   both model no `WalletLocator` on `AccountSet`, so both accept any value
 *   and leave it to the codec. rippled reads it as a `uint256` and treats an
 *   all-zero value as "unset the wallet locator" rather than "set it to
 *   zero" (`makeFieldAbsent` vs `setFieldH256`).
 *   - Source: rippled `src/libxrpl/tx/transactors/account/AccountSet.cpp:428–442`;
 *     `include/xrpl/protocol/detail/sfields.macro:178`
 *     (`TYPED_SFIELD(sfWalletLocator, UINT256, 7)`).
 *
 * - **`WalletSize` is deliberately not modelled.** It is a real AccountSet
 *   field (`sfWalletSize`, UINT32, field code 12) and the codec accepts it on
 *   the wire — but no rippled transactor ever reads it. `grep -rn "WalletSize"
 *   src/` over rippled returns nothing outside the generated protocol
 *   accessors, so setting it changes nothing on the ledger. Modelling it
 *   would give a caller a typed prop for a field with no effect, and a guard
 *   for a value the ledger never inspects. It stays a protocol-only field:
 *   accepted on AccountSet (the transaction that owns it), rejected anywhere
 *   else.
 *   - Source: rippled `include/xrpl/protocol/detail/sfields.macro:58`
 *     (`TYPED_SFIELD(sfWalletSize, UINT32, 12)`);
 *     `include/xrpl/protocol/detail/transactions.macro:98`
 *     (`{sfWalletSize, SoeOptional}` in the `ttACCOUNT_SET` block).
 *
 * - **`Account` must be a well-formed XRPL classic or X-address.** The
 *   class API's base validator checks `Account` with `isString` only, so
 *   `"not-an-address"` passes. The factory requires a well-formed
 *   address — a format check, not a checksum verification. rippled
 *   parses `Account` as an `AccountID` and rejects anything that is
 *   neither hex nor valid base58, so the rule is the ledger's own;
 *   xrpl.js checks the field with `isString` and ignores it.
 *   - Source: rippled `src/libxrpl/protocol/STParsedJSON.cpp:919`
 *     (`case STI_ACCOUNT:`);
 *     xrpl.js `models/transactions/common.ts:987`
 *     (`validateRequiredField(common, 'Account', isString)`);
 *     Class API `src/validation/base.ts:40–41`.
 */
import type { BasePropsFields } from '../../types/base.js';
import {
  isAccount,
  isLedgerEntryId,
  isNumber,
  isString,
} from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// `asfAuthorizedNFTokenMinter` — the AccountSet flag that authorises another
// account to mint NFToken mints on this account's behalf. Declared locally
// rather than imported from `src/types/flags.js` so this factory does not pull
// the whole flags module into a bundle that only wants AccountSet.
// Source: `src/types/flags.ts` (`AccountSetAsfFlags.asfAuthorizedNFTokenMinter`).
const ASF_AUTHORIZED_NFTOKEN_MINTER = 10;

// Why the two keys are omitted — do not "simplify" this away:
//  TransactionType: buildFrozenTx spreads props AFTER setting it, so a
//    caller-supplied value would win. See payment.ts:36-40.
//  Flags: re-declared below with this transaction's narrower type.
//
// The base is `BasePropsFields`, not `BaseTransactionFields`: the latter
// carries a trailing `[key: string]: unknown` that widens `keyof` to
// `string | number`, so `Omit<BaseTransactionFields, ...>` would collapse to
// a bare index signature and silently drop all fourteen named members. See
// the doc comment on BasePropsFields in src/types/base.ts.
export interface AccountSetProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  Account: string;
  /** Flag to clear on the account. */
  ClearFlag?: number | undefined;
  /** Domain name associated with this account (hex encoded). */
  Domain?: string | undefined;
  /** Email hash (e.g. for Gravatar). */
  EmailHash?: string | undefined;
  /** Message key for encrypted messaging. */
  MessageKey?: string | undefined;
  /**
   * Account authorised to mint NFToken mints on this account's behalf.
   * Required when `SetFlag` is `asfAuthorizedNFTokenMinter` (10); must be
   * absent when `ClearFlag` carries that same flag.
   */
  NFTokenMinter?: string | undefined;
  /** Flag to enable on the account. */
  SetFlag?: number | undefined;
  /** Transfer rate for issued currencies (drops per billion). */
  TransferRate?: number | undefined;
  /** Tick size for offer matching (3-15 or 0 to disable). */
  TickSize?: number | undefined;
  /**
   * 256-bit wallet locator for this account, as 64 hex characters. An
   * all-zero value clears the locator rather than setting it.
   */
  WalletLocator?: string | undefined;
  /** Bit-flags for this transaction. */
  Flags?: number | undefined;
}

export interface AccountSet
  extends Readonly<AccountSetProps> {
  readonly TransactionType: 'AccountSet';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<AccountSetProps>): AccountSet;
}

export function accountSet(props: AccountSetProps): AccountSet {
  // Account is required per xrpl.js's validateBaseTransaction
  // (common.ts: validateRequiredField(common, 'Account', isString)).
  require(
    props.Account,
    'AccountSet: Account is required',
    isAccount,
  );

  // Validate optional fields when present
  if (props.TransferRate !== undefined) {
    require(
      props.TransferRate,
      'AccountSet: TransferRate must be a number',
      isNumber,
    );
  }
  if (props.TickSize !== undefined) {
    require(
      props.TickSize,
      'AccountSet: TickSize must be a number',
      isNumber,
    );
    if (
      props.TickSize !== 0 &&
      (props.TickSize < 3 || props.TickSize > 15)
    ) {
      throw new ValidationError('AccountSet: TickSize must be 3-15 or 0');
    }
  }
  if (props.Domain !== undefined) {
    require(
      props.Domain,
      'AccountSet: Domain must be a string',
      isString,
    );
  }

  // ── NFTokenMinter ── the account authorised to mint on this account's
  // behalf. rippled stores it as an AccountID, so the shape is an address.
  if (props.NFTokenMinter !== undefined) {
    require(
      props.NFTokenMinter,
      'AccountSet: NFTokenMinter must be a string',
      isString,
    );
    if (!isAccount(props.NFTokenMinter)) {
      throw new ValidationError(
        'AccountSet: NFTokenMinter must be a valid XRPL classic or X-address',
      );
    }
  }

  // ── NFTokenMinter ↔ asfAuthorizedNFTokenMinter ── rippled requires the
  // minter when the flag is set, and forbids it when the flag is cleared.
  // Both are `temMALFORMED` at the ledger.
  if (
    props.SetFlag === ASF_AUTHORIZED_NFTOKEN_MINTER &&
    props.NFTokenMinter === undefined
  ) {
    throw new ValidationError(
      'AccountSet: NFTokenMinter is required when SetFlag is asfAuthorizedNFTokenMinter (10)',
    );
  }
  if (
    props.ClearFlag === ASF_AUTHORIZED_NFTOKEN_MINTER &&
    props.NFTokenMinter !== undefined
  ) {
    throw new ValidationError(
      'AccountSet: NFTokenMinter must not be set when ClearFlag is asfAuthorizedNFTokenMinter (10)',
    );
  }

  // ── WalletLocator ── a 256-bit value. rippled reads it as a uint256, so
  // anything other than 64 hex characters is malformed on the wire.
  if (props.WalletLocator !== undefined) {
    if (!isLedgerEntryId(props.WalletLocator)) {
      throw new ValidationError(
        'AccountSet: WalletLocator must be a 64-character hex string',
      );
    }
  }

  // ─── Base transaction fields ───
  // Validates the fields this factory inherits from BaseTransactionFields
  // but does not otherwise check. Placed AFTER the AccountSet-specific
  // checks so a more specific mistake gets a more specific message.
  // `TransactionType` is supplied because the validator checks a built
  // transaction, not a props bag — the factory injects it below.
  validateBaseTransaction({ TransactionType: 'AccountSet', ...props });

  return buildFrozenTx<AccountSetProps, AccountSet>(
    'AccountSet',
    props,
    {
      validate(this: AccountSet) {
        // Validated at construction.
      },
      toJSON(this: AccountSet) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: AccountSet, overrides: Partial<AccountSetProps>) {
        return accountSet(mergeForWith(this, overrides));
      },
    },
  );
}