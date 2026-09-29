/**
 * Public entry point for the functional transaction API.
 *
 * Usage:
 *   import { payment, accountSet } from 'xrplt/fp';
 *
 * Why a separate entry point:
 *   - Tree-shaking: a consumer that only imports `payment` should pull
 *     in ONLY the Payment factory code, not the AMM/Vault/Loan code.
 *   - Coexistence: the class-based API at `xrplt` keeps shipping for
 *     v0.4.x; users can opt in to the fp style independently.
 *   - Testability: the fp tests live under `tests/fp/` and verify the
 *     frozen-shape contract independently of the class tests.
 *
 * Family grouping (alphabetical within family):
 *   - Account         (AccountDelete, AccountSet)
 *   - AMM             (7 — XLS-0030)
 *   - Batch           (Batch — BatchV1_1)
 *   - Check           (CheckCancel, CheckCash, CheckCreate)
 *   - Clawback        (Clawback)
 *   - ConfidentialMPT (5 — ConfidentialTransfer amendment)
 *   - Credential      (CredentialAccept, CredentialCreate, CredentialDelete — XLS-0070)
 *   - Delegate        (DelegateSet — XLS-0085d)
 *   - DepositPreauth  (DepositPreauth — XLS-0070 4-way field rule)
 *   - DID             (DIDDelete, DIDSet — XLS-0040)
 *   - Escrow          (EscrowCancel, EscrowCreate, EscrowFinish)
 *   - LedgerStateFix  (LedgerStateFix)
 *   - Loan            (LoanDelete, LoanManage, LoanPay, LoanSet)
 *   - LoanBroker      (5 — LendingProtocol amendment)
 *   - MPT             (4 — XLS-0033)
 *   - NFToken         (6 — XLS-0020)
 *   - Offer           (OfferCancel, OfferCreate)
 *   - Oracle          (OracleDelete, OracleSet)
 *   - Payment         (Payment)
 *   - PaymentChannel  (3)
 *   - PermissionedDom (PermissionedDomainDelete, PermissionedDomainSet)
 *   - SetRegularKey   (SetRegularKey)
 *   - SignerListSet   (SignerListSet)
 *   - Sponsorship     (SponsorshipSet, SponsorshipTransfer — Sponsor amendment)
 *   - TicketCreate    (TicketCreate)
 *   - TrustSet        (TrustSet)
 *   - Vault           (6 — SingleAssetVault amendment)
 *   - XChain          (8 — XLS-0038d Sidechain amendment)
 */

// ============================================================ // Account family
export {
  accountDelete,
  type AccountDelete,
  type AccountDeleteProps,
} from './factories/account-delete.js';
export {
  accountSet,
  type AccountSet,
  type AccountSetProps,
} from './factories/account-set.js';

// ============================================================ // AMM family (XLS-0030)
export {
  ammBid,
  type AmmBid,
  type AmmBidProps,
} from './factories/amm-bid.js';
export {
  ammClawback,
  type AmmClawback,
  type AmmClawbackProps,
} from './factories/amm-clawback.js';
export {
  ammCreate,
  type AmmCreate,
  type AmmCreateProps,
} from './factories/amm-create.js';
export {
  ammDelete,
  type AmmDelete,
  type AmmDeleteProps,
} from './factories/amm-delete.js';
export {
  ammDeposit,
  type AmmDeposit,
  type AmmDepositProps,
} from './factories/amm-deposit.js';
export {
  ammVote,
  type AmmVote,
  type AmmVoteProps,
} from './factories/amm-vote.js';
export {
  ammWithdraw,
  type AmmWithdraw,
  type AmmWithdrawProps,
} from './factories/amm-withdraw.js';

// ============================================================ // Batch (BatchV1_1)
export {
  batch,
  type Batch,
  type BatchProps,
} from './factories/batch.js';

// ============================================================ // Check family
export {
  checkCancel,
  type CheckCancel,
  type CheckCancelProps,
} from './factories/check-cancel.js';
export {
  checkCash,
  type CheckCash,
  type CheckCashProps,
} from './factories/check-cash.js';
export {
  checkCreate,
  type CheckCreate,
  type CheckCreateProps,
} from './factories/check-create.js';

// ============================================================ // Clawback
export {
  clawback,
  type Clawback,
  type ClawbackProps,
} from './factories/clawback.js';

// ============================================================ // ConfidentialMPT family (ConfidentialTransfer amendment)
export {
  confidentialMptClawback,
  type ConfidentialMptClawback,
  type ConfidentialMptClawbackProps,
} from './factories/confidential-mpt-clawback.js';
export {
  confidentialMptConvert,
  type ConfidentialMptConvert,
  type ConfidentialMptConvertProps,
} from './factories/confidential-mpt-convert.js';
export {
  confidentialMptConvertBack,
  type ConfidentialMptConvertBack,
  type ConfidentialMptConvertBackProps,
} from './factories/confidential-mpt-convert-back.js';
export {
  confidentialMptMergeInbox,
  type ConfidentialMptMergeInbox,
  type ConfidentialMptMergeInboxProps,
} from './factories/confidential-mpt-merge-inbox.js';
export {
  confidentialMptSend,
  type ConfidentialMptSend,
  type ConfidentialMptSendProps,
} from './factories/confidential-mpt-send.js';

// ============================================================ // Credential family (XLS-0070)
export {
  credentialAccept,
  type CredentialAccept,
  type CredentialAcceptProps,
} from './factories/credential-accept.js';
export {
  credentialCreate,
  type CredentialCreate,
  type CredentialCreateProps,
} from './factories/credential-create.js';
export {
  credentialDelete,
  type CredentialDelete,
  type CredentialDeleteProps,
} from './factories/credential-delete.js';

// ============================================================ // Delegate family (XLS-0085d)
export {
  delegateSet,
  type DelegateSet,
  type DelegateSetProps,
} from './factories/delegate-set.js';

// ============================================================ // DepositPreauth (XLS-0070 4-way field rule)
export {
  depositPreauth,
  type DepositPreauth,
  type DepositPreauthProps,
} from './factories/deposit-preauth.js';

// ============================================================ // DID family (XLS-0040)
export {
  didDelete,
  type DIDDelete,
  type DIDDeleteProps,
} from './factories/did-delete.js';
export {
  didSet,
  type DIDSet,
  type DIDSetProps,
} from './factories/did-set.js';

// ============================================================ // Escrow family
export {
  escrowCancel,
  type EscrowCancel,
  type EscrowCancelProps,
} from './factories/escrow-cancel.js';
export {
  escrowCreate,
  type EscrowCreate,
  type EscrowCreateProps,
} from './factories/escrow-create.js';
export {
  escrowFinish,
  type EscrowFinish,
  type EscrowFinishProps,
} from './factories/escrow-finish.js';

// ============================================================ // LedgerStateFix
export {
  ledgerStateFix,
  type LedgerStateFix,
  type LedgerStateFixProps,
} from './factories/ledger-state-fix.js';

// ============================================================ // Loan family
export {
  loanDelete,
  type LoanDelete,
  type LoanDeleteProps,
} from './factories/loan-delete.js';
export {
  loanManage,
  type LoanManage,
  type LoanManageProps,
} from './factories/loan-manage.js';
export {
  loanPay,
  type LoanPay,
  type LoanPayProps,
} from './factories/loan-pay.js';
export {
  loanSet,
  type LoanSet,
  type LoanSetProps,
} from './factories/loan-set.js';

// ============================================================ // LoanBroker family (LendingProtocol amendment)
export {
  loanBrokerCoverClawback,
  type LoanBrokerCoverClawback,
  type LoanBrokerCoverClawbackProps,
} from './factories/loan-broker-cover-clawback.js';
export {
  loanBrokerCoverDeposit,
  type LoanBrokerCoverDeposit,
  type LoanBrokerCoverDepositProps,
} from './factories/loan-broker-cover-deposit.js';
export {
  loanBrokerCoverWithdraw,
  type LoanBrokerCoverWithdraw,
  type LoanBrokerCoverWithdrawProps,
} from './factories/loan-broker-cover-withdraw.js';
export {
  loanBrokerDelete,
  type LoanBrokerDelete,
  type LoanBrokerDeleteProps,
} from './factories/loan-broker-delete.js';
export {
  loanBrokerSet,
  type LoanBrokerSet,
  type LoanBrokerSetProps,
} from './factories/loan-broker-set.js';

// ============================================================ // MPT family (XLS-0033)
export {
  mptokenAuthorize,
  type MptokenAuthorize,
  type MptokenAuthorizeProps,
} from './factories/mptoken-authorize.js';
export {
  mptokenIssuanceCreate,
  type MptokenIssuanceCreate,
  type MptokenIssuanceCreateProps,
} from './factories/mptoken-issuance-create.js';
export {
  mptokenIssuanceDestroy,
  type MptokenIssuanceDestroy,
  type MptokenIssuanceDestroyProps,
} from './factories/mptoken-issuance-destroy.js';
export {
  mptokenIssuanceSet,
  type MptokenIssuanceSet,
  type MptokenIssuanceSetProps,
} from './factories/mptoken-issuance-set.js';

// ============================================================ // NFToken family (XLS-0020)
export {
  nftokenAcceptOffer,
  type NftokenAcceptOffer,
  type NftokenAcceptOfferProps,
} from './factories/nftoken-accept-offer.js';
export {
  nftokenBurn,
  type NftokenBurn,
  type NftokenBurnProps,
} from './factories/nftoken-burn.js';
export {
  nftokenCancelOffer,
  type NftokenCancelOffer,
  type NftokenCancelOfferProps,
} from './factories/nftoken-cancel-offer.js';
export {
  nftokenCreateOffer,
  type NftokenCreateOffer,
  type NftokenCreateOfferProps,
} from './factories/nftoken-create-offer.js';
export {
  nftokenMint,
  type NftokenMint,
  type NftokenMintProps,
} from './factories/nftoken-mint.js';
export {
  nftokenModify,
  type NftokenModify,
  type NftokenModifyProps,
} from './factories/nftoken-modify.js';

// ============================================================ // Offer family
export {
  offerCancel,
  type OfferCancel,
  type OfferCancelProps,
} from './factories/offer-cancel.js';
export {
  offerCreate,
  type OfferCreate,
  type OfferCreateProps,
} from './factories/offer-create.js';

// ============================================================ // Oracle family
export {
  oracleDelete,
  type OracleDelete,
  type OracleDeleteProps,
} from './factories/oracle-delete.js';
export {
  oracleSet,
  type OracleSet,
  type OracleSetProps,
} from './factories/oracle-set.js';

// ============================================================ // Payment
export {
  payment,
  type Payment,
  type PaymentProps,
} from './factories/payment.js';

// ============================================================ // PaymentChannel family
export {
  paymentChannelClaim,
  type PaymentChannelClaim,
  type PaymentChannelClaimProps,
} from './factories/payment-channel-claim.js';
export {
  paymentChannelCreate,
  type PaymentChannelCreate,
  type PaymentChannelCreateProps,
} from './factories/payment-channel-create.js';
export {
  paymentChannelFund,
  type PaymentChannelFund,
  type PaymentChannelFundProps,
} from './factories/payment-channel-fund.js';

// ============================================================ // PermissionedDomain family
export {
  permissionedDomainDelete,
  type PermissionedDomainDelete,
  type PermissionedDomainDeleteProps,
} from './factories/permissioned-domain-delete.js';
export {
  permissionedDomainSet,
  type PermissionedDomainSet,
  type PermissionedDomainSetProps,
} from './factories/permissioned-domain-set.js';

// ============================================================ // SetRegularKey
export {
  setRegularKey,
  type SetRegularKey,
  type SetRegularKeyProps,
} from './factories/set-regular-key.js';

// ============================================================ // SignerListSet
export {
  signerListSet,
  type SignerListSet,
  type SignerListSetProps,
} from './factories/signer-list-set.js';

// ============================================================ // Sponsorship family (Sponsor amendment)
export {
  sponsorshipSet,
  type SponsorshipSet,
  type SponsorshipSetProps,
} from './factories/sponsorship-set.js';
export {
  sponsorshipTransfer,
  type SponsorshipTransfer,
  type SponsorshipTransferProps,
  type SponsorSignatureProps,
} from './factories/sponsorship-transfer.js';

// ============================================================ // TicketCreate
export {
  ticketCreate,
  type TicketCreate,
  type TicketCreateProps,
} from './factories/ticket-create.js';

// ============================================================ // TrustSet
export {
  trustSet,
  type TrustSet,
  type TrustSetProps,
} from './factories/trust-set.js';

// ============================================================ // Vault family (SingleAssetVault amendment)
export {
  vaultClawback,
  type VaultClawback,
  type VaultClawbackProps,
} from './factories/vault-clawback.js';
export {
  vaultCreate,
  type VaultCreate,
  type VaultCreateProps,
} from './factories/vault-create.js';
export {
  vaultDelete,
  type VaultDelete,
  type VaultDeleteProps,
} from './factories/vault-delete.js';
export {
  vaultDeposit,
  type VaultDeposit,
  type VaultDepositProps,
} from './factories/vault-deposit.js';
export {
  vaultSet,
  type VaultSet,
  type VaultSetProps,
} from './factories/vault-set.js';
export {
  vaultWithdraw,
  type VaultWithdraw,
  type VaultWithdrawProps,
} from './factories/vault-withdraw.js';

// ============================================================ // XChain family (XLS-0038d Sidechain amendment)
export {
  xchainAccountCreateCommit,
  type XchainAccountCreateCommit,
  type XchainAccountCreateCommitProps,
} from './factories/xchain-account-create-commit.js';
export {
  xchainAddAccountCreateAttestation,
  type XchainAddAccountCreateAttestation,
  type XchainAddAccountCreateAttestationProps,
} from './factories/xchain-add-account-create-attestation.js';
export {
  xchainAddClaimAttestation,
  type XchainAddClaimAttestation,
  type XchainAddClaimAttestationProps,
} from './factories/xchain-add-claim-attestation.js';
export {
  xchainClaim,
  type XchainClaim,
  type XchainClaimProps,
} from './factories/xchain-claim.js';
export {
  xchainCommit,
  type XchainCommit,
  type XchainCommitProps,
} from './factories/xchain-commit.js';
export {
  xchainCreateBridge,
  type XchainCreateBridge,
  type XchainCreateBridgeProps,
} from './factories/xchain-create-bridge.js';
export {
  xchainCreateClaimID,
  type XchainCreateClaimID,
  type XchainCreateClaimIDProps,
} from './factories/xchain-create-claim-id.js';
export {
  xchainModifyBridge,
  type XchainModifyBridge,
  type XchainModifyBridgeProps,
} from './factories/xchain-modify-bridge.js';