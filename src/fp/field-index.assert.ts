/**
 * Drift assertions for the generated field-ownership index.
 *
 * `scripts/gen-field-index.mjs` produces `field-index.ts` from the 79
 * `XxxProps` interfaces and the protocol's `TRANSACTION_FORMATS` table. Nothing
 * stops that table drifting from its source: someone adds a field to a props
 * interface and forgets to regenerate, and the index quietly stops knowing
 * where that field belongs.
 *
 * These assertions close that gap at COMPILE TIME rather than in CI. All three
 * are load-bearing, and all three are easy to accidentally disarm:
 *
 *   - `FIELD_OWNERS` is typed `satisfies Record<string, ReadonlySet<string>>`,
 *     never `Record<string, ReadonlySet<string>>`. A `Record` annotation adds
 *     an index signature, `keyof` collapses to `string`, and then:
 *       completeness  `Exclude<AllFields, keyof>` -> `never`  -> always passes
 *       key soundness `Exclude<keyof, …>`         -> `string` -> always fires
 *     The first is the dangerous one: the index could lose fields entirely and
 *     the build would stay green.
 *
 *   - `keyof` over a UNION yields the INTERSECTION of keys, not the union.
 *     `UnionKeys` distributes over the union to get every key. Without it,
 *     `AllOwnedFields` would contain only the fields common to all 79
 *     factories — `Account` and a handful — and completeness would be vacuous.
 *
 * The Props union below is a list of `import type` statements, not a copy of
 * the interfaces. Imports resolve against the live types, so an edit to a props
 * interface is what makes these assertions fire.
 *
 * Fields in `COMMON_FIELDS` are valid on every transaction, so they own no
 * index entry and are excluded from the completeness scope for the same reason
 * `Fee` never appears in a props interface body — it is inherited.
 */
import type { FIELD_OWNERS as Owners, CommonField } from './field-index.js';
/**
 * The three assertions below are written so the compiler NAMES the offender,
 * not just reports `false`. Each resolves to `true` when it holds, and to an
 * object type carrying the offending keys when it does not — so
 *
 *     error TS2322: Type '{ failingCheck: "COMPLETENESS"; offenders: "NewField" }'
 *
 * appears at the const that consumes it. A bare `Assert<IsNever<…>>` reports
 * only `Type 'false' does not satisfy the constraint 'true'`, which tells the
 * maintainer that *something* drifted but not what.
 */
import type { AmmBidProps } from './factories/amm-bid.js';
import type { AmmClawbackProps } from './factories/amm-clawback.js';
import type { AmmCreateProps } from './factories/amm-create.js';
import type { AmmDeleteProps } from './factories/amm-delete.js';
import type { AmmDepositProps } from './factories/amm-deposit.js';
import type { AmmVoteProps } from './factories/amm-vote.js';
import type { AmmWithdrawProps } from './factories/amm-withdraw.js';
import type { AccountDeleteProps } from './factories/account-delete.js';
import type { AccountSetProps } from './factories/account-set.js';
import type { BatchProps } from './factories/batch.js';
import type { CheckCancelProps } from './factories/check-cancel.js';
import type { CheckCashProps } from './factories/check-cash.js';
import type { CheckCreateProps } from './factories/check-create.js';
import type { ClawbackProps } from './factories/clawback.js';
import type { ConfidentialMptClawbackProps } from './factories/confidential-mpt-clawback.js';
import type { ConfidentialMptConvertProps } from './factories/confidential-mpt-convert.js';
import type { ConfidentialMptConvertBackProps } from './factories/confidential-mpt-convert-back.js';
import type { ConfidentialMptMergeInboxProps } from './factories/confidential-mpt-merge-inbox.js';
import type { ConfidentialMptSendProps } from './factories/confidential-mpt-send.js';
import type { CredentialAcceptProps } from './factories/credential-accept.js';
import type { CredentialCreateProps } from './factories/credential-create.js';
import type { CredentialDeleteProps } from './factories/credential-delete.js';
import type { DIDDeleteProps } from './factories/did-delete.js';
import type { DIDSetProps } from './factories/did-set.js';
import type { DelegateSetProps } from './factories/delegate-set.js';
import type { DepositPreauthProps } from './factories/deposit-preauth.js';
import type { EscrowCancelProps } from './factories/escrow-cancel.js';
import type { EscrowCreateProps } from './factories/escrow-create.js';
import type { EscrowFinishProps } from './factories/escrow-finish.js';
import type { LedgerStateFixProps } from './factories/ledger-state-fix.js';
import type { LoanBrokerCoverClawbackProps } from './factories/loan-broker-cover-clawback.js';
import type { LoanBrokerCoverDepositProps } from './factories/loan-broker-cover-deposit.js';
import type { LoanBrokerCoverWithdrawProps } from './factories/loan-broker-cover-withdraw.js';
import type { LoanBrokerDeleteProps } from './factories/loan-broker-delete.js';
import type { LoanBrokerSetProps } from './factories/loan-broker-set.js';
import type { LoanDeleteProps } from './factories/loan-delete.js';
import type { LoanManageProps } from './factories/loan-manage.js';
import type { LoanPayProps } from './factories/loan-pay.js';
import type { LoanSetProps } from './factories/loan-set.js';
import type { MptokenAuthorizeProps } from './factories/mptoken-authorize.js';
import type { MptokenIssuanceCreateProps } from './factories/mptoken-issuance-create.js';
import type { MptokenIssuanceDestroyProps } from './factories/mptoken-issuance-destroy.js';
import type { MptokenIssuanceSetProps } from './factories/mptoken-issuance-set.js';
import type { NftokenAcceptOfferProps } from './factories/nftoken-accept-offer.js';
import type { NftokenBurnProps } from './factories/nftoken-burn.js';
import type { NftokenCancelOfferProps } from './factories/nftoken-cancel-offer.js';
import type { NftokenCreateOfferProps } from './factories/nftoken-create-offer.js';
import type { NftokenMintProps } from './factories/nftoken-mint.js';
import type { NftokenModifyProps } from './factories/nftoken-modify.js';
import type { OfferCancelProps } from './factories/offer-cancel.js';
import type { OfferCreateProps } from './factories/offer-create.js';
import type { OracleDeleteProps } from './factories/oracle-delete.js';
import type { OracleSetProps } from './factories/oracle-set.js';
import type { PaymentProps } from './factories/payment.js';
import type { PaymentChannelClaimProps } from './factories/payment-channel-claim.js';
import type { PaymentChannelCreateProps } from './factories/payment-channel-create.js';
import type { PaymentChannelFundProps } from './factories/payment-channel-fund.js';
import type { PermissionedDomainDeleteProps } from './factories/permissioned-domain-delete.js';
import type { PermissionedDomainSetProps } from './factories/permissioned-domain-set.js';
import type { SetRegularKeyProps } from './factories/set-regular-key.js';
import type { SignerListSetProps } from './factories/signer-list-set.js';
import type { SponsorshipSetProps } from './factories/sponsorship-set.js';
import type { SponsorshipTransferProps } from './factories/sponsorship-transfer.js';
import type { TicketCreateProps } from './factories/ticket-create.js';
import type { TrustSetProps } from './factories/trust-set.js';
import type { VaultClawbackProps } from './factories/vault-clawback.js';
import type { VaultCreateProps } from './factories/vault-create.js';
import type { VaultDeleteProps } from './factories/vault-delete.js';
import type { VaultDepositProps } from './factories/vault-deposit.js';
import type { VaultSetProps } from './factories/vault-set.js';
import type { VaultWithdrawProps } from './factories/vault-withdraw.js';
import type { XchainAccountCreateCommitProps } from './factories/xchain-account-create-commit.js';
import type { XchainAddAccountCreateAttestationProps } from './factories/xchain-add-account-create-attestation.js';
import type { XchainAddClaimAttestationProps } from './factories/xchain-add-claim-attestation.js';
import type { XchainClaimProps } from './factories/xchain-claim.js';
import type { XchainCommitProps } from './factories/xchain-commit.js';
import type { XchainCreateBridgeProps } from './factories/xchain-create-bridge.js';
import type { XchainCreateClaimIDProps } from './factories/xchain-create-claim-id.js';
import type { XchainModifyBridgeProps } from './factories/xchain-modify-bridge.js';

/** Distributes `keyof` over a union so it yields every key, not just shared ones. */
type UnionKeys<T> = T extends unknown ? keyof T : never;

/** Every one of the 79 factory props types. */
type AnyProps =
  | AmmBidProps
  | AmmClawbackProps
  | AmmCreateProps
  | AmmDeleteProps
  | AmmDepositProps
  | AmmVoteProps
  | AmmWithdrawProps
  | AccountDeleteProps
  | AccountSetProps
  | BatchProps
  | CheckCancelProps
  | CheckCashProps
  | CheckCreateProps
  | ClawbackProps
  | ConfidentialMptClawbackProps
  | ConfidentialMptConvertProps
  | ConfidentialMptConvertBackProps
  | ConfidentialMptMergeInboxProps
  | ConfidentialMptSendProps
  | CredentialAcceptProps
  | CredentialCreateProps
  | CredentialDeleteProps
  | DIDDeleteProps
  | DIDSetProps
  | DelegateSetProps
  | DepositPreauthProps
  | EscrowCancelProps
  | EscrowCreateProps
  | EscrowFinishProps
  | LedgerStateFixProps
  | LoanBrokerCoverClawbackProps
  | LoanBrokerCoverDepositProps
  | LoanBrokerCoverWithdrawProps
  | LoanBrokerDeleteProps
  | LoanBrokerSetProps
  | LoanDeleteProps
  | LoanManageProps
  | LoanPayProps
  | LoanSetProps
  | MptokenAuthorizeProps
  | MptokenIssuanceCreateProps
  | MptokenIssuanceDestroyProps
  | MptokenIssuanceSetProps
  | NftokenAcceptOfferProps
  | NftokenBurnProps
  | NftokenCancelOfferProps
  | NftokenCreateOfferProps
  | NftokenMintProps
  | NftokenModifyProps
  | OfferCancelProps
  | OfferCreateProps
  | OracleDeleteProps
  | OracleSetProps
  | PaymentProps
  | PaymentChannelClaimProps
  | PaymentChannelCreateProps
  | PaymentChannelFundProps
  | PermissionedDomainDeleteProps
  | PermissionedDomainSetProps
  | SetRegularKeyProps
  | SignerListSetProps
  | SponsorshipSetProps
  | SponsorshipTransferProps
  | TicketCreateProps
  | TrustSetProps
  | VaultClawbackProps
  | VaultCreateProps
  | VaultDeleteProps
  | VaultDepositProps
  | VaultSetProps
  | VaultWithdrawProps
  | XchainAccountCreateCommitProps
  | XchainAddAccountCreateAttestationProps
  | XchainAddClaimAttestationProps
  | XchainClaimProps
  | XchainCommitProps
  | XchainCreateBridgeProps
  | XchainCreateClaimIDProps
  | XchainModifyBridgeProps;

/** Every transaction type this library implements. */
type TxType =
  | 'AMMBid'
  | 'AMMClawback'
  | 'AMMCreate'
  | 'AMMDelete'
  | 'AMMDeposit'
  | 'AMMVote'
  | 'AMMWithdraw'
  | 'AccountDelete'
  | 'AccountSet'
  | 'Batch'
  | 'CheckCancel'
  | 'CheckCash'
  | 'CheckCreate'
  | 'Clawback'
  | 'ConfidentialMPTClawback'
  | 'ConfidentialMPTConvert'
  | 'ConfidentialMPTConvertBack'
  | 'ConfidentialMPTMergeInbox'
  | 'ConfidentialMPTSend'
  | 'CredentialAccept'
  | 'CredentialCreate'
  | 'CredentialDelete'
  | 'DIDDelete'
  | 'DIDSet'
  | 'DelegateSet'
  | 'DepositPreauth'
  | 'EscrowCancel'
  | 'EscrowCreate'
  | 'EscrowFinish'
  | 'LedgerStateFix'
  | 'LoanBrokerCoverClawback'
  | 'LoanBrokerCoverDeposit'
  | 'LoanBrokerCoverWithdraw'
  | 'LoanBrokerDelete'
  | 'LoanBrokerSet'
  | 'LoanDelete'
  | 'LoanManage'
  | 'LoanPay'
  | 'LoanSet'
  | 'MPTokenAuthorize'
  | 'MPTokenIssuanceCreate'
  | 'MPTokenIssuanceDestroy'
  | 'MPTokenIssuanceSet'
  | 'NFTokenAcceptOffer'
  | 'NFTokenBurn'
  | 'NFTokenCancelOffer'
  | 'NFTokenCreateOffer'
  | 'NFTokenMint'
  | 'NFTokenModify'
  | 'OfferCancel'
  | 'OfferCreate'
  | 'OracleDelete'
  | 'OracleSet'
  | 'Payment'
  | 'PaymentChannelClaim'
  | 'PaymentChannelCreate'
  | 'PaymentChannelFund'
  | 'PermissionedDomainDelete'
  | 'PermissionedDomainSet'
  | 'SetRegularKey'
  | 'SignerListSet'
  | 'SponsorshipSet'
  | 'SponsorshipTransfer'
  | 'TicketCreate'
  | 'TrustSet'
  | 'VaultClawback'
  | 'VaultCreate'
  | 'VaultDelete'
  | 'VaultDeposit'
  | 'VaultSet'
  | 'VaultWithdraw'
  | 'XChainAccountCreateCommit'
  | 'XChainAddAccountCreateAttestation'
  | 'XChainAddClaimAttestation'
  | 'XChainClaim'
  | 'XChainCommit'
  | 'XChainCreateBridge'
  | 'XChainCreateClaimID'
  | 'XChainModifyBridge';

/** Every non-common field name declared anywhere in the 79 props interfaces. */
type AllOwnedFields = Exclude<UnionKeys<AnyProps>, CommonField | 'validate' | 'toJSON' | 'with'>;

/** The element type of every owner set in the index. */
type SetElement<S> = S extends ReadonlySet<infer T> ? T : never;
type AllOwnerTxTypes = SetElement<(typeof Owners)[keyof typeof Owners]>;

/** Fields the protocol contributes that this library does not model. */
type ProtocolOnlyFields =
  | 'BookDirectory'
  | 'NFTokenMinter'
  | 'WalletLocator'
  | 'WalletSize';

type IsNever<T> = [T] extends [never] ? true : false;

/** `true` when `Bad` is `never`; otherwise an object naming its members. */
type Check<Bad extends string, Name extends string> =
  IsNever<Bad> extends true ? true : { failingCheck: Name; offenders: Bad };

/**
 * COMPLETENESS — every field declared in a props interface is in the index.
 * This is what makes the table self-maintaining: add a field to an interface
 * without regenerating, and the build fails naming that field.
 */
type Completeness = Check<
  Exclude<AllOwnedFields, keyof typeof Owners>,
  'COMPLETENESS'
>;

/**
 * TX-TYPE SOUNDNESS — every transaction named in the index is one this library
 * implements. A typo would make a field reject on every type, including the one
 * that should accept it.
 */
type TxTypes = Check<Exclude<AllOwnerTxTypes, TxType>, 'TX_TYPE_SOUNDNESS'>;

/**
 * KEY SOUNDNESS — every index key is either a field some props interface
 * declares or a field the protocol contributes. The protocol contributes
 * 4 fields this library does not model
 * (`BookDirectory`, `NFTokenMinter`, `WalletLocator`, `WalletSize`) — the entire point of
 * merging in protocol truth: those are real ledger fields, so using one on the
 * wrong transaction is caught even though this library has no interface for it.
 */
type IndexKeys = Check<
  Exclude<keyof typeof Owners, AllOwnedFields | ProtocolOnlyFields>,
  'KEY_SOUNDNESS'
>;

const _completeness: Completeness = true;
const _txTypes: TxTypes = true;
const _indexKeys: IndexKeys = true;

export { _completeness, _txTypes, _indexKeys };
