# Functional API over the class API

`xrpjson` is the functional-API refactor of the sibling class-based builder `xrplt`
(v0.7.1, published separately): instead of one
instantiated class per transaction type with a shared base-class hierarchy and a
central registry, each transaction family gets a single exported factory function.
Because every factory is its own module reached through a per-family barrel
(`src/fp/index.ts`), a consumer that imports only `payment` pulls in only the
Payment factory and its direct imports, so tree-shaking is total — which is what
lets the package ship 79 transaction types with zero runtime dependencies.

## Considered Options

The rejected alternative is the class API itself: `new Payment({...})` extends a
`Transaction` base, registers in `registry.ts`, and inherits validation down a
prototype chain. `xrplt` keeps shipping that API, so `xrpjson` is not a
replacement for it — it is an opt-in second shape for the same 79 transaction
types.

## Consequences

The trade-off is a more verbose call site (`payment({ Account, Destination,
Amount })` rather than `new Payment(...).amount(...)` chaining) and the loss of
`instanceof` as a type guard, because a factory returns a frozen plain object
with no prototype (see [ADR-0002](./0002-frozen-data-object-not-class-wrapper.md)).
Those are accepted costs for full tree-shaking and for eager validation at
construction.
