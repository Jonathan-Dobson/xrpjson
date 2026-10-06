/**
 * Functional-transaction shape helpers.
 *
 * A "frozen tx" is an `Object.freeze`-d plain object that carries the
 * transaction fields plus three methods bound to it: `validate()`,
 * `toJSON()`, and `with(overrides)`. The shape is immutable by
 * construction — consumers cannot mutate it; they must call `.with()`
 * to derive a new tx.
 *
 * Why freeze at the data layer rather than the wrapper?
 *   - `Object.freeze(data)` makes the field set stable, so `Object.keys(tx)`
 *     reflects only what the user provided plus `TransactionType`.
 *   - `Object.freeze(wrapper)` after attaching methods keeps the methods
 *     callable but unassignable.
 *   - Spreading `{ ...tx }` after freeze still works (it copies
 *     enumerable own properties); used by `with()` to apply overrides.
 *
 * What this prototype is testing:
 *   1. Can a frozen plain object satisfy a structural interface that
 *      includes methods, while remaining serializable via `toJSON()`?
 *   2. Does `with()` returning a fresh factory call correctly
 *      re-validate and produce a new frozen object?
 *   3. Does the API surface reduce to one function per type, with
 *      no class hierarchy and no central registry?
 *   4. Does tree-shaking actually work — i.e., can a consumer
 *      `import { payment } from 'xrpjson'` and pull in ONLY the
 *      Payment factory code, with no AMM/Vault/Loan code?
 */
import { ValidationError } from '../errors.js';
import { assertKnownFields } from './field-index.js';

/**
 * Every frozen tx has these three methods. The factory binds them
 * directly to the data so the result is a single immutable object —
 * no class, no prototype chain, no `instanceof` checks possible.
 */
export interface FrozenTxMethods<TProps extends object, TTx> {
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<TProps>): TTx;
}

/**
 * Build a frozen tx from validated field data. The factory calls this
 * AFTER running its own validation, so any object passed in is assumed
 * already ledger-compliant.
 *
 * ## Field ownership
 *
 * Both this function and every per-factory `toJSON` carry **every** key on the
 * object, not just the ones a factory models, so a prop the factory does not
 * recognise would otherwise reach the serialised transaction and be refused
 * there by the codec with `Field 'X' found in disallowed location.` — an error
 * that names the field but not the mistake.
 *
 * ```js
 * setRegularKey({ Account, TotallyBogusField: 1 })  // a typo
 * setRegularKey({ Account, DestinationTag: 42 })    // a REAL field, wrong type
 * ```
 *
 * The second is the worse one, because nothing at the call site looks wrong.
 * `assertKnownFields` closes both here, at the one choke point every factory
 * and every `.with()` override passes through. It rejects a field only when it
 * is KNOWN and absent for this transaction type — see `src/fp/field-index.ts`
 * for how the ownership table is built and why that rule is not an allowlist.
 *
 * A field with no entry in the index is one this library does not model yet,
 * and still passes: `BaseTransactionFields` deliberately carries
 * `[key: string]: unknown` for forward-compatibility (`src/types/base.ts:100`),
 * and a genuinely-new amendment field must not be rejected just because the
 * library has not caught up with it.
 *
 * @param txType     - The literal transaction type string ('Payment', ...)
 * @param fields     - The validated field set (frozen at this layer too)
 * @param methods    - Bound methods (validate / toJSON / with)
 */
export function buildFrozenTx<TProps extends object, TTx>(
  txType: string,
  fields: Readonly<TProps>,
  methods: FrozenTxMethods<TProps, TTx>,
): TTx {
  for (const field of Object.keys(fields)) {
    assertKnownFields(txType, field);
  }
  const data = Object.freeze({ TransactionType: txType, ...fields });
  // TypeScript can't see that the spread of `data` (which IS TProps-shaped
  // minus TransactionType) plus the methods (which carry validate/toJSON/with)
  // produces a valid TTx (which is Readonly<TProps> + those methods).
  // The cast is safe by construction — see the type definitions in the
  // concrete factories (payment.ts, account-set.ts) for the structural
  // contract that backs this assertion.
  return Object.freeze({
    ...data,
    ...methods,
  }) as unknown as TTx;
}

/**
 * Helper for `with()` implementations: spreads the current tx's
 * enumerable own keys (skipping methods/functions), applies overrides,
 * and hands the merged shape back to the factory to re-validate.
 *
 * Used as: `return payment(mergeForWith(this, overrides));`
 */
export function mergeForWith<TProps extends object>(
  current: Readonly<TProps>,
  overrides: Partial<TProps>,
): TProps {
  const merged: Record<string, unknown> = {};
  for (const k of Object.keys(current)) {
    const v = (current as Record<string, unknown>)[k];
    if (typeof v !== 'function') merged[k] = v;
  }
  for (const k of Object.keys(overrides)) {
    merged[k] = (overrides as Record<string, unknown>)[k];
  }
  return merged as TProps;
}

/**
 * Common validator: throw a typed `ValidationError` with the field path.
 * Keeps factory code uniform without imposing a particular error shape.
 */
export function require<T>(
  value: T,
  message: string,
  isOk: (v: T) => boolean = (v) => v !== undefined && v !== null,
): T {
  if (!isOk(value)) throw new ValidationError(message);
  return value;
}