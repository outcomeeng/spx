# Plan: Consumer boundary repair

> **Reconcile against `spx/PLAN.md` first.** This is the use-case layer (cross-library orchestration only). The corrected model separates `persistence` (records / journals / snapshots) from `backend` (was "materialization") and `delivery`, makes verification the five types that *consume* the journal, names `spx verify` the SPX projection/validation home, requires additive migration (never a wholesale move), and defers `.surface`. Where this note predates that model, the root plan governs.

This coordination note preserves the spec-domain repair before durable specs and implementation are moved.

## Ownership target

`spx/31-spec-domain.enabler` should consume the spec-tree logical foundation and expose cross-library use-case operations that the surface layer (`spx/60-surfaces.enabler`, see root `spx/PLAN.md`) wraps:

- application use-cases as calls into the foundation (e.g. the status rollup that composes spec-tree × verification × test)
- web API and MCP use-cases when those surfaces exist, exposed as the same operations, not per-surface reimplementations
- projection production — the projection object a surface renders, not the terminal/JSON/UI formatting itself
- diagnostics as structured results the surface reports

It should not own:

- node state vocabulary
- status semantics
- stale/fresh dependency semantics
- filesystem metadata schema
- language dependency discovery
- executable evidence semantics
- CLI command binding, verbs, flags, help text, or terminal/JSON rendering — these live in `spx/60-surfaces.enabler/21-cli-surface.enabler` per root `spx/PLAN.md`

## Current node-status disposition

`spx/31-spec-domain.enabler/21-node-status.enabler` is a migration holding area. Its business logic should move to `spx/23-spec-tree.enabler` and its filesystem status-file behavior should move under the materialization backend.

Spec-domain may keep a status use-case node only after it is reduced to:

- call the spec-tree foundation
- accept resolved options from the surface
- produce projections (the surface renders them)
- return structured diagnostics

## Interface model

The surface layer sits above spec-domain use-cases:

```text
spx/60-surfaces.enabler        (CLI / Web API / MCP / UI wrappers)
        ↓
spx/31-spec-domain.enabler     (cross-library use-cases)
        ↓
spx/23-spec-tree.enabler       (logical foundation)
```

No surface shells out to another surface. A web frontend calls the use-case boundary; it does not run the CLI.

## Next steps

1. Keep current node-status branch unmerged until ownership is repaired.
2. After the provider nodes exist, rewrite spec-domain specs to reference provider operations rather than status-file internals.
3. Move implementation from `src/lib/node-status/` into provider/backend modules where appropriate.
4. Keep command modules thin over provider operations.

---

## Existing plan: Spec-domain command refactor

> Transitional: the section below describes `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler` as it stands today, owning `spx spec` command binding, flags, and terminal rendering — its completed (`[x]`) items are the current state, not the target. Root `spx/PLAN.md` supersedes that ownership: the surface wrapper migration (delivery-order step 5) moves this CLI wrapper into `spx/60-surfaces.enabler/21-cli-surface.enabler/`, leaving spec-domain the use-case layer per the "Ownership target" above.

## Purpose

Rebuild `spx spec` command behavior on top of the current spec-tree library. This node owns command invocation, flags, terminal-oriented rendering, errors, and local CLI contract tests. It does not own source parsing, tree assembly, traversal, state derivation, or registry vocabulary.

## First tranche

- [x] Pause in-place migration of legacy command tests and classify the dirty legacy-node tests as evidence inventory only.
- [x] Extract every assertion from `spx/31-spec-domain.enabler/spec-domain.md` and route it through the spec-tree testing methodology.
- [x] Add child target specs before adding child-local tests:
  - `spx/31-spec-domain.enabler/32-spec-cli-rendering.enabler/`
  - `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/`
  - `spx/31-spec-domain.enabler/76-spec-cli-contract-tests.enabler/`
- [x] Move rendering assertions from the legacy output-formatting node into the rendering target.
- [x] Move `status` and `next` command assertions from the legacy CLI-integration node into the command target.
- [x] Move package-script or process-level command contract evidence from legacy E2E nodes into the contract-test target.
- [x] Rebuild tests from the assertions using `withSpecTreeEnv` for real temp product directory execution and in-memory sources for pure command rendering.
- [x] Keep source-level implementation changes in `src/commands/spec/*`, `src/domains/spec/*`, and CLI registration only after the target tests state the desired behavior.

## Owner Nodes

- Deterministic context ingestion work lives in `spx/31-spec-domain.enabler/43-context-ingestion.enabler/`.

## Evidence matrix

| Target                               | Evidence                                                                                                                | Minimum level                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `32-spec-cli-rendering.enabler`      | Text, table, markdown, and JSON renderers map spec-tree projections to terminal/API output without parsing source paths | L1 mapping/conformance                                                                |
| `54-spec-cli-commands.enabler`       | `spx spec status` reads the current worktree `spx/` tree and reports registry labels, node paths, and derived states    | L1 scenario with `withSpecTreeEnv`                                                    |
| `54-spec-cli-commands.enabler`       | `spx spec next` selects the first non-passing node from the spec-tree traversal surface                                 | L1 scenario with `withSpecTreeEnv`                                                    |
| `54-spec-cli-commands.enabler`       | Empty spec trees and malformed source states return deterministic command output or diagnostics                         | L1 scenarios over real temp product directories                                       |
| `76-spec-cli-contract-tests.enabler` | Commander wiring accepts current flags and routes to the spec-domain handler                                            | L2 scenario through the development CLI entry point if process invocation is required |
| `76-spec-cli-contract-tests.enabler` | Package-script invocation keeps development and built CLI contracts distinct                                            | L2 scenario after build only when the assertion requires the packaged executable      |

## Current dirty edit disposition

- [x] Move `spx/31-spec-domain.enabler/tests/spec-cli-commands.scenario.l1.test.ts` into `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/tests/spec-cli-commands.scenario.l1.test.ts` after routing it through the current command evidence matrix.
- [x] Replace deprecated-node edits with target-node tests, then remove those deprecated-node changes from the refactor branch.
- [x] Keep `src/domains/spec/index.ts`, `src/commands/spec/status.ts`, `src/commands/spec/next.ts`, and `src/cli.ts` changes only after the target-node tests prove the current command behavior.
- [x] Delete the previous spec-domain compatibility path after no import path or test still depends on it.

## Remaining work

- [x] Author the three spec-domain child nodes with current `.enabler` suffixes and assertion links.
- [x] Move or rewrite command tests into those child nodes with canonical evidence/level names.
- [x] Make renderers consume `SpecTreeProjection` rather than raw snapshots when the command output is a stable projection concern.
- [x] Make command handlers resolve the worktree-local tracked `spx/` root per `spx/15-worktree-management.pdr.md`.
- [x] Keep config writes out of all spec-domain command paths.
- [x] Rename apply-exclude root vocabulary from `projectRoot` to `productDir` when owning the config-write path — resolved by deleting the retired config-write path instead of retaining it.
- [x] Run focused spec-domain tests, then `spx validation all`, then the full package test gate.

## Acceptance

- [x] Spec-domain tests are in the current `spx/31-spec-domain.enabler/` subtree and no retained evidence depends on deprecated node shapes.
- [x] Command modules consume the public spec-tree surface and never parse suffixes or assemble hierarchy themselves.
- [x] `status` and `next` behavior are proven against real temp product directories built by `withSpecTreeEnv`.
- [x] Rendering behavior is proven separately from command filesystem execution.
- [x] CLI contract tests cover only behavior that cannot be proven through direct command functions.
