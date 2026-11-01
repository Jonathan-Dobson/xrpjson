# Code quality & architecture audit — 2026-11-01

Whole-project review of `xrpjson` 1.4.2: 79 functional transaction factories,
the shared validation layer, the generated field-ownership index, and the
package/release surface.

> Scope: every factory in `src/fp/factories/`, the shared modules under
> `src/validation/`, `src/types/`, `src/fp/`, the generator, CI, and the
> published package shape. Method: source reading plus mechanical probes
> against the built package (`dist/`), not a diff review — the working tree
> was clean at `21fc672`.

**Baseline before any change:** `npm run lint` exit 0 · `npx tsc --noEmit`
exit 0 · `npm test` **4,085 passed** across 80 files.

---

## Resolution

Every finding below was remediated in **1.4.3** and **1.5.0**. The findings
are kept below as written, with the outcome noted on each; two claims in the
original text were wrong and are corrected in place.

| # | Finding | Outcome |
|---|---|---|
| P0-1 | A caller could override `TransactionType` on any factory | **Fixed in 1.4.3** — closed at the shared choke point, 4 regression tests |
| P1-1 | 10 (field, transaction) pairs reach the wire unvalidated | **Fixed in 1.5.0** — 7 of the 10 pairs now have real guards (`Payment.CredentialIDs`, `Payment.DomainID`, `AMMDeposit.TradingFee`); the remaining 3 pairs are fields the library does not model at all, and are now recorded in a committed gap report |
| P1-2 | 8 of 79 factories do not validate `Account` as an XRPL address | **Fixed in 1.5.0** — all 79 now use `isAccount`; a repo-wide invariant test enforces it |
| P1-3 | The generated index has no guard that it matches its generator | **Fixed in 1.5.0** — CI regenerates and diffs; the codec is pinned as an explicit dependency |
| P2-1 | The README's tree-shaking claim is overstated | **Fixed in 1.5.0** — the README now states what actually ships; `sideEffects: false` added; the type-only assert file no longer ships |
| P2-2 | The README's "`## Divergences` header" claim is false for four factories | **Fixed in 1.5.0** — all 79 now carry a `## Divergences` block |
| P3 | Stale generator rationale; the divergence report was only printed | **Fixed in 1.5.0** — comment corrected, report written to `docs/field-index-divergences.md` |
| **new** | `ammDeposit` does not implement rippled's per-deposit-mode field rules | **Fixed in 1.5.1** — the full per-mode matrix is enforced; see P2-3 |

Two claims in the original text were wrong, and are corrected in place:

- The original P1-2 said the 71 stricter factories "do not record" the
  Account guard in their `## Divergences` blocks. **57 of 79 did.** The real
  gap was narrower: 11 factories applied the guard without documenting it,
  and 4 had no `## Divergences` block at all.
- The original P1-2 also reported that
  `permissioned-domain-delete.ts` cites xrpl.js as checking `Account` via
  `isAccount`. **That citation was false** — xrpl.js uses `isString`. Three
  more factories (`loan-delete`, `amm-delete`, `amm-vote`) carried the same
  false citation. All four are corrected.

---

## TL;DR

`xrpjson` is a well-built, unusually disciplined library. Its vocabulary
(`CONTEXT.md`), its four ADRs, its two prior audits, its citation
conventions, and its compile-time drift assertions are all above the norm for
a package this size, and the 4,085-test suite is genuinely fast. The
generated field-ownership index and the `## Divergences` discipline are the
two load-bearing ideas, and both work.

Six findings, none of which is a design failure:

1. **P0 — a caller could override `TransactionType` on any factory**
   (fixed in this pass). `buildFrozenTx` spread the caller's field set *after*
   the factory's type literal, so `offerCreate({ …, TransactionType: 'Payment' })`
   returned a frozen tx that claimed to be a Payment while carrying
   OfferCreate's fields, and `toJSON()` put that mismatch on the wire. The
   type layer already blocked it for TypeScript callers; JavaScript callers —
   the people the package actually ships to — had no guard.
2. **P1 — 10 (field, transaction) pairs reach the wire unvalidated.** The
   protocol half of the field index widens runtime acceptance past what the
   library models or checks. `payment({ …, CredentialIDs: 'garbage' })`
   constructs and serialises.
3. **P1 — 8 of 79 factories do not validate `Account` as an XRPL address.**
   The other 71 do. All eight accept `Account: 'not-an-address'`.
4. **P1 — the generated index has no guard that it matches its generator.**
   Nothing in CI runs `scripts/gen-field-index.mjs`, and no assertion covers
   the protocol half of the table. A hand-edit already slipped through once
   (`a2685e7`), leaving the file's own header statistics wrong.
5. **P2 — the README's "full tree-shaking" claim is overstated**, measurably:
   the shared field-ownership table is 26% of a Payment-only bundle.
6. **P2 — the README's "Every factory file ships a `## Divergences` header"
   is false** for 4 of 79 factories, and three documents now disagree about
   whether that is a finding.

**Recommended order:** the P0 is done. Next, close the generator-output gap
(finding 4) — it is the cheapest and it protects the mechanism the library is
built on. Then settle finding 3, which is a policy question with a real
correctness cost, and finding 2, which is a design decision about the index.

---

## What's genuinely good

Worth preserving deliberately, because these are the parts a rewrite would
lose:

- **The vocabulary is enforced, not just written down.** `CONTEXT.md` pins
  *frozen tx*, *divergence*, *preclaim*, *Class API*, *Source* vs *Cross-ref*
  — and the factories use those words consistently. A codebase where the
  glossary matches the code is rare.
- **The field-ownership index is the right idea.** Rejecting a field only
  when it is *known and wrong for this type* (rather than allowlisting)
  preserves forward-compatibility for unmodelled amendment fields while still
  catching the mistake that matters — a real field on the wrong transaction.
  `src/fp/field-index.ts` is generated from two independent sources and the
  merge is documented as widening-only.
- **The compile-time drift assertions are genuinely load-bearing.** The
  `satisfies`-not-`Record` trick, the `UnionKeys` distribution over the
  props union, and the "assertions that name the offender" pattern
  (`src/fp/field-index.assert.ts:309-345`) are correct, and the comments
  explain *why each one is easy to accidentally disarm*. That is the kind of
  comment that earns its keep.
- **`BasePropsFields` is a subtle fix, properly documented.**
  `src/types/base.ts:103-139` explains that `Omit<BaseTransactionFields, …>`
  collapses to a bare index signature because of the trailing
  `[key: string]: unknown`, silently discarding every named member. Every
  factory uses `BasePropsFields`, so all 79 inherit the seven shared fields
  with real type checking.
- **Error discipline is uniform.** 735 throw sites across the 79 factories,
  **zero** bare `throw new Error`. Every one is a `ValidationError`, which is
  exactly what `CONTRIBUTING.md:103-106` demands and what makes
  `instanceof ValidationError` a usable branch for consumers.
- **The prior audits are honest.** `docs/audit/2026-10-02-flag-contradiction-audit.md`
  records a defect it fixed against the *implementation* where the prose said
  otherwise, cites the ledger test that settled it, and lists the gaps it did
  not fix. That is a higher standard than most.
- **Release hygiene is clean.** Trusted Publishing via OIDC, `sideEffects`-free
  of secrets, `dist/` and `scratch/` gitignored, CI mirrors the publish job.

---

## Architectural patterns

- **Shape.** `src/fp/factories/<kebab>.ts` (one per transaction type) →
  `src/fp/shape.ts` (`buildFrozenTx` / `mergeForWith` / `require`) →
  `src/validation/helpers.ts` (predicates) + `src/validation/base.ts`
  (`validateBaseTransaction`) → `src/types/` (props, flags, amounts) →
  `src/errors.ts` (`ValidationError`). The barrel `src/fp/index.ts` exports
  all 79 factories and their props types.
- **One choke point.** Every factory ends in
  `buildFrozenTx(txType, props, methods)`, which runs `assertKnownFields` over
  every key before freezing. Cross-cutting behaviour is implemented once, in
  that choke point, rather than in 79 places. This is the single most
  valuable structural decision in the codebase — and it is why the P0 below
  was a **one-line** fix rather than 79.
- **The frozen tx.** `Object.freeze({ TransactionType, ...fields })` plus
  three bound methods (`validate` / `toJSON` / `with`). `validate()` is a
  deliberate no-op for Class-API parity (`CONTEXT.md:27-31`).
- **The index.** `field → Set<transactionType>`, merged from the library's 79
  props interfaces (source B) and the codec's `TRANSACTION_FORMATS` table
  (source A). The merge only widens, so no working call can start failing.
- **Divergences as documentation.** Each factory's header block records the
  guards it adds beyond the Class API, each with a `Source:` (xrpl.js,
  xrpl.org, XLS) and optionally a `Cross-ref:` (rippled).

---

## P0 — critical (correctness)

### P0-1 · A caller could override `TransactionType` on any factory — **FIXED**

**Concern.** `buildFrozenTx` spread the caller's field set after the factory's
type literal, so a caller-supplied `TransactionType` won. The frozen tx then
claimed a type its own fields did not match, and `toJSON()` serialised that
mismatch to the wire.

**Evidence (before the fix).** `src/fp/shape.ts:85`:

```ts
const data = Object.freeze({ TransactionType: txType, ...fields });
//                                       ^^^^^^^^^^^^^^    ^^^^^^^
//                                       literal first     spread LAST — the caller wins
```

Reproduced against the built package:

```
offerCreate -> frozen tx TransactionType : Payment     ← asked for OfferCreate
offerCreate -> toJSON().TransactionType  : Payment
after .with({Fee}) TransactionType       : Payment      ← survives re-validation
payment      -> TransactionType: Batch
accountSet   -> TransactionType: Batch
```

`offerCreate({ Account, TakerGets, TakerPays, TransactionType: 'Payment' })`
returns a tx whose `toJSON()` is
`{TransactionType:'Payment', Account, TakerGets, TakerPays}` — a Payment
carrying OfferCreate fields. The ledger rejects it; the developer debugging it
is looking at the wrong transaction type.

**Why P0.** Every one of the 79 factories is affected, and the failure lands
on the wire rather than at the call site — the library's own thesis is
*"eager validation — an invalid transaction cannot be held in a variable at
all"* (`CONTEXT.md:27-31`), and this let exactly that happen. It also
contradicts the field-ownership index's whole purpose: that index exists so a
field on the wrong transaction is caught at construction, and the type literal
is the field that most needs to be right.

**The type layer already knew.** `src/fp/factories/payment.ts:37-39`:

> `TransactionType` is omitted because the factory injects it, and because
> `buildFrozenTx` spreads the field set AFTER setting it — a caller-supplied
> value would win. Inheriting it would put that hazard in the type.

All 79 props interfaces omit `TransactionType`, so a **TypeScript** caller
cannot do this. But the package ships JavaScript (`"type": "module"`, no
`dependencies`, ESM-only with `.d.ts` alongside), and a JavaScript caller has
no such guard. The hazard was mitigated in the type and left open at runtime.

**Fix.** Closed at the one choke point, so it covers all 79 factories and
every `.with()` override at once — `src/fp/shape.ts:101-103`:

```ts
const { TransactionType: _callerSupplied, ...ownFields } =
  fields as unknown as Record<string, unknown>;
const data = Object.freeze({ TransactionType: txType, ...ownFields });
```

`mergeForWith` now skips the key too (`src/fp/shape.ts:135`), so a tx's own
type is not re-fed into the props bag on `.with()`.

**Why the value is discarded rather than rejected.** `.with()` legitimately
re-feeds the current tx's own `TransactionType` back through `mergeForWith`;
throwing on a caller-supplied `TransactionType` would break every `.with()`
call. The factory's literal is authoritative, so the caller's copy is
dropped. (Verified: `tx.with({Fee:'12'})` still works on every factory.)

**Tests.** `tests/fp/field-index.test.ts` — new *TransactionType is
factory-owned* block, 4 cases: the literal wins over an injected value; it
wins across four factories from different families; it survives `.with()`
intact; and `TransactionType` stays the first key of `toJSON()`.

Tests: 4,085 → 4,089. `npm run lint` 0 · `npx tsc --noEmit` 0 · `npm test`
**4,089 passed**.

---

## P1 — high-priority tech debt

### P1-1 · Ten (field, transaction) pairs reach the wire unvalidated

> **Status — Fixed in 1.5.0, with one part deliberately left open.** The
> finding below is correct as written. The remediation splits the ten pairs
> in two: seven are fields the library *could* model and now does, and three
> are fields the library has no model for at all. Read the resolution at the
> end of this section before acting on the drill-deeper list, which
> describes the options as they stood before the decision was taken.

**Concern.** The index merges *protocol truth* into the ownership table so it
can catch a protocol field used on the wrong type. The side effect is that a
field the **library neither models nor validates** becomes acceptable at
runtime on the types the protocol allows it on — and then passes straight
through to the wire, unchecked.

**Evidence.** The generator reports four standing divergences between the
library and the protocol (`node scripts/gen-field-index.mjs`):

```
--- divergences (merged, not resolved) ---
  AMMDeposit: protocol-only       -> TradingFee
  AccountSet: protocol-only       -> NFTokenMinter, WalletLocator, WalletSize
  LedgerStateFix: protocol-only       -> BookDirectory
  Payment: protocol-only       -> CredentialIDs, DomainID
```

Those are 10 (field, type) pairs. All ten accept arbitrary garbage:

```
ammDeposit     — ACCEPTED:  TradingFee = 999
accountSet     — ACCEPTED:  NFTokenMinter = "not-hex", WalletLocator = "not-hex", WalletSize = 999
ledgerStateFix — ACCEPTED:  BookDirectory = "not-hex"
payment        — ACCEPTED:  CredentialIDs = "garbage", DomainID = 42
```

`payment({ Account, Destination, Amount, CredentialIDs: 'garbage' })` returns a
frozen tx whose `toJSON()` contains `CredentialIDs: "garbage"`. TypeScript
rejects the same call (`PaymentProps` declares neither field) — so the two
languages disagree about what the library accepts, and the permissive one is
the one that ships to production code.

**Why P1.** It is a correctness hole, but a bounded one: ten pairs, on four
transaction types, all of them fields the library has consciously not
modelled. The severity is bounded by the fact that the codec will reject the
garbage at encode time — the cost is a bad error message at the wrong layer,
not a corrupt ledger entry.

**Drill-deeper before fixing.**

- Decide whether the protocol half of the merge should widen *acceptance* at
  all. The merge exists so a protocol field on the wrong type is caught; it
  does not need the field to be *constructible*. A split is possible: keep
  the merged set for *rejection* decisions, but keep the library's own set
  for *acceptance*. That preserves the catch surface and removes the
  unvalidated pass-through. See `scripts/gen-field-index.mjs:228-254` for
  where the two sources are merged, and `src/fp/field-index.ts:228-240` for
  the single lookup that consumes them.
- If the split is taken, the 4 protocol-only *fields* the library genuinely
  wants to catch on the wrong type (`BookDirectory`, `NFTokenMinter`,
  `WalletLocator`, `WalletSize`) need their own entry — they are not in any
  props interface, so a library-only acceptance set would drop them entirely.
  `src/fp/field-index.assert.ts:300-305` already lists them as
  `ProtocolOnlyFields`.
- Alternative, much cheaper: model the 4 fields on the 4 types that use them
  and validate them properly. That closes 10 pairs by adding real guards, and
  it is the only option that makes the library's own surface honest.

**Resolution taken (1.5.0).** The ten pairs split cleanly in two, and the
second bullet above turned out to be the wrong cut — the useful split is by
*whether the library can validate the field at all*, not by whether the
field is "protocol-only".

| Pair | Resolution |
|---|---|
| `Payment.CredentialIDs` | **Now modelled and validated.** `PaymentProps` gains `CredentialIDs?: string[]`; the factory applies the same rule `accountDelete` applies to the same field — non-empty, ≤ 8 entries, each a 64-character hex string, no duplicates. |
| `Payment.DomainID` | **Now modelled and validated.** `PaymentProps` gains `DomainID?: string`; validated with the library's existing `isDomainID` helper (64-character hex). Gated by `featurePermissionedDEX` in rippled (XLS-0080d). |
| `AMMDeposit.TradingFee` | **Now modelled and validated.** `AmmDepositProps` gains `TradingFee?: number`; permitted only with the `tfTwoAssetIfEmpty` deposit mode and bounded to `[0, 1000]` (`kTradingFeeThreshold`, `include/xrpl/protocol/AMMCore.h:16`). |
| `AccountSet.NFTokenMinter`, `AccountSet.WalletLocator`, `AccountSet.WalletSize` | **Left open, deliberately.** These are fields the library has no model for anywhere. Modelling them is new feature work, not a fix, and rejecting them would break the forward-compatibility hatch the library is built on — and an existing test deliberately pins that a protocol-legal field on its owning transaction is accepted. |
| `LedgerStateFix.BookDirectory` | **Left open, for the same reason.** |

All three modelled fields are confirmed by rippled's own transaction
template — `ttPAYMENT` lists `{sfCredentialIDs, SoeOptional}` and
`{sfDomainID, SoeOptional}`, and `ttAMM_DEPOSIT` lists `{sfTradingFee,
SoeOptional}` (`include/xrpl/protocol/detail/transactions.macro`) — and by
xrpl.js 5.3.0, which already validates all three
(`models/transactions/payment.ts:214–218` and `:225`).

The four pairs left open are now written to a committed file rather than
living in terminal scrollback: `docs/field-index-divergences.md`, generated
by `scripts/gen-field-index.mjs`. After the three fields above were
modelled, the generator's divergence report shrank from four transactions to
two, and the ten pairs to four.

### P1-2 · Eight factories do not validate `Account` as an XRPL address
> **Status — Fixed in 1.5.0.** All 79 factories now check `Account` with
> `isAccount`, and `tests/fp/account-guard.test.ts` pins the invariant
> repo-wide so a future factory cannot reintroduce the laxer check. The
> "Why P1" and drill-deeper text below is retained as the reasoning that
> drove the decision; note the correction at the top of this section
> about how many factories already documented the guard.

**Concern.** 71 of 79 factories check `Account` with `isAccount`; eight check
it with `isString`. The eight accept any string.

**Evidence.** A repo-wide probe against the built package — call each factory
with `{ Account: 'not-an-address' }` and see whether the error is about
`Account`:

```
--- Account NOT validated (8) ---
  credentialAccept      [CredentialAccept: missing or invalid Issuer]
  credentialCreate      [CredentialCreate: Subject is required]
  oracleSet             [OracleSet: OracleDocumentID must be an integer]
  permissionedDomainSet [PermissionedDomainSet: AcceptedCredentials is ]
  vaultCreate           [VaultCreate: Asset must be a valid Currency (X]
  vaultDelete           [VaultDelete: VaultID must be a 64-character he]
  vaultDeposit          [VaultDeposit: VaultID must be a 64-character h]
  vaultSet              [VaultSet: VaultID must be a 64-character hex s]
```

The error surfaces on a *different* field, which proves `Account` passed.
The check sites:

| Factory | Site | Predicate |
|---|---|---|
| `oracle-set.ts` | `:299` | `require(props.Account, '…Account is required', isString)` |
| `vault-create.ts` | `:96` | `require(props.Account, '…Account is required', isString)` |
| `vault-delete.ts` | `:92` | `require(props.Account, '…Account is required', isString)` |
| `vault-set.ts` | `:114` | `require(props.Account, '…Account is required', isString)` |
| `vault-deposit.ts` | `:124` | `if (!isString(props.Account) || props.Account.length === 0)` |
| `credential-accept.ts` | `:152-158` | `require(…, isString)` + non-empty check |
| `credential-create.ts` | `:233-239` | `require(…, isString)` + non-empty check |
| `permissioned-domain-set.ts` | `:187-193` | `require(…, isString)` + non-empty check |

**Why P1, and why it is not simply "fix all eight".** This is a policy
question with a documented baseline on both sides:

- The library's own contribution guide teaches `isAccount` —
  `CONTRIBUTING.md:61` uses it in the template, and `CONTRIBUTING.md:84-85`
  says *"Use the existing predicates from `src/validation/helpers.ts`
  (`isAccount`, `isAmount`, `isXChainBridge`, …) rather than writing new
  inline checks."*
- But xrpl.js's canonical `validateBaseTransaction` uses `isString`:
  `node_modules/xrpl/dist/npm/models/transactions/common.js:391` —
  `validateRequiredField(common, 'Account', isString);` — and the local
  `src/validation/base.ts:40-42` faithfully mirrors that.

So the eight are *baseline-faithful* and the 71 are the ones that diverge
from the Class API. Per `CONTEXT.md:76-80` a divergence belongs in the
factory's `## Divergences` block — and 57 of the 79 do record it.

> **Correction to the text below.** When this finding was first written it
> said that only one factory recorded the Account guard and that "the other
> 70 stricter factories do not". That was wrong: a survey of the
> `## Divergences` blocks found **57 of 79** already documenting it. The
> real documentation gap was narrower — 11 factories applied the guard
> without mentioning it, and 4 had no `## Divergences` block at all:
> `account-set`, `loan-set`, `mptoken-issuance-create`, `payment`,
> `vault-create`.

The Class API check was also confirmed directly: `xrplt@0.7.1`
(`/Users/jdobson/developer/128-xrp-tx-builder`) uses `isAccount` for
`Destination`, `Issuer`, `Owner`, `Holder`, `RegularKey`, `Sponsee`,
`Counterparty`, `Authorize` and `Unauthorize` — but **never** for `Account`
itself, which only its base validator touches, with `isString`
(`src/validation/base.ts:40–41`). So the 71 stricter factories are the ones
diverging from the baseline, and the divergence is legitimate: rippled
parses `Account` as an `AccountID` and rejects anything that is neither hex
nor valid base58 (`src/libxrpl/protocol/STParsedJSON.cpp:919`).

Either way the library shipped two different guarantees for the same field
name, which is the real problem.

**Resolution taken (1.5.0).** Option (a) from the drill-deeper list —
tighten the eight to `isAccount` — for three reasons: it matches the
library's own contribution template, it matches the majority convention
already in the code, and it is what rippled's own parsing requires. The
eight factories now use `isAccount`; all 79 document the guard; and
`tests/fp/account-guard.test.ts` asserts the invariant across every factory
in the barrel, so the split cannot come back.

`isAccount` remains deliberately format-only — no base58 checksum
(`CONTEXT.md:51-56`, `src/validation/helpers.ts:44-60`). A tightened
`Account` check rejects garbage strings but still accepts a
well-formed-but-invalid address; the divergence text in each factory says so.

**Drill-deeper before fixing.**

- Read the Class API (`xrplt` 0.7.1, the sibling checkout) for each of the
  eight and the 71. If the Class API uses `isString` for the eight, then
  either (a) tighten the eight to `isAccount` and record the divergence in
  each, or (b) loosen the 71 to `isString` and record that in each. Option
  (a) is a strict improvement in correctness; option (b) is strict parity.
  Do not do (a) without deciding what the Class API does, because the
  divergence framing in `CONTEXT.md` depends on it.
- Whichever way it goes, the `## Divergences` blocks need to say so. 71
  factories currently apply a guard their baseline does not, undocumented.
  `CONTRIBUTING.md:126-127` requires one entry per guard added beyond the
  Class API.
- `isAccount` is deliberately format-only — no base58 checksum
  (`CONTEXT.md:51-56`, `src/validation/helpers.ts:44-60`). A tightened
  `Account` check rejects garbage strings but still accepts a
  well-formed-but-invalid address. Say so in the error text if the eight are
  tightened, so callers do not read the guard as a checksum.

### P1-3 · The generated index has no guard that it matches its generator
> **Status — Fixed in 1.5.0.** CI now regenerates the index and fails on any
> diff; `ripple-binary-codec` is pinned as an explicit devDependency; and the
> divergence report the generator already computed is written to a committed
> file instead of being printed and lost.

**Concern.** `scripts/gen-field-index.mjs` writes two files into `src/`.
Nothing checks that the committed files are what the generator would produce,
and CI never runs the generator.

**Evidence — the gap is already live.** `a2685e7` ("AccountSet must not
accept NFTokenBrokerFee") hand-edited `src/fp/field-index.ts`, a file headed
*GENERATED by scripts/gen-field-index.mjs. Do not edit.*, removing
`'AccountSet'` from `NFTokenBrokerFee`'s owner set. It did not update the
header, which still read *322 field/type pairs; 87 fields valid on exactly
one type* while the table beneath it holds **321** pairs and **88** single-type
fields. Regenerating today produces exactly that one-line correction and
nothing else — the hand-edit and the generator agree on the table, so the
edit was benign. But nothing would have caught the stale header.

The compile-time assertions do not cover it. `src/fp/field-index.assert.ts`
has three:

| Assertion | Line | What it catches |
|---|---|---|
| `Completeness` | `:318` | a field in a props interface with no index entry |
| `TxTypes` | `:328` | the index naming a transaction type not implemented |
| `IndexKeys` | `:338` | an index key that is neither modelled nor protocol-only |

None of them reads the protocol half of the table. That half comes from
`ripple-binary-codec`'s `TRANSACTION_FORMATS`
(`scripts/gen-field-index.mjs:228-254`), and it contributes the four
protocol-only fields the library has no interface for
(`BookDirectory`, `NFTokenMinter`, `WalletLocator`, `WalletSize`). If the
codec is bumped, the committed index — which is what actually runs — silently
keeps the old protocol truth, and no assertion fires. `ripple-binary-codec`
is not even a direct devDependency; it arrives transitively through
`xrpl@5.3.0` and is pinned only in `package-lock.json`.

**Why P1.** The index is the mechanism the library's error messages depend on
— every "It belongs to: …" message comes from it. A silently stale index
means the library rejects valid transactions, or accepts invalid ones, with
no signal in the build.

**Drill-deeper before fixing.**

- The one-line fix is a CI step, not a code change:
  ```yaml
  - run: node scripts/gen-field-index.mjs
  - run: git diff --exit-code src/fp/field-index.ts src/fp/field-index.assert.ts
  ```
  That closes the hand-edit hole, the protocol-drift hole, and the stale
  header in one move. It needs the codec installed, which `npm ci` already
  guarantees (it is a transitive dependency).
- Decide whether to add `ripple-binary-codec` as an explicit devDependency.
  It is a *build input* for a committed artifact — the generator reads its
  `definitions.json` directly (`scripts/gen-field-index.mjs:104-117`). It
  should be pinned by intent, with the exact version in `package.json`, not
  inherited by accident.
- Consider a fourth assertion that *does* read the protocol half: for every
  field the codec lists on a type this library implements, assert the index
  agrees. That turns the protocol dependency from a silent input into a
  compile-time fact.

---

## P2 — medium-priority quality

### P2-1 · The README's tree-shaking claim is overstated, measurably
> **Status — Partly fixed in 1.5.0.** The README now states what actually
> ships, `sideEffects: false` is set, and the type-only assert file is
> excluded from the tarball. The measured table size is unchanged — the
> cross-type field index cannot tree-shake, because catching a field used
> on the wrong transaction requires knowing every field on every type.
> The per-field module split below is therefore still open as an option,
> but it is a *size* optimisation, not a correctness one.

**Concern.** `README.md:29-31`:

> Each transaction family (`payment`, `vaultCreate`, `ammDeposit`, ...) has
> its own factory. Importing one pulls in only that factory's code (full
> tree-shaking).

The factory code does tree-shake. But the **field-ownership table does not**,
because `src/fp/shape.ts` statically imports `assertKnownFields` and
`FIELD_OWNERS` is a module-level const that every factory pulls in.

**Evidence.** Rollup bundle of an entry that imports only `payment`:

```
payment-only bundle        : 45046 bytes
field-ownership table alone: 11667 bytes
share of the bundle        : 26%
```

The bundle contains `ZKProof`, `VaultDeposit`, and `XChainModifyBridge` — all
irrelevant to a consumer that builds one Payment. Every consumer of the
package ships the whole 143-field × 79-type cross table.

Two smaller points in the same area:

- `package.json` has **no `sideEffects` field**. Rollup tree-shakes anyway
  (verified above), but webpack-class bundlers need `"sideEffects": false` to
  drop unused re-exports from the 79-export barrel. The library is
  side-effect-free by construction, so the field is safe to add — but it is
  a claim the package does not currently make.
- `src/fp/field-index.assert.ts` compiles to `dist/` and **ships in the npm
  tarball**: `field-index.assert.js` (170 B) plus `.d.ts` (14,207 B),
  `.d.ts.map` (7,327 B) and two source maps — 21,972 bytes of a
  type-only assertion file with no runtime consumer.

**Drill-deeper.**

- Decide whether to fix the claim or the implementation. Fixing the
  implementation means emitting the index as one module per field
  (`field-owners/<Field>.js`), so a bundler keeps only the fields the
  consumer's factory actually declares — roughly 15 of 143 for a Payment
  consumer. The generator already builds the table field by field
  (`scripts/gen-field-index.mjs:257-261`); splitting the emit is mechanical.
  The cost is a change to `assertKnownFields`' lookup and to the
  `field-index.assert.ts` import shape.
- If the implementation is not changed, amend `README.md:29-31` to say what
  is actually true: factory code tree-shakes; the shared field-ownership
  table does not.
- Add `"sideEffects": false` to `package.json` regardless — it is correct
  and costs nothing.
- Exclude `field-index.assert.*` from the published files. `files` in
  `package.json` is `["dist", …]`; the assert file needs an explicit
  exclusion, and `tsconfig.json` would need the emit skipped.

### P2-2 · The README's "`## Divergences` header" claim is false for four factories
> **Status — Fixed in 1.5.0.** All 79 factories now carry a `## Divergences`
> block: the four that had none gained one, and the ones that had one but
> did not mention the `Account` guard gained an entry for it.

**Concern.** `README.md:68`:

> Every factory file ships a `## Divergences` header listing the guards it
> adds beyond the Class API's equivalent.

Four of 79 do not: `loan-set`, `mptoken-issuance-create`, `payment`,
`vault-create`. `CONTRIBUTING.md:166-170` is explicit that this is a finding
in its own right:

> ### "No divergences" is a finding
> If the factory genuinely adds nothing over the Class API, say so explicitly
> rather than omitting the block — an absent heading reads as an oversight,
> and five factories were originally ambiguous for exactly that reason.

The 2026-10-01 citation audit resolved it a third way — *"each is now covered
by the `Class API` term in `CONTEXT.md` rather than by a missing block"*
(`docs/audit/2026-10-01-citation-audit.md:21-25`). So three documents now
state three different positions: the README says all 79 have a block,
CONTRIBUTING says an explicit statement is required, and the citation audit
says the glossary covers it.

**Drill-deeper.** Pick one and make all three agree. The cheapest is to
change `README.md:68` to describe reality and point at the citation audit's
resolution. The most consistent with `CONTRIBUTING.md:166-170` is to add an
explicit *"no divergences"* line to the four factories — four comment blocks,
no behaviour change, and it removes the last ambiguity for a future
contributor reading one factory in isolation.

### P2-3 · `ammDeposit` does not implement rippled's per-deposit-mode field rules

> **Status — Fixed in 1.5.1.** The factory now enforces rippled's per-mode
> matrix, which subsumes the three generic cross-field rules it used to
> check. It was found during this review, while implementing the P1-1
> `TradingFee` rule, and belongs to the same family of problems: the library
> models a subset of rippled's preclaim rules for this transaction type.

**Concern.** rippled's `AMMDeposit::preflight` has a *per-mode* field
combination table — which of `Amount`, `Amount2`, `EPrice`, `LPTokenOut` and
`TradingFee` may appear alongside each deposit-mode flag. The library checks
the mode flag itself (exactly one of six) and a few cross-field rules, but
not the per-mode combinations.

**Evidence.** rippled `src/libxrpl/tx/transactors/dex/AMMDeposit.cpp:78–112`:

| Mode | rippled requires | rippled forbids |
|---|---|---|
| `tfLPToken` | `LPTokenOut` | `EPrice`, `TradingFee`, one of `Amount`/`Amount2` |
| `tfSingleAsset` | `Amount` | `Amount2`, `EPrice`, `TradingFee` |
| `tfTwoAsset` | `Amount`, `Amount2` | `EPrice`, `TradingFee` |
| `tfOneAssetLPToken` | `Amount`, `LPTokenOut` | `Amount2`, `EPrice`, `TradingFee` |
| `tfLimitLPToken` | `Amount`, `EPrice` | `LPTokenOut`, `Amount2`, `TradingFee` |
| `tfTwoAssetIfEmpty` | `Amount`, `Amount2` | `EPrice`, `LPTokenOut` |

The library's `amm-deposit.ts` enforces only: `Amount2` and `EPrice` require
`Amount`; at least one of `LPTokenOut` or `Amount` is required; and the mode
flag is exactly one of six. So `ammDeposit({ Flags: tfSingleAsset, Amount,
Amount2 })` constructs here and is rejected by the ledger with
`temMALFORMED` — a `tfSingleAsset` deposit that is not single-asset.

**Why P2.** It is a real gap, but narrower than P1-1: the mode flag is
validated, the field types are validated, and the two cross-field rules the
library does implement are correct. What is missing is the per-mode matrix.
The blast radius is `ammDeposit` only.

**Drill-deeper before fixing.**

- Implement the table literally, as a per-mode predicate over the set of
  present fields. rippled's own comment block above the branches
  (`AMMDeposit.cpp:66–72`) is the field list to transcribe, and it is short
  enough to put in the factory as a table rather than as six branches.
- Decide the error surface. rippled answers `temMALFORMED` for all six
  modes; the library's convention is a specific message naming the offending
  combination, which is more useful than a generic one but is not a
  `temMALFORMED` reproduction.
- Check the Class API first (`xrplt@0.7.1`,
  `src/transactions/amm-deposit.ts`) — it models none of these combination
  rules either, so implementing them is a divergence and needs an entry in
  the factory's `## Divergences` block.
- Note that `tfTwoAssetIfEmpty` also requires `Amount2` (rippled line 110),
  which the library does not check for any mode.

**Resolution taken (1.5.1).** The matrix is implemented as a table — one row
per mode, naming the fields it requires and forbids — and it replaces the
three generic cross-field rules the factory used to check (`Amount` with
`Amount2`, `Amount` with `EPrice`, and at least one of `LPTokenOut` or
`Amount`). Every combination those three rejected is rejected by the matrix
too, so nothing is lost; what is gained is that the message names the mode
and the offending field, and that the rules the generic form could not
express — `tfTwoAsset` forbids `EPrice`, `tfSingleAsset` forbids `Amount2`,
`tfLimitLPToken` forbids `LPTokenOut`, and `tfLPToken` requires `Amount` and
`Amount2` together or not at all — are now caught.

Two design notes:

- The **forbidden check runs before the required check**. A field the mode
  forbids has to be removed regardless of what else is wrong, whereas a
  missing required field might be satisfied by a different valid shape.
  Telling a caller to add `Amount` when `Amount2` is also present would
  only lead them to a second error. rippled combines both into one
  condition and so does not answer the question.
- The **six mode bits are now named constants** rather than literals
  repeated across the flag mask, `flagsToNumber`, and the matrix. The same
  six values appeared in three places that had to agree, and a literal
  repeated three times is how they drift apart.

Three pre-existing tests asserted behaviour rippled rejects — a
`tfTwoAsset` deposit carrying `EPrice`, a shared `make()` helper that
satisfied none of the six modes, and the generic "at least LPTokenOut or
Amount" message. They were updated to the protocol's rules; the intent
behind each was preserved.

Regression coverage: `tests/fp/amm-deposit.test.ts` gained a
*deposit-mode field matrix* block that drives the matrix from a
transcription of rippled's branches — every mode's minimal valid shape is
accepted, every field each mode forbids is rejected, every required field is
enforced when missing, and `tfLPToken`'s together-or-neither rule is checked
in all four combinations. Tests: 4,119 → 4,126.

---

## P3 — cleanup

- ~~**`scripts/gen-field-index.mjs:39-42` is stale.**~~ **Fixed in 1.5.0.**
  It justified the two-source merge with: *"the codec lags the library.
  `AccountSet` declares `NFTokenBrokerFee`, which codec 2.11.0 places only on
  `NFTokenAcceptOffer`. An index built from A alone would reject a field this
  library deliberately supports."* After `a2685e7`, the library no longer
  declares it — it deliberately **rejects** it. The comment inverted the
  current behaviour and would have misled the next maintainer about why the
  merge exists. It now describes both directions of the codec's lag, and
  names `a2685e7` as the precedent for removing a field rather than shipping
  it.
- ~~**The generator's protocol-divergence report is printed and discarded.**~~
  **Fixed in 1.5.0.** `scripts/gen-field-index.mjs` now writes the report to
  `docs/field-index-divergences.md`, and CI checks that file against a fresh
  run. The library's list of "fields the protocol has that we do not model" is
  no longer terminal scrollback. The report carries no timestamp on purpose:
  a date would make the file differ on every regeneration and defeat the
  drift check that compares it.
- **`src/validation/base.ts` is exported twice over.** `validateBaseTransaction`
  is reachable at `xrpjson/validation` (via `src/validation/index.ts:1`) and
  is also imported directly by all 79 factories from
  `../../validation/base.js`. Not a defect — the public subpath export is
  deliberate — but the module is doing double duty as both a public API
  surface and an internal dependency, which makes the "public" boundary
  ambiguous for a future refactor.

---

## Recommendations, ordered by ROI

| # | Action | Priority | Effort | State |
|---|---|---|---|---|
| 1 | CI step: regenerate the field index and `git diff --exit-code` | P1 | ~5 min | **Done** — `npm run check:field-index`, wired into CI and the publish workflow |
| 2 | Pin `ripple-binary-codec` as an explicit devDependency | P1 | ~5 min | **Done** — exact pin `2.11.0`, with the reason recorded |
| 3 | Model + validate `Payment.CredentialIDs`, `Payment.DomainID`, `AMMDeposit.TradingFee` | P1 | ~2 h | **Done** — closes 6 of the 10 unvalidated pairs |
| 4 | Settle the `Account` predicate question for all 79 | P1 | ~4 h | **Done** — all 79 use `isAccount`; a repo-wide invariant test enforces it |
| 5 | Document the `Account` divergence in every factory | P2 | ~2 h | **Done** — all 79 carry a `## Divergences` block |
| 6 | Correct the four false xrpl.js `isAccount` citations | P1 | ~30 min | **Done** — `permissioned-domain-delete`, `loan-delete`, `amm-delete`, `amm-vote` |
| 7 | Add `"sideEffects": false` to `package.json` | P2 | ~1 min | **Done** |
| 8 | Exclude `field-index.assert.*` from the published tarball | P2 | ~15 min | **Done** — ~22 KB of dead weight removed |
| 9 | Amend `README.md:29-31` on tree-shaking | P2 | ~10 min | **Done** — the README now says what actually ships |
| 10 | Fix the stale rationale in `scripts/gen-field-index.mjs` | P3 | ~5 min | **Done** |
| 11 | Persist the generator's protocol-divergence report | P3 | ~30 min | **Done** — `docs/field-index-divergences.md` |
| 12 | Implement rippled's per-deposit-mode field rules in `ammDeposit` | P2 | ~3 h | **Done in 1.5.1** — the matrix subsumes the three generic cross-field rules |
| 13 | Emit the index as one module per field | P2 | ~3 h | **Open** — a size optimisation, not a correctness one |
| 14 | Model `AccountSet`'s three protocol-only fields, and `LedgerStateFix.BookDirectory` | P2 | ~4 h | **Open** — new feature work, not a fix |

---

## Sources and files read

**Read in full.** `src/fp/shape.ts` · `src/validation/base.ts` ·
`src/validation/helpers.ts` · `src/types/base.ts` ·
`src/fp/field-index.ts` · `src/fp/field-index.assert.ts` · `src/fp/index.ts`
· `src/fp/factories/payment.ts` · `src/fp/factories/oracle-set.ts` ·
`src/fp/factories/mptoken-issuance-set.ts` ·
`src/fp/factories/xchain-create-bridge.ts` · `src/errors.ts` ·
`CONTEXT.md` · `CONTRIBUTING.md` · `README.md` · `AGENTS.md` ·
`CHANGELOG.md` (head + 1.4.x entries) · `docs/audit/2026-10-01-citation-audit.md`
· `docs/audit/2026-10-02-flag-contradiction-audit.md` ·
`scripts/gen-field-index.mjs` (all 545 lines) · `tsconfig.json` ·
`eslint.config.js` · `package.json` · `.gitignore` ·
`.github/workflows/ci.yml` · `.github/workflows/npm-publish.yml`

**Swept mechanically.** All 79 files in `src/fp/factories/` (props-interface
shape, `TransactionType` omission, `validateBaseTransaction` call, `with` /
`toJSON` / `validate` implementation and declaration, error type, `Account`
predicate, `Flags` declaration vs runtime read) · all 80 test files ·
`src/types/flags.ts` (referenced) · `src/validation/index.ts`

**Probes run against the built package.** TransactionType override across
four factories and through `.with()` · `Account` acceptance across all 79
factories · the four protocol-only divergence cases · bundle size attribution
via Rollup · generator regeneration diff · `npm pack --dry-run`

**External sources consulted.**

- `node_modules/xrpl@5.3.0` `dist/npm/models/transactions/common.js:391` —
  the canonical `validateBaseTransaction` Account predicate (`isString`).
- `node_modules/ripple-binary-codec@2.11.0` `dist/enums/definitions.json` —
  `TRANSACTION_FORMATS`, the index's protocol source.
- `~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/common.ts:987`
  — the pinned xrpl.js mirror; `common.ts:28` (`MAX_AUTHORIZED_CREDENTIALS = 8`),
  `common.ts:1106` (`validateCredentialsList`),
  `payment.ts:214–218` and `:225` (the two Payment fields),
  `permissionedDomainDelete.ts:22–28`, `credentialAccept.ts:39`,
  `credentialCreate.ts:50`.
- `~/.mavis/docs.local/rippled/repo/` — the pinned rippled mirror:
  `src/libxrpl/protocol/STParsedJSON.cpp:919` (`case STI_ACCOUNT:`),
  `include/xrpl/protocol/detail/transactions.macro` (the `ttPAYMENT`,
  `ttAMM_DEPOSIT` and `ttESCROW_FINISH` blocks),
  `include/xrpl/protocol/AMMCore.h:16` (`kTradingFeeThreshold = 1000`),
  `src/libxrpl/tx/transactors/dex/AMMDeposit.cpp:64, 78–112, 168`,
  `src/libxrpl/tx/transactors/payment/Payment.cpp:88–90`.
- `/Users/jdobson/developer/128-xrp-tx-builder` — the Class API (`xrplt@0.7.1`),
  the divergence baseline: `src/validation/base.ts:40–41` (the Account check)
  and `src/transactions/*.ts` (per-class field validation).

**Verification after the remediation.** `npm run lint` exit 0 ·
`npx tsc --noEmit` exit 0 · `npm test` **4,126 passed** across 81 files ·
`npm run check:field-index` exit 0 (the committed index, the assertion file and
the divergence report all match a fresh generator run) ·
`npm pack --dry-run` ships 372 files with no `field-index.assert.*`.
