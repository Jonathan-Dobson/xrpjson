# xrpjson

Functional transaction factories for the XRP Ledger — 79 frozen-shape
builders verified against [xrpl.js](https://github.com/XRPLF/xrpl.js),
[xrpl.org](https://xrpl.org/), and [XLS specs](https://github.com/XRPLF/XRPL-Standards).

```ts
import { payment, accountSet, vaultCreate } from 'xrpjson';

const tx = payment({
  Account: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
  Destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
  Amount: '1000000', // 1 XRP in drops
});

// tx is frozen — every field is validated at construction time.
// toJSON() produces a wire-format object ready for xrpl.encode().
const wire = tx.toJSON();
```

## What it is

`xrpjson` is the functional-programming API for building XRPL transactions.
Every factory returns a **frozen** transaction object with **eager validation**
at construction. If a required field is missing, malformed, or violates a
ledger rule the factory knows about, the call throws — no separate
`.validate()` step, no silent preclaim failures at submit time.

Each transaction family (`payment`, `vaultCreate`, `ammDeposit`, ...) has
its own factory. Importing one pulls in only that factory's code (full
tree-shaking).

## What it covers

**79 transaction types** (the full Class API transaction set,
including the XLS-38d Sidechain family):

- **Account:** `accountDelete`, `accountSet`
- **AMM** (7): XLS-0030
- **Batch:** `batch` (BatchV1_1)
- **Check** (3): `checkCancel`, `checkCash`, `checkCreate`
- **Clawback:** `clawback`
- **ConfidentialMPT** (5): ConfidentialTransfer amendment
- **Credential** (3): XLS-0070
- **Delegate:** `delegateSet` (XLS-0085d)
- **DepositPreauth:** 4-way field rule (XLS-0070)
- **DID** (2): XLS-0040
- **Escrow** (3)
- **LedgerStateFix**
- **Loan** (4) + **LoanBroker** (5): LendingProtocol amendment
- **MPT** (4): XLS-0033
- **NFToken** (6): XLS-0020
- **Offer** (2)
- **Oracle** (2)
- **Payment**
- **PaymentChannel** (3)
- **PermissionedDomain** (2)
- **SetRegularKey**
- **SignerListSet**
- **Sponsorship** (2): Sponsor amendment
- **TicketCreate**
- **TrustSet**
- **Vault** (6): SingleAssetVault amendment
- **XChain** (8): XLS-0038d Sidechain amendment

## What it adds over the class API

Every factory file ships a `## Divergences` header listing the guards it
adds beyond the Class API's equivalent. Examples:

- **`vaultCreate`**: rejects `VaultID === '00…00'` (64-char all-zero
  hex would fail at the ledger with `temMALFORMED`); `Amount` must be
  strictly positive across all 3 forms (XRP drops / IOU object / MPT
  object).
- **`ammDeposit` / `ammWithdraw`**: validates `Asset` and `Asset2` as
  `Currency` (no MPT), enforces the "Amount2 requires Amount" and
  "EPrice requires Amount" cross-field rules, plus exactly-one
  AMM-withdraw mode flag.
- **`batch`**: validates `RawTransactions` 2..8, exclusive `Flags` on
  the outer tx, inner-tx `Sequence XOR TicketSequence`, `BatchSigners`
  ≤ 24 + sorted + no duplicates, outer `Account` not in `BatchSigners`.
- **`nftokenCreateOffer`**: rejects `Owner` on sell offers, requires
  `Owner` on buy offers, rejects `Owner === Account`, 64-char hex
  `NFTokenID`.
- **`nftokenCancelOffer`**: rejects duplicate offer IDs, max 500
  entries per rippled `kMaxTokenOfferCancelCount`.
- **`signerListSet`**: ≤ 32 entries, positive `SignerWeight`, no
  self-listing, 64-char hex `WalletLocator`.
- **`xchainCreateBridge` / `xchainModifyBridge`**: enforces 4-key
  bridge shape (`LockingChainDoor`, `LockingChainIssue`,
  `IssuingChainDoor`, `IssuingChainIssue`), bridge doors as valid
  XRPL accounts, `SignatureReward` / `MinAccountCreateAmount` as
  strictly positive XRP drops strings (XLS-38 §2.1.1.1.3/1.4),
  `Account === LockingChainDoor` equality.

Every divergence is cited: file path + line number in
[xrpl.js](https://github.com/XRPLF/xrpl.js),
[xrpl.org docs](https://xrpl.org/), and the relevant XLS spec.

## Usage

```ts
import { payment, vaultCreate, nftokenCreateOffer } from 'xrpjson';

// 1. Build a frozen, validated tx.
const tx = payment({
  Account: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
  Destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
  Amount: '1000000',
});

// 2. (optional) derive a new tx with overrides — re-validates.
const withHigherFee = tx.with({ Fee: '20' });

// 3. Serialize for the wire format.
const wire = tx.toJSON();
// wire is a plain object matching the canonical XRPL JSON shape.

// 4. Encode + sign + submit via xrpl.js (or your own client).
import { encode, sign, submit } from 'xrpl';
const encoded = encode(wire);
const signed = sign(wallet, encoded);
await submit(signed);
```

The factory is pure — no global state, no I/O, no side effects. You can
construct thousands of transactions per second.

## Verification discipline

Every factory is verified against **three canonical sources** before
landing:

1. **xrpl.js 5.3.0** at `xrpl.js` — the canonical
   JavaScript validator. We check what `validate<Transaction>` does and
   *what it skips*.
2. **xrpl.org docs** at `xrpl-dev-portal` — the
   human-readable reference. We extract the field tables, internal
   types, and error code catalog.
3. **XLS specs** at `xrpl-standards` — the
   authoritative spec text. We read the amendment's field table,
   preclaim rules, and cross-field invariants.

When the three sources disagree, the XLS spec wins. The factory
documents the divergence with citation.

## Out of scope

- Pseudo-transactions: `EnableAmendment`, `LedgerEntry` (state query)
- Deprecated: `UNLModify`
- Future amendments not yet enabled on the ledger: `SetFee` (XRPL hook amendment)

These are outside the scope of this package.

## Development

```bash
git clone https://github.com/Jonathan-Dobson/xrpjson.git
cd xrpjson
npm ci
npm test        # run the test suite
npm run lint    # ESLint 9 flat config + typescript-eslint strict
npm run build   # tsc → dist/
```

Tests use `vitest`. The factories are pure ESM with TypeScript strict
mode (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, etc.).
No runtime dependencies.

### Agent workflow

[`AGENTS.md`](./AGENTS.md) holds the standing rules for working in this repo:
branch policy — including the `semantic-codesearch` branch and the rule that it
is never merged into `main` — plus how to keep the local semantic-search index
fresh. Read it before your first change.

### Project documentation

| Document | What it is |
|---|---|
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | How to add a factory — the three-source verification loop, the `## Divergences` format, and the citation conventions |
| [`CONTEXT.md`](./CONTEXT.md) | Glossary of the terms the factory docstrings use without defining — *frozen tx*, *divergence*, *preclaim*, *Class API*, *Source* vs *Cross-ref* |
| [`docs/adr/`](./docs/adr/) | Architecture decisions: functional API over the class API, the frozen shape, XLS-spec precedence, and the rippled citation convention |
| [`docs/audit/`](./docs/audit/) | Audits — what was checked, against which pinned sources, and what was corrected |
| [`docs/audit/2026-10-02-flag-contradiction-audit.md`](./docs/audit/2026-10-02-flag-contradiction-audit.md) | Flag audit of all 63 `Flags`-bearing factories. Found **3 defects** — all cases where a factory rejected input rippled accepts — and fixed them: `sponsorshipTransfer` refused `spfSponsorFee`, `mptokenIssuanceCreate` ignored boolean-map `Flags`, `nftokenMint` refused `TransferFee: 0`. Also records the gaps (46 factories reason about flags not at all) and corrects the "7 of 63 validate" count, which was a grep artifact — 17 read `Flags` at runtime |

## License

MIT

## Related projects

- [xrpl.js](https://github.com/XRPLF/xrpl.js) — the canonical JavaScript
  library; `xrpjson` uses xrpl.js as a devDep for test round-tripping
  (encode/decode).
- [XRPL Standards](https://github.com/XRPLF/XRPL-Standards) — the
  amendment specs `xrpjson` verifies against.