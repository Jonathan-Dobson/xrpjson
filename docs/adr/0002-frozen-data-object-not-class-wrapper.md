# Frozen data object, not a class wrapper

A factory returns an `Object.freeze`'d plain object with `validate()`,
`toJSON()` and `with(overrides)` bound directly onto it — no class, no
prototype chain — so that the serialized shape and the programmatic shape are
the same object, `Object.keys(tx)` is the exact wire field set, and `with()` can
re-run the factory to re-validate. `buildFrozenTx` in `src/fp/shape.ts` freezes
twice for this reason: once at the data layer so the field set is stable and
`Object.keys(tx)` reflects only user-supplied fields plus `TransactionType`, and
again after attaching the methods so they stay callable but unassignable.

## Considered Options

The class-wrapper alternative was rejected: a wrapper object holding the data
separately would either leak methods into `Object.keys(tx)` (breaking
serialization) or need a custom serializer, and the prototype chain would block
the structural, tree-shakeable shape that motivated the functional API in the
first place.

## Consequences

`validate()` on a frozen tx is a deliberate no-op — validation already happened
during the factory call — kept only so code written against the class API does
not have to special-case. With no prototype, `instanceof` is unavailable, and
`mergeForWith` must explicitly skip function-valued keys when spreading the
current tx for `with()`.
