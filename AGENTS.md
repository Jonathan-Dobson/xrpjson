# AGENTS.md

Standing rules for any agent or human working in this repo. Read before your
first change.

## Branches

- **`main`** — the only branch that ships. All product code lands here.
- **`semantic-codesearch`** — infrastructure-only. It hosts the
  `codebase-semantic-search` dev dependency, its config
  (`.codesearchrc.json`, `docker-compose.search.yml`,
  `.search-index-state.json`), the generated agent-instruction files under
  `.github/instructions/` and `.github/agents/`, and the MCP registration.

### Hard rules for `semantic-codesearch`

1. **Never merge `semantic-codesearch` → `main`.** Not ever — not even "just
   the config files" or "it's only a few lines". The branch is a permanent
   side-channel for the search stack, not a staging area for product work.
2. **Never commit new code to it.** No features, bug fixes, refactors, tests,
   or dependency changes. The only commits it should ever receive are merges
   *in from* `main`, plus the tooling's own state churn — e.g. a changed
   `.search-index-state.json` after a reindex. A dirty tree there is normal
   after indexing; it is not a signal to start writing code.
3. **Keep it current with `main`.** Merge `main` into the branch
   (`git switch semantic-codesearch && git merge main`), resolve nothing but
   the shared config, then re-index.
4. **The index outlives the branch.** Milvus is a Docker volume, not git
   state, so once you have merged `main` and re-indexed, `git switch` back to
   your working branch and the `codesearch` MCP tools keep answering normally.

## Keeping the index fresh

- `npx codesearch index` — incremental reindex. Run it whenever `src/` has
  moved since `.search-index-state.json`'s `lastIndexedAt`, and at minimum
  right after every merge from `main`.
- `npx codesearch index --full` — drops the collection and rebuilds. Only for
  chunker/config changes, not routine refreshes.
- `npx codesearch doctor` — first move when queries fail or return nothing
  (usually Ollama or the Milvus stack is down).
- `npx codesearch down` — stops Milvus; the index survives.
- The index is a discovery aid, not an oracle. If a hit is about to become a
  claim in an answer or a code change, confirm it against the file first.

## Using it

Full tool reference: `.github/instructions/codebase-semantic-search.instructions.md`
on the `semantic-codesearch` branch. The upstream copy ships with the package
at `node_modules/codebase-semantic-search/README.md`. Prefer the MCP tools
(`codebase_semantic_search` → `codebase_clip` / `codebase_read_file`) over the
HTTP fallback on `:7700`.

## Delegating work

- **Reuse a finished sub-agent instead of spawning a new one.** When more work
  follows a task an agent already did, continue it with `task_append` rather
  than starting fresh — it already holds the project context, so the briefing
  is shorter and continuity survives.
- Spawn a new agent only when the task shares nothing with what an existing one
  already knows.
- **Never let two workers write the same file.** Give each a disjoint set of
  factories, and keep anything shared (README, `src/fp/index.ts` barrel, the
  audit report) with the parent, integrating it in one pass afterwards.
- Workers must not run `git switch`, `git checkout`, or `git commit`.

## Before claiming done

```bash
npm run lint      # ESLint 9 flat config + typescript-eslint strict
npx tsc --noEmit  # type check without emitting
npm test          # vitest
```

All three. A change is not done until lint, type check, and tests are green.
