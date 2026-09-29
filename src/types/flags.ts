/**
 * Flag enums and interfaces for all XRPL transaction types.
 *
 * Each transaction type that supports flags gets:
 * 1. A numeric enum for bitwise flag values
 * 2. A boolean-map interface for developer-friendly usage
 */

// ─── Global ──────────────────────────────────────────────────────────

export enum GlobalFlags {
  tfInnerBatchTxn = 0x40000000,
}

export interface GlobalFlagsInterface {
  tfInnerBatchTxn?: boolean;
}

// ─── Payment ─────────────────────────────────────────────────────────

export enum PaymentFlags {
  tfNoRippleDirect = 0x00010000,
  tfPartialPayment = 0x00020000,
  tfLimitQuality = 0x00040000,
}

export interface PaymentFlagsInterface extends GlobalFlagsInterface {
  tfNoRippleDirect?: boolean;
  tfPartialPayment?: boolean;
  tfLimitQuality?: boolean;
}

// ─── AccountSet ──────────────────────────────────────────────────────

export enum AccountSetAsfFlags {
  asfRequireDest = 1,
  asfRequireAuth = 2,
  asfDisallowXRP = 3,
  asfDisableMaster = 4,
  asfAccountTxnID = 5,
  asfNoFreeze = 6,
  asfGlobalFreeze = 7,
  asfDefaultRipple = 8,
  asfDepositAuth = 9,
  asfAuthorizedNFTokenMinter = 10,
  asfDisallowIncomingNFTokenOffer = 12,
  asfDisallowIncomingCheck = 13,
  asfDisallowIncomingPayChan = 14,
  asfDisallowIncomingTrustline = 15,
  asfAllowTrustLineClawback = 16,
  asfAllowTrustLineLocking = 17,
}

export enum AccountSetTfFlags {
  tfRequireDestTag = 0x00010000,
  tfOptionalDestTag = 0x00020000,
  tfRequireAuth = 0x00040000,
  tfOptionalAuth = 0x00080000,
  tfDisallowXRP = 0x00100000,
  tfAllowXRP = 0x00200000,
}

export interface AccountSetFlagsInterface extends GlobalFlagsInterface {
  tfRequireDestTag?: boolean;
  tfOptionalDestTag?: boolean;
  tfRequireAuth?: boolean;
  tfOptionalAuth?: boolean;
  tfDisallowXRP?: boolean;
  tfAllowXRP?: boolean;
}

// ─── TrustSet ────────────────────────────────────────────────────────

export enum TrustSetFlags {
  tfSetfAuth = 0x00010000,
  tfSetNoRipple = 0x00020000,
  tfClearNoRipple = 0x00040000,
  tfSetFreeze = 0x00100000,
  tfClearFreeze = 0x00200000,
  tfSetDeepFreeze = 0x00400000,
  tfClearDeepFreeze = 0x00800000,
}

export interface TrustSetFlagsInterface extends GlobalFlagsInterface {
  tfSetfAuth?: boolean;
  tfSetNoRipple?: boolean;
  tfClearNoRipple?: boolean;
  tfSetFreeze?: boolean;
  tfClearFreeze?: boolean;
  tfSetDeepFreeze?: boolean;
  tfClearDeepFreeze?: boolean;
}

// ─── OfferCreate ─────────────────────────────────────────────────────

export enum OfferCreateFlags {
  tfPassive = 0x00010000,
  tfImmediateOrCancel = 0x00020000,
  tfFillOrKill = 0x00040000,
  tfSell = 0x00080000,
  tfHybrid = 0x00100000,
}

export interface OfferCreateFlagsInterface extends GlobalFlagsInterface {
  tfPassive?: boolean;
  tfImmediateOrCancel?: boolean;
  tfFillOrKill?: boolean;
  tfSell?: boolean;
  tfHybrid?: boolean;
}

// ─── NFTokenMint ─────────────────────────────────────────────────────

export enum NFTokenMintFlags {
  tfBurnable = 0x00000001,
  tfOnlyXRP = 0x00000002,
  tfTrustLine = 0x00000004,
  tfTransferable = 0x00000008,
  /**
   * If set, indicates that this NFT's URI can be modified via a future
   * `NFTokenModify` transaction. Driven by the `DynamicNFT` amendment.
   */
  tfMutable = 0x00000010,
}

export interface NFTokenMintFlagsInterface extends GlobalFlagsInterface {
  tfBurnable?: boolean;
  tfOnlyXRP?: boolean;
  tfTrustLine?: boolean;
  tfTransferable?: boolean;
  tfMutable?: boolean;
}

// ─── NFTokenCreateOffer ──────────────────────────────────────────────

export enum NFTokenCreateOfferFlags {
  tfSellNFToken = 0x00000001,
}

export interface NFTokenCreateOfferFlagsInterface extends GlobalFlagsInterface {
  tfSellNFToken?: boolean;
}

// ─── PaymentChannelClaim ─────────────────────────────────────────────

export enum PaymentChannelClaimFlags {
  tfRenew = 0x00010000,
  tfClose = 0x00020000,
}

export interface PaymentChannelClaimFlagsInterface extends GlobalFlagsInterface {
  tfRenew?: boolean;
  tfClose?: boolean;
}

// ─── AMMDeposit ──────────────────────────────────────────────────────

export enum AMMDepositFlags {
  tfLPToken = 0x00010000,
  tfSingleAsset = 0x00080000,
  tfTwoAsset = 0x00100000,
  tfOneAssetLPToken = 0x00200000,
  tfLimitLPToken = 0x00400000,
  tfTwoAssetIfEmpty = 0x00800000,
}

export interface AMMDepositFlagsInterface extends GlobalFlagsInterface {
  tfLPToken?: boolean;
  tfSingleAsset?: boolean;
  tfTwoAsset?: boolean;
  tfOneAssetLPToken?: boolean;
  tfLimitLPToken?: boolean;
  tfTwoAssetIfEmpty?: boolean;
}

// ─── AMMWithdraw ─────────────────────────────────────────────────────

export enum AMMWithdrawFlags {
  tfLPToken = 0x00010000,
  tfWithdrawAll = 0x00020000,
  tfOneAssetWithdrawAll = 0x00040000,
  tfSingleAsset = 0x00080000,
  tfTwoAsset = 0x00100000,
  tfOneAssetLPToken = 0x00200000,
  tfLimitLPToken = 0x00400000,
}

export interface AMMWithdrawFlagsInterface extends GlobalFlagsInterface {
  tfLPToken?: boolean;
  tfWithdrawAll?: boolean;
  tfOneAssetWithdrawAll?: boolean;
  tfSingleAsset?: boolean;
  tfTwoAsset?: boolean;
  tfOneAssetLPToken?: boolean;
  tfLimitLPToken?: boolean;
}

// ─── MPTokenAuthorize ────────────────────────────────────────────────

export enum MPTokenAuthorizeFlags {
  tfMPTUnauthorize = 0x00000001,
}

export interface MPTokenAuthorizeFlagsInterface extends GlobalFlagsInterface {
  tfMPTUnauthorize?: boolean;
}

// ─── MPTokenIssuanceCreate ───────────────────────────────────────────
// Capable-setting flags (set at issuance; once set, most cannot be disabled).
// Required by the MPTokenIssuanceCreate spec; driven by the
// `MPTokensV1` amendment (capable flags) plus `ConfidentialTransfer`
// (tfMPTCanHoldConfidentialBalance).

export enum MPTokenIssuanceCreateFlags {
  tfMPTCanLock = 0x00000002,
  tfMPTRequireAuth = 0x00000004,
  tfMPTCanEscrow = 0x00000008,
  tfMPTCanTrade = 0x00000010,
  tfMPTCanTransfer = 0x00000020,
  tfMPTCanClawback = 0x00000040,
  tfMPTCanHoldConfidentialBalance = 0x00000080,
}

export interface MPTokenIssuanceCreateFlagsInterface
  extends GlobalFlagsInterface {
  tfMPTCanLock?: boolean;
  tfMPTRequireAuth?: boolean;
  tfMPTCanEscrow?: boolean;
  tfMPTCanTrade?: boolean;
  tfMPTCanTransfer?: boolean;
  tfMPTCanClawback?: boolean;
  tfMPTCanHoldConfidentialBalance?: boolean;
}

// ─── MPTokenIssuanceSet ──────────────────────────────────────────────
// Capable-setting flags + lock/unlock. Spec'd in
// `MPTokenIssuanceSet.md` and gated by `MPTokensV1`,
// `DynamicMPT` (capable flags + immutable flags), and
// `ConfidentialTransfer` (tfMPTCanHoldConfidentialBalance).

export enum MPTokenIssuanceSetFlags {
  tfMPTLock = 0x00000001,
  tfMPTUnlock = 0x00000002,
  tfMPTSetCanLock = 0x00000004,
  tfMPTSetRequireAuth = 0x00000008,
  tfMPTSetCanEscrow = 0x00000010,
  tfMPTSetCanTrade = 0x00000020,
  tfMPTSetCanTransfer = 0x00000040,
  tfMPTSetCanClawback = 0x00000080,
  tfMPTSetCanHoldConfidentialBalance = 0x00000100,
}

export interface MPTokenIssuanceSetFlagsInterface
  extends GlobalFlagsInterface {
  tfMPTLock?: boolean;
  tfMPTUnlock?: boolean;
  tfMPTSetCanLock?: boolean;
  tfMPTSetRequireAuth?: boolean;
  tfMPTSetCanEscrow?: boolean;
  tfMPTSetCanTrade?: boolean;
  tfMPTSetCanTransfer?: boolean;
  tfMPTSetCanClawback?: boolean;
  tfMPTSetCanHoldConfidentialBalance?: boolean;
}

// ─── MPTokenIssuance immutable flags ────────────────────────────────
// Used on both MPTokenIssuanceCreate and MPTokenIssuanceSet to declare
// which fields/capabilities become permanent. Driven by the `DynamicMPT`
// amendment (XLS-94).

export enum MPTokenImmutableFlags {
  tifMPTCanLock = 0x00000002,
  tifMPTRequireAuth = 0x00000004,
  tifMPTCanEscrow = 0x00000008,
  tifMPTCanTrade = 0x00000010,
  tifMPTCanTransfer = 0x00000020,
  tifMPTCanClawback = 0x00000040,
  tifMPTCanHoldConfidentialBalance = 0x00000080,
  tifMPTMetadata = 0x00010000,
  tifMPTTransferFee = 0x00020000,
}

export interface MPTokenImmutableFlagsInterface {
  tifMPTCanLock?: boolean;
  tifMPTRequireAuth?: boolean;
  tifMPTCanEscrow?: boolean;
  tifMPTCanTrade?: boolean;
  tifMPTCanTransfer?: boolean;
  tifMPTCanClawback?: boolean;
  tifMPTCanHoldConfidentialBalance?: boolean;
  tifMPTMetadata?: boolean;
  tifMPTTransferFee?: boolean;
}

// ─── VaultCreate ─────────────────────────────────────────────────────
// Flags for the VaultCreate transaction. Both flags can ONLY be set at
// vault-creation time — they're immutable thereafter. Driven by the
// `SingleAssetVault` amendment.

export enum VaultCreateFlags {
  tfVaultPrivate = 0x00010000,
  tfVaultShareNonTransferable = 0x00020000,
}

export interface VaultCreateFlagsInterface extends GlobalFlagsInterface {
  tfVaultPrivate?: boolean;
  tfVaultShareNonTransferable?: boolean;
}

// ─── Vault enums ──────────────────────────────────────────────────────
// Driven by the `SingleAssetVault` + `LendingProtocolV1_1` amendments.
// Numeric values are mirrored from the upstream xrpl.js reference impl.

/** Withdrawal strategies for a Vault. Currently only FCFS is supported. */
export enum VaultWithdrawalPolicy {
  vaultStrategyFirstComeFirstServe = 0x0001,
}

/** Vault lifecycle kind (LendingProtocolV1_1). */
export enum VaultKind {
  /** Open-ended: shares can be redeemed at any time. */
  vaultKindOpen = 0,
  /** Closed-ended: lifecycle bounded by SubscriptionDate/RedemptionDate. */
  vaultKindClosed = 1,
}

// ─── LoanSet ──────────────────────────────────────────────────────────
// Driven by the `LendingProtocol` amendment. The lone flag indicates
// support for overpayments on the resulting loan.

export enum LoanSetFlags {
  tfLoanOverpayment = 0x00010000,
}

export interface LoanSetFlagsInterface extends GlobalFlagsInterface {
  tfLoanOverpayment?: boolean;
}

// ─── LoanPay ──────────────────────────────────────────────────────────
// Driven by the `LendingProtocol` amendment. Three mutually-exclusive
// payment-type flags: at most one can be set per transaction.

export enum LoanPayFlags {
  tfLoanOverpayment = 0x00010000,
  tfLoanFullPayment = 0x00020000,
  tfLoanLatePayment = 0x00040000,
}

export interface LoanPayFlagsInterface extends GlobalFlagsInterface {
  tfLoanOverpayment?: boolean;
  tfLoanFullPayment?: boolean;
  tfLoanLatePayment?: boolean;
}

// ─── LoanManage ──────────────────────────────────────────────────────
// Driven by the `LendingProtocol` amendment. Three action flags. Note
// that tfLoanImpair and tfLoanUnimpair are mutually exclusive.

export enum LoanManageFlags {
  tfLoanDefault = 0x00010000,
  tfLoanImpair = 0x00020000,
  tfLoanUnimpair = 0x00040000,
}

export interface LoanManageFlagsInterface extends GlobalFlagsInterface {
  tfLoanDefault?: boolean;
  tfLoanImpair?: boolean;
  tfLoanUnimpair?: boolean;
}

// ─── Batch ────────────────────────────────────────────────────────────
// Driven by the `BatchV1_1` amendment. Four mutually-exclusive batch modes.
// Per the spec, exactly one of these flags must be set per Batch tx.

export enum BatchFlags {
  tfAllOrNothing = 0x00010000,
  tfOnlyOne = 0x00020000,
  tfUntilFailure = 0x00040000,
  tfIndependent = 0x00080000,
}

export interface BatchFlagsInterface extends GlobalFlagsInterface {
  tfAllOrNothing?: boolean;
  tfOnlyOne?: boolean;
  tfUntilFailure?: boolean;
  tfIndependent?: boolean;
}

// ─── Clawback ────────────────────────────────────────────────────────

export enum ClawbackFlags {
  tfClawTwoAssets = 0x00000001,
}

export interface ClawbackFlagsInterface extends GlobalFlagsInterface {
  tfClawTwoAssets?: boolean;
}

// ─── XChainModifyBridge ──────────────────────────────────────────────

export enum XChainModifyBridgeFlags {
  tfClearAccountCreateAmount = 0x00010000,
}

export interface XChainModifyBridgeFlagsInterface extends GlobalFlagsInterface {
  tfClearAccountCreateAmount?: boolean;
}

// ─── SponsorshipSet ─────────────────────────────────────────────────

export enum SponsorshipSetFlags {
  tfSponsorshipSetRequireSignForFee = 0x00010000,
  tfSponsorshipClearRequireSignForFee = 0x00020000,
  tfSponsorshipSetRequireSignForReserve = 0x00040000,
  tfSponsorshipClearRequireSignForReserve = 0x00080000,
  tfDeleteObject = 0x00100000,
}

export interface SponsorshipSetFlagsInterface extends GlobalFlagsInterface {
  tfSponsorshipSetRequireSignForFee?: boolean;
  tfSponsorshipClearRequireSignForFee?: boolean;
  tfSponsorshipSetRequireSignForReserve?: boolean;
  tfSponsorshipClearRequireSignForReserve?: boolean;
  tfDeleteObject?: boolean;
}

// ─── SponsorshipTransfer ────────────────────────────────────────────

export enum SponsorshipTransferFlags {
  tfSponsorshipEnd = 0x00010000,
  tfSponsorshipCreate = 0x00020000,
  tfSponsorshipReassign = 0x00040000,
}

export interface SponsorshipTransferFlagsInterface extends GlobalFlagsInterface {
  tfSponsorshipEnd?: boolean;
  tfSponsorshipCreate?: boolean;
  tfSponsorshipReassign?: boolean;
}
