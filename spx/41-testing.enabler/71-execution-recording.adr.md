# Testing Execution Recording and Per-Node Run

## Purpose

This decision governs the testing domain's provider surface that turns a test run into persisted last-run evidence: the command-layer handler that assembles and records a `TestRunState` after a run, and the registry-based per-node run that the status domain consumes to refresh one node's outcome. It decides only the parent composition that ties discovery, the child digest and storage surface, and registry dispatch together — the storage schema, atomic write, digest derivation, and staleness comparison are governed by `spx/41-testing.enabler/43-last-run-evidence.enabler/11-last-run-directory.adr.md`, `spx/41-testing.enabler/43-last-run-evidence.enabler/21-testing-state-storage.adr.md`, `spx/41-testing.enabler/43-last-run-evidence.enabler/32-terminal-write-protocol.adr.md`, and `spx/41-testing.enabler/43-last-run-evidence.enabler/43-staleness-comparison.adr.md`.

## Context

**Business impact:** Status commands report a node's outcome without re-running its suite when valid evidence exists, and refresh exactly one node when its evidence is stale, failing, or absent. Both depend on the testing domain persisting evidence after a run and exposing a single-node run that produces and records the same shape of evidence. One recording path keeps the full-suite run and the single-node run from diverging in what they capture.

**Technical constraints:** Recording writes `state.json` to the worktree filesystem, so it is I/O orchestration that belongs in the command layer per `spx/14-cli-composition.adr.md`, not in the pure testing domain and not in the Commander descriptor. Test execution reaches each language only through `src/testing/registry.ts` per `spx/19-language-registration.adr.md`. The four staleness inputs are derived from sources outside this node: the testing config digest from the canonical descriptor digest (`spx/16-config.enabler/54-canonical-descriptor-digest.enabler/canonical-descriptor-digest.md`), the descriptor-declared product input digests from the domain execution descriptors (`spx/16-config.enabler/43-domain-execution-descriptors.enabler/domain-execution-descriptors.md`), and the discovered path-set and content digests from the child helpers `digestTestPaths` and `digestTestContents`; the worktree root, branch name, and head SHA come from the product-directory API (`spx/16-config.enabler/65-product-directory-api.enabler/product-directory-api.md`). The per-node run's outcome is consumed across the domain boundary by the status resolver defined in `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md`.

## Decision

Last-run evidence recording and the registry-based per-node run are command-layer handlers under `src/commands/testing/` that share one recording path: each handler resolves the discovered test files for its scope, dispatches the matching files through the testing registry, assembles a `TestRunState` from the runner outcomes plus the four staleness digests and the branch and head-SHA identity fields, and persists it through the injected `TestRunStateFileSystem`; the per-node run scopes discovery to a single node's tests and returns that node's runner outcome to its caller, while the full-suite run records over all discovered files. The four staleness digests are derived by one shared current-staleness-inputs function — over the resolved testing config, the covered test paths and their contents, and the descriptor-declared product inputs — that both the recording path and the status resolver's freshness check consume, so a node's recorded staleness inputs and the current inputs later compared against them derive from one recipe.

## Rationale

A single recording function consumed by both the full-suite run and the per-node run guarantees the two produce identical evidence shape and staleness inputs — a node refreshed individually is indistinguishable from the same node covered by a full run, which is what lets status read either interchangeably. Placing recording in `src/commands/testing/` follows the layering in `spx/14-cli-composition.adr.md`: it composes the pure digest helpers and the storage surface with filesystem, clock, and git reads, returns a result, and carries no Commander binding or process exit, so it verifies against temporary fixtures. Dispatching the per-node run through `src/testing/registry.ts` keeps the single-node path language-agnostic per `spx/19-language-registration.adr.md`, so the status domain obtains every outcome through one registry-driven path and names no language.

Returning the per-node outcome to the caller — rather than having the testing domain reach into status — preserves the composition direction declared by `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md`: status composes the testing provider through an injected resolver, and the testing domain depends on neither the status nor the spec domain.

Alternatives rejected:

- **Recording inside the pure dispatch (`runTests`) or the testing domain layer** — drags filesystem, clock, and git I/O into a layer that `spx/14-cli-composition.adr.md` keeps free of them, defeating its isolated verification.
- **Recording inside the Commander descriptor** — mixes evidence assembly and persistence with the process boundary, so the recording logic could be exercised only through the built executable.
- **Separate recording paths for the full run and the per-node run** — lets the two drift in captured fields or digest derivation, so a per-node refresh could record evidence a full run would not trust, breaking the read-either-interchangeably property.
- **A status-owned per-node runner** — duplicates registry dispatch and forces status to name languages, rejected by `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md`.

## Trade-offs accepted

| Trade-off                                                                  | Mitigation / reasoning                                                                                                                      |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| The recording handler depends on four external digest and identity sources | Each is a settled, separately governed API; the handler composes them and owns none of their logic                                          |
| Two run scopes (full-suite, single-node) share one recording function      | The shared path is the point — divergence is the failure mode it prevents; the scopes differ only by the discovered-file subset they record |
| Recording adds filesystem writes to every run                              | Writes go through the injected `TestRunStateFileSystem` and the atomic protocol; evidence is the product value the run exists to produce    |

## Invariants

- The full-suite recording and the per-node recording assemble and persist their `TestRunState` through one shared recording function; the scopes differ only by the discovered-file subset they cover.
- A node's recorded staleness inputs and the current staleness inputs the status resolver compares against them are derived by one shared current-staleness-inputs function; the record side and the read side never derive the four digests by separate recipes.
- Every persisted `TestRunState` carries runner outcomes, the four staleness digests (config, path-set, content, product-input), and the branch and head-SHA identity fields.
- The per-node run's result is the node's runner outcome returned to the caller; the testing domain imports neither the status nor the spec domain.

## Compliance

### Recognized by

Evidence recording and the per-node run are exported from handlers under `src/commands/testing/`; both obtain filesystem, clock, and git access through injected dependency parameters and reach language runners through `src/testing/registry.ts`. The persisted `state.json` carries the four staleness digests and the identity fields.

### MUST

- Evidence recording and the per-node run live under `src/commands/testing/` as handlers that return results and accept filesystem, clock, and git access as injected parameters — so they verify against temporary fixtures without mocking ([review])
- The full-suite run and the per-node run assemble and persist their `TestRunState` through one shared recording function — so per-node and full-run evidence are identical in shape and staleness inputs ([review])
- The per-node run dispatches through `src/testing/registry.ts` and selects the node's tests by its discovered test paths — so the single-node path names no language ([review])
- The recording handler derives all four staleness digests (testing config digest, discovered path-set digest, discovered content digest, descriptor-declared product input digests) and records the branch name and head SHA, persisting through the injected `TestRunStateFileSystem` ([review])
- Derive the four staleness digests through one shared current-staleness-inputs function that the recording path and the status resolver's freshness check both consume — so freshly recorded evidence is never read as stale through recipe drift ([review])
- The per-node run returns the node's runner outcome to its caller for the injected status resolver to consume ([review])

### NEVER

- Place evidence recording or per-node run orchestration in `src/domains/testing/` or in the Commander descriptor — I/O orchestration belongs to the command layer ([review])
- Reference a specific language by name in the per-node run dispatch — every outcome arrives through the registry enumeration ([review])
- Access the filesystem, clock, or git through direct `fs`, `Date.now`, or `child_process` calls instead of injected dependencies, or stand in a double via `vi.mock()` / `jest.mock()` ([review])
- The testing domain imports the status or spec domain — the per-node outcome flows outward through the returned result, never through a reverse import ([review])
