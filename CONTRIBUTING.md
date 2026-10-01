# Contributing

How to add a transaction factory to `xrpjson`, and what the verification bar is.

Read these first — they are short and they carry decisions this guide depends on:

| | |
|---|---|
| [`AGENTS.md`](./AGENTS.md) | branch policy, verification gate, delegation rules |
| [`CONTEXT.md`](./CONTEXT.md) | the vocabulary used below — *frozen tx*, *divergence*, *Source* vs *Cross-ref*, *Class API* |
| [`docs/adr/`](./docs/adr/) | why the API looks like this |

---

## The verification loop

Every guard you add is traced to a canonical source and cited. This is the
package's whole value proposition, so it is not optional and it is not
approximate. Three sources, in this order of authority:

1. **XLS specs** — `~/.mavis/docs.local/xrpl-standards/repo/XLS-<NNNN>-<slug>/README.md`
2. **xrpl.org docs** — `~/.mavis/docs.local/xrpl-dev-portal/repo/docs/references/protocol/transactions/types/<lowercase>.md`
3. **xrpl.js 5.3.0** — `~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/`

**When they disagree, the XLS wins** ([ADR-0003](./docs/adr/0003-xls-spec-wins-on-conflict.md)).
Record the divergence rather than silently picking one.

Before writing a guard, answer: *is this already enforced upstream, or is it a
guard this factory adds beyond the Class API?* Both belong in the code. Only the
second goes in `## Divergences`.

---

## Adding a factory

Two files, plus one line in the barrel.

**1. `src/fp/factories/<kebab-case>.ts`**

```ts
import { isAccount, isNumber } from '../../validation/helpers.js';
import { ValidationError } from '../../errors.js';
import { buildFrozenTx, mergeForWith, require } from '../shape.js';

export interface TicketCreateProps {
  Account: string;
  TicketCount: number;
  Flags?: number | undefined;
  Fee?: string | undefined;
  Sequence?: number | undefined;
}

export interface TicketCreate extends Readonly<TicketCreateProps> {
  readonly TransactionType: 'TicketCreate';
  validate(): void;
  toJSON(): Record<string, unknown>;
  with(overrides: Partial<TicketCreateProps>): TicketCreate;
}

export function ticketCreate(props: TicketCreateProps): TicketCreate {
  require(props.Account, 'TicketCreate: Account is required and must be a valid XRPL address', isAccount);
  if (props.TicketCount === undefined) {
    throw new ValidationError('TicketCreate: missing field TicketCount');
  }
  // …
  return buildFrozenTx<TicketCreateProps, TicketCreate>('TicketCreate', props, {
    validate() {
      // Validated at construction — deliberately a no-op.
    },
    toJSON(this: TicketCreate) { /* copy own keys, skip methods and undefined */ },
    with(this: TicketCreate, overrides: Partial<TicketCreateProps>) {
      return ticketCreate(mergeForWith(this, overrides));
    },
  });
}
```

Invariants worth knowing:

- `validate()` on the returned tx is **intentionally empty**. Construction is the
  validation point; the method exists for parity with the Class API
  ([ADR-0002](./docs/adr/0002-frozen-data-object-not-class-wrapper.md)).
- `with()` re-invokes the factory, so overrides are re-validated. Never mutate.
- Use the existing predicates from `src/validation/helpers.ts` (`isAccount`,
  `isAmount`, `isXChainBridge`, …) rather than writing new inline checks.

**2. `tests/fp/<kebab-case>.test.ts`** — cover construction, the frozen-shape
contract, `with()` re-validation, `toJSON()` stripping, and one case per guard.

**3. `src/fp/index.ts`** — add the factory to its family block, alphabetically,
and to the export list.

> **If you are fanning out several factories to parallel agents, do not let them
> edit `src/fp/index.ts`.** Concurrent edits to the barrel silently drop
> exports — the factory and its test pass in isolation and the full suite fails
> with "is not a function". Have each worker report the export line it needs and
> add them all yourself afterwards.

---

## Errors

**Always throw `ValidationError`, never a bare `Error`.** A caller decides
between "your input was wrong" and "my code is broken" with
`instanceof ValidationError`; a bare `Error` sends a user's typo down the
unexpected-bug path.

Include the spec citation in the message when there is one — the error is where
a developer lands when a rule surprises them:

```ts
throw new ValidationError(
  'XChainCreateClaimID: SignatureReward must be a non-negative XRP drops string (in XRP, ≥ 0; XLS-38 §2.3.1.1.2 line 397)',
);
```

This makes citation accuracy a runtime concern: those numbers will drift and
need re-verifying. That is a deliberate trade-off — the error tells you which
rule you broke.

---

## Writing the `## Divergences` block

Every factory file opens with a JSDoc header. After a short description and
`@see` links, add `## Divergences` — one entry per guard the factory adds
beyond the Class API.

Each entry states the rule, then grounds it:

```
 * - **`Destination` must be a valid XRPL classic or X-address.**
 *   The Class API's `XChainClaim` does not validate `Destination` at all.
 *   xrpl.js `validateXChainClaim` line 74 calls
 *   `validateRequiredField(tx, 'Destination', isAccount)`.
 *   - Source: xrpl.js `XChainClaim.ts` line 74.
 *   - Source: xrpl.org `xchainclaim.md` line 47 (`AccountID` internal type).
 *   - Source: XLS-38 §2.3.4.1.3 line 547 (`ACCOUNT`).
 *   - Cross-ref: rippled parses both doors as `STAccount` via
 *     `src/libxrpl/protocol/STXChainBridge.cpp::STXChainBridge(...)`.
```

- **`Source:`** is load-bearing — xrpl.js, xrpl.org, or an XLS.
- **`Cross-ref:`** corroborates. Never the sole justification for a rule.
- **Refer to the Class API by name**, not by path: `the Class API's
  \`XChainClaim\``. There is no `src/transactions/` in this repo.

### Citation conventions

- **xrpl.js** — cite the file that defines the validator. There is no
  `validate<Name>.ts`; `validate<Name>` is a *function inside* `<name>.ts`.
  Casing is not uniform: `delegateSet.ts` is camelCase, `XChainCreateBridge.ts`
  is PascalCase. Check the actual mirror.
- **rippled** — the **symbol carries the claim**, not the line number
  ([ADR-0004](./docs/adr/0004-rippled-citations-name-a-symbol.md)):

  ```
  src/libxrpl/tx/transactors/bridge/XChainBridge.cpp::XChainCreateAccountCommit::preflight
  ```

  A line number may follow as a convenience but is never load-bearing. Pin to
  tag `3.4.0`; transactors merge and rename between releases.
- **A type name is not a filename.** `Hash256` is a legacy alias for `UInt256`
  that survives in the codec definitions, not a page in the portal docs.

### "No divergences" is a finding

If the factory genuinely adds nothing over the Class API, say so explicitly
rather than omitting the block — an absent heading reads as an oversight, and
five factories were originally ambiguous for exactly that reason.

---

## Before you claim done

```bash
npm run lint      # ESLint 9 + typescript-eslint strict
npx tsc --noEmit  # type check
npm test          # vitest
```

All three must be green. For a repo this small the suite runs in about four
seconds — there is no reason to skip it.

---

## Checking citations

Citations drift. Sources are pinned locally, so a quick check is cheap:

```bash
# Does the cited file exist, and does it hold the cited line?
sed -n '74p' ~/.mavis/docs.local/xrpl.js/repo/packages/xrpl/src/models/transactions/XChainClaim.ts
```

A full audit of all 1,074 citations, including the defect taxonomy and the four
items still open, is in
[`docs/audit/2026-10-01-citation-audit.md`](./docs/audit/2026-10-01-citation-audit.md).
Re-running it after a bulk change is worthwhile — the last pass found defects
that had been sitting in every factory file since the package was written.
