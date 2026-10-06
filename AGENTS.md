# AGENTS.md

Standing rules for any agent or human working in this repo. Read before your
first change.

## Branches

- **`main`** — the only branch that ships. All product code lands here.
- **`semantic-codesearch`** — infrastructure-only, and **local-only: never
  pushed**. It hosts the `codebase-semantic-search` dev dependency, its config
  (`.codesearchrc.json`, `docker-compose.search.yml`), the generated
  agent-instruction files under `.github/instructions/` and
  `.github/agents/`, and the MCP registration.

### Hard rules for `semantic-codesearch`

1. **Never merge `semantic-codesearch` → `main`.** Not ever — not even "just
   the config files" or "it's only a few lines". The branch is a permanent
   side-channel for the search stack, not a staging area for product work.
2. **Never commit new code to it.** No features, bug fixes, refactors, tests,
   or dependency changes. The only commits it should ever receive are merges
   *in from* `main`. Index state is never committed — see the note at the end
   of "Keeping the index fresh".
3. **Keep it current with `main`.** Merge `main` into the branch
   (`git switch semantic-codesearch && git merge main`), resolve nothing but
   the shared config, then re-index.
4. **Never push it.** It is tracked locally only. `origin` carries `main` and
   nothing else, so `git push` on this branch must always be refused — the
   infra config, the Milvus port binding, and the local index are all
   machine-local concerns, and none of them belong in the published repo.
5. **The index outlives the branch.** Milvus is a Docker volume, not git
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

### Do not collide with `128-xrp-tx-builder`

That sibling checkout had the same `milvusPort` (19530) and `collectionName`
(`codebase_chunks`), so indexing there would have overwritten this project's
index — it pointed straight at the live `175-xrpjson` Milvus stack. **This
project owns `codebase_chunks` on :19530.** `128-xrp-tx-builder` has been moved
to port 19531, collection `codebase_chunks_xrplt`, HTTP :7800. Do not move this
project back onto the defaults; if you change a port or collection name here,
change it in both places or the collision returns.

### Search-index port and collection registry

Three live stacks now share this machine. Claim a **fourth** port for any new
index; never reuse a row.

| Port | Collection | HTTP | Owner |
|---:|---|---:|---|
| 19530 | `codebase_chunks` | 7800 | **this project** |
| 19531 | `codebase_chunks_xrplt` | 7801 | `128-xrp-tx-builder` |
| 19532 | `codebase_chunks_rippled` | 7802 | rippled C++ mirror (`~/.mavis/docs.local/rippled/`) |

The rippled stack indexes the XRPL ledger server's own source so protocol
citations can be verified against real code instead of the web. It is documented
in the `xrpl-tx-stories` skill, which is where to look before querying it.

`collectionName` has **no environment override** — only `milvusPort`,
`searchPort`, `ollamaHost` and `embeddingModel` do. A `.codesearchrc.json` in the
indexed workspace root is the *only* thing separating two indexes. That file is
found by walking up from the working directory, so always run from the intended
workspace or you will silently pick up another project's config.

### `.search-index-state.json` is local-only

It is gitignored on **both** branches and never committed. It records what the
local indexer has already embedded; the index itself lives in the Milvus
volume, not in git.

It used to be tracked on `semantic-codesearch` only, which meant switching to
`main` deleted it. With no bookkeeping, the next incremental reindex re-upserted
every file without pruning the stale chunks, so the collection grew by exactly
one batch of duplicates. If the chunk count ever jumps by a few hundred right
after a branch switch, that file went missing — check it exists before
reindexing.

### Known tooling defects in `codebase-semantic-search@0.2.5`

Neither is fixable in this repo without patching `node_modules` or upgrading.
Both below were measured against a clean `--full` rebuild of this repo
(570 chunks across 96 files).

- `codebase_stats` and the CLI's "Done! N total chunks" line report `0` right
  after a successful `--full` rebuild — it reads the collection before Milvus
  flushes. The rows are there. Confirm with a real `codebase_semantic_search`
  call or a direct `query`, never with the counter.
- **Line ranges are systematically short.** The chunker attaches a node's
  leading comment — its JSDoc block, and sometimes the `// ─── Section ───`
  banner above that — to the stored `content`, but records `start_line` /
  `endLine` at the bare declaration. Measured over all 570 chunks: 26.5%
  exact, 41.9% off by 2–5 lines, **14.0% off by more than 5**. Example:
  `offer-create.ts:176-178` is `isXrplNumber`, but the stored content actually
  begins at the section banner on line 169. A search hit's line range therefore
  lands *after* the docstring that explains it. Read a few lines above the
  reported range, or use `codebase_clip` to get the content search already
  returned.

There are **no duplicate chunks**: a clean rebuild yields 570 rows with zero
duplicate ids, zero duplicate `(file_path, start_line)`, and 96 distinct files.
Duplicate hits seen earlier were a side effect of the lost state file above, not
a chunker bug — `--full` clears them.

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
