/**
 * Functional OracleSet factory — frozen-object style.
 *
 * Creates a new `PriceOracle` ledger entry or updates an existing one,
 * identified by `(Account, OracleDocumentID)`. Validation happens at
 * construction; there is no way to construct an invalid tx.
 *
 *   import { oracleSet } from 'xrplt/fp';
 *   const tx = oracleSet({
 *     Account,
 *     OracleDocumentID: 34,
 *     LastUpdateTime: 743609014,
 *     Provider: '70726F7669646572',
 *     AssetClass: '63757272656E6379',
 *     PriceDataSeries: [
 *       { PriceData: { BaseAsset: 'XRP', QuoteAsset: 'USD', AssetPrice: 740, Scale: 3 } },
 *     ],
 *   });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ LastUpdateTime: 743700000 });
 *
 * Affected amendment: `PriceOracle` (XLS-47).
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/oracleset
 * @see https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0047-PriceOracles
 *
 * ## Divergences
 *
 * The factory enforces six preclaim guards the class API
 * (`src/transactions/oracle-set.ts`) skips:
 *
 *   1. `PriceDataSeries` array length capped at 10 elements.
 *      Source: XLS-47 §"Transaction for creating or updating PriceOracle
 *      instance" failure conditions — "Transaction's `PriceDataSeries`
 *      array size is empty or exceeds ten when creating a new Oracle
 *      instance or Oracle's instance `PriceDataSeries` array size
 *      exceeds ten after updating". The class only checks
 *      `isArray(PriceDataSeries)` and accepts unbounded lengths.
 *
 *   2. Each `PriceDataSeries` element has exactly one key: `PriceData`.
 *      Source: XLS-47 example JSON wraps the inner object as
 *      `{ "PriceData": { ... } }`. xrpl.js 5.3.0 validateOracleSet()
 *      enforces `Object.keys(priceData).length !== 1`
 *      (`packages/xrpl/src/models/transactions/oracleSet.ts:122`).
 *
 *   3. `AssetPrice` and `Scale` inside `PriceData` must be BOTH present
 *      or BOTH omitted. The class does not check this coupling.
 *      Source: xrpl.js 5.3.0 validateOracleSet() lines 144-151
 *      (`packages/xrpl/src/models/transactions/oracleSet.ts:144`).
 *
 *   4. `Scale` is constrained to `[0, 10]` (integer).
 *      Source: xrpl.js 5.3.0 validateOracleSet() lines 183-187
 *      (`packages/xrpl/src/models/transactions/oracleSet.ts:183`).
 *      Note: XLS-47 README §"Transaction fields" claims valid range
 *      `{1-20}` but xrpl.js enforces `{0-10}` (uint8 internal type,
 *      practical chain limit). The factory follows xrpl.js.
 *
 *   5. `AssetPrice` is validated as either a number OR a hex string
 *      of 1-16 characters. The class accepts `Record<string, unknown>`
 *      for the array element with no inner checks.
 *      Source: xrpl.js 5.3.0 validateOracleSet() lines 155-176
 *      (`packages/xrpl/src/models/transactions/oracleSet.ts:155`).
 *
 *   6. `Provider` / `URI` / `AssetClass` byte limits (256 / 256 / 16)
 *      with hex-encoding and printable-ASCII range checks.
 *      Sources: XLS-47 §"PriceOracle Object" — "`Provider` ... string of
 *      up to 256 ASCII hex encoded characters (0x20-0x7E)"; "`URI` ...
 *      limited to 256 bytes"; "`AssetClass` ... string of up to sixteen
 *      ASCII hex encoded characters (0x20-0x7E)". The class accepts any
 *      string and does not enforce length or character range.
 *
 * ## Field name divergences from the class
 *
 * The class source (`src/transactions/oracle-set.ts`) declares two
 * top-level fields — `AssetBase` and `AssetQuote` — that do NOT exist
 * in either XLS-47 or xrpl.js 5.3.0. The spec/xrpl.js model puts those
 * identifiers INSIDE each `PriceDataSeries[i].PriceData` element, named
 * `BaseAsset` and `QuoteAsset`. The factory follows the spec; it does
 * not surface `AssetBase` / `AssetQuote`. Source: XLS-47 §"PriceOracle
 * Object" → `PriceData` subtable; xrpl.js 5.3.0 OracleSet interface
 * (`packages/xrpl/src/models/transactions/oracleSet.ts:31`).
 *
 * Conversely, the class OMITS `AssetClass`, which is a required-on-
 * create / optional-on-update spec field. The factory includes it.
 * Source: XLS-47 §"Transaction fields for OracleSet" table;
 * "The transaction fails if: ... `AssetClass` field length exceeds 16
 * bytes".
 */
import {
  isArray,
  isHex,
  isNumber,
  isRecord,
  isString,
} from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

/** XLS-47 §"Transaction fields for OracleSet" — "array of up to ten PriceData objects". */
const PRICE_DATA_SERIES_MAX_LENGTH = 10;
/** XLS-47 §"PriceOracle Object" — Provider up to 256 bytes. */
const MAX_PROVIDER_BYTES = 256;
/** XLS-47 §"PriceOracle Object" — URI limited to 256 bytes. */
const MAX_URI_BYTES = 256;
/** XLS-47 §"PriceOracle Object" — AssetClass up to 16 bytes. */
const MAX_ASSET_CLASS_BYTES = 16;
/** XLS-47 §"PriceOracle Object" — printable-ASCII range (0x20..0x7E). */
const PRINTABLE_ASCII_MIN = 0x20;
const PRINTABLE_ASCII_MAX = 0x7e;
/** xrpl.js 5.3.0 validateOracleSet() lines 178-187 — uint8 Scale. */
const SCALE_MIN = 0;
const SCALE_MAX = 10;
/** xrpl.js 5.3.0 validateOracleSet() lines 167-173 — AssetPrice hex length. */
const MINIMUM_ASSET_PRICE_LENGTH = 1;
const MAXIMUM_ASSET_PRICE_LENGTH = 16;
/** UINT32 max (XLS-47 §"Transaction fields" — internal type UINT32). */
const UINT32_MAX = 0xffffffff;

// ─── Public types ────────────────────────────────────────────────────

/**
 * A single `PriceDataSeries` element. Per XLS-47 / xrpl.js 5.3.0,
 * each element wraps the inner object under a `PriceData` key.
 */
export interface PriceData {
  readonly PriceData: {
    readonly BaseAsset: string;
    readonly QuoteAsset: string;
    readonly AssetPrice?: string | number;
    readonly Scale?: number;
  };
}

export interface OracleSetProps {
  /** The XRPL account with create/update/delete privileges on the oracle. */
  Account: string;
  /** Unique identifier of the price oracle for the Account. UINT32. */
  OracleDocumentID: number;
  /** Unix time (seconds) when the data was last updated. UINT32. */
  LastUpdateTime: number;
  /** Up to 10 PriceData objects, each describing a token-pair quote. */
  PriceDataSeries: PriceData[];
  /** Oracle Provider identifier, hex-encoded ASCII (0x20-0x7E), ≤256 bytes. */
  Provider?: string | undefined;
  /** Off-chain URI reference, hex-encoded, ≤256 bytes. */
  URI?: string | undefined;
  /** Asset type, hex-encoded ASCII (0x20-0x7E), ≤16 bytes. */
  AssetClass?: string | undefined;
  /** Bit-flags for this transaction. OracleSet has no defined flags. */
  Flags?: number | undefined;
  Fee?: string | undefined;
  Sequence?: number | undefined;
}

export interface OracleSet extends Readonly<OracleSetProps> {
  readonly TransactionType: 'OracleSet';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<OracleSetProps>): OracleSet;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Validate the "ASCII hex encoded" blob fields per XLS-47 §"PriceOracle
 * Object": hex-encoded string whose decoded bytes are printable ASCII
 * (0x20-0x7E) and whose decoded length is ≤ maxBytes.
 */
function validateAsciiHexBlob(
  field: 'Provider' | 'URI' | 'AssetClass',
  value: unknown,
  maxBytes: number,
): void {
  if (!isString(value) || !isHex(value)) {
    throw new ValidationError(
      `OracleSet: ${field} must be a hex-encoded string`,
    );
  }
  if (value.length % 2 !== 0) {
    throw new ValidationError(
      `OracleSet: ${field} must be a hex string with an even number of characters`,
    );
  }
  const bytes = value.length / 2;
  if (bytes > maxBytes) {
    throw new ValidationError(
      `OracleSet: ${field} exceeds ${maxBytes} bytes (actual: ${bytes})`,
    );
  }
  for (let i = 0; i < value.length; i += 2) {
    const byte = parseInt(value.slice(i, i + 2), 16);
    if (byte < PRINTABLE_ASCII_MIN || byte > PRINTABLE_ASCII_MAX) {
      throw new ValidationError(
        `OracleSet: ${field} must decode to printable ASCII (0x${PRINTABLE_ASCII_MIN.toString(16)}-0x${PRINTABLE_ASCII_MAX.toString(16)})`,
      );
    }
  }
}

/**
 * Validate one `PriceDataSeries` element per XLS-47 and xrpl.js 5.3.0
 * validateOracleSet() (`packages/xrpl/src/models/transactions/oracleSet.ts:91`).
 */
function validatePriceDataSeriesElement(value: unknown, index: number): void {
  if (!isRecord(value)) {
    throw new ValidationError(
      `OracleSet: PriceDataSeries[${index}] must be an object`,
    );
  }
  if (Object.keys(value).length !== 1) {
    throw new ValidationError(
      `OracleSet: PriceDataSeries[${index}] must contain only a single "PriceData" key`,
    );
  }
  const inner = value['PriceData'];
  if (!isRecord(inner)) {
    throw new ValidationError(
      `OracleSet: PriceDataSeries[${index}].PriceData must be an object`,
    );
  }
  if (!isString(inner['BaseAsset'])) {
    throw new ValidationError(
      `OracleSet: PriceDataSeries[${index}].PriceData.BaseAsset must be a string`,
    );
  }
  if (!isString(inner['QuoteAsset'])) {
    throw new ValidationError(
      `OracleSet: PriceDataSeries[${index}].PriceData.QuoteAsset must be a string`,
    );
  }
  // AssetPrice and Scale must be paired (xrpl.js lines 144-151).
  const hasPrice = 'AssetPrice' in inner && inner['AssetPrice'] !== undefined;
  const hasScale = 'Scale' in inner && inner['Scale'] !== undefined;
  if (hasPrice !== hasScale) {
    throw new ValidationError(
      `OracleSet: PriceDataSeries[${index}].PriceData must have both AssetPrice and Scale if any are present`,
    );
  }
  if (hasPrice) {
    const assetPrice = inner['AssetPrice'];
    if (isNumber(assetPrice)) {
      // accept numbers as-is
    } else if (isString(assetPrice)) {
      if (!isHex(assetPrice)) {
        throw new ValidationError(
          `OracleSet: PriceDataSeries[${index}].PriceData.AssetPrice must be a valid hex string when provided as a string`,
        );
      }
      if (
        assetPrice.length < MINIMUM_ASSET_PRICE_LENGTH ||
        assetPrice.length > MAXIMUM_ASSET_PRICE_LENGTH
      ) {
        throw new ValidationError(
          `OracleSet: PriceDataSeries[${index}].PriceData.AssetPrice hex length must be between ${MINIMUM_ASSET_PRICE_LENGTH} and ${MAXIMUM_ASSET_PRICE_LENGTH} characters`,
        );
      }
    } else {
      throw new ValidationError(
        `OracleSet: PriceDataSeries[${index}].PriceData.AssetPrice must be a number or a string`,
      );
    }
  }
  if (hasScale) {
    const scale = inner['Scale'];
    if (
      !isNumber(scale) ||
      !Number.isInteger(scale) ||
      scale < SCALE_MIN ||
      scale > SCALE_MAX
    ) {
      throw new ValidationError(
        `OracleSet: PriceDataSeries[${index}].PriceData.Scale must be an integer in [${SCALE_MIN}, ${SCALE_MAX}]`,
      );
    }
  }
}

// ─── Factory ─────────────────────────────────────────────────────────

export function oracleSet(props: OracleSetProps): OracleSet {
  // ── Account ── required, must be a non-empty string.
  require(props.Account, 'OracleSet: Account is required', isString);
  if (props.Account.length === 0) {
    throw new ValidationError('OracleSet: Account is required');
  }

  // ── OracleDocumentID ── required, positive integer, UINT32.
  if (!isNumber(props.OracleDocumentID) || !Number.isInteger(props.OracleDocumentID)) {
    throw new ValidationError(
      'OracleSet: OracleDocumentID must be an integer',
    );
  }
  if (props.OracleDocumentID < 0 || props.OracleDocumentID > UINT32_MAX) {
    throw new ValidationError(
      `OracleSet: OracleDocumentID must be in [0, ${UINT32_MAX}] (UINT32)`,
    );
  }

  // ── LastUpdateTime ── required, positive integer, UINT32.
  if (!isNumber(props.LastUpdateTime) || !Number.isInteger(props.LastUpdateTime)) {
    throw new ValidationError(
      'OracleSet: LastUpdateTime must be an integer',
    );
  }
  if (props.LastUpdateTime < 0 || props.LastUpdateTime > UINT32_MAX) {
    throw new ValidationError(
      `OracleSet: LastUpdateTime must be in [0, ${UINT32_MAX}] (UINT32)`,
    );
  }

  // ── PriceDataSeries ── required, non-empty (per spec), ≤10 elements.
  if (!isArray(props.PriceDataSeries)) {
    throw new ValidationError(
      'OracleSet: PriceDataSeries is required and must be an array',
    );
  }
  if (props.PriceDataSeries.length === 0) {
    throw new ValidationError(
      'OracleSet: PriceDataSeries must contain at least one PriceData object',
    );
  }
  if (props.PriceDataSeries.length > PRICE_DATA_SERIES_MAX_LENGTH) {
    throw new ValidationError(
      `OracleSet: PriceDataSeries must have at most ${PRICE_DATA_SERIES_MAX_LENGTH} PriceData objects`,
    );
  }
  for (let i = 0; i < props.PriceDataSeries.length; i++) {
    validatePriceDataSeriesElement(props.PriceDataSeries[i], i);
  }

  // ── Provider ── hex-encoded printable ASCII, ≤256 bytes.
  if (props.Provider !== undefined) {
    validateAsciiHexBlob('Provider', props.Provider, MAX_PROVIDER_BYTES);
  }

  // ── URI ── hex-encoded, ≤256 bytes.
  if (props.URI !== undefined) {
    validateAsciiHexBlob('URI', props.URI, MAX_URI_BYTES);
  }

  // ── AssetClass ── hex-encoded printable ASCII, ≤16 bytes.
  if (props.AssetClass !== undefined) {
    validateAsciiHexBlob('AssetClass', props.AssetClass, MAX_ASSET_CLASS_BYTES);
  }

  return buildFrozenTx<OracleSetProps, OracleSet>(
    'OracleSet',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: OracleSet) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: OracleSet, overrides: Partial<OracleSetProps>) {
        return oracleSet(mergeForWith(this, overrides));
      },
    },
  );
}
