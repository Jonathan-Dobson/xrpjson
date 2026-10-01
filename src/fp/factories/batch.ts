/**
 * Functional Batch factory — frozen-object style.
 *
 * The Batch transaction (`BatchV1_1` amendment) wraps a list of inner
 * transactions (`RawTransactions`) into a single atomic submission. The
 * factory validates at construction; an invalid Batch can never exist.
 *
 *   import { batch } from 'xrpjson';
 *   const tx = batch({ Account, Flags, RawTransactions: [...] });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Flags: 0x00020000 }); // tfOnlyOne
 *
 * Compare with the class-based equivalent, where fields are assigned to
 * an instance and validate() must be called explicitly:
 *
 *   const tx = new Batch({ Account, Flags, RawTransactions: [...] });
 *   tx.validate();   // must be called explicitly
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/batch
 * @see https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0056-batch
 *
 * ## Divergences
 * The factory enforces eight preclaim checks that the class API
 * (the Class API's `Batch`) explicitly skips. Each is documented
 * inline with the corresponding citation.
 *
 *   1. `RawTransactions` length must be **2–8** (class: only non-empty).
 *      Source: XLS-56 §2.1.2 — "There can be up to 8 transactions
 *      included. There must be at least 2 transactions." Cross-checked
 *      against xrpl.org error table for `temARRAY_EMPTY` and
 *      `temARRAY_TOO_LARGE`.
 *
 *   2. Outer `Flags` must contain **exactly one** batch-mode flag
 *      (`tfAllOrNothing` | `tfOnlyOne` | `tfUntilFailure` | `tfIndependent`).
 *      Source: XLS-56 §2.1.1 — "Exactly one must be specified in a Batch
 *      transaction." Cross-checked against xrpl.org error table for
 *      `temINVALID_FLAG` (first clause). The class source comment
 *      (the Class API's `Batch`, lines 33-38) explicitly defers this to the
 *      ledger.
 *
 *   3. Each inner transaction must set **either** `Sequence` (non-zero)
 *      **or** `TicketSequence` (positive integer), but not both and not
 *      neither. Source: XLS-56 §2.3.2.12 — "exactly one of the two must
 *      be used: a ticketed inner transaction sets `TicketSequence` and
 *      `Sequence: 0`, and a sequence-based inner transaction sets a
 *      non-zero `Sequence` and omits `TicketSequence`." Cross-checked
 *      against xrpl.org error table for `temSEQ_AND_TICKET`.
 *
 *   4. No duplicate inner transactions in `RawTransactions` (deep-equal
 *      by canonical JSON serialization with sorted keys).
 *      Source: XLS-56 §2.3.2.10 — "There is a duplicate transaction in
 *      the `RawTransactions` field (`temREDUNDANT`)."
 *
 *   5. `BatchSigners` length must be ≤ 24 entries.
 *      Source: XLS-56 §2.3.3.1 — "The length of `BatchSigners` is greater
 *      than 24 (`temARRAY_TOO_LARGE`). This is three times the maximum
 *      number of inner transactions."
 *
 *   6. `BatchSigners` must be sorted strictly ascending by `Account` and
 *      contain no duplicate accounts. Source: XLS-56 §2.1.3 — "The
 *      entries in `BatchSigners` must be sorted in strictly ascending
 *      order by `Account`. Duplicate entries are not permitted."
 *      Cross-checked against xrpl.org `temBAD_SIGNER` (third and fourth
 *      clauses).
 *
 *   7. The outer `Account` may not appear as a `BatchSigner.Account`
 *      Source: XLS-56 §2.3.3.2 — "The `BatchSigners` field contains a
 *      signature from the account signing the outer transaction
 *      (`temBAD_SIGNER`)."
 *
 *   8. Each `BatchSigner` must be exclusively either single-sign
 *      (`SigningPubKey` + `TxnSignature`) or multi-sign (`Signers`); the
 *      two forms cannot be mixed on the same entry.
 *      Source: XLS-56 §2.1.3 — "Either the `SigningPubKey` and
 *      `TxnSignature` fields must be included, or the `Signers` field."
 *      Cross-checked against xrpl.org note on the `BatchSigners` table.
 *
 * Where the class enforces a rule, the factory matches its error wording
 * so consumers can rely on either API for the same set of guard checks.
 */
import type { Signer } from '../../types/common.js';
import type { BatchFlagsInterface } from '../../types/flags.js';
import { GlobalFlags } from '../../types/flags.js';
import {
  isAccount,
  isArray,
  isRecord,
  isString,
} from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

// Minimum number of inner transactions in a Batch (XLS-56 §2.1.2).
const MIN_RAW_TRANSACTIONS = 2;
// Maximum number of inner transactions in a Batch (XLS-56 §2.1.2).
const MAX_RAW_TRANSACTIONS = 8;
// Maximum number of BatchSigner entries (XLS-56 §2.3.3.1).
const MAX_BATCH_SIGNERS = 24;

// ─── Public types ────────────────────────────────────────────────────

/**
 * A single inner transaction wrapped in the Batch's `RawTransactions`
 * array. Per BatchV1_1, the wrapping object has exactly one key:
 * `RawTransaction`.
 */
export interface RawTransaction {
  readonly RawTransaction: Record<string, unknown>;
}

/**
 * A counterparty signature for a multi-account Batch tx. The wrapper
 * carries a single `BatchSigner` record.
 */
export interface BatchSigner {
  readonly BatchSigner: {
    readonly Account: string;
    readonly SigningPubKey?: string;
    readonly TxnSignature?: string;
    readonly Signers?: Signer[];
  };
}

export interface BatchProps {
  /** The unique address of the transaction sender (outer Batch signer). */
  Account: string;
  /**
   * Batch mode flags. Exactly one of `tfAllOrNothing`, `tfOnlyOne`,
   * `tfUntilFailure`, or `tfIndependent` must be set (XLS-56 §2.1.1).
   */
  Flags?: number | BatchFlagsInterface | undefined;
  /**
   * 2–8 inner transactions to apply. Each must include the
   * `tfInnerBatchTxn` flag, `Fee: "0"`, and `SigningPubKey: ""`.
   */
  RawTransactions: RawTransaction[];
  /**
   * Counterparty signatures for multi-account batches. Optional; if any
   * inner-tx account is not the outer `Account`, the corresponding
   * `BatchSigner` entry is required (XLS-56 §2.1.3).
   */
  BatchSigners?: BatchSigner[] | undefined;
  /** Common base fields — pass-through only. */
  Fee?: string | undefined;
  Sequence?: number | undefined;
}

export interface Batch extends Readonly<BatchProps> {
  readonly TransactionType: 'Batch';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<BatchProps>): Batch;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Count how many of the four batch-mode flags are set in `flags`.
 * Returns 0–4.
 */
function countBatchModeFlags(flags: number): number {
  let count = 0;
  for (const bit of [
    0x00010000,
    0x00020000,
    0x00040000,
    0x00080000,
  ]) {
    if ((flags & bit) === bit) count += 1;
  }
  return count;
}

/**
 * Resolve a possibly-boolean-map `Flags` value to a numeric bitmask.
 * Falls back to 0 when neither form is supplied.
 */
function flagsToNumber(
  flags: number | BatchFlagsInterface | undefined,
): number {
  if (flags === undefined) return 0;
  if (typeof flags === 'number') return flags;
  let n = 0;
  if (flags.tfAllOrNothing) n |= 0x00010000;
  if (flags.tfOnlyOne) n |= 0x00020000;
  if (flags.tfUntilFailure) n |= 0x00040000;
  if (flags.tfIndependent) n |= 0x00080000;
  if (flags.tfInnerBatchTxn) n |= GlobalFlags.tfInnerBatchTxn;
  return n;
}

/**
 * Canonical JSON serialization for inner-tx duplicate detection. Sorts
 * object keys recursively so `{a:1,b:2}` and `{b:2,a:1}` compare equal.
 *
 * Not for use as a wire serializer — only as a hash key.
 */
function stableStringify(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'null';
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return (
      '{' +
      keys
        .map(
          (k) =>
            JSON.stringify(k) +
            ':' +
            stableStringify((value as Record<string, unknown>)[k]),
        )
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(String(value));
}

// ─── Factory ─────────────────────────────────────────────────────────

export function batch(props: BatchProps): Batch {
  // ── Account ── required, valid XRPL address.
  require(props.Account, 'Batch: Account is required', isAccount);

  // ── Outer Flags ── exactly one batch-mode flag must be set.
  //    XLS-56 §2.1.1 ("Exactly one must be specified").
  const outerFlags = flagsToNumber(props.Flags);
  const modeCount = countBatchModeFlags(outerFlags);
  if (modeCount !== 1) {
    throw new ValidationError(
      `Batch: Flags must contain exactly one of tfAllOrNothing, tfOnlyOne, tfUntilFailure, or tfIndependent (found ${modeCount})`,
    );
  }

  // ── RawTransactions ── required, 2–8 entries.
  if (!isArray(props.RawTransactions)) {
    throw new ValidationError(
      'Batch: RawTransactions must be an array',
    );
  }
  if (props.RawTransactions.length < MIN_RAW_TRANSACTIONS) {
    throw new ValidationError(
      `Batch: RawTransactions must contain at least ${MIN_RAW_TRANSACTIONS} transactions (found ${props.RawTransactions.length})`,
    );
  }
  if (props.RawTransactions.length > MAX_RAW_TRANSACTIONS) {
    throw new ValidationError(
      `Batch: RawTransactions must contain at most ${MAX_RAW_TRANSACTIONS} transactions (found ${props.RawTransactions.length})`,
    );
  }

  // ── Each inner transaction: shape + inner-tx invariants.
  const seen = new Set<string>();
  props.RawTransactions.forEach((wrapper, index) => {
    if (!isRecord(wrapper)) {
      throw new ValidationError(
        `Batch: RawTransactions[${index}] is not an object`,
      );
    }
    const inner = wrapper['RawTransaction'];
    if (inner === undefined) {
      throw new ValidationError(
        `Batch: RawTransactions[${index}] is missing the 'RawTransaction' key`,
      );
    }
    if (!isRecord(inner)) {
      throw new ValidationError(
        `Batch: RawTransactions[${index}].RawTransaction is not an object`,
      );
    }

    // No nesting: an inner tx cannot itself be a Batch.
    if (inner['TransactionType'] === 'Batch') {
      throw new ValidationError(
        `Batch: RawTransactions[${index}] is a Batch transaction. Cannot nest Batch transactions.`,
      );
    }

    // tfInnerBatchTxn flag must be set.
    const innerFlags = inner['Flags'];
    if (
      typeof innerFlags !== 'number' ||
      (innerFlags & GlobalFlags.tfInnerBatchTxn) !== GlobalFlags.tfInnerBatchTxn
    ) {
      throw new ValidationError(
        `Batch: RawTransactions[${index}] must contain the tfInnerBatchTxn flag`,
      );
    }

    // Fee must be "0" (or null/undefined, per xrpl.js compatibility).
    const fee = inner['Fee'];
    if (fee !== undefined && fee !== null && fee !== '0') {
      throw new ValidationError(
        `Batch: RawTransactions[${index}].RawTransaction.Fee must be "0" (outer tx pays all fees)`,
      );
    }

    // SigningPubKey must be "" (or null/undefined, per xrpl.js).
    const spk = inner['SigningPubKey'];
    if (spk !== undefined && spk !== null && spk !== '') {
      throw new ValidationError(
        `Batch: RawTransactions[${index}].RawTransaction.SigningPubKey must be ""`,
      );
    }

    // TxnSignature must be absent.
    if (inner['TxnSignature'] !== undefined) {
      throw new ValidationError(
        `Batch: RawTransactions[${index}].RawTransaction.TxnSignature must be absent`,
      );
    }

    // Signers must be absent.
    if (inner['Signers'] !== undefined) {
      throw new ValidationError(
        `Batch: RawTransactions[${index}].RawTransaction.Signers must be absent`,
      );
    }

    // Sequence XOR TicketSequence: exactly one, and Sequence must be
    // non-zero when used (XLS-56 §2.3.2.12 → temSEQ_AND_TICKET).
    const hasSeq = inner['Sequence'] !== undefined;
    const hasTicket = inner['TicketSequence'] !== undefined;
    if (hasSeq && hasTicket) {
      throw new ValidationError(
        `Batch: RawTransactions[${index}].RawTransaction must set either Sequence or TicketSequence, not both`,
      );
    }
    if (!hasSeq && !hasTicket) {
      throw new ValidationError(
        `Batch: RawTransactions[${index}].RawTransaction must set either Sequence or TicketSequence`,
      );
    }
    if (hasSeq) {
      const seq = inner['Sequence'];
      if (
        typeof seq !== 'number' ||
        !Number.isInteger(seq) ||
        seq <= 0
      ) {
        throw new ValidationError(
          `Batch: RawTransactions[${index}].RawTransaction.Sequence must be a positive integer when used`,
        );
      }
    }
    if (hasTicket) {
      const ts = inner['TicketSequence'];
      if (
        typeof ts !== 'number' ||
        !Number.isInteger(ts) ||
        ts <= 0
      ) {
        throw new ValidationError(
          `Batch: RawTransactions[${index}].RawTransaction.TicketSequence must be a positive integer when used`,
        );
      }
    }

    // Duplicate detection (XLS-56 §2.3.2.10 → temREDUNDANT).
    const key = stableStringify(inner);
    if (seen.has(key)) {
      throw new ValidationError(
        `Batch: RawTransactions[${index}] is a duplicate of a previous inner transaction`,
      );
    }
    seen.add(key);
  });

  // ── BatchSigners ── optional; if present, validate fully.
  if (props.BatchSigners !== undefined) {
    if (!isArray(props.BatchSigners)) {
      throw new ValidationError('Batch: BatchSigners must be an array');
    }
    if (props.BatchSigners.length > MAX_BATCH_SIGNERS) {
      throw new ValidationError(
        `Batch: BatchSigners must contain at most ${MAX_BATCH_SIGNERS} entries (found ${props.BatchSigners.length})`,
      );
    }

    const seenAccounts: string[] = [];
    props.BatchSigners.forEach((signerWrapper, index) => {
      if (!isRecord(signerWrapper)) {
        throw new ValidationError(
          `Batch: BatchSigners[${index}] is not an object`,
        );
      }
      const signer = signerWrapper['BatchSigner'];
      if (!isRecord(signer)) {
        throw new ValidationError(
          `Batch: BatchSigners[${index}] is missing the 'BatchSigner' key`,
        );
      }

      // Account required, must be a valid XRPL address.
      const acct = signer['Account'];
      if (!isString(acct) || !isAccount(acct)) {
        throw new ValidationError(
          `Batch: BatchSigners[${index}].BatchSigner.Account is required and must be a valid XRPL account address`,
        );
      }

      // Outer Account may not appear here (XLS-56 §2.3.3.2).
      if (acct === props.Account) {
        throw new ValidationError(
          `Batch: BatchSigners[${index}].BatchSigner.Account must not equal the outer Account (the outer signer is implicit)`,
        );
      }

      // Strictly ascending by Account; no duplicates (XLS-56 §2.1.3).
      for (const prior of seenAccounts) {
        if (prior >= acct) {
          throw new ValidationError(
            `Batch: BatchSigners must be sorted in strictly ascending order by Account (BatchSigners[${index}] out of order)`,
          );
        }
      }
      seenAccounts.push(acct);

      // Single-sign XOR multi-sign exclusivity
      // (XLS-56 §2.1.3: "Either ... or ...").
      const hasSigningPubKey =
        signer['SigningPubKey'] !== undefined &&
        signer['SigningPubKey'] !== null;
      const hasTxnSignature =
        signer['TxnSignature'] !== undefined &&
        signer['TxnSignature'] !== null;
      const hasSigners =
        signer['Signers'] !== undefined &&
        signer['Signers'] !== null;

      // Single-sign requires both SigningPubKey and TxnSignature;
      // multi-sign uses Signers only. Mixing is forbidden.
      if (hasSigningPubKey !== hasTxnSignature) {
        throw new ValidationError(
          `Batch: BatchSigners[${index}].BatchSigner single-sign form requires both SigningPubKey and TxnSignature (or neither — use Signers for multi-sign)`,
        );
      }
      if (hasSigners && (hasSigningPubKey || hasTxnSignature)) {
        throw new ValidationError(
          `Batch: BatchSigners[${index}].BatchSigner cannot mix single-sign fields with Signers`,
        );
      }
      if (!hasSigners && !hasSigningPubKey && !hasTxnSignature) {
        throw new ValidationError(
          `Batch: BatchSigners[${index}].BatchSigner must carry either (SigningPubKey + TxnSignature) or Signers`,
        );
      }

      // Field type checks (mirror xrpl.js models/batch.ts:151-162).
      if (hasSigningPubKey && !isString(signer['SigningPubKey'])) {
        throw new ValidationError(
          `Batch: BatchSigners[${index}].BatchSigner.SigningPubKey must be a string`,
        );
      }
      if (hasTxnSignature && !isString(signer['TxnSignature'])) {
        throw new ValidationError(
          `Batch: BatchSigners[${index}].BatchSigner.TxnSignature must be a string`,
        );
      }
      if (hasSigners && !isArray(signer['Signers'])) {
        throw new ValidationError(
          `Batch: BatchSigners[${index}].BatchSigner.Signers must be an array`,
        );
      }
    });
  }

  return buildFrozenTx<BatchProps, Batch>(
    'Batch',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: Batch) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: Batch, overrides: Partial<BatchProps>) {
        return batch(mergeForWith(this, overrides));
      },
    },
  );
}
