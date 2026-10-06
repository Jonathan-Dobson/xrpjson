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

### Fixed

`accountSet` accepted `NFTokenBrokerFee`, which the protocol does not put on
`AccountSet`. Sending it reached the ledger and failed there with
`Field 'NFTokenBrokerFee' found in disallowed location.` The field now raises at
construction, naming `NFTokenAcceptOffer` as the transaction that owns it, and
the field-ownership index no longer lists `AccountSet` as an owner.

Found by cross-checking every factory's declared fields against rippled's own
`transactions.macro` and `sfields.macro` plus its `TxFormats::getCommonFields()`
common-field injection. Tests: 4,084 → 4,085.

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

[Unreleased]: https://github.com/Jonathan-Dobson/xrpjson/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/Jonathan-Dobson/xrpjson/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Jonathan-Dobson/xrpjson/compare/v1.0.5...v1.1.0
[1.0.5]: https://github.com/Jonathan-Dobson/xrpjson/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/Jonathan-Dobson/xrpjson/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/Jonathan-Dobson/xrpjson/compare/v1.0.2...v1.0.3
