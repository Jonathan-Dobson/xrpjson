/**
 * Functional SetRegularKey factory — frozen-object style.
 *
 * Assigns, changes, or removes the regular key pair associated with the
 * sending account. Validation happens at construction; there is no way
 * to construct an invalid tx.
 *
 *   import { setRegularKey } from 'xrplt/fp';
 *   const tx = setRegularKey({ Account, RegularKey });
 *   tx.validate();   // throws if construction didn't already
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Fee: '12', Sequence: 42 });
 *
 * If `RegularKey` is omitted the tx removes any existing regular key
 * from the account. (Per xrpl.org, "If omitted, removes any existing
 * regular key pair from the account.")
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/setregularkey
 *
 * ## Divergences
 *
 * The class-based API at `src/transactions/set-regular-key.ts` is
 * missing one rule that the canonical sources require. The factory
 * fills it:
 *
 *   1. `temBAD_REGKEY` is not enforced.
 *      The class never compares `RegularKey` against `Account`, so a
 *      `SetRegularKey` whose `RegularKey` equals the sender's address
 *      (i.e. assigns the master key as its own regular key) passes
 *      class validation and only fails at the ledger with `temBAD_REGKEY`.
 *      The factory rejects this at construction.
 *      Source: rippled `src/libxrpl/tx/transactors/account/SetRegularKey.cpp`
 *              lines 44–47 (`SetRegularKey::preflight` returns `temBAD_REGKEY`
 *              when `getAccountID(sfRegularKey) == getAccountID(sfAccount)`).
 *              Confirmed by xrpl-dev-portal `setregularkey.md` Fields table:
 *              "Must not match the master key pair for the address."
 */
import { isAccount } from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Public types ────────────────────────────────────────────────────

export interface SetRegularKeyProps {
  /**
   * The funded account whose regular key is being set/changed/removed.
   * Required, must be a valid XRPL classic or X-address.
   */
  Account: string;
  /**
   * Optional. The address of the new regular key pair. Omit (or pass
   * `undefined`) to remove any existing regular key pair.
   *
   * When present, must be a valid XRPL address AND must NOT equal
   * `Account` — the master key cannot be its own regular key
   * (`temBAD_REGKEY`).
   */
  RegularKey?: string | undefined;
  /** Bit-flags for this transaction. SetRegularKey has no defined flags. */
  Flags?: number | undefined;
  /** Fee in drops. Base transaction field. */
  Fee?: string | undefined;
  /** Account sequence number. Base transaction field. */
  Sequence?: number | undefined;
}

export interface SetRegularKey extends Readonly<SetRegularKeyProps> {
  readonly TransactionType: 'SetRegularKey';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<SetRegularKeyProps>): SetRegularKey;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function setRegularKey(props: SetRegularKeyProps): SetRegularKey {
  // ── Account ── required, must be a valid XRPL classic or X-address.
  require(props.Account, 'SetRegularKey: Account is required', isAccount);

  // ── RegularKey ── optional.
  //   xrpl.js validateSetRegularKey (packages/xrpl/src/models/transactions/
  //   setRegularKey.ts) only checks `typeof RegularKey === 'string'` when
  //   present. The class uses `isAccount` (format-only regex check). We
  //   layer on the rippled `temBAD_REGKEY` guard: RegularKey must not equal
  //   the sending Account.
  if (props.RegularKey !== undefined) {
    if (!isAccount(props.RegularKey)) {
      throw new ValidationError(
        'SetRegularKey: RegularKey must be a valid XRPL address',
      );
    }
    // ── temBAD_REGKEY guard ─────────────────────────────────────────
    // rippled SetRegularKey.cpp:44–47
    if (props.RegularKey === props.Account) {
      throw new ValidationError(
        'SetRegularKey: RegularKey must not equal Account (temBAD_REGKEY)',
      );
    }
  }

  return buildFrozenTx<SetRegularKeyProps, SetRegularKey>(
    'SetRegularKey',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: SetRegularKey) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: SetRegularKey, overrides: Partial<SetRegularKeyProps>) {
        return setRegularKey(mergeForWith(this, overrides));
      },
    },
  );
}