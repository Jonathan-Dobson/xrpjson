/**
 * All XRPL transaction type strings as a discriminated union.
 *
 * This is the single source of truth for valid TransactionType values.
 */
export type TransactionType =
  // Account management
  | 'AccountDelete'
  | 'AccountSet'
  | 'SetRegularKey'
  | 'SignerListSet'
  | 'DelegateSet'
  | 'DepositPreauth'
  | 'TicketCreate'
  | 'Clawback'

  // Payments & value transfer
  | 'Payment'
  | 'CheckCreate'
  | 'CheckCash'
  | 'CheckCancel'
  | 'EscrowCreate'
  | 'EscrowFinish'
  | 'EscrowCancel'
  | 'PaymentChannelCreate'
  | 'PaymentChannelFund'
  | 'PaymentChannelClaim'

  // DEX offers
  | 'OfferCreate'
  | 'OfferCancel'

  // Trust lines & issued currencies
  | 'TrustSet'

  // NFTokens
  | 'NFTokenMint'
  | 'NFTokenBurn'
  | 'NFTokenCreateOffer'
  | 'NFTokenCancelOffer'
  | 'NFTokenAcceptOffer'
  | 'NFTokenModify'

  // Multi-Purpose Tokens
  | 'MPTokenAuthorize'
  | 'MPTokenIssuanceCreate'
  | 'MPTokenIssuanceDestroy'
  | 'MPTokenIssuanceSet'

  // AMM
  | 'AMMCreate'
  | 'AMMDeposit'
  | 'AMMWithdraw'
  | 'AMMVote'
  | 'AMMBid'
  | 'AMMClawback'
  | 'AMMDelete'

  // Cross-chain (XChain)
  | 'XChainCreateBridge'
  | 'XChainModifyBridge'
  | 'XChainCommit'
  | 'XChainClaim'
  | 'XChainAccountCreateCommit'
  | 'XChainCreateClaimID'
  | 'XChainAddClaimAttestation'
  | 'XChainAddAccountCreateAttestation'

  // Vaults
  | 'VaultCreate'
  | 'VaultDeposit'
  | 'VaultWithdraw'
  | 'VaultSet'
  | 'VaultDelete'
  | 'VaultClawback'

  // Loans
  | 'LoanSet'
  | 'LoanDelete'
  | 'LoanManage'
  | 'LoanPay'
  | 'LoanBrokerSet'
  | 'LoanBrokerDelete'
  | 'LoanBrokerCoverClawback'
  | 'LoanBrokerCoverDeposit'
  | 'LoanBrokerCoverWithdraw'

  // Credentials
  | 'CredentialCreate'
  | 'CredentialAccept'
  | 'CredentialDelete'

  // Oracles
  | 'OracleSet'
  | 'OracleDelete'

  // DID
  | 'DIDSet'
  | 'DIDDelete'

  // Permissioned domains
  | 'PermissionedDomainSet'
  | 'PermissionedDomainDelete'

  // Batch
  | 'Batch'

  // Sponsorship (Sponsor amendment — not_enabled)
  | 'SponsorshipSet'
  | 'SponsorshipTransfer'

  // Ledger-state fix
  | 'LedgerStateFix'

  // ConfidentialMPT family (ConfidentialTransfer amendment — not_enabled)
  | 'ConfidentialMPTClawback'
  | 'ConfidentialMPTConvert'
  | 'ConfidentialMPTConvertBack'
  | 'ConfidentialMPTMergeInbox'
  | 'ConfidentialMPTSend';
