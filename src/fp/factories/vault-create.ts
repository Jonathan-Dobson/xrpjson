/**
 * Functional VaultCreate factory — frozen-object style.
 *
 * Creates a single-asset vault on the ledger. The asset can be XRP,
 * a trust line token, or an MPT. Validation happens at construction;
 * there is no way to construct an invalid tx.
 *
 *   import { vaultCreate } from 'xrpjson';
 *   const tx = vaultCreate({ Account, Asset: IOU_ASSET });
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ WithdrawalPolicy: 0x0001 });
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/vaultcreate
 */
import type { Currency } from '../../types/amounts.js';
import type { VaultCreateFlagsInterface } from '../../types/flags.js';
import {
  isCurrency,
  isDomainID,
  isHex,
  isNumber,
  isString,
} from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

const MAX_DATA_BYTES = 256;
const MAX_METADATA_BYTES = 1024;
const MIN_SCALE = 0;
const MAX_SCALE = 18;
const VAULT_KIND_OPEN_ENDED = 0;
const VAULT_KIND_CLOSED_ENDED = 1;
const WITHDRAWAL_POLICY_FCFS = 0x0001;
const MIN_CLOSED_ENDED_GAP_SECONDS = 180;
const MAX_CLOSED_ENDED_GAP_SECONDS = 946708560; // 30 years
const TF_VAULT_PRIVATE = 0x00010000;

// ─── Public types ────────────────────────────────────────────────────

export interface VaultCreateProps {
  Account: string;
  /** The asset held in the vault: XRP, a trust line token, or an MPT. */
  Asset: Currency;
  /** Optional cap on total assets the vault can hold (base-10 number string). */
  AssetsMaximum?: string | undefined;
  /** Optional vault metadata, hex-encoded, 0 < length ≤ 256 bytes. */
  Data?: string | undefined;
  /** Optional Permissioned Domain ID (64-char hex). Requires tfVaultPrivate. */
  DomainID?: string | undefined;
  /** Optional share-metadata, hex-encoded, 0 < length ≤ 1024 bytes. */
  MPTokenMetadata?: string | undefined;
  /** Required when VaultKind = 1 (closed-ended). */
  RedemptionDate?: number | undefined;
  /** Decimal precision for share conversion. Fixed at 0 for XRP/MPT. */
  Scale?: number | undefined;
  /** Required when VaultKind = 1 (closed-ended). */
  SubscriptionDate?: number | undefined;
  /** 0 = open-ended (default); 1 = closed-ended. */
  VaultKind?: number | undefined;
  /** Withdrawal strategy. Currently only 0x0001 (FCFS) is supported. */
  WithdrawalPolicy?: number | undefined;
  /** Bit-flags for this transaction. */
  Flags?: number | VaultCreateFlagsInterface | undefined;
  Fee?: string | undefined;
  Sequence?: number | undefined;
}

export interface VaultCreate
  extends Readonly<VaultCreateProps> {
  readonly TransactionType: 'VaultCreate';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<VaultCreateProps>): VaultCreate;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function vaultCreate(props: VaultCreateProps): VaultCreate {
  // ── Account ── required, must be a valid XRPL classic address.
  require(props.Account, 'VaultCreate: Account is required', isString);

  // ── Asset ── required, must be a valid Currency.
  if (!isCurrency(props.Asset)) {
    throw new ValidationError(
      'VaultCreate: Asset must be a valid Currency (XRP, trust line, or MPT form)',
    );
  }

  // ── Data ── hex, even length, ≤ 256 bytes.
  if (props.Data !== undefined) {
    if (!isString(props.Data) || !isHex(props.Data)) {
      throw new ValidationError('VaultCreate: Data must be a hex string');
    }
    if (props.Data.length % 2 !== 0) {
      throw new ValidationError(
        'VaultCreate: Data must be a hex string with an even number of characters',
      );
    }
    const bytes = props.Data.length / 2;
    if (bytes > MAX_DATA_BYTES) {
      throw new ValidationError(
        `VaultCreate: Data exceeds ${MAX_DATA_BYTES} bytes (actual: ${bytes})`,
      );
    }
  }

  // ── MPTokenMetadata ── hex, non-empty, ≤ 1024 bytes.
  if (props.MPTokenMetadata !== undefined) {
    if (!isString(props.MPTokenMetadata) || !isHex(props.MPTokenMetadata)) {
      throw new ValidationError(
        'VaultCreate: MPTokenMetadata must be a valid non-empty hex string',
      );
    }
    const bytes = props.MPTokenMetadata.length / 2;
    if (bytes > MAX_METADATA_BYTES) {
      throw new ValidationError(
        `VaultCreate: MPTokenMetadata exceeds ${MAX_METADATA_BYTES} bytes (actual: ${bytes})`,
      );
    }
  }

  // ── WithdrawalPolicy ── currently only 0x0001 supported.
  if (props.WithdrawalPolicy !== undefined) {
    if (
      !isNumber(props.WithdrawalPolicy) ||
      props.WithdrawalPolicy !== WITHDRAWAL_POLICY_FCFS
    ) {
      throw new ValidationError(
        `VaultCreate: WithdrawalPolicy must be 0x${WITHDRAWAL_POLICY_FCFS.toString(16).padStart(4, '0')} (vaultStrategyFirstComeFirstServe)`,
      );
    }
  }

  // ── AssetsMaximum ── non-negative base-10 integer string.
  if (props.AssetsMaximum !== undefined) {
    if (
      !isString(props.AssetsMaximum) ||
      !/^[0-9]+$/u.test(props.AssetsMaximum)
    ) {
      throw new ValidationError(
        'VaultCreate: AssetsMaximum must be a non-negative base-10 integer string',
      );
    }
  }

  // ── VaultKind ── 0 or 1 only.
  if (props.VaultKind !== undefined) {
    if (
      !isNumber(props.VaultKind) ||
      (props.VaultKind !== VAULT_KIND_OPEN_ENDED &&
        props.VaultKind !== VAULT_KIND_CLOSED_ENDED)
    ) {
      throw new ValidationError(
        `VaultCreate: VaultKind must be ${VAULT_KIND_OPEN_ENDED} (open-ended) or ${VAULT_KIND_CLOSED_ENDED} (closed-ended)`,
      );
    }
  }

  // ── Scale ── conditional on Asset type + range.
  if (props.Scale !== undefined) {
    if (
      !isNumber(props.Scale) ||
      props.Scale < MIN_SCALE ||
      props.Scale > MAX_SCALE ||
      !Number.isInteger(props.Scale)
    ) {
      throw new ValidationError(
        `VaultCreate: Scale must be an integer in [${MIN_SCALE}, ${MAX_SCALE}]`,
      );
    }
    if ('currency' in props.Asset && props.Asset.currency === 'XRP') {
      throw new ValidationError(
        'VaultCreate: Scale parameter must not be provided for XRP or MPT assets',
      );
    } else if ('mpt_issuance_id' in props.Asset) {
      throw new ValidationError(
        'VaultCreate: Scale parameter must not be provided for XRP or MPT assets',
      );
    }
  }

  // ── Closed-ended vault date invariants ──
  const hasSub = props.SubscriptionDate !== undefined;
  const hasRed = props.RedemptionDate !== undefined;
  const isClosedEnded =
    props.VaultKind === VAULT_KIND_CLOSED_ENDED ||
    (props.VaultKind === undefined && (hasSub || hasRed));

  if (props.VaultKind === VAULT_KIND_CLOSED_ENDED) {
    if (!hasSub || !hasRed) {
      throw new ValidationError(
        'VaultCreate: VaultKind=1 (closed-ended) requires both SubscriptionDate and RedemptionDate',
      );
    }
  } else if (props.VaultKind === VAULT_KIND_OPEN_ENDED) {
    if (hasSub || hasRed) {
      throw new ValidationError(
        'VaultCreate: VaultKind=0 (open-ended) must not include SubscriptionDate or RedemptionDate',
      );
    }
  }

  if (isClosedEnded && hasSub && hasRed) {
    if (
      !isNumber(props.SubscriptionDate) ||
      !isNumber(props.RedemptionDate) ||
      props.SubscriptionDate <= 0 ||
      props.RedemptionDate <= 0
    ) {
      throw new ValidationError(
        'VaultCreate: SubscriptionDate and RedemptionDate must be positive integers (seconds since Ripple Epoch)',
      );
    }
    const gap = props.RedemptionDate - props.SubscriptionDate;
    if (
      gap < MIN_CLOSED_ENDED_GAP_SECONDS ||
      gap >= MAX_CLOSED_ENDED_GAP_SECONDS
    ) {
      throw new ValidationError(
        `VaultCreate: RedemptionDate - SubscriptionDate must be in [${MIN_CLOSED_ENDED_GAP_SECONDS}, ${MAX_CLOSED_ENDED_GAP_SECONDS}) seconds`,
      );
    }
  }

  // ── DomainID ── 64-char hex AND requires tfVaultPrivate flag.
  if (props.DomainID !== undefined) {
    if (!isDomainID(props.DomainID)) {
      throw new ValidationError(
        'VaultCreate: DomainID must be a 64-character hex string',
      );
    }
    const flags = props.Flags as number | undefined;
    if (!flags || (flags & TF_VAULT_PRIVATE) !== TF_VAULT_PRIVATE) {
      throw new ValidationError(
        'VaultCreate: Cannot set DomainID unless tfVaultPrivate flag is set',
      );
    }
  }

  return buildFrozenTx<VaultCreateProps, VaultCreate>(
    'VaultCreate',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: VaultCreate) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: VaultCreate, overrides: Partial<VaultCreateProps>) {
        return vaultCreate(mergeForWith(this, overrides));
      },
    },
  );
}