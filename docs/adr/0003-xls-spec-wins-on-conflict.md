# The XLS spec wins when canonical sources disagree

Every factory is verified against three sources — xrpl.js 5.3.0, the xrpl.org
docs, and the XRPL amendment (XLS) specs — and when they disagree, the XLS spec
is authoritative: the factory follows the spec and the divergence is recorded in
that factory's `## Divergences` block with a citation. This is why `xrpjson`
is deliberately stricter than `xrplt`'s class API, whose guards are a subset of
what the specs require (74 of 79 factory files carry a `## Divergences` block
enumerating the extra guards).

## Consequences

The cost is that `xrpjson` can be stricter than the library most users actually
run: xrpl.js is the validator that will serialize and submit, so a spec-mandated
guard may reject a transaction that xrpl.js would happily encode. The
mitigation is that each divergence is cited to the specific spec section, so a
user who hits a rejection can see exactly which rule they are violating rather
than guessing from an opaque throw.
