/**
 * Functional DepositPreauth factory — frozen-object style.
 *
 * Grant or revoke preauthorization for another account (or a set of
 * credentials) to deliver payments to the sender. Preauthorization is
 * only meaningful when the sender has [Deposit Authorization][depauth]
 * enabled, but the tx can be submitted ahead of time so the switch
 * is seamless.
 *
 *   import { depositPreauth } from 'xrplt/fp';
 *   const tx = depositPreauth({
 *     Account,
 *     Authorize: OTHER_ACCOUNT,
 *   });
 *   tx.validate();   // no-op — already validated at construction
 *   const j = tx.toJSON();
 *   const tx2 = tx.with({ Fee: '12', Sequence: 42 });
 *
 * Four mutually exclusive "payload" fields are supported by the
 * binary codec: exactly one of `Authorize`, `Unauthorize`,
 * `AuthorizeCredentials`, or `UnauthorizeCredentials` MUST be
 * supplied. Per XRPL.org: "You must provide exactly one of …"
 *
 * @see https://xrpl.org/docs/references/protocol/transactions/types/depositpreauth
 * @see XLS-9d  (DepositPreauth amendment)
 * @see XLS-70  (Credentials — adds the credential preauth fields)
 * @see xrpl.js `packages/xrpl/src/models/transactions/DepositPreauth.ts`
 *      (`validateDepositPreauth` and `validateSingleAuthorizationFieldProvided`
 *       — source of every guard below except the X-address `Account`
 *       equality check, which is slightly more permissive here).
 *
 * ## Divergences
 *
 * The factory implements the canonical XRPL DepositPreauth shape from
 * xrpl.js / XLS-9d / XLS-70 / XRPL.org, which is a strict superset of
 * the validation the class API performs. The class at
 * `src/transactions/deposit-preauth.ts` is a pre-Credentials
 * placeholder — it only models the two single-account fields
 * (`Authorize` / `Unauthorize`) and the "exactly one of two" rule.
 * Concretely:
 *
 *   1. **Validation is eager, not lazy.** The class lets callers
 *      construct a tx without immediately validating it; the factory
 *      runs every guard at construction so an invalid `DepositPreauth`
 *      is a type error (the call throws). There is no way to construct
 *      an invalid frozen tx. Source: class `validate()` only runs when
 *      explicitly called (`src/transactions/deposit-preauth.ts:36-50`);
 *      the factory mirrors the xrpl.js guard sequence
 *      (`DepositPreauth.ts:63-86`) at construction time.
 *
 *   2. **`Account` is validated as a classic/X-address via
 *      `isAccount`, not just as a non-empty string.** The class
 *      delegates `Account` to the base class, which only requires
 *      `typeof Account === 'string'`. The factory enforces the format
 *      regex at construction, matching the rest of the M4 fp family
 *      (delegateSet, setRegularKey, didSet, payment, etc.).
 *
 *   3. **"Exactly one of four" instead of "exactly one of two".**
 *      The class enforces the rule on two fields
 *      (`src/transactions/deposit-preauth.ts:38-43`):
 *      `Authorize XOR Unauthorize`. XRPL.org and xrpl.js both require
 *      EXACTLY ONE of `Authorize`, `Unauthorize`,
 *      `AuthorizeCredentials`, `UnauthorizeCredentials`. The factory
 *      enforces the 4-way XOR per xrpl.js
 *      `validateSingleAuthorizationFieldProvided`
 *      (`DepositPreauth.ts:88-104`) and XRPL.org
 *      `depositpreauth.md:66` "You must provide exactly one of …".
 *      Source: xrpl.js `DepositPreauth.ts:88-104`; XRPL.org
 *      `depositpreauth.md:66`.
 *
 *   4. **`AuthorizeCredentials` and `UnauthorizeCredentials` are
 *      modelled (XLS-70).** The class does not declare these fields
 *      at all. The binary codec accepts them (per
 *      `ripple-binary-codec definitions.json` DepositPreauth
 *      definition), but the class refuses them via TypeScript.
 *      Without these fields a caller cannot preauthorize or
 *      unauthorize a credential — a common workflow under the
 *      Credentials amendment. The factory exposes both. Source:
 *      xrpl.js `DepositPreauth.ts:33-38`; XRPL.org
 *      `depositpreauth.md:36-53` (the Credential preauthorization
 *      JSON example); XLS-70 §3.
 *
 *   5. **`Account` cannot equal `Authorize` or `Unauthorize`
 *      (`temCANNOT_PREAUTH_SELF`).** xrpl.js rejects this via
 *      `validateAuthorizationField` and `areAddressesEqual`
 *      (`DepositPreauth.ts:41-55`); XRPL.org documents the resulting
 *      error code `temCANNOT_PREAUTH_SELF` ("You cannot preauthorize
 *      yourself") at `depositpreauth.md:91`. The class does NOT check
 *      this — the class validator only requires `isAccount(...)` and
 *      does not compare against `Account`. The factory rejects
 *      self-preauth at construction. Source: xrpl.js
 *      `DepositPreauth.ts:41-55`; XRPL.org `depositpreauth.md:91`.
 *
 *   6. **`AuthorizeCredentials` / `UnauthorizeCredentials` list
 *      validation.** xrpl.js calls `validateCredentialsList`
 *      (`DepositPreauth.ts:71-85`) with `MAX_AUTHORIZED_CREDENTIALS =
 *      8`. The factory mirrors this: the list must be a non-empty
 *      array, length ≤ 8, each entry must be a valid
 *      `AuthorizeCredential` object form (NOT a string credential
 *      ID), and there must be no duplicate (Issuer, CredentialType)
 *      pairs. The class has no equivalent field, so the class has no
 *      equivalent rule. Source: xrpl.js
 *      `DepositPreauth.ts:71-85`; xrpl.js `common.ts:28,1106-1148`;
 *      XRPL.org `depositpreauth.md:71-78` (per-entry field table).
 *
 *   7. **Per-credential validation: `CredentialType` must be non-empty
 *      hex (Blob) ≤ 64 bytes; `Issuer` must be a valid XRPL account.**
 *      xrpl.js's `validateCredentialsList` calls `isAuthorizeCredential`
 *      which only checks object shape + string types
 *      (`common.ts:179-191`); it does NOT enforce hex validity on
 *      `CredentialType` or address format on `Issuer`. The factory
 *      adds these checks so a malformed credential surfaces at
 *      construction rather than at the binary codec layer
 *      (`CredentialType` is `Blob` per XRPL.org
 *      `depositpreauth.md:78`, and `Issuer` is `AccountID` per
 *      `depositpreauth.md:77`). Source: xrpl.js `common.ts:179-191`;
 *      XRPL.org `depositpreauth.md:71-78`; XLS-70 §2.1.3 (64-byte
 *      CredentialType cap).
 */
import type { AuthorizeCredential } from '../../types/common.js';
import {
  isAccount,
  isAuthorizeCredential,
  isHex,
  isString,
} from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

// ─── Spec constants ──────────────────────────────────────────────────

/**
 * Maximum number of credentials accepted in `AuthorizeCredentials` /
 * `UnauthorizeCredentials`. Mirrors xrpl.js `MAX_AUTHORIZED_CREDENTIALS`.
 * Source: xrpl.js `common.ts:28`.
 */
const MAX_AUTHORIZED_CREDENTIALS = 8;

/**
 * `CredentialType` is a hex-encoded Blob capped at 64 bytes per
 * XLS-0070 §2.1.3.
 */
const MAX_CREDENTIAL_TYPE_BYTES = 64;

// ─── Public types ────────────────────────────────────────────────────

/**
 * Props for the `DepositPreauth` factory.
 *
 * Four mutually exclusive "payload" fields are supported by the
 * binary codec. Exactly one of them MUST be supplied (per XRPL.org
 * and xrpl.js `validateSingleAuthorizationFieldProvided`).
 */
export interface DepositPreauthProps {
  /**
   * The unique address of the transaction sender. The owner of the
   * deposit-authorization slot. Required, must be a valid XRPL
   * classic or X-address.
   */
  Account: string;

  /**
   * An account to preauthorize (grant the right to deliver payments
   * to `Account`). Must differ from `Account` (`temCANNOT_PREAUTH_SELF`).
   * Mutually exclusive with `Unauthorize`, `AuthorizeCredentials`,
   * `UnauthorizeCredentials`.
   */
  Authorize?: string | undefined;

  /**
   * An account whose preauthorization should be revoked. Must differ
   * from `Account`. Mutually exclusive with the other three payload
   * fields.
   */
  Unauthorize?: string | undefined;

  /**
   * A list of credentials to preauthorize (XLS-70). 1–8 unique
   * `AuthorizeCredential` entries. Mutually exclusive with the other
   * three payload fields.
   */
  AuthorizeCredentials?: AuthorizeCredential[] | undefined;

  /**
   * A list of credentials whose preauthorization should be revoked
   * (XLS-70). 1–8 unique `AuthorizeCredential` entries. Mutually
   * exclusive with the other three payload fields.
   */
  UnauthorizeCredentials?: AuthorizeCredential[] | undefined;

  /**
   * Bit-flags for this transaction. DepositPreauth defines no
   * transaction-specific flags; only the universal
   * `tfFullyCanonicalSig` (0x80000000) is meaningful.
   */
  Flags?: number | undefined;
  /** Fee in XRP (drops), base-10 integer string. */
  Fee?: string | undefined;
  /** Account sequence number. */
  Sequence?: number | undefined;
}

export interface DepositPreauth
  extends Readonly<DepositPreauthProps> {
  readonly TransactionType: 'DepositPreauth';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<DepositPreauthProps>): DepositPreauth;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Validate a single `AuthorizeCredential.CredentialType` payload per
 * XLS-0070 §2.1.3: hex string, non-empty, even length, ≤ 64 bytes.
 */
function validateCredentialType(
  txType: string,
  path: string,
  value: unknown,
): string {
  if (!isString(value)) {
    throw new ValidationError(
      `${txType}: ${path}.Credential.CredentialType must be a hex string`,
    );
  }
  if (value.length === 0) {
    throw new ValidationError(
      `${txType}: ${path}.Credential.CredentialType must not be empty`,
    );
  }
  if (!isHex(value)) {
    throw new ValidationError(
      `${txType}: ${path}.Credential.CredentialType must be a hex string`,
    );
  }
  if (value.length % 2 !== 0) {
    throw new ValidationError(
      `${txType}: ${path}.Credential.CredentialType must be a hex string with an even number of characters`,
    );
  }
  const bytes = value.length / 2;
  if (bytes > MAX_CREDENTIAL_TYPE_BYTES) {
    throw new ValidationError(
      `${txType}: ${path}.Credential.CredentialType exceeds ${MAX_CREDENTIAL_TYPE_BYTES} bytes (actual: ${bytes})`,
    );
  }
  return value;
}

/**
 * Validate a credentials list (`AuthorizeCredentials` or
 * `UnauthorizeCredentials`). Mirrors xrpl.js `validateCredentialsList`
 * for DepositPreauth (object-form, not string-IDs; cap 8; no dupes),
 * plus stricter per-element validation (hex CredentialType, valid
 * Issuer address).
 */
function validateCredentialsArray(
  txType: string,
  fieldName: 'AuthorizeCredentials' | 'UnauthorizeCredentials',
  list: unknown,
): void {
  if (!Array.isArray(list)) {
    throw new ValidationError(
      `${txType}: ${fieldName} must be an array`,
    );
  }
  if (list.length === 0) {
    throw new ValidationError(
      `${txType}: ${fieldName} cannot be an empty array`,
    );
  }
  if (list.length > MAX_AUTHORIZED_CREDENTIALS) {
    throw new ValidationError(
      `${txType}: ${fieldName} length cannot exceed ${MAX_AUTHORIZED_CREDENTIALS} elements (actual: ${list.length})`,
    );
  }
  const seen = new Set<string>();
  list.forEach((credential, idx) => {
    if (!isAuthorizeCredential(credential)) {
      throw new ValidationError(
        `${txType}: ${fieldName}[${idx}] is not a valid AuthorizeCredential object`,
      );
    }
    const credObj = credential.Credential;
    // ── Issuer must be a valid XRPL account (XRPL.org says
    //    AccountID; class has no equivalent field so no precedent).
    if (!isAccount(credObj.Issuer)) {
      throw new ValidationError(
        `${txType}: ${fieldName}[${idx}].Credential.Issuer must be a valid XRPL address`,
      );
    }
    // ── CredentialType must be a non-empty hex Blob ≤ 64 bytes.
    validateCredentialType(
      txType,
      `${fieldName}[${idx}]`,
      credObj.CredentialType,
    );
    // ── No duplicate (Issuer, CredentialType) pairs (XLS-0070).
    const key = `${credObj.Issuer}-${credObj.CredentialType}`;
    if (seen.has(key)) {
      throw new ValidationError(
        `${txType}: ${fieldName} cannot contain duplicate elements`,
      );
    }
    seen.add(key);
  });
}

// ─── Factory ─────────────────────────────────────────────────────────

/**
 * Build a frozen DepositPreauth. Throws `ValidationError` on
 * construction if any required field is missing, malformed, or if
 * the mutually-exclusive-payload rule is violated.
 */
export function depositPreauth(props: DepositPreauthProps): DepositPreauth {
  // ── Account ── required, must be a valid XRPL classic/X-address.
  require(
    props.Account,
    'DepositPreauth: missing or invalid Account',
    isAccount,
  );

  // ── "Exactly one of four" payload XOR ──
  // xrpl.js `validateSingleAuthorizationFieldProvided`
  // (`DepositPreauth.ts:88-104`) and XRPL.org
  // `depositpreauth.md:66`.
  const hasAuth = props.Authorize !== undefined;
  const hasUnauth = props.Unauthorize !== undefined;
  const hasAuthCreds = props.AuthorizeCredentials !== undefined;
  const hasUnauthCreds = props.UnauthorizeCredentials !== undefined;
  const payloadCount =
    Number(hasAuth) +
    Number(hasUnauth) +
    Number(hasAuthCreds) +
    Number(hasUnauthCreds);
  if (payloadCount !== 1) {
    throw new ValidationError(
      'DepositPreauth: requires exactly one of Authorize, Unauthorize, AuthorizeCredentials, or UnauthorizeCredentials',
    );
  }

  // ── Authorize ── if present, must be a valid account and must not
  //    equal Account (`temCANNOT_PREAUTH_SELF`).
  if (hasAuth) {
    if (!isString(props.Authorize)) {
      throw new ValidationError(
        'DepositPreauth: Authorize must be a string',
      );
    }
    if (!isAccount(props.Authorize)) {
      throw new ValidationError(
        'DepositPreauth: Authorize must be a valid XRPL address',
      );
    }
    if (props.Authorize === props.Account) {
      throw new ValidationError(
        'DepositPreauth: Account cannot preauthorize itself (temCANNOT_PREAUTH_SELF)',
      );
    }
  }

  // ── Unauthorize ── if present, must be a valid account and must
  //    not equal Account (symmetric `temCANNOT_PREAUTH_SELF` rule
  //    via xrpl.js `validateAuthorizationField`).
  if (hasUnauth) {
    if (!isString(props.Unauthorize)) {
      throw new ValidationError(
        'DepositPreauth: Unauthorize must be a string',
      );
    }
    if (!isAccount(props.Unauthorize)) {
      throw new ValidationError(
        'DepositPreauth: Unauthorize must be a valid XRPL address',
      );
    }
    if (props.Unauthorize === props.Account) {
      throw new ValidationError(
        'DepositPreauth: Account cannot unauthorize itself (temCANNOT_PREAUTH_SELF)',
      );
    }
  }

  // ── AuthorizeCredentials ── if present, must be a valid 1..8
  //    list of unique AuthorizeCredential objects.
  if (hasAuthCreds) {
    validateCredentialsArray(
      'DepositPreauth',
      'AuthorizeCredentials',
      props.AuthorizeCredentials,
    );
  }

  // ── UnauthorizeCredentials ── if present, must be a valid 1..8
  //    list of unique AuthorizeCredential objects.
  if (hasUnauthCreds) {
    validateCredentialsArray(
      'DepositPreauth',
      'UnauthorizeCredentials',
      props.UnauthorizeCredentials,
    );
  }

  return buildFrozenTx<DepositPreauthProps, DepositPreauth>(
    'DepositPreauth',
    props,
    {
      validate() {
        // Validated at construction.
      },
      toJSON(this: DepositPreauth) {
        const json: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k === 'validate' || k === 'toJSON' || k === 'with') continue;
          const v = (this as unknown as Record<string, unknown>)[k];
          if (v !== undefined) json[k] = v;
        }
        return json;
      },
      with(this: DepositPreauth, overrides: Partial<DepositPreauthProps>) {
        return depositPreauth(mergeForWith(this, overrides));
      },
    },
  );
}
