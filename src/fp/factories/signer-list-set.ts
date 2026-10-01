/**
 * Functional SignerListSet factory — frozen-object style.
 *
 * Create, replace, or remove a list of signers that can be used to
 * multi-sign transactions on the ledger.
 *
 *   import { signerListSet } from 'xrpjson';
 *   const tx = signerListSet({
 *     Account,
 *     SignerQuorum: 3,
 *     SignerEntries: [
 *       { SignerEntry: { Account: SIGNER_A, SignerWeight: 2 } },
 *       { SignerEntry: { Account: SIGNER_B, SignerWeight: 1 } },
 *     ],
 *   });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Fee: '12', Sequence: 42 });
 *
 * To **delete** a signer list, omit `SignerEntries` and pass
 * `SignerQuorum: 0`. xrpl.org: "To delete a signer list, you must set
 * `SignerQuorum` to `0` _and_ omit the `SignerEntries` field.
 * Otherwise, the transaction fails with the error `temMALFORMED`."
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/signerlistset
 * @see https://xrpl.org/docs/references/protocol/ledger-data/ledger-entry-types/signerlist
 * @see xrpl.js `validateSignerListSet` — packages/xrpl/src/models/transactions/signerListSet.ts
 *
 * ## Divergences
 *
 * The factory implements the canonical XRPL SignerListSet shape from
 * xrpl.org + rippled + xrpl.js, which is a strict superset of the
 * current class API at the Class API's `SignerListSet`. The class
 * is a thin skeleton — it only checks `SignerQuorum` is a number and
 * that `SignerEntries` (when present) is an array of `SignerEntry`
 * objects. It does NOT enforce any of the ledger-level guardrails
 * below, so malformed transactions currently sail through class
 * validation and only fail at the ledger with `temMALFORMED` /
 * `temBAD_QUORUM` / `temBAD_SIGNER` / `temBAD_WEIGHT`. Concretely:
 *
 *   1. **`SignerEntries` is required when `SignerQuorum > 0`.**
 *      xrpl.js `signerListSet.ts:53-62` short-circuits on
 *      `tx.SignerQuorum === 0`, but for any non-zero quorum it then
 *      runs `validateRequiredField(tx, 'SignerEntries', isArray)` and
 *      rejects an empty array with `'SignerListSet: need at least 1
 *      member in SignerEntries'`. xrpl.org
 *      (`docs/.../signerlistset.md` Fields table) says the list "must
 *      have at least 1 member and no more than 32 members". The class
 *      does not enforce either rule.
 *
 *   2. **`SignerEntries` cap is 32 members.** xrpl.js throws
 *      `'SignerListSet: maximum of 32 members allowed in
 *      SignerEntries'` when `tx.SignerEntries.length > MAX_SIGNERS =
 *      32` (xrpl.js `signerListSet.ts:64-68`). rippled enforces the
 *      same cap via `temMALFORMED`. The class does not check length.
 *
 *   3. **`SignerWeight` must be a positive integer.**
 *      xrpl.js does not check the SignerWeight value itself, but the
 *      rippled `SignerListSet` preflight raises `temBAD_WEIGHT` when
 *      any `SignerWeight` is zero or negative
 *      (`xrpl-dev-portal/.../tem-codes.md`: "The SignerListSet
 *      transaction includes a SignerWeight that is invalid, for
 *      example a zero or negative value."). The factory rejects
 *      non-integer, zero, and negative weights at construction.
 *      The class only checks `isNumber(entry['SignerWeight'])`, which
 *      accepts `-1` and `0`.
 *
 *   4. **`SignerQuorum` must be in `[1, sum(SignerWeights)]`.**
 *      xrpl.org (`signerlistset.md`): "The `SignerQuorum` must be
 *      greater than 0 but less than or equal to the sum of the
 *      `SignerWeight` values in the list. Otherwise, the transaction
 *      fails with the error `temMALFORMED`." rippled raises
 *      `temBAD_QUORUM` (tem-codes.md: "Either the value is not greater
 *      than zero, or it is more than the sum of all signers in the
 *      list."). The factory rejects `SignerQuorum > sumWeight` at
 *      construction. Note: the SignerQuorum === 0 deletion path is
 *      still permitted when `SignerEntries` is omitted — that is
 *      explicitly allowed by rippled (see #1 above).
 *
 *   5. **Each `SignerEntry.Account` must be a valid XRPL address.**
 *      The class accepts any string (`isString(entry['Account'])`),
 *      which lets malformed addresses through. rippled rejects with
 *      `temMALFORMED` ("...malformed address..."). The factory runs
 *      `isAccount()` per entry.
 *
 *   6. **No duplicate `SignerEntry.Account` values.** xrpl.org
 *      (`signerlistset.md`): "No address may appear more than once in
 *      the list". rippled raises `temBAD_SIGNER` (tem-codes.md:
 *      "there may be duplicate entries..."). The factory enforces
 *      uniqueness via a `Set` and rejects duplicates. The class does
 *      not check.
 *
 *   7. **`SignerEntry.Account` must not equal the sending `Account`.**
 *      xrpl.org (`signerlistset.md`): "nor may the `Account`
 *      submitting the transaction appear in the list". rippled raises
 *      `temBAD_SIGNER`. The factory rejects the sending account as
 *      one of its own signers at construction. The class does not
 *      check.
 *
 *   8. **`WalletLocator`, when present, must be a 256-bit (32-byte)
 *      hex string.** xrpl.js enforces `HEX_WALLET_LOCATOR_REGEX =
 *      /^[0-9A-Fa-f]{64}$/u` (xrpl.js `signerListSet.ts:39, 78-86`)
 *      and rejects non-hex or wrong-length values. The factory mirrors
 *      this regex.
 *
 *   9. **`Account` is validated as a classic/X-address via
 *      `isAccount`, not just as a non-empty string.** The class
 *      delegates `Account` to the base class's
 *      `validateBaseTransaction`, which only requires
 *      `typeof Account === 'string'` (`src/validation/base.ts:36-42`).
 *      The factory is consistent with all other fp factories.
 */
import { isAccount, isNumber, isString } from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

/**
 * Maximum number of `SignerEntry` entries in a single SignerListSet
 * transaction. Mirrors xrpl.js `MAX_SIGNERS`.
 *
 * @see xrpl.js `signerListSet.ts:37`
 * @see rippled `SignerListSet` preflight
 */
const MAX_SIGNERS = 32;

/**
 * `WalletLocator` is a 256-bit (32-byte) hex value. Mirrors xrpl.js
 * `HEX_WALLET_LOCATOR_REGEX`.
 *
 * @see xrpl.js `signerListSet.ts:39`
 */
const HEX_WALLET_LOCATOR_REGEX = /^[0-9A-Fa-f]{64}$/u;

// ─── Public types ────────────────────────────────────────────────────

/**
 * One entry in the `SignerEntries` array.
 *
 * The shape is a nested `SignerEntry` object — exactly the on-ledger
 * serialization required by ripple-binary-codec. `WalletLocator` is
 * optional and only meaningful after the `ExpandedSignerList`
 * amendment.
 *
 * @see https://xrpl.org/docs/references/protocol/ledger-data/ledger-entry-types/signerlist#signer-entry-object
 */
export interface SignerEntryData {
  /** An XRPL classic or X-address whose signature contributes to the multi-signature. */
  readonly SignerEntry: {
    readonly Account: string;
    /**
     * Weight of a signature from this signer. Must be a positive
     * integer (`>= 1`). rippled raises `temBAD_WEIGHT` on 0 or
     * negative values.
     */
    readonly SignerWeight: number;
    /**
     * Optional 256-bit (32-byte) hex identifier (post-ExpandedSignerList).
     * When present, must be exactly 64 hex characters.
     */
    readonly WalletLocator?: string;
  };
}

export interface SignerListSetProps {
  /** The unique address of the transaction sender. */
  Account: string;
  /**
   * Target number of signer weights. A multi-signature from the list
   * is valid only if the sum of the signature weights is `>=` this
   * value. **To delete the signer list, set to `0` AND omit
   * `SignerEntries`.** Otherwise, `1 <= SignerQuorum <=
   * sum(SignerWeights)`.
   */
  SignerQuorum: number;
  /**
   * The list of signers. Required when `SignerQuorum > 0`; must be
   * omitted entirely when `SignerQuorum === 0`. Each entry's `Account`
   * must be a valid XRPL address, `SignerWeight` a positive integer,
   * `WalletLocator` (when present) a 64-char hex string. Signer
   * accounts must be unique and must not equal `Account`.
   */
  SignerEntries?: SignerEntryData[] | undefined;
  /** Bit-flags for this transaction. SignerListSet has no defined flags. */
  Flags?: number | undefined;
  /** Fee in drops. */
  Fee?: string | undefined;
  /** Account sequence number. */
  Sequence?: number | undefined;
}

export interface SignerListSet
  extends Readonly<SignerListSetProps> {
  readonly TransactionType: 'SignerListSet';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<SignerListSetProps>): SignerListSet;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function signerListSet(props: SignerListSetProps): SignerListSet {
  // ── Account ── required, must be a valid XRPL classic or X-address.
  require(
    props.Account,
    'SignerListSet: missing or invalid Account',
    isAccount,
  );

  // ── SignerQuorum ── required, must be a number. Range and zero-
  //    branch handling come after we've decided whether the tx is a
  //    create/replace (Signers present) or a delete (Quorum === 0).
  require(
    props.SignerQuorum,
    'SignerListSet: missing or invalid SignerQuorum',
    isNumber,
  );

  // ── Deletion path: SignerQuorum === 0 must NOT have SignerEntries.
  //    xrpl.org: "To delete a signer list, you must set SignerQuorum
  //    to 0 AND omit the SignerEntries field. Otherwise, the
  //    transaction fails with the error temMALFORMED."
  if (props.SignerQuorum === 0) {
    if (props.SignerEntries !== undefined && props.SignerEntries.length > 0) {
      throw new ValidationError(
        'SignerListSet: SignerQuorum must be > 0 when SignerEntries are present',
      );
    }
    // Deletion path is otherwise complete — no SignerEntries validation.
    return buildFrozenTx<SignerListSetProps, SignerListSet>(
      'SignerListSet',
      props,
      {
        validate() {
          // Validated at construction.
        },
        toJSON(this: SignerListSet) {
          const json: Record<string, unknown> = {};
          for (const k of Object.keys(this)) {
            if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
            const v = (this as unknown as Record<string, unknown>)[k];
            if (v !== undefined) json[k] = v;
          }
          return json;
        },
        with(this: SignerListSet, overrides: Partial<SignerListSetProps>) {
          return signerListSet(mergeForWith(this, overrides));
        },
      },
    );
  }

  // ── Non-zero quorum: SignerEntries is required.
  if (!Array.isArray(props.SignerEntries)) {
    throw new ValidationError(
      'SignerListSet: missing or invalid SignerEntries (array required when SignerQuorum > 0)',
    );
  }
  if (props.SignerEntries.length === 0) {
    throw new ValidationError(
      'SignerListSet: need at least 1 member in SignerEntries',
    );
  }
  if (props.SignerEntries.length > MAX_SIGNERS) {
    throw new ValidationError(
      `SignerListSet: maximum of ${MAX_SIGNERS} members allowed in SignerEntries (actual: ${props.SignerEntries.length})`,
    );
  }

  // ── SignerEntries ── shape, weight range, account format,
  //    uniqueness, owner-not-in-list.
  let weightSum = 0;
  const seenAccounts = new Set<string>();
  for (let i = 0; i < props.SignerEntries.length; i++) {
    const entry = props.SignerEntries[i];
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ValidationError(
        `SignerListSet: SignerEntries[${i}] must be an object with a SignerEntry field`,
      );
    }
    const inner = (entry as unknown as Record<string, unknown>)['SignerEntry'];
    if (
      inner === null ||
      typeof inner !== 'object' ||
      Array.isArray(inner)
    ) {
      throw new ValidationError(
        `SignerListSet: SignerEntries[${i}].SignerEntry must be an object`,
      );
    }

    const acc = (inner as Record<string, unknown>)['Account'];
    if (!isAccount(acc)) {
      throw new ValidationError(
        `SignerListSet: SignerEntries[${i}].SignerEntry.Account must be a valid XRPL address`,
      );
    }
    // ── Owner-in-list guard ── rippled temBAD_SIGNER.
    if (acc === props.Account) {
      throw new ValidationError(
        `SignerListSet: SignerEntries[${i}].SignerEntry.Account must not equal the sending Account (temBAD_SIGNER)`,
      );
    }
    // ── Duplicate-account guard ── rippled temBAD_SIGNER.
    if (seenAccounts.has(acc)) {
      throw new ValidationError(
        `SignerListSet: duplicate signer Account in SignerEntries (${acc}) (temBAD_SIGNER)`,
      );
    }
    seenAccounts.add(acc);

    const weight = (inner as Record<string, unknown>)['SignerWeight'];
    if (
      !isNumber(weight) ||
      !Number.isInteger(weight) ||
      weight < 1
    ) {
      throw new ValidationError(
        `SignerListSet: SignerEntries[${i}].SignerEntry.SignerWeight must be a positive integer (temBAD_WEIGHT)`,
      );
    }
    weightSum += weight;

    // ── WalletLocator ── optional, must be 64-char hex if present.
    const locator = (inner as Record<string, unknown>)['WalletLocator'];
    if (locator !== undefined) {
      if (
        !isString(locator) ||
        !HEX_WALLET_LOCATOR_REGEX.test(locator)
      ) {
        throw new ValidationError(
          `SignerListSet: SignerEntries[${i}].SignerEntry.WalletLocator must be a 256-bit (32-byte) hexadecimal value`,
        );
      }
    }
  }

  // ── SignerQuorum cap: 1 <= Quorum <= sum(SignerWeights).
  //    xrpl.org "must be greater than 0 but less than or equal to
  //    the sum of the SignerWeight values in the list. Otherwise,
  //    the transaction fails with temMALFORMED." (mirrored by
  //    rippled's temBAD_QUORUM).
  if (props.SignerQuorum > weightSum) {
    throw new ValidationError(
      `SignerListSet: SignerQuorum (${props.SignerQuorum}) must not exceed the sum of SignerWeights (${weightSum}) (temBAD_QUORUM)`,
    );
  }

  return buildFrozenTx<SignerListSetProps, SignerListSet>(
    'SignerListSet',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: SignerListSet) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: SignerListSet, overrides: Partial<SignerListSetProps>) {
        return signerListSet(mergeForWith(this, overrides));
      },
    },
  );
}