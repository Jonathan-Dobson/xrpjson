# Citation audit — 2026-10-01

Audit of the `## Divergences` docstring blocks in `src/fp/factories/*.ts` against
their cited canonical sources, plus a documentation pass over the package.

Status: **applied**. Every item in "Fixed" below has been corrected in the
working tree and verified by `npm run lint`, `npx tsc --noEmit`, and
`npm test` (79 files, 2,833 tests).

---

## Scope

| | |
|---|---|
| Factories with a `## Divergences` block | 74 of 79 |
| Citations parsed | 1,074 |
| Coverage vs. independent grep anchors | 96% |
| Citations resolving to a real file | 873 (81%) |

Five factories have **no** `## Divergences` block: `account-set`,
`loan-set`, `mptoken-issuance-create`, `payment`, `vault-create`. These were
reviewed and are genuinely divergence-free relative to the Class API; each is
now covered by the `Class API` term in `CONTEXT.md` rather than by a missing
block.

## Sources and pins

| Source | Pin | Local mirror |
|---|---|---|
| xrpl.js | commit `5c41405` (matches installed `xrpl@5.3.0`) | `~/.mavis/docs.local/xrpl.js/repo/` |
| XLS specs | commit `eed109e` | `~/.mavis/docs.local/xrpl-standards/repo/` |
| xrpl.org | commit `c664193` | `~/.mavis/docs.local/xrpl-dev-portal/repo/` |
| rippled | tag **`3.4.0`** | `~/.mavis/docs.local/rippled/repo/` (added by this audit) |
| Class API | `xrplt` 0.7.1 | sibling checkout |

The rippled mirror is a **tarball extraction, not a git clone** — this
environment's sandbox denies git's lock-file operations. It must not be
refreshed with `sync-docs.sh`. See its `PATCHES.md`.

---

## Defects found and fixed

### 1. Citation scaffolding was wrong across the board

| Defect | Count | Fix |
|---|---|---|
| Usage examples named the wrong package (`xrplt/fp`) | 80 | → `xrpjson` |
| Divergence prose pointed at `src/transactions/*.ts`, a path that does not exist in this repo | 85 | → `the Class API's \`<ClassName>\`` |
| `errors.ts` named the wrong package | 1 | → `xrpjson` |
| `errors.ts` documented a "registry" that the design explicitly rejects | 1 | corrected to what the class actually is |
| README claimed `xrpjson` is "the fp refactor of `xrplt`'s functional subpath (`xrplt/fp`)" — a subpath that never existed | 1 | claim removed |

Class names were **derived from the real exports**, not guessed: naive
capitalisation would have produced `NftokenCreateOffer` and `AmpDeposit`
instead of `NFTokenCreateOffer` and `AMMDeposit`.

### 2. Citations named a function as if it were a filename

xrpl.js has no `validate<Name>.ts` file. The validator is a *function inside*
`<name>.ts`. 14 citations across 6 factories were wrong this way.

| Cited | Occurrences | Actually |
|---|---|---|
| `validateDelegateSet.ts` | 7 | `delegateSet.ts` |
| `validateXChainCreateBridge.ts` | 3 | `XChainCreateBridge.ts` |
| `validateXChainModifyBridge.ts` | 3 | `XChainModifyBridge.ts` |
| `validateSignerListSet.ts` | 1 | `signerListSet.ts` |
| `CheckCancel.ts` | 1 | `checkCancel.ts` |
| `Amount.cpp` | 1 | `STAmount.cpp` |

Note the casing is **not uniform** in xrpl.js: most transactions are
camelCase, the XChain family is PascalCase. An earlier pass of this audit got
that wrong and introduced 6 broken citations before being caught.

### 3. Four rippled citations were wrong twice

They named `XChainAccountCreateCommit.cpp`, which is wrong in two independent
ways: all bridge transactors merged into `XChainBridge.cpp`, **and** the class
was renamed — 3.4.0 carries `XChainCreateAccountCommit` with the old name only
as a deprecated alias (`include/xrpl/tx/transactors/bridge/XChainBridge.h:332`).

Re-sourced per [ADR-0004](../adr/0004-rippled-citations-name-a-symbol.md),
symbol-first:

| Claim | Correct source at 3.4.0 |
|---|---|
| `Account` → `STAccount` | `src/libxrpl/protocol/STParsedJSON.cpp::parseLeaf` (case `STI_ACCOUNT`) |
| bridge doors → `STAccount` | `src/libxrpl/protocol/STXChainBridge.cpp::STXChainBridge(SField const&, json::Value const&)` |
| `Amount` XRP-only, `> 0` | `XChainBridge.cpp::XChainCreateAccountCommit::preflight` |
| `SignatureReward` XRP, `≥ 0` | same `::preflight`, plus `::preclaim` |

### 4. Four claims were factually unsupported by their citation

| File | Claim | What the source actually says |
|---|---|---|
| `nftoken-mint.ts` | XLS-20 §1.3.3 requires the URI be hex | §1.3.3 says only "The URI is **NOT** checked for validity"; the hex/`Blob` requirement is xrpl.org's, not the XLS's. Attribution corrected. |
| `nftoken-mint.ts` | XLS-0020 line 344 for the taxon range | the quote is at **342** |
| `trust-set.ts` | currency-formats.md line 28 = "Minimum value: `0`" | line 28 is the **Maximum** row; the quote is at **27** |
| `xchain-create-claim-id.ts` | line 49 validates `OtherChainSource` | line 49 validates `XChainBridge`; `OtherChainSource` is at **53** |

### 5. Line drift — 14 citations pointed at whitespace

11 real drift (uniform per file: −1 in XLS-0038, −3 and −5 in portal docs) plus
3 found incidentally. All re-anchored and content-verified. None of the cited
content had left its file.

### 6. Two throws violated the documented error contract

`account-set.ts` (TickSize) and `payment.ts` (`DeliverMin` without
`tfPartialPayment`) threw a bare `Error` where all 730 other throw sites use
`ValidationError`. A caller doing `instanceof ValidationError` therefore
mis-routed a user's typo into its "unexpected bug" branch. Both corrected,
with regression tests asserting the type.

### 7. One citation named a type in a file that does not define it

`nftoken-cancel-offer.ts` cited `xrpl.org common-fields.md Hash256` as the
authority for the 64-char hex encoding of `NFTokenOffers`. There are two files
named `common-fields.md` (`transactions/` and `ledger-data/`), and **neither
contains the string `Hash256`** — verified by grep across the pinned mirror.

The claim was sound but the type name was wrong on two counts. The field is
the `VECTOR256` **array**, not a scalar `Hash256`: XLS-20 §1.5.5 line 738 gives
`array` / `VECTOR256`, and xrpl.org's Fields table line 46 gives `Array` /
`Vector256`. `Hash256` describes an *element*. XLS-20 uses the scalar `Hash256`
name at line 682 — but for the offer's `NFTokenID`, a different field.

Re-sourced to `binary-format.md` line 436, the only place the type is actually
defined: `Hash256` is the legacy name for `UInt256`, which "is typically
represented in JSON as hexadecimal" (64 chars). The runtime error string keeps
`(Hash256)`, which is correct there — it annotates a single indexed element.

---

## Known open items

1. **38 `AMBIGUOUS_FILENAME` citations** — 37 resolved by content during the
   audit; the resolutions were verified but the checker still reports them as
   ambiguous, so a re-run will keep flagging them until its disambiguation is
   improved.
2. **Citations inside runtime error messages** — five factories embed spec
   references in thrown error strings. **Decision: keep them for now.** The
   error tells a developer which rule they broke, which is the package's whole
   thesis. The cost is that citation accuracy becomes a runtime concern and
   those line numbers drift; re-verify them during audits. Documented in
   `CONTRIBUTING.md`.
4. **32 "blank line" warnings were false alarms** — blank lines inside a
   correctly cited *range* are normal separators. The checker's advisory
   should be narrowed to "cited range contains no non-blank line" to avoid
   crying wolf on the next run.

## Resolved after this audit

- **Milvus collection collision.** `128-xrp-tx-builder` and this project both
  targeted `codebase_chunks` on port 19530 — and 128 pointed at *this* project's
  live stack, so indexing there would have overwritten this index. 128 now uses
  port 19531, collection `codebase_chunks_xrplt`, HTTP :7800. This project owns
  `codebase_chunks` on :19530. Recorded in `AGENTS.md`.


---

## Method notes

Tier 1 was mechanical (does the path resolve, does the line exist, is it
non-blank). Tier 2 was judgment (does this text support this claim) and was run
by re-using three existing sub-agents, each on a disjoint slice: one on the
unparsed xrpl.js symbols, one on the rippled citations, one on the checker's
own blank/ambiguous output. No worker wrote to the repository.

Three claims from workers were checked by hand and **corrected** before
application:

- an ADR claimed `SponsorshipSet.cpp` and `STAmount.cpp` do not exist at 3.4.0;
  both do. Corrected to the verified pair (`Amount.cpp`,
  `XChainAccountCreateCommit.cpp` — the only two of 12 that genuinely fail).
- an ADR embedded a machine-specific absolute path for the sibling package.
- the first rename pass derived citation filenames from the *sibling* package's
  class names rather than from the xrpl.js mirror, and broke 6 citations.
