# Plan: Spec-domain command refactor

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
- [x] Replace legacy edits under `spx/21-core-cli.capability/` and `spx/26-scoped-cli.capability/` with target-node tests, then remove those legacy-node changes from the refactor branch.
- [x] Keep `src/domains/spec/index.ts`, `src/commands/spec/status.ts`, `src/commands/spec/next.ts`, and `src/cli.ts` changes only after the target-node tests prove the current command behavior.
- [x] Delete `src/domains/spec-legacy/index.ts` only after no import path or test still depends on the legacy domain.

## Remaining work

- [x] Author the three spec-domain child nodes with current `.enabler` suffixes and assertion links.
- [x] Move or rewrite command tests into those child nodes with canonical evidence/level names.
- [x] Make renderers consume `SpecTreeProjection` rather than raw snapshots when the command output is a stable projection concern.
- [x] Make command handlers resolve the worktree-local tracked `spx/` root per `spx/15-worktree-resolution.pdr.md`.
- [x] Keep config writes out of all spec-domain command paths.
- [x] Delete the retired apply-exclude implementation after removing the config-writing command route.
- [x] Remove legacy `specs/work` fixtures from spec-domain tests.
- [x] Run focused spec-domain tests, then `spx validation all`, then the full package test gate.

## Acceptance

- [x] Spec-domain tests are in the current `spx/31-spec-domain.enabler/` subtree and no retained evidence depends on legacy capability/feature/story nodes.
- [x] Command modules consume the public spec-tree surface and never parse suffixes or assemble hierarchy themselves.
- [x] `status` and `next` behavior are proven against real temp product directories built by `withSpecTreeEnv`.
- [x] Rendering behavior is proven separately from command filesystem execution.
- [x] CLI contract tests cover only behavior that cannot be proven through direct command functions.
