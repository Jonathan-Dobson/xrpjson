/**
 * Functional AccountSet factory — frozen-object style.
 *
 * Companion prototype to payment.ts. Validates at construction, returns
 * a frozen object with bound validate/toJSON/with methods.
 */
import type { BasePropsFields } from '../../types/base.js';
import { isAccount, isNumber, isString } from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

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
  /** NFT collection fee (0-50,000). */
  NFTokenBrokerFee?: number | undefined;
  /** Flag to enable on the account. */
  SetFlag?: number | undefined;
  /** Transfer rate for issued currencies (drops per billion). */
  TransferRate?: number | undefined;
  /** Tick size for offer matching (3-15 or 0 to disable). */
  TickSize?: number | undefined;
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