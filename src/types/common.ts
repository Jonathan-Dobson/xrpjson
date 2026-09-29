/**
 * Common supporting types used across XRPL transactions.
 */

/**
 * A Memo attached to a transaction.
 */
export interface Memo {
  readonly Memo: {
    readonly MemoData?: string;
    readonly MemoType?: string;
    readonly MemoFormat?: string;
  };
}

/**
 * A multi-signature entry.
 */
export interface Signer {
  readonly Signer: {
    readonly Account: string;
    readonly TxnSignature: string;
    readonly SigningPubKey: string;
  };
}

/**
 * A single step in a payment path.
 */
export interface PathStep {
  readonly account?: string;
  readonly currency?: string;
  readonly issuer?: string;
}

/**
 * A payment path — an array of path steps.
 */
export type Path = readonly PathStep[];

/**
 * An XChain bridge specification.
 */
export interface XChainBridge {
  readonly LockingChainDoor: string;
  readonly LockingChainIssue: { readonly currency: string; readonly issuer?: string };
  readonly IssuingChainDoor: string;
  readonly IssuingChainIssue: { readonly currency: string; readonly issuer?: string };
}

/**
 * An authorization credential reference.
 */
export interface AuthorizeCredential {
  readonly Credential: {
    readonly Issuer: string;
    readonly CredentialType: string;
  };
}

/**
 * A signer entry for SignerListSet.
 */
export interface SignerEntry {
  readonly SignerEntry: {
    readonly Account: string;
    readonly SignerWeight: number;
    readonly WalletLocator?: string;
  };
}

/**
 * Oracle data series entry.
 */
export interface OracleDataSeries {
  readonly PriceData: {
    readonly BaseAsset: string;
    readonly QuoteAsset: string;
    readonly AssetPrice?: string | number;
    readonly Scale?: number;
  };
}

/**
 * An authorized account for AMM bidding.
 */
export interface AuthAccount {
  readonly AuthAccount: {
    readonly Account: string;
  };
}

/**
 * An XChain claim attestation.
 */
export interface XChainClaimAttestation {
  readonly XChainClaimAttestationBatch: {
    readonly XChainBridge: XChainBridge;
    readonly XChainClaimID: string | number;
    readonly Destination: string;
    readonly Amount: string | { currency: string; issuer: string; value: string };
    readonly Attestations: Array<{
      readonly Attestation: {
        readonly AttestationPubKey: string;
        readonly AttestationSignature: string;
        readonly Amount: string | { currency: string; issuer: string; value: string };
        readonly AttestationRewardAccount: string;
        readonly WasLockingChainSend: 0 | 1;
      };
    }>;
  };
}

/**
 * An XChain account create attestation.
 */
export interface XChainAccountCreateAttestation {
  readonly XChainAccountCreateAttestationBatch: {
    readonly XChainBridge: XChainBridge;
    readonly XChainAccountCreateCount: string | number;
    readonly Destination: string;
    readonly Amount: string | { currency: string; issuer: string; value: string };
    readonly Attestations: Array<{
      readonly Attestation: {
        readonly AttestationPubKey: string;
        readonly AttestationSignature: string;
        readonly Amount: string | { currency: string; issuer: string; value: string };
        readonly AttestationRewardAccount: string;
        readonly WasLockingChainSend: 0 | 1;
      };
    }>;
  };
}

/**
 * CounterpartySignature — inner object on multi-party transactions where
 * one party creates + signs and the other party counter-signs.
 *
 * Used by `LoanSet` (Loan Broker + Borrower mutual agreement) and similar
 * amendments-driven flows. Role-specific hash prefixes for these
 * signatures are handled at signing time, not in the transaction body.
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/loanset
 */
export interface CounterpartySignature {
  /** The public key used to verify the counterparty's signature. */
  readonly SigningPubKey?: string;
  /** The counterparty's signature over all signing fields. */
  readonly TxnSignature?: string;
  /** Array of multi-signature entries from the counterparty. */
  readonly Signers?: Signer[];
}
