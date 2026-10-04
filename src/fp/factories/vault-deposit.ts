/**
 * Functional VaultDeposit factory — frozen-object style.
 *
 * Deposits assets into a vault in exchange for vault shares. Validation
 * happens at construction; there is no way to construct an invalid tx from the
 * fields it models.
 *
 *   import { vaultDeposit } from 'xrpjson';
 *   const tx = vaultDeposit({ Account, VaultID, Amount });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Amount: '5000000' });
 *
 * Affected amendments:
 *   - `SingleAssetVault` (base VaultDeposit)
 *   - `LendingProtocolV1_1` (deposit phase gating on closed-ended vaults;
 *     see XLS-65 §3.5.2.2 check 15 — runtime phase is not locally checkable)
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/vaultdeposit
 * @see https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0065-single-asset-vault
 *
 * ## Divergences
 * The factory enforces two preclaim checks that the class API
 * (the Class API's `VaultDeposit`) skips:
 *
 *   1. `VaultID` must not be the all-zeros HASH256 value.
 *      Source: XLS-65 §3.5.2.1 check 1 — "The `VaultID` field is zero
 *      (`temMALFORMED`)". xrpl.js only requires it to be a string.
 *
 *   2. `Amount` must be strictly positive (non-zero, non-negative) in
 *      all three forms (XRP drops string, `IssuedCurrencyAmount.value`,
 *      `MPTAmount.value`).
 *      Source: XLS-65 §3.5.2.1 check 2 — "The `Amount` field is zero or
 *      negative (`temBAD_AMOUNT`)". xrpl.js `isAmount` accepts any
 *      numeric string and does not check the sign of the `value`
 *      sub-field of object amounts.
 */
import type { BasePropsFields } from '../../types/base.js';
import type { Amount, MPTAmount } from '../../types/amounts.js';
import { isAmount, isHex, isString } from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// A HASH256 is 32 bytes = 64 hex chars.
const VAULT_ID_LENGTH = 64;
// All-zeros HASH256 is reserved / malformed per spec.
const VAULT_ID_ZERO =
  '0000000000000000000000000000000000000000000000000000000000000000';

// ─── Public types ────────────────────────────────────────────────────

// Why the two keys are omitted — do not "simplify" this away:
//  TransactionType: buildFrozenTx spreads props AFTER setting it, so a
//    caller-supplied value would win. See payment.ts:36-40.
//  Flags: re-declared per transaction with that type's narrower flag
//    interface, which is assignable to the base's.
//
// The base is `BasePropsFields`, not `BaseTransactionFields`: the latter
// carries a trailing `[key: string]: unknown` that widens `keyof` to
// `string | number`, so `Omit<BaseTransactionFields, ...>` would collapse to
// a bare index signature and silently drop all fourteen named members.
// See the doc comment on BasePropsFields in src/types/base.ts.
export interface VaultDepositProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  /** The unique address of the transaction sender. */
  Account: string;
  /** The ID of the vault to deposit into. 64-char hex. */
  VaultID: string;
  /** Asset amount to deposit (XRP / trust line / MPT form). */
  Amount: Amount | MPTAmount;
  /** Bit-flags for this transaction. VaultDeposit has no defined flags. */
  Flags?: number | undefined;
}

export interface VaultDeposit extends Readonly<VaultDepositProps> {
  readonly TransactionType: 'VaultDeposit';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<VaultDepositProps>): VaultDeposit;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Per XLS-65 §3.5.2.1 check 2: "The `Amount` field is zero or negative
 * (`temBAD_AMOUNT`)." Validates the sign of an Amount in all three
 * accepted forms.
 *
 *   - XRP form: a decimal-string of drops (e.g. "1000000").
 *   - IssuedCurrency form: object with a `value` sub-string.
 *   - MPT form: object with a `value` sub-string.
 *
 * We accept the canonical scientific mantissa form (`1.5e3`) so this
 * stays compatible with the XRPL serialization layer, which uses the
 * same mantissa as `rippled` for `STAmount`. Negative or zero mantissas
 * are rejected.
 */
function isPositiveAmount(amount: Amount | MPTAmount): boolean {
  // XRP drops — a decimal or scientific-mantissa string.
  if (typeof amount === 'string') {
    if (!/^-?[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u.test(amount)) {
      return false;
    }
    return parseFloat(amount) > 0;
  }
  // Object form (IssuedCurrency or MPT).
  if (typeof amount !== 'object' || amount === null) return false;
  const value = (amount as { value?: unknown }).value;
  if (typeof value !== 'string') return false;
  if (!/^-?[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u.test(value)) {
    return false;
  }
  return parseFloat(value) > 0;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function vaultDeposit(props: VaultDepositProps): VaultDeposit {
  // ── Account ── required, must be a non-empty string (class parity).
  if (!isString(props.Account) || props.Account.length === 0) {
    throw new ValidationError('VaultDeposit: Account is required');
  }

  // ── VaultID ── required, 64-char hex AND non-zero.
  if (
    !isString(props.VaultID) ||
    !isHex(props.VaultID) ||
    props.VaultID.length !== VAULT_ID_LENGTH
  ) {
    throw new ValidationError(
      'VaultDeposit: VaultID must be a 64-character hex string',
    );
  }
  if (props.VaultID === VAULT_ID_ZERO) {
    throw new ValidationError(
      'VaultDeposit: VaultID must not be the all-zeros HASH256 value',
    );
  }

  // ── Amount ── required, must be a valid Amount AND strictly positive.
  if (!isAmount(props.Amount)) {
    throw new ValidationError(
      'VaultDeposit: Amount must be a valid Amount (XRP / trust line / MPT form)',
    );
  }
  if (!isPositiveAmount(props.Amount)) {
    throw new ValidationError(
      'VaultDeposit: Amount must be strictly positive (non-zero, non-negative)',
    );
  }

  // ─── Base transaction fields ───
  // Catches the seven shared fields this factory now accepts through
  // `BasePropsFields` but does not otherwise check: Memos, SourceTag,
  // LastLedgerSequence, AccountTxnID, NetworkID, Delegate, TicketSequence.
  // Placed AFTER the VaultDeposit-specific checks so a more specific message
  // wins for a more specific mistake, and this acts as the backstop for
  // everything shared across transaction types.
  //
  // `TransactionType` is supplied because the validator checks a transaction,
  // not a props bag — the factory injects it in `buildFrozenTx` below.
  validateBaseTransaction({ TransactionType: 'VaultDeposit', ...props });

  return buildFrozenTx<VaultDepositProps, VaultDeposit>(
    'VaultDeposit',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: VaultDeposit) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: VaultDeposit, overrides: Partial<VaultDepositProps>) {
        return vaultDeposit(mergeForWith(this, overrides));
      },
    },
  );
}