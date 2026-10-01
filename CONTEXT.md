# xrpjson

Functional transaction factories for the XRP Ledger. This file pins down the
vocabulary that the factory docstrings, `## Divergences` blocks, and validation
helpers all use without ever defining it.

## The factory contract

**Functional API (fp)**:
The style of building transactions as plain functions over plain data rather
than instantiating a class per transaction type. `fp` is the subpath and
file-tree name this style ships under.
_Avoid_: functional programming, FP

**Factory**:
The single exported function for one transaction type that checks its input
and returns a frozen tx. There is exactly one per type — no class hierarchy, no
central registry.
_Avoid_: constructor, builder, `new Payment()`

**Frozen tx**:
The immutable object a factory returns: the validated fields plus three
methods bound to it — validate, toJSON, and with. Frozen at the data layer, so
what serialises is exactly what the caller provided.
_Avoid_: instance, model, entity, tx object

**Eager validation**:
Checking every field at construction rather than on a later call, so an invalid
transaction cannot be held in a variable at all. The validate method a frozen tx
carries is a no-op, kept for parity with the class API.
_Avoid_: deferred validation, lazy validation, preclaim

**Override**:
A field value supplied to with(), which re-runs the factory so the derived tx
is validated again. A frozen tx is never edited in place.
_Avoid_: mutation, patch, edit

**Wire format**:
The plain JSON object a frozen tx serializes to, matching the canonical XRPL
request shape and ready to encode, sign, and submit.
_Avoid_: JSON, output, blob

## Guards and validation

**Predicate**:
An exported zero-dependency type check named `is*` — isAmount, isAccount,
isXChainBridge — that a guard composes into a field rule. A predicate
recognises a shape; it never rewrites or coerces the value.
_Avoid_: validator, schema, guard

**Format-only check**:
A predicate that tests the visible form of a value (regex, length, key set)
without verifying it cryptographically, so an XRPL address is checked but its
base58 checksum is not. The weakening is deliberate: verifying it would pull in
a codec dependency.
_Avoid_: full validation, verified

**Guard**:
A single rejection rule inside a factory, present because the baseline omits it
or a canonical source mandates it.
_Avoid_: check, assertion, validation step

**Preclaim**:
A rule rippled applies to a transaction before applying it to the ledger,
rejecting it with a `tem`-class code. A factory duplicates a preclaim locally
only when the field values alone decide it.
_Avoid_: validation, submit-time check

**Pass-through field**:
A field a factory accepts and stores without checking, most often the shared
Fee and Sequence.
_Avoid_: unvalidated field, ignored field, base field

## Divergences and sourcing

**Divergence**:
A guard a factory adds beyond what the baseline does — either the baseline omits
the rule, or a canonical source mandates one it ignores. Every divergence is
recorded in the factory's divergences block with a citation.
_Avoid_: deviation, difference, bug, delta

**Spec clarification**:
An entry in a divergences block that records agreement with the canonical
source rather than a departure from the baseline, so a reader knows the omission
was considered rather than missed.
_Avoid_: note, comment, non-divergence

**Class API**:
The class-based transaction layer in the sibling `xrplt` package, and the
reference point every divergence is measured against.
_Avoid_: baseline, legacy layer, v0.7.1 source

**Canonical source**:
One of the three authorities a guard is checked against: xrpl.js, the xrpl.org
docs, or an XLS spec. When the three disagree, the XLS wins.
_Avoid_: upstream, reference, docs

**Citation**:
The line that grounds a divergence, naming a file or spec section. A Source
points into xrpl.js, xrpl.org, or an XLS; a Cross-ref points at rippled
behaviour or a local sibling to corroborate the Source.
_Avoid_: link, footnote, bibliography

**Internal type**:
The ST-type an XLS field table assigns to a field, naming the representation
the ledger requires of it.
_Avoid_: field type, datatype, wire type

## XRP Ledger vocabulary

**Amount**:
A transferable value in exactly three forms — an XRP drops string, an
issued-currency object, or an MPT object. Every factory that moves value
accepts all three and names them in its error text.
_Avoid_: value, quantity, IOU

**Currency**:
A currency specifier carrying no amount: XRP, an issued currency, or an MPT
issuance. Distinct from an Amount even where a field named Asset holds one.
_Avoid_: asset, token

**Clawback amount**:
An Amount that can be clawed back — the issued-currency and MPT forms only,
since XRP cannot be.
_Avoid_: clawback variant

**Single-key wrapper**:
The XRPL convention of nesting an inner object under one key named for the field
holding it, as Memo, Signer, and RawTransaction do. Predicates match the
wrapper, not the inner object.
_Avoid_: envelope, container, box

**Bridge**:
The four-part structure naming a locking and issuing chain pair for a
cross-chain transfer: one door and one issue per side.
_Avoid_: connector, route

**Sidechain**:
The two-chain topology the XChain transaction family implements — value locks on
one chain, is attested, and is claimed on the other.
_Avoid_: bridge network, multi-chain

**Bit flag**:
One named bit in a transaction's Flags bitmask, either global or specific to
the transaction type.
_Avoid_: flag object, option

**Flag map**:
The boolean-keyed alternative to the numeric bitmask, accepted wherever Flags
is and folded into the bitmask before any guard reads it.
_Avoid_: flags object, options

**Ledger entry**:
A persistent object owned by an account on the ledger — a DID, oracle, NFT
offer, loan, or vault — addressed by a 64-character hex ID.
_Avoid_: record, row, state

**Amendment**:
A protocol feature that a ledger enables by vote, gating a family of
transaction types. An XLS document is its specification.
_Avoid_: feature, upgrade, protocol change
