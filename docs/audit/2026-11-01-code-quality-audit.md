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

### P1-2 · Eight factories do not validate `Account` as an XRPL address

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
factory's `## Divergences` block — and only one factory currently records it
(`permissioned-domain-delete.ts:99`, *"than the class API's looser
`isString(Account)` check"*). The other 70 stricter factories do not.

Either way the library ships two different guarantees for the same field
name, which is the real problem.

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

---

## P3 — cleanup

- **`scripts/gen-field-index.mjs:39-42` is stale.** It justifies the
  two-source merge with: *"the codec lags the library. `AccountSet` declares
  `NFTokenBrokerFee`, which codec 2.11.0 places only on `NFTokenAcceptOffer`.
  An index built from A alone would reject a field this library deliberately
  supports."* After `a2685e7`, the library no longer declares it — it
  deliberately **rejects** it. The comment inverts the current behaviour and
  will mislead the next maintainer about why the merge exists.
- **The generator's protocol-divergence report is printed and discarded.**
  `scripts/gen-field-index.mjs:274-285` computes the four standing
  divergences and writes them to stdout. Nothing persists them, so the
  library's list of "fields the protocol has that we do not model" lives
  only in a terminal scrollback. Emitting them into a committed doc would
  make P1-1's ten pairs reviewable over time rather than rediscovered.
- **`src/validation/base.ts` is exported twice over.** `validateBaseTransaction`
  is reachable at `xrpjson/validation` (via `src/validation/index.ts:1`) and
  is also imported directly by all 79 factories from
  `../../validation/base.js`. Not a defect — the public subpath export is
  deliberate — but the module is doing double duty as both a public API
  surface and an internal dependency, which makes the "public" boundary
  ambiguous for a future refactor.

---

## Recommendations, ordered by ROI

| # | Action | Priority | Effort | Impact |
|---|---|---|---|---|
| 1 | CI step: regenerate the field index and `git diff --exit-code` | P1 | ~5 min | Closes the hand-edit hole, the protocol-drift hole, and the stale header at once |
| 2 | Add `ripple-binary-codec` as an explicit devDependency | P1 | ~5 min | Pins a build input by intent rather than by transitivity |
| 3 | Split the index's *acceptance* set from its *rejection* set | P1 | ~2 h | Removes 10 unvalidated (field, type) pairs from the wire |
| 4 | Settle the `Account` predicate question for all 79 | P1 | ~4 h | One guarantee for one field name, and 71 documented divergences |
| 5 | Emit the index as one module per field | P2 | ~3 h | Cuts ~26% off a Payment-only bundle |
| 6 | Add `"sideEffects": false` to `package.json` | P2 | ~1 min | Correct, free, and helps webpack consumers |
| 7 | Exclude `field-index.assert.*` from the published tarball | P2 | ~15 min | Removes ~22 KB of dead weight from the package |
| 8 | Reconcile the three documents on `## Divergences` | P2 | ~30 min | Removes a contradiction a contributor will hit |
| 9 | Amend `README.md:29-31` on tree-shaking (or do #5 first) | P2 | ~10 min | Makes the README measurably true |
| 10 | Fix the stale rationale in `scripts/gen-field-index.mjs:39-42` | P3 | ~5 min | Stops the next maintainer being misled |
| 11 | Persist the generator's protocol-divergence report | P3 | ~30 min | Makes P1-1 trackable over time |

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

**External sources consulted.** `node_modules/xrpl@5.3.0`
`dist/npm/models/transactions/common.js:391` (canonical
`validateBaseTransaction` Account predicate) ·
`node_modules/ripple-binary-codec@2.11.0` `dist/enums/definitions.json`
(`TRANSACTION_FORMATS`, the index's protocol source) ·
`~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/common.ts`
(canonical source mirror)

**Verification at time of writing.** `npm run lint` exit 0 ·
`npx tsc --noEmit` exit 0 · `npm test` **4,089 passed** across 80 files ·
`node scripts/gen-field-index.mjs` reproduces the committed index exactly.
