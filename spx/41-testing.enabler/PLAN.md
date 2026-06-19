# Test Runner Environments PDR Plan

## Context to Preserve

Create a dedicated product decision record at
`spx/41-testing.enabler/11-test-runner-environments.pdr.md`.

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

Shipped as `spx/41-testing.enabler/90-targeted-execution.enabler`: explicit
positional node-path and test-file-path operands for `spx test` and
`spx test passing`, an opt-in `--recursive`/`-r` flag for descendant nodes,
passing-scope applied to the operand-selected set, and unmatched operands
exiting non-zero.

## Future Slices

### Slice 3: Changed-Set Planning

Observable path:

```bash
spx test passing --changed --base origin/main
```

This slice should map changed files to affected nodes and test files. It may
integrate runner-specific related-test support, such as Vitest `--related`, only
through the selected adapter's declared capability.

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
