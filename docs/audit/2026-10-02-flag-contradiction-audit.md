# Flag-contradiction audit — 2026-10-02

Audit of every `fp` factory that exposes `Flags` in its props, asking one
question in each direction:

- **Defect** — does a factory reject a flag combination rippled *accepts*?
  The library refuses valid input.
- **Gap** — does a factory accept a flag combination rippled *rejects*?
  A known, recorded gap, not a bug.

Status: **applied and ledger-verified**. Three defects found and fixed in the
working tree, each with unit tests. Verified by `npx tsc --noEmit` (exit 0),
`npm run lint` (exit 0), and `npm test` (79 files, **2,858** tests, 0 failed —
up from the 2,849 baseline; net +9).

**Live testnet verification: 10 passed, 0 failed, 1 skipped.** Defects 2 and 3
are settled against a real ledger. Defect 1 is settled by four independent
sources but **not** by a ledger — the `Sponsor` amendment is disabled on
testnet, so no ledger verdict is obtainable there. See *Live verification*.

---

## Scope

| | |
|---|---|
| Factories with `Flags?:` in props | **63** |
| …that read `Flags` at runtime | **17** (7 formal validators + 10 ad hoc) |
| …that do nothing with it | **46** |
| Defects found | **3** |
| Gaps recorded | families below, not enumerated |
| Baseline tests | 2,849 |
| Tests after | 2,858 |

### The 7/56 split in the brief is a grep artifact

The brief's heuristic (`popcount|FLAG_BITS|FLAGS_MASK|mode flag`) finds 7
validators. Sweeping instead for *runtime reads of `props.Flags`* finds **17**.
Ten more factories carry real flag logic the heuristic misses:

`did-delete` · `did-set` · `loan-manage` · `loan-pay` ·
`nftoken-create-offer` · `nftoken-mint` · `offer-create` · `payment` ·
`sponsorship-set` · `vault-create`

Two of the three defects live in that hidden set (`nftoken-mint`,
`mptoken-issuance-create`'s gate). **A grep for validator-shaped names is not
a safe proxy for "does this factory reason about flags."**

---

## Method — source reading only

No network submission, no testnet probe. rippled is read from the local
mirror at `~/.mavis/docs.local/rippled/repo/`.

The rule rippled applies: every transaction type's mask is built by
`TO_MASK` (`TxFlags.h:264-266`) as `~(tfUniversal | <that tx's own flags>)`,
where `tfUniversal = tfFullyCanonicalSig | tfInnerBatchTxn`
(`TxFlags.h:43-46`). A bit is legal when `(flags & ~txMask) === 0`. Cardinality
rules live separately in each transactor's `preflight`.

### The rippled mirror

The mirror is a **deliberate sparse extraction** of rippled tag **3.4.0**,
documented in `~/.mavis/docs.local/rippled/PATCHES.md` and `.source.json`. It
is not a broken clone, and it is intentionally not a semantic index (rippled
is C++; `search.sh rippled --build` would produce zero chunks — use `rg`).

**This audit was written while `src/libxrpl/ledger/` was still outside the
slice, so Defect 1 originally rested on `TxFlags.h:459-461`,
`STTx.cpp:676`, and the portal docs rather than on `isReserveSponsored`
itself. The slice was extended on the same day and the gap is now closed.**

The definition confirms the finding, and confirms it more strongly than the
mask alone could. rippled keeps the two sponsor bits in **two independent,
non-overlapping predicates**:

```cpp
// include/xrpl/ledger/helpers/SponsorHelpers.h:32-35
inline bool
isFeeSponsored(STTx const& tx)
{
    return tx.isFieldPresent(sfSponsor) && ((tx.getFieldU32(sfSponsorFlags) & spfSponsorFee) != 0u);
}

// include/xrpl/ledger/helpers/SponsorHelpers.h:40-45
inline bool
isReserveSponsored(STTx const& tx)
{
    return tx.isFieldPresent(sfSponsor) &&
        ((tx.getFieldU32(sfSponsorFlags) & spfSponsorReserve) != 0u);
}
```

Neither predicate inspects the other's bit. `SponsorshipTransfer::preflight`
requires `isReserveSponsored` (lines 120, 147) and never consults
`isFeeSponsored` — so `SponsorFlags: 3` makes **both** predicates true and
nothing objects. That is the mechanism by which the documented "fee and
reserve" sponsorship is expressible at all, and it is precisely what the old
`SponsorFlags & ~spfSponsorReserve` check destroyed. **Defect 1 is confirmed
from source; no part of it rests on documentation inference.**

Two notes on the mirror, for whoever refreshes it next:

- **The 3.4.0 pin cannot be re-derived locally.** There is no git history, so
  the pin rests on `PATCHES.md` + `.source.json` + the recorded tarball
  SHA-256 (`9eef7781…`) plus a whole-tree manifest hash
  (`517518cf…`) for drift detection — not on an independently checkable ref.
- **One gap remains: `src/libxrpl/tx/` (the parent of `tx/transactors/`).**
  `preflight1Sponsor` — cited in a comment at `SponsorshipTransfer.cpp:176` —
  is a **file-static** function in `src/libxrpl/tx/Transactor.cpp:176-226`,
  which is still outside the slice. It is not stale: `Transactor.cpp:186` is
  exactly `if (hasSponsor != hasSponsorFlags) return temINVALID_FLAG;`, called
  from `preflight1` at `:293`. Nothing in this audit's reasoning depends on
  it, and adding `Transactor.cpp` + `Transactor.h` would close the last hole.
  Note that `isReserveSponsored` is also called from `Transactor.cpp:208,418,443`.

The slice now covers 496 files across 7 paths. Every line number cited in
this report was re-verified after the addition; **none moved.**

---

# Defects

All three are the same shape: **the factory answers a question about flags
that only the ledger can answer, and answers it too strictly.** None of them
produces a result code from rippled, because in every case rippled *accepts*
the transaction the factory refuses. That absence of a `tem*` code is the
evidence, not a gap in the write-up.

---

## Defect 1 — `sponsorshipTransfer` rejects `spfSponsorFee`, which rippled allows (FIXED)

**Factory:** `sponsorshipTransfer`

**Bug.** The factory rejected any `SponsorFlags` bit other than
`spfSponsorReserve`. rippled declares **both** sponsor bits valid, and the
canonical docs say so explicitly.

```ts
// src/fp/factories/sponsorship-transfer.ts:404-408 (before)
if ((props.SponsorFlags & ~SPF_SPONSOR_RESERVE) !== 0) {
  throw new ValidationError(
    'SponsorshipTransfer: SponsorFlags may only set the spfSponsorReserve bit (0x00000002)',
  );
}
```

`SponsorFlags: 0x00000003` — fee **and** reserve — is the documented way to
have the sponsor cover both the fee and the reserve. The factory refused it.

**What rippled does.** `spfSponsorFlagMask` is the complement of *both* bits,
so neither is in the invalid set:

```cpp
// TxFlags.h:459-461
inline constexpr FlagValue spfSponsorFee = 1;
inline constexpr FlagValue spfSponsorReserve = 2;
inline constexpr FlagValue spfSponsorFlagMask = ~(spfSponsorFee | spfSponsorReserve);
```

`SponsorshipTransfer::preflight` requires the reserve bit for the Create and
Reassign scenarios (`SponsorshipTransfer.cpp:120,147` →
`isReserveSponsored`) but **never forbids the fee bit**. rippled actively
reads it — `STTx::getFeePayerID()` (`STTx.cpp:676`) returns the sponsor as
fee payer when `spfSponsorFee` is set, which is the whole point of the bit.

**Confirmed from source** (the mirror gained `include/xrpl/ledger/` after this
was first written): rippled has two independent predicates, `isFeeSponsored`
(`SponsorHelpers.h:32-35`) and `isReserveSponsored` (`:40-45`), each testing
only its own bit. `preflight` requires the reserve one and never consults the
fee one, so `SponsorFlags: 3` satisfies both. See *The rippled mirror* above.

**Result code:** none. rippled accepts the transaction. The factory made it
unconstructible.

**Canonical sources:**
- rippled `TxFlags.h:459-461` — `spfSponsorFlagMask = ~(spfSponsorFee | spfSponsorReserve)`
- rippled `SponsorshipTransfer.cpp:120,147` — reserve bit required; fee bit never forbidden
- rippled `STTx.cpp:676` — `getFieldU32(sfSponsorFlags) & spfSponsorFee` selects the fee payer
- xrpl.org `common-fields.md:196` — "The **`spfSponsorFee`** flag can be used with any transaction type."
- xrpl.org `common-fields.md:191` — "**Both flags can be used together in a single transaction.**"
- xrpl.org `common-fields.md:225` — SponsorshipTransfer is on the `spfSponsorReserve` list

**Fix.** Widen the mask to rippled's own set
(`VALID_SPONSOR_FLAGS_MASK = SPF_SPONSOR_FEE | SPF_SPONSOR_RESERVE`,
`sponsorship-transfer.ts:134-139`, check at `:427`). The reserve-bit
*requirement* is unchanged — only the over-broad rejection went away.

**Tests.** `tests/fp/sponsorship-transfer.test.ts` — added
`accepts SponsorFlags with spfSponsorFee set alongside spfSponsorReserve`;
retargeted the over-broad-rejection test at a genuinely undefined bit
(`0x04`), which still throws. The pre-existing
`throws if SponsorFlags omits the spfSponsorReserve bit` case was
`SponsorFlags: 0x00000001` with the comment "wrong bit" — the bit is legal,
it is the *reserve* bit that is missing; the comment was wrong and was
corrected rather than the test.

**Severity: high.** SponsorFlags has no other entry point, so before this fix
a caller using the documented fee+reserve combination simply could not express
it. Note this is the `SponsorFlags` field, not `Flags`; `Flags` itself is
correct for this factory (see *No issue*).

---

## Defect 2 — `mptokenIssuanceCreate` treats a boolean-map `Flags` as zero (FIXED)

**Factory:** `mptokenIssuanceCreate`

**Bug.** `Flags` has two documented input forms: a numeric bitmask, or a
boolean map keyed by `tfMPT*` names. The map form was collapsed to `0` before
the cross-field gates ran, so a caller who correctly wrote
`{ tfMPTCanTransfer: true }` was told their `TransferFee` needed a flag they
had just set.

```ts
// src/fp/factories/mptoken-issuance-create.ts:123 (before)
const flags = (typeof props.Flags === 'number' ? props.Flags : 0) as number;
```

That single line fed both gates:
- `TransferFee !== 0 && (flags & TF_MPT_CAN_TRANSFER) === 0` → throw (`:137`)
- `DomainID` present && `(flags & TF_MPT_REQUIRE_AUTH) === 0` → throw (`:200`)

The inline comment claimed this matched "the class version, which only
inspects numeric flags." It does not: the class version runs the map through
`convertTxFlagsToNumber` (`packages/xrpl/src/models/utils/flags.ts:174-201`)
first. **And the sibling factory in this same repo already did it correctly** —
`mptoken-issuance-set.ts:409-424` resolves its map form to real bits before
gating. The comment was wrong and the two MPT factories disagreed with each
other.

**What rippled does.** A boolean map is a client-side convenience; it becomes
plain bits in the JSON that reaches preflight. `tfMPTCanTransfer` set means
the bit is set, and the gate passes.

**Result code:** none. rippled accepts. `mptokenissuancecreate.md:45` — "A
non-zero value is only valid if the `tfMPTCanTransfer` flag is also set" — is
satisfied by the map.

**Canonical sources:**
- xrpl.org `mptokenissuancecreate.md:45` — non-zero `TransferFee` requires `tfMPTCanTransfer`
- xrpl.org `mptokenissuancecreate.md:44` — "You must enable the `tfMPTRequireAuth` flag to use permissioned domains"
- `src/types/flags.ts:224-233` — `MPTokenIssuanceCreateFlagsInterface` declares `tfMPTCanTransfer?: boolean` and `tfMPTRequireAuth?: boolean`, so the map form is part of the library's own public surface
- rippled `TxFlags.h:138-147` — `TRANSACTION(MPTokenIssuanceCreate, …)`, `MASK_ADJ(0)`
- Cross-ref: `mptoken-issuance-set.ts:409-424` — the correct pattern, already in this repo

**Fix.** Added a local `flagsToNumber` with a closed key→bit map
(`mptoken-issuance-create.ts:47-83`) and called it at `:162`. Unknown keys are
ignored rather than rejected, matching `loan-manage.ts`'s forward-compatible
policy, so a future global flag does not break an existing caller.

**Tests.** `tests/fp/mptoken-issuance-create.test.ts` — new
`boolean-map Flags form` block, 6 cases: each gate honoured via the map, both
flags in one map, the negative case (map set but wrong bit), an explicit
`false` treated as unset, and unknown keys ignored.

**Severity: high.** Every MPT issuance that sets a non-zero `TransferFee` or a
`DomainID` through the documented map form was unconstructible.

---

## Defect 3 — `nftokenMint` rejects `TransferFee: 0` without `tfTransferable` (FIXED)

**Factory:** `nftokenMint`

**Bug.** The `TransferFee ↔ tfTransferable` coupling was gated on field
*presence* rather than on *value*.

```ts
// src/fp/factories/nftoken-mint.ts:319-327 (before)
if (
  props.TransferFee !== undefined &&
  (numericFlags & TF_TRANSFERABLE) !== TF_TRANSFERABLE
) { /* throw */ }
```

`TransferFee: 0` with no `tfTransferable` is a transaction rippled accepts.

**What rippled does.** The gate is on the value:

```cpp
// NFTokenMint.cpp:92-96
// If a non-zero TransferFee is set then the tfTransferable flag
// must also be set.
if (f > 0u && !ctx.tx.isFlag(tfTransferable))
    return temMALFORMED;
```

`f == 0` short-circuits the condition, so the transaction proceeds.

**Result code:** none. rippled accepts.

**This one has a documented prose/implementation split, and it is the weakest
of the three.** The written specs gate on *presence*:

- XLS-20 §1.5.1 line 367: "The field MUST NOT be present if the
  `tfTransferable` flag is not set. If it is, the transaction should fail and
  a fee should be claimed."
- xrpl.org `nftokenmint.md:52`: "If this field is provided, the transaction
  MUST have the `tfTransferable` flag enabled."

The pre-existing test cited both. So the old behaviour was *defensible against
the prose* and wrong against the implementation. It is fixed anyway, because:

1. This audit's oracle is rippled, and the library's contract is to emit
   transactions the ledger accepts. Rejecting a submittable transaction is
   the worse failure.
2. The prose's own stated purpose — the trailing "and a fee should be
   claimed" — does not apply to a zero fee.
3. **The sibling rule in this repo already used the value test.**
   `mptoken-issuance-create.ts:137` reads
   `props.TransferFee !== 0 && (flags & TF_MPT_CAN_TRANSFER) === 0`. The same
   rule, one file over, was implemented the other way.

**Canonical sources:**
- rippled `NFTokenMint.cpp:94` — `if (f > 0u && !ctx.tx.isFlag(tfTransferable)) return temMALFORMED;`
- XLS-20 §1.5.1 line 367 (presence-based prose — divergence recorded)
- xrpl.org `nftokenmint.md:52` (presence-based prose — divergence recorded)
- Cross-ref: `mptoken-issuance-create.ts:137` — same rule, value-based, already correct

**Fix.** Added `props.TransferFee > 0` to the condition
(`nftoken-mint.ts:350`). `TransferFee` is range-checked to an integer in
`[0, 50000]` earlier in the same function, so the narrowing is safe. The
divergence is documented in the `## Divergences` header block and inline at
the check, including how to revert to the prose reading.

**Tests.** `tests/fp/nftoken-mint.test.ts` — the old
`throws on TransferFee=0 without tfTransferable` case asserted the defect and
was replaced by three: `TransferFee=0` without the flag is **accepted**;
a non-zero `TransferFee` without it still throws; `TransferFee=0` with it is
accepted.

**Severity: medium** — narrower than Defects 1 and 2 (a zero transfer fee is
rare in practice), and the one finding where a maintainer might reasonably
prefer the prose reading.

**Settled on a live ledger — the fix stands.** A controlled pair on testnet
resolved it: `TransferFee: 0` without `tfTransferable` is accepted
(`tesSUCCESS`), while `TransferFee: 1` under the identical flag state is
rejected (`temMALFORMED`). The ledger gates on value. The prose is wrong, the
fix is right, and the "revert this one line" question is closed rather than
deferred. See *Live verification*.

---

# Gaps — accepted, not fixed

Per the brief these are **not** bugs, and are recorded as counts rather than
one entry per factory. Turning them into 50+ reports would misrepresent the
library's stated policy: validate *fields* eagerly, let the ledger catch the
rest.

| Gap | Affected | rippled's answer |
|---|---|---|
| No flag reasoning at all | **46** of 63 factories | `temINVALID_FLAG` |
| No membership check on `Flags` (cardinality only) | `batch` | `temINVALID_FLAG` |
| No membership check on `Flags` | `sponsorship-transfer` | `temINVALID_FLAG` |
| No membership check on `Flags` | `nftoken-mint` | `temINVALID_FLAG` |

Two specifics worth recording without inflating:

- **`batch`** implements rippled's cardinality rule exactly
  (`Batch.cpp:222`, `temINVALID_FLAG`) but has no mask, so it will not reject
  `tfInnerBatchTxn` on an *outer* Batch. rippled deliberately rejects that bit
  there — `TxFlags.h:206` adds `MASK_ADJ(tfInnerBatchTxn)` with the comment
  "Batch must reject tfInnerBatchTxn - only inner transactions should have
  this flag", asserted by a `static_assert` at `TxFlags.h:269-274`.
- **`nftoken-mint`** rejects `tfTrustLine` outright. rippled's mask is
  amendment-conditional (`NFTokenMint.cpp:55-83`): the bit is legal until
  `fixRemoveNFTokenAutoTrustLine` is enabled. Since a client library cannot
  know ledger amendment state and the amendment is enabled on the public
  network, unconditional rejection is the right call — this is a deliberate,
  conservative divergence, not an oversight.

---

# No issue

**No flag contradiction was found in the 46 factories that do not read
`Flags`, and none in the 17 that do — other than the three defects above.**
Stated plainly rather than left implied.

Verified against the transactor, item by item:

| Factory | Rule enforced | Matches |
|---|---|---|
| `amm-deposit` | membership + cardinality | ✅ reference, live-verified (Bug #6/#7) |
| `amm-withdraw` | membership + cardinality | ✅ reference, live-verified (Bug #6/#7) |
| `amm-clawback` | membership mask = `tfClawTwoAssets \| tfUniversal` | ✅ `TxFlags.h:188-189` |
| `batch` | exactly one of 4 mode flags | ✅ `Batch.cpp:222` |
| `mptoken-issuance-set` | 9 own bits + `tfUniversal` | ✅ `TxFlags.h:153-163` |
| `mptoken-issuance-create` | `ImmutableFlags` bits | ✅ exact match to `lsifMPT*` (`LedgerFormats.h:287-295`) |
| `payment` | `DeliverMin` ⇒ `tfPartialPayment` | ✅ `Payment.cpp:252-260` |
| `loan-manage` | ≥2 action bits rejected | ✅ `LoanManage.cpp:50-58` |
| `sponsorship-set` | Set/Clear pair conflicts | ✅ `SponsorshipSet.cpp:90-95` |
| `did-delete` | mask = `tfUniversal` | ✅ flagless tx (XLS-40 §5.3.2) |
| `did-set` | numeric/finite only | ✅ rejects nothing valid |
| `vault-create` | `DomainID` ⇒ `tfVaultPrivate` | ✅ `VaultCreate.cpp:80-83` |
| `offer-create` | mode inference, type guards | ✅ no bit-level rejection |
| `nftoken-create-offer` | mode inference, type guards | ✅ no bit-level rejection |
| `loan-pay` | inference only | ✅ no bit-level rejection |

Three traps from the brief were checked and did **not** fire:

- **Signed 32-bit `&` — measured, not assumed.** Every mask test in the
  codebase uses `&`, which is int32 in JS, so the negative `~mask` is handled
  correctly even where the mask carries `0x80000000`
  (`mptoken-issuance-set.ts:431` adds a redundant `& 0x7fffffff` that is
  harmless). The new `sponsorship-transfer.ts:427` check follows the same
  shape and was verified at the boundary: `0x80000002` and `0xc0000002` are
  both rejected, and `0x80000000 & ~0x3` evaluates to **`-2147483648`**, not
  `2147483648`. No `>>> 0` is needed *inside* a `&` test; it is needed in an
  **assertion** comparing against an unsigned literal, and this audit's own
  first-draft boundary test got that wrong before the mirror of the brief's
  warning was applied. Worth remembering when writing future flag tests.
- **Sparse bit sets.** `batch` counts by iterating its four specific bits
  rather than popcounting, so a foreign bit cannot be miscounted as a second
  mode. `loan-manage` masks with `tfUniversalMask` before the
  `flags & (flags - 1)` count, exactly as rippled does at
  `LoanManage.cpp:52-53`.
- **`validateBaseTransaction` JSDoc noise.** The ~32 grep hits are all
  citations; the only real reference in `src/` is the re-export in
  `src/validation/index.ts`.

## Two non-defects noted for accuracy

- **`amm-clawback.ts:155` names `0x80000000` `TF_BATCH`.** That bit is
  `tfFullyCanonicalSig`, not a Batch flag — the batch marker is
  `tfInnerBatchTxn` (`0x40000000`). The *value* is right, so behaviour is
  correct and there is no defect; only the constant name and its comment are
  misleading. Left as-is: renaming a constant is churn without behaviour
  change, but the next reader will be misled.
- **`SponsorshipTransfer::preflight` error codes** are `temINVALID_FLAG` for
  the flag-count and reserve-bit checks and `temMALFORMED` for the
  field-presence checks. The factory raises `ValidationError` for both, which
  is correct — it does not claim to mirror result codes.

---

# Part C — type surface (observation only)

All **63** flag-bearing factories type `Flags?: number` (41 bare `number`,
22 as `number | XFlagsInterface`). **Zero** narrow it to a union of legal
bits.

So the type surface is uniformly wider than what rippled permits, in every
case, with no exceptions worth listing. TypeScript cannot reject anything at
runtime, so this is never a contradiction — it is a single observation, and
narrowing 63 public types is a breaking API change, not a bug fix. Recorded
here so it is not mistaken for an oversight when someone notices
`Flags: 0xFFFFFFFF` type-checks.

---

# Verification

```
npx tsc --noEmit      exit 0
npm run lint          exit 0
npm test              79 files, 2858 passed, 0 failed  (baseline 2849, net +9)
```

Files changed:

| File | Change |
|---|---|
| `src/fp/factories/sponsorship-transfer.ts` | `spfSponsorFee` allowed in `SponsorFlags`; mask widened to rippled's set |
| `src/fp/factories/mptoken-issuance-create.ts` | boolean-map `Flags` resolved to real bits before the cross-field gates |
| `src/fp/factories/nftoken-mint.ts` | `TransferFee` gate changed to `> 0`; prose divergence documented |
| `tests/fp/sponsorship-transfer.test.ts` | +1 test, 1 retargeted, 1 comment corrected |
| `tests/fp/mptoken-issuance-create.test.ts` | new `boolean-map Flags form` block, 6 tests |
| `tests/fp/nftoken-mint.test.ts` | 1 test replaced by 3 |

All three fixes were additionally verified at their **boundaries** with a
throwaway suite (since deleted): `SponsorFlags` ∈ {0,1,2,3,4,5,6,7,0xa,0xe,0x12,
0x102,0x7ffffffe,0x80000002,0xc0000002} behave as intended — the reserve gate
fires before the mask gate when bit `0x02` is absent; the boolean-map and
numeric `Flags` forms agree bit-for-bit; `TransferFee` ∈ {0, 1, 50000, −1} split
correctly between the flag gate and the range check. 10/10 passed.

Two pre-existing tests asserted the defective behaviour and were rewritten.
Both rewrites are documented above with the rippled citation that justifies
them; no assertion was weakened to make a gate green.

## Live verification — 2026-10-02, XRPL Testnet

The unit half of all three defects was verified in this repo. The **ledger
half** was then settled against a real testnet, the way suite `[14]` settled
Bug #6. Server: rippled **3.4.1**, `wss://s.altnet.rippletest.net:51233`,
funded via the faucet.

Harness: `173-xrpjson-testing/integration/tests/15-flag-defect-verification.mjs`
(Defects 2 and 3, against `xrpl@4.6.0`) plus
`146-xrpjs/scratch/sponsorship-ledger-check.mjs` (Defect 1, against
`xrpl@5.3.0`). Both import the **locally built** dist, not the published
`xrpjson@1.2.0` in that repo's `node_modules`, which does not contain the
fixes. **Result: 10 passed, 0 failed, 1 skipped.**

### Defect 3 — settled, decisively. The prose is wrong; rippled is right.

This was the judgement call, so it got the most careful treatment: a
*controlled pair*, so that "it succeeded" cannot be confused with "the gate
does not exist".

| `TransferFee` | `tfTransferable` | Factory | Ledger |
|---|---|---|---|
| `0` | absent | **builds** (used to throw) | **`tesSUCCESS`** |
| `1` | absent | throws | **`temMALFORMED`** |
| `1` | set | builds | **`tesSUCCESS`** |

The ledger accepts a zero fee and rejects a one-unit fee under identical
flag state. That is `f > 0u` behaving exactly as read, and it settles the
XLS-20 / xrpl.org question **empirically**: the written specs gate on field
presence, the ledger gates on value, and the ledger is what a submission
actually meets. **The fix stands. The prose is the thing that is wrong.**

A third implementation agrees: xrpl.js's own check is
`if (tx.TransferFee && !isTfMPTCanTransfer)` — a *truthiness* test, so `0`
skips it, for the same reason rippled's `f > 0u` does
(`xrpl/dist/npm/models/transactions/MPTokenIssuanceCreate.js:49`).

### Defect 2 — settled

| Case | Factory | Ledger |
|---|---|---|
| `Flags: { tfMPTCanTransfer: true }`, `TransferFee: 100` | **builds** (used to throw) | `tesSUCCESS` |
| `Flags: 0x20`, `TransferFee: 100` | builds | **`tesSUCCESS`** |
| `Flags: 0`, `TransferFee: 100` | throws | refused |
| map present but missing the bit | throws | — |

The control is refused **client-side by xrpl.js** rather than by the ledger:
`MPTokenIssuanceCreate: TransferFee cannot be provided without enabling
tfMPTCanTransfer flag`. That is a refusal either way, and it is worth
recording *where* each layer draws its line — xrpl.js reads
`flags.tfMPTCanTransfer` off a boolean map directly
(`MPTokenIssuanceCreate.js:43-45`), so the map form is a first-class input to
that client too, not just to xrpjson. Confirmed empirically: the object form
encodes on the wire.

### Defect 1 — settled by three implementations, NOT by the ledger

| Source | Verdict on `SponsorFlags: 3` |
|---|---|
| rippled `TxFlags.h:461` | both bits outside the invalid set |
| rippled `SponsorHelpers.h:32-45` | two independent predicates, one per bit |
| xrpl.js 5.3.0 `common.js:316` | `validFlags = spfSponsorFee \| spfSponsorReserve` |
| xrpl.pl docs `common-fields.md:191` | "Both flags can be used together" |

**The live ledger gave no verdict, and this report does not claim one.** A
`SponsorshipTransfer` with `SponsorFlags: 3`, signed and submitted, returns:

```
temDISABLED — The transaction requires logic that is currently disabled.
```

The `Sponsor` amendment is **not enabled on testnet**, so the transaction is
refused at the amendment gate before any SponsorshipTransfer-specific
validation runs. There is no ledger-level answer available on this network,
and the honest statement is that the verdict rests on the four sources above
— which agree with each other, and one of which (xrpl.js 5.3.0) uses a mask
structurally identical to the one this fix implements.

It would need a network where `featureSponsor` is enabled to close, and that
is recorded as outstanding below rather than papered over.

### Two harness bugs worth recording

Both were mine, and both silently inverted a correct result into a failing
one — the exact failure mode a live check exists to prevent:

1. **Anchored result-code regex.** The library wraps rejections in prose
   (`"Transaction failed, temMALFORMED: Malformed transaction."`), so an
   anchored `^te…` pattern never matched. A correct ledger *rejection* was
   being reported as a test failure.
2. **Capture group instead of full match.** The group spans only the `te?`
   prefix, so `m[1]` was `"tem"`. Asserting `temMALFORMED` against `"tem"`
   fails.

The first run scored 8/11 and looked like two real defects. Neither was.

---

## Outstanding

- **Defect 1 still lacks a ledger verdict.** `featureSponsor` is disabled on
  testnet, so `SponsorshipTransfer` cannot be exercised at all there. Closing
  this needs a network with the amendment enabled. The four-source agreement
  above is strong, but it is not the same thing as a confirmed submission.
- **No commit was made.** Git writes are unavailable in this sandbox (see
  `AGENTS.md`). The work is in the working tree for the maintainer.
- **`tests/zz-tmp-*` and `scratch/*` boundary checks** were run and deleted;
  no stray files remain in `146-xrpjs`. One throwaway probe
  (`probe-amendments.mjs`) could not be deleted in the `173-xrpjson-testing`
  tree — the sandbox denies deletes there — and should be removed by hand.
