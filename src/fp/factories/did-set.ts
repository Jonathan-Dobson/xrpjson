/**
 * Functional DIDSet factory — frozen-object style.
 *
 * Creates or updates a [W3C DID][xls-40] (Decentralized Identifier) ledger
 * entry associated with the sending `Account`. Validation happens at
 * construction; there is no way to construct an invalid tx.
 *
 *   import { didSet } from 'xrpjson';
 *   const tx = didSet({
 *     Account,
 *     URI: '697066733A2F2F62616679626569676479727A7435...', // ipfs://...
 *   });
 *   tx.validate();   // no-op — already validated at construction
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Fee: '12', Sequence: 42 });
 *
 * At least one of `Data`, `DIDDocument`, or `URI` must be provided — per
 * XLS-40 the tx must carry "modification" payload or rippled rejects it
 * with `temEMPTY_DID`. An empty string (`""`) is the canonical way to
 * clear an existing field, per the xrpl.org DIDSet reference.
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/didset
 * @see XLS-40 §5.2 (DIDSet transaction)
 *      https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0040-decentralized-identity
 * @see xrpl.js `packages/xrpl/src/models/transactions/DIDSet.ts`
 *      (validateDIDSet — source of every guard below except the
 *      hex-format and Account-format checks, which are stricter.)
 *
 * ## Divergences
 *
 * The factory implements the canonical XRPL DIDSet shape from
 * xrpl.js / XLS-40 / xrpl.org, which is a strict superset of the
 * validation the class API performs. The class at
 * the Class API's `DIDSet` is a minimal placeholder — it only
 * enforces the "at least one of Data/DIDDocument/URI" rule at
 * `validate()`-call time. Concretely:
 *
 *   1. **Validation is eager, not lazy.** The class lets callers
 *      construct a tx without immediately validating it; the factory
 *      runs every guard at construction so an invalid `DIDSet` is a
 *      type error (the call throws). There is no way to construct an
 *      invalid frozen tx. Sources: class `validate()` runs only when
 *      explicitly called (the Class API's `DIDSet`, lines 37-42); the
 *      factory mirrors the xrpl.js guard sequence
 *      (`DIDSet.ts:31-48`) at construction time.
 *
 *   2. **`Account` is validated as a classic/X-address via `isAccount`,
 *      not just as a non-empty string.** The class defers `Account`
 *      validation to the base class's `validateBaseTransaction`, which
 *      only requires `typeof Account === 'string'`. The factory
 *      enforces the format regex at construction, matching the rest
 *      of the M4 fp family (delegateSet, setRegularKey, payment, etc.).
 *
 *   3. **`Data`, `DIDDocument`, and `URI` are validated as
 *      well-formed uppercase/lowercase hex (or `""` to clear) when
 *      present.** xrpl.js `validateDIDSet` only checks `isString`
 *      (`DIDSet.ts:34,36,38`) and lets the binary codec reject
 *      non-hex at signing time. XRPL.org's DIDSet reference documents
 *      all three fields as JSON Type `String` / Internal Type `Blob`
 *      (see the Field tables at `xrpl-dev-portal/repo/docs/
 *      references/protocol/transactions/types/didset.md:33-38`). The
 *      factory enforces the hex format pre-signing so the failure
 *      surfaces at construction, not at submit time. Empty string is
 *      accepted (and validated as a no-op hex) because the xrpl.org
 *      note "To delete the Data, DIDDocument, or URI field from an
 *      existing DID ledger entry, add the field as an empty string."
 *      (`didset.md:41`) makes `""` the canonical clear payload.
 *      Source: xrpl.org `didset.md:33-41`; XLS-40 §5.2 (DIDSet
 *      fields are `Blob` internal type).
 *
 *   4. **`Data`, `DIDDocument`, and `URI` lengths must be even
 *      (whole-byte blobs).** Each field is an XLS-40 "Blob", which
 *      rippled serialises as an even number of nibbles. xrpl.js does
 *      not enforce this at the validator layer (it relies on the
 *      binary codec), but odd-length hex would be rejected at sign
 *      time with a codec error rather than a clear `ValidationError`.
 *      The factory surfaces this at construction so callers don't
 *      have to wait until `encode()` to discover the typo.
 *      Source: ripple-binary-codec `definitions.json`
 *      `DIDSet.Data/DIDDocument/URI: Blob`; XLS-40 §5.2.
 *
 *   5. **`Flags` is validated as a finite number if present.** The
 *      spec defines no DIDSet-specific flags; the only meaningful
 *      value is the universal `tfFullyCanonicalSig` (0x80000000) that
 *      every signed transaction should set. The class accepts any
 *      `Flags` value without type-checking; the factory rejects
 *      non-numeric, `NaN`, or non-finite values. The bit itself is
 *      NOT validated against a whitelist because some legacy tooling
 *      passes through whatever the signer provides. Source: XRPL.org
 *      DIDSet reference (no transaction-specific flags table; the
 *      global flag list at
 *      `xrpl-dev-portal/repo/docs/references/protocol/transactions/
 *      common-fields.md` is authoritative).
 */
import type { BasePropsFields } from '../../types/base.js';
import { isAccount, isHex, isNumber, isString } from '../../validation/helpers.js';
import { validateBaseTransaction } from '../../validation/base.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Public types ────────────────────────────────────────────────────

/**
 * Props for the `DIDSet` factory.
 *
 * Field naming follows xrpl.js / XLS-40 exactly — no rename relative
 * to the class API. The class's `URI` field, the xrpl.js `URI` field,
 * and the XLS-40 `URI` field all refer to the same hex-encoded
 * Universal Resource Identifier slot on the DID ledger entry.
 */
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
export interface DIDSetProps extends Omit<
  BasePropsFields,
  'TransactionType' | 'Flags'
> {
  /**
   * The unique address of the transaction sender. The DID ledger entry
   * is owned by this account. Required, must be a valid XRPL classic
   * or X-address.
   */
  Account: string;

  /**
   * The DID document associated with the DID, hex-encoded. Optional,
   * but at least one of `Data`, `DIDDocument`, or `URI` must be
   * present (not `undefined`) for the tx to be well-formed.
   *
   * Pass `""` to clear an existing `DIDDocument` from the ledger
   * entry. Source: xrpl.org `didset.md:41`.
   */
  DIDDocument?: string | undefined;

  /**
   * The public attestations of identity credentials associated with
   * the DID, hex-encoded. Optional, but at least one of `Data`,
   * `DIDDocument`, or `URI` must be present.
   *
   * Pass `""` to clear.
   */
  Data?: string | undefined;

  /**
   * The Universal Resource Identifier associated with the DID,
   * hex-encoded. Optional, but at least one of `Data`, `DIDDocument`,
   * or `URI` must be present.
   *
   * Pass `""` to clear.
   */
  URI?: string | undefined;

  /**
   * Bit-flags for this transaction. DIDSet defines no
   * transaction-specific flags; only the universal
   * `tfFullyCanonicalSig` (0x80000000) is meaningful. Optional.
   */
  Flags?: number | undefined;
}

export interface DIDSet
  extends Readonly<DIDSetProps> {
  readonly TransactionType: 'DIDSet';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<DIDSetProps>): DIDSet;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Validate a Blob field per XLS-40: it must be a string, must be valid
 * hex (or empty to clear), and must have even length (whole-byte
 * encoding).
 *
 * The empty string is intentionally accepted because xrpl.org
 * documents `""` as the canonical payload for clearing an existing
 * field. Source: xrpl.org `didset.md:41`.
 */
function validateBlobField(
  field: 'Data' | 'DIDDocument' | 'URI',
  value: unknown,
): void {
  if (!isString(value)) {
    throw new ValidationError(
      `DIDSet: ${field} must be a string (hex-encoded, or "" to clear)`,
    );
  }
  // Empty string is the canonical "clear" payload and is NOT hex.
  if (value === '') return;
  if (!isHex(value)) {
    throw new ValidationError(
      `DIDSet: ${field} must be valid hex (got: ${JSON.stringify(value)})`,
    );
  }
  if (value.length % 2 !== 0) {
    throw new ValidationError(
      `DIDSet: ${field} hex must have even length (whole bytes); got ${value.length} chars`,
    );
  }
}

// ─── Factory ─────────────────────────────────────────────────────────

/**
 * Build a frozen DIDSet. Throws `ValidationError` on construction if
 * any required field is missing or malformed.
 *
 * The class-based equivalent validates lazily (caller must invoke
 * `.validate()`); this functional version validates at construction.
 * There is no way to build an invalid tx — `with()` re-runs the
 * factory, so overrides are re-validated too.
 */
export function didSet(props: DIDSetProps): DIDSet {
  // ── Account ── required, must be a valid XRPL classic/X-address.
  require(
    props.Account,
    'DIDSet: missing or invalid Account',
    isAccount,
  );

  // ── At least one of Data / DIDDocument / URI must be present. ──
  // xrpl.js `validateDIDSet` lines 40-48; XRPL.org DIDSet "must include
  // either Data, DIDDocument, or URI"; the Class API's `DIDSet` enforces
  // the same rule at `.validate()` time (lines 39-41).
  const hasData = props.Data !== undefined;
  const hasDIDDocument = props.DIDDocument !== undefined;
  const hasURI = props.URI !== undefined;
  if (!hasData && !hasDIDDocument && !hasURI) {
    throw new ValidationError(
      'DIDSet: must specify at least one of Data, DIDDocument, or URI',
    );
  }

  // ── Data / DIDDocument / URI ── if present, must be hex Blob.
  if (hasData) validateBlobField('Data', props.Data);
  if (hasDIDDocument) validateBlobField('DIDDocument', props.DIDDocument);
  if (hasURI) validateBlobField('URI', props.URI);

  // ── Flags ── if present, must be a finite number.
  if (props.Flags !== undefined) {
    if (!isNumber(props.Flags) || !Number.isFinite(props.Flags)) {
      throw new ValidationError(
        'DIDSet: Flags must be a finite number',
      );
    }
  }

  // ── Base transaction fields ──
  // Catches the seven shared fields this factory now accepts through
  // `BasePropsFields` but does not otherwise check: Memos, SourceTag,
  // LastLedgerSequence, AccountTxnID, NetworkID, Delegate, TicketSequence.
  // Placed AFTER the DIDSet-specific checks so a more specific message wins
  // for a more specific mistake.
  validateBaseTransaction({ TransactionType: 'DIDSet', ...props });

  return buildFrozenTx<DIDSetProps, DIDSet>(
    'DIDSet',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: DIDSet) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: DIDSet, overrides: Partial<DIDSetProps>) {
        return didSet(mergeForWith(this, overrides));
      },
    },
  );
}
