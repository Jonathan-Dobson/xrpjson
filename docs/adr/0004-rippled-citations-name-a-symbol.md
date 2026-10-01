# rippled citations name a symbol; line numbers are a hint

rippled is pinned at tag `3.4.0` as the reference for C++-side preclaim
behaviour, and a citation carries the *symbol* — e.g.
`src/libxrpl/tx/transactors/bridge/XChainBridge.cpp::XChainCreateClaimID::preflight`
— not a bare `.cpp` filename and not a line number. Bare filenames are
unreliable because rippled consolidated transaction validators into transactor
headers under `include/xrpl/tx/transactors/` and merged many bridge validators
into `XChainBridge.cpp`. Of the 12 distinct `.cpp`/`.h` filenames cited across
the 115 rippled references in 32 factory files, 10 resolve at tag `3.4.0` and
two do not: `XChainAccountCreateCommit.cpp` (cited by
`xchain-account-create-commit.ts`; the transactor is a header) and `Amount.cpp`
(cited by `xchain-commit.ts`; no such file under any extension). The symbol
still resolves after those moves, so it is the load-bearing part.

## Consequences

A line number may still be included, but only as a convenience for a reader
holding that exact ref — it is not part of the claim and should never be the
only thing identifying the source. This is a convention change for new and
edited citations; existing docstrings that cite bare filenames are known to be
inconsistent and need sweeping separately.
