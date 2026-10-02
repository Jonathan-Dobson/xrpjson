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

Nothing yet.

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
