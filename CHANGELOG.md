# Changelog

All notable changes to `xrpjson` are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Most fixes in this project were **found by a separate downstream test harness**,
[173-xrpjson-testing](https://github.com/Jonathan-Dobson/173-xrpjson-testing),
which exercises all 79 functional factories at the unit contract and against a
live XRPL testnet. Entries below name the surface that surfaced the change, so
a reader can tell a ledger-facing behaviour change from an internal cleanup.

## [Unreleased]

## [1.6.1] — 2026-11-01

### Changed

**The field-ownership index is roughly half the size it was.** The table
that lets a factory reject a field belonging to another transaction now
stores an *index* into a shared tuple of transaction type names, instead of
repeating the name for every one of its 321 (field, type) pairs.

Measured with Rollup, bundling an entry that imports only `payment`:

| | 1.6.0 | 1.6.1 |
|---|---|---|
| field-ownership index | 13,377 B / 9,556 B minified | 9,830 B / 4,849 B minified |
| Payment-only bundle | 32,154 B / 14,300 B minified | 28,607 B / 9,593 B minified |

**This is an internal change with no behavioural difference.** 5,616
(transaction type, field name) pairs were compared against the published
1.6.0 implementation: every accept/reject decision *and* every error
message string is identical. The error still names the transaction that
accepts the field — `Payment: "DestinationTag" is not a field on this
transaction. It belongs to: AccountSet.`

The index still ships in full, because it cannot tree-shake: rejecting a
field that belongs to another transaction requires knowing every field name
the library knows, so that "foreign" can be told apart from "a field a
future amendment adds". What changed is how much of it there is.

The audit's own proposed remedy for this — one module per field, so a
bundler keeps only the fields the consumer's factory declares — was
measured and cannot work: a Payment-only consumer would then have no way to
tell a foreign field from an unknown one, and would let `DestinationTag`
through. 143 one-field modules also measured *larger* than the single
table. See
[`docs/audit/2026-11-01-code-quality-audit.md`](./docs/audit/2026-11-01-code-quality-audit.md),
P2-1.

## [1.6.0] — 2026-11-01

Closes the last two open items from the whole-project review in
[`docs/audit/2026-11-01-code-quality-audit.md`](./docs/audit/2026-11-01-code-quality-audit.md),
and fixes one new finding the review did not cover.

### Added

- **`accountSet` models `NFTokenMinter` and `WalletLocator`.** Both are real
  AccountSet fields — `sfNFTokenMinter` (ACCOUNT) and `sfWalletLocator`
  (UINT256) — that the library previously passed through unvalidated, so an
  arbitrary value reached the wire. `NFTokenMinter` must be a valid address
  (the same check xrpl.js applies at
  `models/transactions/accountSet.ts:165,181`). `WalletLocator` must be a
  64-character hex string; rippled reads it as a `uint256` and treats an
  all-zero value as "unset the locator" rather than "set it to zero"
  (`src/libxrpl/tx/transactors/account/AccountSet.cpp:428–442`).
- **`ledgerStateFix` models `BookDirectory`.** The `uint256` key of the book
  directory whose exchange rate needs fixing — the field fix type `2` exists
  to carry (`src/libxrpl/tx/transactors/system/LedgerStateFix.cpp:107`).

### Fixed

**`accountSet` now enforces rippled's `NFTokenMinter` ↔
`asfAuthorizedNFTokenMinter` coupling.** rippled requires the minter when the
flag is set and forbids it when the flag is cleared; both mistakes are
`temMALFORMED` at the ledger:

```
if (uSetFlag == asfAuthorizedNFTokenMinter && !tx.isFieldPresent(sfNFTokenMinter))
    return temMALFORMED;
if (uClearFlag == asfAuthorizedNFTokenMinter && tx.isFieldPresent(sfNFTokenMinter))
    return temMALFORMED;
```

— rippled `src/libxrpl/tx/transactors/account/AccountSet.cpp:159–163`. The
factory checked neither, so `accountSet({ Account, SetFlag: 10 })` constructed
successfully and the ledger rejected it. xrpl.js models the field and checks
its shape but not the coupling.

**`ledgerStateFix` now enforces rippled's fix-type rules.** The factory
accepted any UInt16 as `LedgerFixType`, and accepted either fix-specific
field on either fix type. rippled implements exactly two fix types and
requires each to carry exactly one fix-specific field — its own, present, and
the other one absent:

| `LedgerFixType` | Requires | Forbids |
|---|---|---|
| `1` — NFToken-page-links | `Owner` | `BookDirectory` |
| `2` — book exchange rate | `BookDirectory` | `Owner` |

Sources: rippled
`include/xrpl/tx/transactors/system/LedgerStateFix.h:19–22` (the fix types),
`src/libxrpl/tx/transactors/system/LedgerStateFix.cpp:27–30` (`kLedgerFixFields`),
`:44–53` (`hasUnexpectedFixField`), `:58–74` (`tefINVALID_LEDGER_FIX_TYPE` for
an unknown type) and `:76–79` (`temINVALID` for the wrong fix-specific field).

**This is a behaviour change.** A `ledgerStateFix` that previously
constructed and then failed at the ledger now fails at construction. Three
cases are newly rejected: a `LedgerFixType` outside `{1, 2}`, a type-1 fix
carrying `BookDirectory`, and a type-2 fix carrying `Owner` (or missing
`BookDirectory`). `LedgerFixType: 65535` used to construct; it no longer
does.

Note that the xrpl-dev-portal reference page for this transaction still
documents only fix type `1` and does not mention `BookDirectory` — it trails
the ledger, which has shipped type `2` (`BookExchangeRate`) behind the
`fixCleanup3_2_0` amendment. The library follows the ledger.

### Changed

- **`accountSet` now rejects a `WalletLocator` that is not a 64-character hex
  string.** The field was previously unmodelled, so it passed through
  unchecked — including as an object, which rippled cannot parse as a
  `uint256`. One test in `tests/fp/field-index.test.ts` pinned that
  unvalidated shape; it now pins the shape the ledger accepts.
- **The field-index divergence report shrank from four protocol-only fields to
  one.** `NFTokenMinter`, `WalletLocator` and `BookDirectory` are now modelled,
  so `WalletSize` is the only field the protocol contributes that the library
  does not model. It stays unmodelled deliberately: it is a real AccountSet
  field (UInt32) that the codec accepts on the wire but that **no rippled
  transactor ever reads**, so a typed prop and a guard for it would describe a
  field with no effect. The reason is recorded in `account-set.ts`.

Tests: 4,126 → 4,149. New coverage in `tests/fp/account-set.test.ts`
(the `NFTokenMinter` and `WalletLocator` blocks) and
`tests/fp/ledger-state-fix.test.ts` (the *fix-type field matrix* block).

## [1.5.1] — 2026-11-01

### Fixed

**`ammDeposit` now enforces rippled's per-deposit-mode field rules.**
`AMMDeposit::preflight` fixes which of `Amount`, `Amount2`, `EPrice`,
`LPTokenOut` and `TradingFee` may accompany each deposit mode:

| Mode | Requires | Forbids |
|---|---|---|
| `tfLPToken` | `LPTokenOut`; `Amount` and `Amount2` together or not at all | `EPrice`, `TradingFee` |
| `tfSingleAsset` | `Amount` | `Amount2`, `EPrice`, `TradingFee` |
| `tfTwoAsset` | `Amount`, `Amount2` | `EPrice`, `TradingFee` |
| `tfOneAssetLPToken` | `Amount`, `LPTokenOut` | `Amount2`, `EPrice`, `TradingFee` |
| `tfLimitLPToken` | `Amount`, `EPrice` | `LPTokenOut`, `Amount2`, `TradingFee` |
| `tfTwoAssetIfEmpty` | `Amount`, `Amount2` | `EPrice`, `LPTokenOut` |

The factory checked the mode flag itself but none of this, so a
`tfSingleAsset` deposit carrying `Amount2` constructed successfully and was
rejected by the ledger with `temMALFORMED`.

The matrix replaces the three generic cross-field rules the factory used to
check (`Amount` with `Amount2`, `Amount` with `EPrice`, and at least one of
`LPTokenOut` or `Amount`). Every combination those rejected is rejected by
the matrix too — but the message now names the mode and the offending
field, and the rules the generic form could not express are caught at all.

**This is a behaviour change.** A deposit that was previously accepted and
then failed at the ledger now fails at construction, with a message naming
the mode. The three generic messages are gone:

- `AMMDeposit: must set Amount with Amount2`
- `AMMDeposit: must set Amount with EPrice`
- `AMMDeposit: must set at least LPTokenOut or Amount`

The forbidden check runs before the required check: a field the mode forbids
has to be removed regardless of what else is wrong, whereas a missing
required field might be satisfied by a different valid shape.

Source: rippled `src/libxrpl/tx/transactors/dex/AMMDeposit.cpp:66–112`.
Found by: the whole-project review
([`docs/audit/2026-11-01-code-quality-audit.md`](./docs/audit/2026-11-01-code-quality-audit.md)),
P2-3.

Tests: 4,119 → 4,126. The new *deposit-mode field matrix* block in
`tests/fp/amm-deposit.test.ts` drives the matrix from a transcription of
rippled's branches: every mode's minimal valid shape is accepted, every
field each mode forbids is rejected, every required field is enforced when
missing, and `tfLPToken`'s together-or-neither rule is checked in all four
combinations.

## [1.5.0] — 2026-11-01

Remediates the findings of the whole-project review in
[`docs/audit/2026-11-01-code-quality-audit.md`](./docs/audit/2026-11-01-code-quality-audit.md).

### Added

- **`payment` models `CredentialIDs` and `DomainID`.** Both fields are in
  rippled's `ttPAYMENT` block and are validated by xrpl.js 5.3.0, but this
  library accepted them without checking them, so an arbitrary value reached
  the wire. `CredentialIDs` must be a non-empty array of at most 8 entries,
  each a 64-character hex string, with no duplicates — the same rule
  `accountDelete` applies to the same field. `DomainID` must be a
  64-character hex string. Sources: rippled
  `include/xrpl/protocol/detail/transactions.macro`; xrpl.js
  `models/transactions/payment.ts:214–218` and `:225`.
- **`ammDeposit` models `TradingFee`.** rippled's `ttAMM_DEPOSIT` block lists
  `{sfTradingFee, SoeOptional}`, and `AMMDeposit::preflight` permits it in
  exactly one deposit mode. The field is accepted only with the
  `tfTwoAssetIfEmpty` mode and must be an integer in `[0, 1000]`
  (`kTradingFeeThreshold`, `include/xrpl/protocol/AMMCore.h:16`).
- **`npm run check:field-index`** — regenerates the field-ownership index, the
  assertion file and the divergence report, and fails on any diff. Wired into
  CI and into the publish workflow, so the committed artifacts can no longer
  drift from their sources. This closes the only drift the compile-time
  assertions could not catch: the protocol half of the table, which comes
  from `ripple-binary-codec`.
- **`ripple-binary-codec` is an explicit devDependency**, pinned exactly to
  `2.11.0`. It is a build input for a committed artifact — the generator reads
  its `definitions.json` directly — so it should be pinned by intent rather
  than inherited by transitivity through `xrpl`.
- **`docs/field-index-divergences.md`** — the generator's protocol-divergence
  report, written to a committed file instead of printed and lost. It records
  which fields the Ledger accepts but this library does not model, and where
  the field-ownership index catches them. Regenerated and diff-checked by CI.
- **`tests/fp/account-guard.test.ts`** — a repo-wide invariant: every factory
  rejects a malformed `Account`, and every factory accepts a well-formed
  classic or X-address.
- **`"sideEffects": false`** in `package.json`. The package is side-effect-free
  by construction; webpack-class bundlers need the field to drop unused
  re-exports from the 79-export barrel.

### Changed

- **`Account` is now validated as a well-formed XRPL address in all 79
  factories.** Eight factories — `credentialAccept`, `credentialCreate`,
  `oracleSet`, `permissionedDomainSet`, `vaultCreate`, `vaultDelete`,
  `vaultDeposit`, `vaultSet` — checked it with `isString` only, so
  `Account: 'not-an-address'` constructed successfully and the error surfaced
  on some other field. The other 71 already used `isAccount`.

  **This is a behaviour change.** A caller passing a non-address string as
  `Account` used to get a transaction and now gets a `ValidationError`. The
  rule is the ledger's own — rippled parses `Account` as an `AccountID` and
  rejects anything that is neither hex nor valid base58
  (`src/libxrpl/protocol/STParsedJSON.cpp:919`) — and it matches the
  library's own contribution template. The check is deliberately format-only:
  it rejects garbage strings but still accepts a well-formed address whose
  checksum does not verify, which is caught by the ledger.

- **`src/fp/field-index.assert.*` is no longer published.** It is a type-only
  file with no runtime consumer; excluding it removes ~22 KB from the tarball.

### Fixed

- **Four divergence blocks cited xrpl.js incorrectly.** `permissioned-domain-delete`,
  `loan-delete`, `amm-delete` and `amm-vote` all claimed that xrpl.js's
  `validateBaseTransaction` checks `Account` via `isAccount`. It uses
  `isString` — `models/transactions/common.ts:987` — as does the Class API
  (`xrplt src/validation/base.ts:40–41`). The guard is still a legitimate
  divergence, but it rests on rippled's parsing, not xrpl.js's, and the
  citations now say so.

- **Every factory now carries a `## Divergences` block.** `loan-set`,
  `mptoken-issuance-create`, `payment` and `vault-create` had none, which
  `CONTRIBUTING.md:166–170` calls out as a finding in its own right, and the
  README claimed all 79 did. Eleven further factories applied the `Account`
  guard without documenting it; those now have an entry for it.

- **The generator's rationale comment described a behaviour that no longer
  exists.** It justified the two-source merge with `AccountSet` declaring
  `NFTokenBrokerFee`, which the library stopped declaring in `a2685e7`. It
  now describes both directions of the codec's lag.

- **The README overstated tree-shaking.** "Importing one pulls in only that
  factory's code (full tree-shaking)" is true of the factory code and false
  of the shared field-ownership table, which cannot tree-shake: catching a
  field used on the wrong transaction requires knowing every field on every
  type. The README now says what actually ships.

Tests: 4,089 → 4,119.

Found by: a whole-project review pass
([`docs/audit/2026-11-01-code-quality-audit.md`](./docs/audit/2026-11-01-code-quality-audit.md)).

## [1.4.3] — 2026-11-01

### Fixed

**A caller could override `TransactionType` on any factory.** `buildFrozenTx`
spread the caller's field set *after* the factory's transaction-type literal,
so a caller-supplied `TransactionType` won:

```js
offerCreate({
  Account: 'r…',
  TakerGets: '1000000',
  TakerPays: { currency: 'USD', issuer: 'r…', value: '1' },
  TransactionType: 'Payment',   // ← injected
});
// → tx.TransactionType === 'Payment'
// → tx.toJSON().TransactionType === 'Payment'
```

The frozen tx then claimed to be a `Payment` while carrying `OfferCreate`'s
fields, and `toJSON()` serialised that mismatch to the wire — the exact shape
of failure the field-ownership index exists to prevent, one level up. The
override also survived `.with()`, which re-validated the tampered bag rather
than restoring the factory's literal.

The props interfaces already omit `TransactionType`, so a **TypeScript** caller
could not do this — but the package ships JavaScript, and a JavaScript caller
had no guard at all. The hazard was already documented in
`src/fp/factories/payment.ts` ("`buildFrozenTx` spreads the field set AFTER
setting it — a caller-supplied value would win") and mitigated only at the type
layer.

The fix is at the one choke point every factory and every `.with()` override
passes through: `buildFrozenTx` now drops `TransactionType` from the caller's
field set, so the factory's literal always wins. `mergeForWith` skips the key
too, so a tx's own type is not re-fed into the props bag on `.with()`.

The value is discarded rather than rejected, deliberately: `.with()` legitimately
re-feeds the current tx's own `TransactionType` back through `mergeForWith`, so
throwing would break every `.with()` call.

Tests: 4,085 → 4,089. The regression cases live in
`tests/fp/field-index.test.ts` under *TransactionType is factory-owned*.

Found by: a whole-project review pass
([`docs/audit/2026-11-01-code-quality-audit.md`](./docs/audit/2026-11-01-code-quality-audit.md)).

### Fixed

**The generated field-ownership index carried stale statistics.** `a2685e7`
hand-edited `src/fp/field-index.ts` — a file marked *GENERATED — do not edit* —
to drop `AccountSet` from `NFTokenBrokerFee`'s owner set, and did not update the
header, which still claimed *322 field/type pairs; 87 fields valid on exactly
one type*. The table it describes holds **321** pairs and **88** single-type
fields. Regenerating the file fixes the header; the rows were already correct.

## [1.4.2] — 2026-10-09

### Documentation

Added a **Using it in a Node REPL** section. The package is ESM-only, and the
failure modes a REPL user hits look like a broken install rather than expected
behaviour — four consecutive attempts in a first session each read as a
failure when only one was a real mistake. Documented:

- `require()` is unavailable, and it fails with
  `ERR_PACKAGE_PATH_NOT_EXPORTED: No "exports" main defined` rather than the
  familiar `ERR_REQUIRE_ESM`, because the exports map declares only an `import`
  condition.
- **Static `import` is rejected by the interactive REPL** ("Cannot use import
  statement inside the Node.js REPL"). `await import()` is the working form.
  The restriction is the REPL's, not the package's.
- The `undefined` echoed after `const {…} = await import(…)` is the completion
  value of the declaration, not a failed import.
- `payment()` with no argument throws a raw `TypeError` before validation runs,
  since `props` is `undefined` and the first `require(props.X, …)` has nothing
  to read.
- Required fields are reported one at a time, so a session feels like
  whack-a-mole; the section gives the `factory.toString()` trick that lists
  them at once.
- The four-entry import table (`xrpjson`, `/flags`, `/errors`, `/validation`) and
  a note that deep paths are blocked by the closed `exports` map.

Sample output is copied verbatim from a real pty-backed REPL session, including
indentation and trailing semicolons. A piped `node` invocation is not the REPL
and accepts syntax the REPL rejects — verifying this way matters.

No code changes.

## [1.4.1] — 2026-10-07

Carries the fix below on top of **1.4.0**. Note that 1.4.0 was never published to
npm: it was released as a commit and a `package.json` bump, but no GitHub Release
was created, so `npm-publish.yml` never fired. npm's `latest` moved 1.3.0 → 1.4.1
with 1.4.0's fix included.

### Fixed

`accountSet` accepted `NFTokenBrokerFee`, which the protocol does not put on
`AccountSet`. Sending it reached the ledger and failed there with
`Field 'NFTokenBrokerFee' found in disallowed location.` The field now raises at
construction, naming `NFTokenAcceptOffer` as the transaction that owns it, and
the field-ownership index no longer lists `AccountSet` as an owner.

Found by cross-checking every factory's declared fields against rippled's own
`transactions.macro` and `sfields.macro` plus its `TxFormats::getCommonFields()`
common-field injection. Tests: 4,084 → 4,085.

**Upgrade note — this is a compile-time break.** `NFTokenBrokerFee` is gone from
`AccountSetProps`, so TypeScript now rejects it at build time rather than the
ledger rejecting it at submit time:

```
error TS2353: Object literal may only specify known properties,
and 'NFTokenBrokerFee' does not exist in type 'AccountSetProps'.
```

Anyone who set that field must delete the property and move it to an
`nftokenAcceptOffer` call. The runtime behaviour change is a strict improvement
— the error now arrives at construction with the owning transaction named in the
message, instead of as an opaque codec rejection — but it is still a break, which
is why this is a patch on a surface that narrowed rather than a routine bump.

## [1.4.0] — 2026-10-07

### Fixed

A field belonging to a **different transaction type** passed through
construction untouched and reached the serialised transaction, where the codec
refused it with `Field 'X' found in disallowed location.` — an error naming the
field but not the mistake. Found by
[173-xrpjson-testing](https://github.com/Jonathan-Dobson/173-xrpjson-testing)
Bug #11. Tests: 4,023 → 4,084.

- **A real field on the wrong transaction was accepted.**
  `setRegularKey({ Account, DestinationTag: 42 })` constructed and reached
  `toJSON()`. Nothing at the call site looks wrong — `DestinationTag` is a
  genuine XRPL field, valid on `Payment` — which made this the worse of the two
  shapes. `buildFrozenTx` now rejects it and names the transactions that do
  accept the field.

- **The check runs at the single choke point** every factory and every
  `.with()` override already passes through, so all 79 factories are covered
  and the throw cannot be bypassed by deriving a transaction with `.with()`.

- **The index is generated from two sources, not one.** A
  `fieldName -> Set<TransactionType>` table is built by
  `scripts/gen-field-index.mjs` from this library's 79 props interfaces **and**
  from the protocol's own `TRANSACTION_FORMATS` table
  (`ripple-binary-codec`, a devDependency). Either alone is wrong: an
  interfaces-only index cannot catch a misplacement of a field the library
  does not model, and a protocol-only index would reject `NFTokenBrokerFee` on
  `AccountSet`, which this library supports and codec 2.11.0 does not. The
  union can only ever **widen** a field's accepted-type set, so no call that
  works today can start failing. It adds 4 fields the library does not model
  (`BookDirectory`, `NFTokenMinter`, `WalletLocator`, `WalletSize`), which are
  now caught on the wrong transaction.

- **Forward-compatibility is preserved deliberately.** A field with no index
  entry is one the library does not model yet, and still passes —
  `BaseTransactionFields` carries `[key: string]: unknown`
  (`src/types/base.ts:100`) for exactly that case. A strict per-type key set
  would have converted that hatch into a throw. The rule is *reject only when
  known and absent for this transaction*, never *reject when unrecognised*.

- **A completely unrecognised field still passes**, as before. A typo like
  `TotallyBogusField` is indistinguishable from a future amendment field to a
  library with a closed global field list; catching it would require an
  allowlist and would break the hatch above.

- **The generated table cannot silently drift.** `field-index.assert.ts` makes
  the build fail — naming the offending field — when a props interface gains a
  field the index does not carry, when the index names a transaction this
  library does not implement, or when it carries a key that is neither
  declared nor protocol-derived. Each was verified by negative probe.

Three **over-strict** flag validations, all found by
[`docs/audit/2026-10-02-flag-contradiction-audit.md`](./docs/audit/2026-10-02-flag-contradiction-audit.md).
Each refused a transaction rippled accepts — the library could not build
input the ledger would take. Ledger-verified on XRPL testnet.

- **`sponsorshipTransfer` refused `spfSponsorFee`.** `SponsorFlags` was
  restricted to the `spfSponsorReserve` bit alone, so the documented
  fee-and-reserve combination (`SponsorFlags: 3`) was unconstructible.
  rippled keeps the two bits in two independent, non-overlapping predicates —
  `isFeeSponsored` and `isReserveSponsored`
  (`include/xrpl/ledger/helpers/SponsorHelpers.h:32-45`) — and its
  `spfSponsorFlagMask` excludes *both* from the invalid set
  (`TxFlags.h:461`). xrpl.js 5.3.0 agrees, using
  `validFlags = spfSponsorFee | spfSponsorReserve`
  (`models/transactions/common.js:316`). The mask now matches.

- **`mptokenIssuanceCreate` ignored a boolean-map `Flags`.** A
  `Flags: { tfMPTCanTransfer: true }` object was collapsed to `0` before the
  cross-field gates, so a caller who correctly set the bit was told their
  `TransferFee` needed a flag they had just set. The map is a documented
  input form — `MPTokenIssuanceCreateFlagsInterface` declares it — and the
  sibling `mptokenIssuanceSet` factory already resolved it correctly. The two
  MPT factories disagreed with each other; they no longer do.

- **`nftokenMint` rejected `TransferFee: 0` without `tfTransferable`.** The
  gate was on field *presence*; rippled gates on *value*
  (`NFTokenMint.cpp:94`, `f > 0u`). XLS-20 §1.5.1 line 367 and xrpl.org
  `nftokenmint.md` line 52 both say presence, so the old behaviour was
  defensible against the prose and wrong against the implementation. **Settled
  on a live ledger:** `TransferFee: 0` is accepted and `TransferFee: 1` is
  rejected under identical flag state. The prose is the thing that is wrong;
  the divergence is documented at the check.

### Added

- `integration` coverage for all three, in the downstream harness
  [`173-xrpjson-testing`](https://github.com/Jonathan-Dobson/173-xrpjson-testing)
  as suite `[15]` (`15-flag-defect-verification.mjs`) plus a
  `xrpl@5.3.0`-backed check for `SponsorshipTransfer`. 10 passed, 0 failed,
  1 skipped. 9 new unit tests here (+2,849 → +2,858).

## [1.3.0] — 2026-10-05

### Fixed

The seven base transaction fields — `Memos`, `SourceTag`,
`LastLedgerSequence`, `AccountTxnID`, `NetworkID`, `Delegate`,
`TicketSequence` — were declared in `BaseTransactionFields` and checked by
`validateBaseTransaction`, but were **invisible to the type system and
unchecked at construction in most factories**. Both halves are now closed for
all 79. Tests: 2,948 → 4,023.

- **The seven fields were missing from every props interface.** A caller
  passing a well-formed `TicketSequence` got a type error; a caller passing
  a malformed one got no error at all, because the field was not in the type
  and no validator ran. Every factory now inherits them and calls
  `validateBaseTransaction` after its own checks, so the field is both
  accepted and checked.

- **The inheritance the previous conversion used was inert.** The
  `Omit<BaseTransactionFields, 'TransactionType' | 'Flags'>` in the
  already-converted factories did not subtract two keys from fourteen.
  `BaseTransactionFields` ends with `readonly [key: string]: unknown`, which
  widens `keyof` to `string | number`; since `Omit` is defined in terms of
  `keyof`, the result collapsed to a bare index signature and discarded every
  named member. A props interface built that way accepted a **missing
  `Account`**, accepted misspelled field names, and accepted any value type —
  it read as correct and enforced nothing. Adds `BasePropsFields`, a
  key-remapped view that drops the index signature while keeping each named
  field's exact declared type, and uses it in all 79 props interfaces.

- **58 factories never called the validator.** A prior survey recorded 38/79
  as already calling it; the true count was 10. The other 28 matched JSDoc
  prose such as *"inherits `validateBaseTransaction`'s `isString(Account)`
  check"*. `vaultClawback` was filed as "type done, runtime missing" but had
  no import and no `extends` clause at all, only a comment mention.

Ordering is load-bearing and covered by tests: the base call sits after each
factory's own checks, so a specific mistake still yields its specific message
(`setRegularKey`'s `temBAD_REGKEY` and `ledgerStateFix`'s ≥2,000,000 Special
Transaction Cost floor both still win over the base backstop).

### Behaviour change

58 factories now **throw** on a malformed base field where they previously
constructed silently. This is the documented contract finally being enforced
— the module docstring has always promised *"There is no way to build an
invalid tx"* — but code that relied on the permissive behaviour will now see
`ValidationError`. Not a major bump because the old behaviour was the defect,
and 1.2.0 is the last version that exhibited it.

### Known issue (not addressed here)

`toJSON` serialises **every** enumerable key off the frozen object, so an
unrecognised prop bypasses all validation and reaches the wire format:

```js
setRegularKey({ Account, TotallyBogusField: 12345 })
// → toJSON() includes TotallyBogusField
```

TypeScript rejects this at compile time; JavaScript does not, and JS is how
the package is consumed. Tracked separately — see
[`DIVERGENCES.md`](https://github.com/Jonathan-Dobson/173-xrpjson-testing/blob/main/DIVERGENCES.md)
in the downstream harness.

## [1.2.0] — 2026-10-02

### Fixed

- **`ammDeposit` enforced no mode-flag rule at all.** The XRPL requires an
  `AMMDeposit` to carry exactly one deposit-mode flag. `ammWithdraw` enforced
  that; `ammDeposit` accepted an absent `Flags`, an explicit `undefined`,
  `Flags: 0`, and multiple conflicting mode flags, all silently. `ammDeposit`
  now throws `ValidationError` in every one of those cases.

  The check masks before counting, which matters: the six deposit mode bits are
  **sparse**. `0x00020000` (`tfWithdrawAll`) and `0x00040000`
  (`tfOneAssetWithdrawAll`) are `AMMWithdraw` modes, so a naive
  `popcount(Flags)` would miscount a withdraw bit as a second deposit mode.
  rippled's own `tfDepositSubTx` (`TxFlags.h:409-410`) is built the same way,
  and the six bit values are taken from `TxFlags.h:169-176`.

  Sources: xrpl.org [`ammdeposit.md:129`](https://xrpl.org/docs/references/protocol/transactions/types/ammdeposit)
  — "You must specify **exactly one** of these flags" — byte-identical to
  `ammwithdraw.md:107`. Verified against a live ledger by suite [14] of the
  downstream harness; rippled answers `temMALFORMED` for both the zero-flag and
  two-flag cases.

  **Behaviour change.** Code that previously constructed an `AMMDeposit`
  without a mode flag will now throw. Those transactions were always rejected
  downstream, so this surfaces the error earlier and with a clearer message,
  but it is still a change in observable behaviour — hence the minor bump.

  Found by: sibling-factory diff (`ammDeposit` vs `ammWithdraw`) plus live
  suite [14]. Reported as Bug #6 in the harness's `DIVERGENCES.md`.

- **AMM factories checked flag *cardinality* but not flag *membership*.**
  rippled applies two independent checks to `AMMDeposit` flags. First
  `getFlagsMask` — every set bit must be legal for the transaction type, or
  the result is `temINVALID_FLAG`; that mask is built as
  `~(tfUniversal | <the six deposit flags>)` (`TxFlags.h:264-266`, `169-176`,
  `43-46`). Then `preflight` — exactly one mode bit, or `temMALFORMED`
  (`AMMDeposit.cpp:72`). The fix above implements only the second, in both
  `ammDeposit` and `ammWithdraw`.

  The practical effect: `Flags: tfSingleAsset | tfWithdrawAll` contains exactly
  one *deposit* mode, so the count check passed, yet the ledger refused the
  whole transaction with `temINVALID_FLAG`. A caller who trusted the factory
  got a transaction object that could not be submitted.

  Both factories now build the same validity mask rippled uses and reject any
  bit outside it, before the cardinality check. `tfFullyCanonicalSig` and
  `tfInnerBatchTxn` remain legal, since they are in `tfUniversal`.

  Found by: the live verification commissioned for the fix above. Confirmed
  against testnet — the ledger returns `temINVALID_FLAG`, not `temMALFORMED`,
  which is what distinguishes the two checks. Reported as Bug #7 downstream.

> **Version note.** `v1.2.0` was tagged before this second fix landed. Nothing
> had been pushed — `origin/main` was still behind local `main` — so both AMM
> flag fixes are folded into the 1.2.0 section above rather than split across
> two versions. **The `v1.2.0` tag now points at an earlier commit and needs
> `git tag -f v1.2.0` before publishing.**

## [1.1.0] — 2026-10-01

### Fixed

- **`accountSet` (TickSize) and `payment` (DeliverMin) threw a bare `Error`**
  rather than a `ValidationError`, unlike the other 729 throw sites in the
  package. `instanceof ValidationError` now holds for every rejection the
  library raises.

  Found by: an upstream citation audit rather than a failing test — the
  pre-existing suite asserted *that* invalid input was rejected but never
  *what kind* of error it produced, so nothing noticed. The harness now pins
  the type with `tests/unit-error-contract.mjs`.

## [1.0.5] — 2026-09-30

### Changed

- Added `./errors` and `./flags` to the public exports map. `ValidationError`
  and the `*Flags` enums were previously not reachable from the package root,
  which made `instanceof` checks silently return `false` for consumers.

## [1.0.4] — 2026-09-30

### Fixed

- **`accountSet` did not require `Account`**, silently accepting a missing
  signer. `xrpl.js`'s `validateBaseTransaction` rejects it, as does the
  ledger.

  Found by: the downstream generic harness, which expects every factory to
  throw on `{}`.

## [1.0.3] — 2026-09-30

### Fixed

- **`escrowCreate`'s Ripple Epoch lower bound was wrong.** It rejected any
  finish time before `946684800` — the Unix epoch — when the field is seconds
  since the *Ripple* epoch, so the bound should be `0`. A finish time a few
  seconds in the future was rejected as "before Ripple Epoch".

  Found by: downstream integration suite [6], submitting `xrplNow() + 8`.

## [1.0.2] and earlier

Not reconstructed here. `git log` predates this file; consult the repository
history for those releases.

[Unreleased]: https://github.com/Jonathan-Dobson/xrpjson/compare/v1.5.1...HEAD
[1.5.1]: https://github.com/Jonathan-Dobson/xrpjson/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/Jonathan-Dobson/xrpjson/compare/v1.4.3...v1.5.0
[1.4.3]: https://github.com/Jonathan-Dobson/xrpjson/compare/v1.4.2...v1.4.3
[1.2.0]: https://github.com/Jonathan-Dobson/xrpjson/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Jonathan-Dobson/xrpjson/compare/v1.0.5...v1.1.0
[1.0.5]: https://github.com/Jonathan-Dobson/xrpjson/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/Jonathan-Dobson/xrpjson/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/Jonathan-Dobson/xrpjson/compare/v1.0.2...v1.0.3
