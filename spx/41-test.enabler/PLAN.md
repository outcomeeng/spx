# Plan: Testing provider role in spec-tree materialization

> **Reconcile against `spx/PLAN.md` first.** The corrected model separates `persistence` (records / journals / snapshots) from `backend` (was "materialization") and `delivery`, makes verification the five types, requires additive migration (never a wholesale move), and defers `.surface`. This is the `test` verification type, re-homed under verification; read every "materialization" below (title and body) as `backend`. Where this note predates that model, the root plan governs.

## Harness vocabulary guard

Before applying this plan to agent-facing test output, transcript handling, or verification-loop guidance, read `spx/12-agent-harness.pdr.md` and use its vocabulary as the authority: agent harness, agent, agent adapter, and agent session. Treat nearby `agent`, `runtime`, `session`, `Claude`, or `Codex` wording as lower-layer/local vocabulary until reconciled; command vocabulary such as `--agent` output mode must stay distinct from agents, agent adapters, and agent sessions.

This coordination note records the testing-domain responsibility in the spec-tree foundation repair.

## Ownership target

`spx/41-test.enabler` owns test execution and language-registered input discovery:

- test file discovery
- runner adapter selection
- language descriptor dispatch
- product-input discovery for test freshness
- last-run evidence recording
- stale/fresh comparison inputs for test evidence

It does not own spec-tree state semantics or interface rendering.

## Contract needed by spec-tree materialization

The spec-tree materialization layer needs a testing provider contract that can answer:

- which test paths cover a node
- which product input paths affect those test paths
- whether current recorded evidence is usable
- how to request fresh verification
- which operations are unsupported for a backend or language

## Language descriptor responsibilities

Language descriptors should own language-specific product-input expansion.

Examples:

- TypeScript descriptor expands `.test.ts` paths through configured runner inputs, package inputs, `tsconfig`, and local import closure.
- Rust descriptor expands Rust test paths through Cargo manifests, lockfile, target metadata, and reachable crate source paths.
- A descriptor that cannot compute inputs reports that limitation so status can render stale or unsupported rather than falsely fresh.

## Current branch disposition

The TypeScript import walker from the node-status branch should move out of `src/lib/node-status/` and into the TypeScript testing input path.

## Next steps

1. Amend testing ADRs only after the spec-tree materialization contract exists.
2. Define a provider interface for discovered test paths and product input paths.
3. Reuse existing last-run staleness input machinery where it fits.
4. Add fake-descriptor tests before wiring TypeScript-specific expansion.

---

## Existing plan: Test runner environments PDR

## Context to Preserve

Create a dedicated product decision record at
`spx/41-test.enabler/11-test-runner-environments.pdr.md`.

The missing decision is the interface between a consumer product invoking
`spx test` or `spx test passing` and the test runner that product chooses.
The current branch exposed the gap by adding an agent-output slice that assumed
TypeScript means Vitest and that Vitest lives under `node_modules/.bin`. That
assumption is invalid for consumer products:

- TypeScript products can use Vitest, Jest, Node's built-in runner, Playwright,
  uvu, tap, or another runner.
- Package-manager layout is not a stable product contract. `spx` must not assume
  `node_modules`, `.bin`, pnpm, npm, yarn, bun, uv, pytest, or any binary path
  outside a declared runner adapter.
- `spx test --agent` must use the same selected runner and selected test files
  as the default path. Agent mode changes output handling, not runner choice.
- `spx test` is primarily for agents executing spec-tree verification loops, and
  developers must be able to use the same command path so human and agent
  evidence stay aligned.

The PDR should decide the user-observable runner environments before lower ADRs
name concrete runners.

## Product Decision Shape

The long-term runner-environment model distinguishes three environments:

- `operator`: default environment. Native runner stdout and stderr stream to the
  terminal. This is the default by the principle of least surprise: an
  unqualified local command behaves like a developer expects.
- `agent`: bounded transcript environment. Child stdout and stderr are written
  to artifact files, and the terminal receives a compact summary with status,
  exit code, failing runner identity, relevant failing or requested test paths,
  last-run state path, and artifact paths. Child streams do not pass through to
  the invoking terminal.
- `ci`: future machine-readable environment. CI receives a structured progress/output
  stream, likely JSONL or another event stream declared by its ADR. CI mode is
  not part of the slice 1 PDR because this branch ships no CI implementation.

The PDR should state these observable invariants:

- Environment mode changes output handling and reporting shape only.
- Environment mode never changes runner selection, test selection, passing-scope
  filtering, targeted operands, or exit-code aggregation.
- Every environment uses the same runner adapter selected for the product and
  language.
- Unsupported runner choices fail with a diagnostic that names the unsupported
  selection.

The TypeScript and language-runner ADRs should state these adapter-interface
rules:

- A runner adapter must accept explicit test file paths or explicitly declare
  that it cannot satisfy targeted execution.
- A runner adapter must declare how exclusions are represented, if the runner
  supports exclusions.
- A runner adapter must declare whether it can map failures back to concrete
  test paths. When it cannot, `spx` reports the requested paths for the failing
  runner group.
- Toolchain absence is a clear runner-adapter failure, not hidden setup work.

## Consumer-Runner Interface

Model testing like validation: an explicit allow-list of supported runner
adapters per language, selected through product configuration.

`spx test` owns:

- discovering spec-tree tests under `spx/**/tests/`
- resolving explicit targeted operands when that feature is added
- applying `spx test passing` scope filters
- grouping selected test files by configured runner adapter
- invoking the selected adapter for each group
- aggregating exit codes
- recording last-run evidence and staleness inputs
- applying the selected runner environment's output policy

The selected runner adapter owns:

- command construction
- executable lookup or package-manager invocation
- explicit test-file argument shape
- exclusion argument shape
- product input paths that affect staleness
- toolchain presence diagnostics
- failure-output parsing when supported

The first supported adapters should be the current product paths:

- TypeScript: a Vitest adapter for this product's current TypeScript test files.
  The adapter can invoke Vitest through the configured package command, but the
  product decision must not generalize Vitest to every TypeScript consumer.
- Python: a pytest adapter for current Python test files.

Future adapters can add Jest, Node test, Playwright, or other runners without
changing the environment contract.

## Observable Path for Slice 1

Actor: an agent or developer runs:

```bash
spx test passing --agent
```

Invocation:

- command: `spx test` and `spx test passing`
- option: `--agent`
- selected runner adapter: current configured/default adapters
- selected files: discovered spec-tree tests after passing-scope filtering

Behavior:

- `spx` discovers and filters the same tests as operator mode.
- `spx` dispatches the same selected files through the same runner adapter as
  operator mode.
- `spx` captures child stdout and stderr to artifact files.
- `spx` prints a compact summary rather than streaming child output.
- `spx` records last-run evidence using the existing testing state schema.
- `spx` reports concrete failing paths when the runner adapter provides them,
  and reports the requested paths for the failing runner group when it does not.

Persistence or side effect:

- raw stdout artifact file
- raw stderr artifact file
- existing `.spx/worktree/test/runs/run-*.jsonl` last-run evidence
- process exit code equal to the aggregate runner exit code

Inspection surface:

- terminal summary with status, exit code, runner identity, failing or requested
  test paths, last-run evidence path, and artifact paths
- artifact files contain raw runner diagnostics
- last-run evidence remains readable by status consumers

Failure behavior:

- unsupported runner adapter: fail with a diagnostic naming the unsupported
  language/runner combination
- missing runner toolchain: fail with the adapter's clear diagnostic
- runner exits non-zero: command exits non-zero and summary identifies the
  failing runner group
- runner cannot narrow failing paths: summary lists the requested test paths for
  that failing group

## Slice 1 Execution Notes

The `agent-test-output` branch ships the implemented `operator` and `agent`
runner environments. It adds the decision-first PDR, aligns the parent testing
spec plus TypeScript and agent-output decisions, removes the invalid command
rewrite to `node_modules/.bin/vitest`, preserves descriptor-selected runner
commands and arguments, captures child stdout and stderr to artifacts, fails
without artifact paths when artifact writing fails, and preserves the supplied
child environment.

Verification for this slice used targeted local evidence per operator
instruction: focused agent-output Vitest files, scoped validation for touched
files, PDR/ADR/TypeScript architecture/test/code audits, and `changes-reviewer`
before every push. CI supplies broad verification after push.

## Delivered Slices

### Slice 2: Targeted Operands

Shipped as `spx/41-test.enabler/90-targeted-execution.enabler`: explicit
positional node-path and test-file-path operands for `spx test` and
`spx test passing`, an opt-in `--recursive`/`-r` flag for descendant nodes,
passing-scope applied to the operand-selected set, and unmatched operands
exiting non-zero.

## Future Slices

### Slice 3: Changed-Set Planning

Observable path:

```bash
spx test passing --changed [--base <ref>]
```

`--changed` selects the tests affected by the branch's changes against a base
ref. Settled design for this slice:

- **Base default.** `--base` defaults to `origin/<default-branch>`, resolved
  through the existing git/base-ref abstractions (the same `origin/HEAD`
  resolution `sync-base` and the changeset-scope primitives use); `--changed`
  alone means `--changed --base origin/<default-branch>`.
- **Changed-file → test mapping.** A changed spec or test under `spx/<node>/`
  selects that node's `tests/` directly (pure path math). A changed source file
  has no path relation to the tests that exercise it, so it routes through each
  language adapter's registry-declared related-test capability (TypeScript via
  Vitest `--related`; a language whose adapter declares none contributes nothing
  from its changed source files, and that degradation is reported, never silently
  dropped). The planner names no language — it reaches each through
  `src/test/registry.ts` per `../19-language-registration.adr.md`.
- **Pipeline reuse.** The resolved set feeds the existing
  `90-targeted-execution.enabler` resolver → dispatch → passing-scope → last-run
  recording pipeline unchanged; `--changed` is another operand source beside the
  explicit operands.
- **No special-node handling.** There is no list of "expensive" nodes and no
  precommit-ownership rule; selection is uniform across every node.
- **Evidence.** One top-level `l2` scenario exercising the real command against a
  real repository and runner, trusting the proven git abstractions and targeted
  pipeline beneath it.

Composed as `spx/41-test.enabler/95-changed-set-planning.enabler` (index 95,
above `90-targeted-execution.enabler`, which it consumes), with the settled
design above authored into its `changed-set-planning.md` spec and
`11-changed-set-resolution.adr.md` resolution ADR (base-ref default,
changed-path partition, per-language adapter related-test capability contract).
Remaining route: `/apply`.

Reserved horizon under `spx/41-test.enabler`: indices `91–94` and `96–99` stay
free for later slices. Slice 4 (`--ci` environment) and Slice 5 (dogfooding)
have no node yet.

### Slice 4: CI Environment

Observable path:

```bash
spx test passing --ci
```

This slice should define and implement the CI event/output contract. JSONL is a
likely shape, but the ADR should choose the exact schema. CI should be able to
annotate checks without parsing native runner text.

### Slice 5: Product Dogfooding

Observable paths:

```bash
pnpm test
```

and CI test jobs should run through `spx test` once targeted execution and CI
output are ready enough to replace raw runner invocations without losing
diagnostics.

## Open Design Questions

- Whether runner adapter selection belongs in the existing testing descriptor
  section or a new runner-specific descriptor section.
- Whether the initial allow-list should include only current product adapters
  (`vitest`, `pytest`) or reserve names for near-term adapters (`jest`,
  `node-test`, `playwright`).
- The exact CI event schema and whether it should be JSONL, GitHub-step summary
  plus JSON artifact, or both.
- Whether unsupported custom runners should fail closed in v1 or be allowed
  through a generic shell-command adapter with reduced guarantees.

## Harness governance — recording-runner batch complete

The recording-runner harness-governance batch governs the testing recording-runner harnesses and generators with the node-local harness-governance pattern. All four module groups are governed (spec + focused contract tests; spec-auditor and test-evidence-auditor approved):

- `testing/generators/testing/run-state.ts` → `spx/41-test.enabler/43-last-run-evidence.enabler/15-test-state-generator.enabler`
- `testing/harnesses/testing/python-runner.ts`, `testing/generators/testing/python-runner.ts`, `testing/harnesses/testing/python-product-inputs.ts` → `spx/41-test.enabler/21-python-test.enabler/32-test-harness.enabler`
- `testing/harnesses/testing/typescript-runner.ts`, `testing/generators/testing/typescript-runner.ts` → `spx/41-test.enabler/21-typescript-test.enabler/32-test-harness.enabler`
- `testing/harnesses/testing/harness.ts`, `testing/harnesses/testing/cli.ts`, `testing/generators/testing/dispatch.ts`, `testing/harnesses/testing/recording-command-runner.ts` (the shared recording-runner contract assertion lifted from the per-language harness tests) → `spx/41-test.enabler/26-test-harness.enabler` (dispatch operand semantics stay governed by `spx/41-test.enabler/90-targeted-execution.enabler`, not restated)

Learnings to carry to the remaining harness-governance batches:

- Several modules already reach near or full coverage through their consumers (run-state was 100%), so governance is mostly authoring spec nodes with focused contract tests, not coverage-closing tests.
- The python and typescript runners share a `RecordingCommandRunner` structure and the runner generators share spec-tree path constants — keep the parallel structure; do not extract until a third language arrives (see this enabler's `ISSUES.md`).
- `testing/generators/**` is excluded from vitest coverage instrumentation (`coverage.include`), so a generator node's test verifies the generator's output contract rather than adding instrumented coverage — accepted by the test-evidence-auditor as a coverage note.
- The `testing/` package is source code for literal checking. Governance tests draw inputs from generators, source-owned constants, snapshots, filesystem walks, or buffer reads instead of hardcoded reusable literals such as event names, TOML separators, encoding names, or common path tokens. Use one assertion type per test file. `sampleX(generator)` is deterministic only for constant-based generators; otherwise snapshot or walk generated output instead of predicting a random path.

Route per node: `/contextualize spx/41-test.enabler` -> `/author` -> `/apply` (spec-auditor + test-evidence-auditor) -> after all nodes, one `/merge` for the batch PR.
