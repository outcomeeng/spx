# Issues: 54-spec-cli-commands.enabler

## FOLLOW-UP: spx spec next does not read persisted node status

`spx spec status` reports a node's committed `spx.status.json` (read-back), but `spx spec next` (`src/commands/spec/next.ts`) selects the first non-passing node from live structural derivation only — it passes no evidence provider to `readSpecTree`. After `spx spec status --update` writes status files, `status` and `next` can disagree: `status` reports a node as `passing` from its recorded file while `next` re-flags it as non-passing from live derivation. `spec-cli-commands.md` asserts read-back only for `spx spec status`, so this is a spec question, not an implementation defect.

**Resolution:** decide whether `spx spec next` should honor persisted node status; if so, add a `next` read-back assertion to `spec-cli-commands.md` and wire `createNodeStatusProvider` into `nextCommand`.

**Skills:** `spec-tree:authoring` (spec decision), `spec-tree:applying` (implementation).

## FOLLOW-UP: broaden read-back evidence to every overridable live state

The read-back scenario test (`tests/spec-cli-commands.scenario.l1.test.ts`) proves a committed `spx.status.json` overrides a live-derived `specified` state. It does not exercise override of `declared` (no co-located evidence) or `failing` (evidence present, recorded non-passing). Scenario 6 is typed as a Scenario ("there exists"), so one representative override is sufficient evidence; broadening to every overridable live state would retype the assertion as a Mapping over a finite set.

**Resolution:** if stronger evidence is wanted, retype the read-back scenario in `spec-cli-commands.md` as a Mapping over the overridable live states (`declared`, `specified`, `failing`) and cover each in `tests/spec-cli-commands.mapping.l1.test.ts`.

**Skills:** `spec-tree:authoring` (assertion retype), `typescript:testing-typescript` (tests).

## FOLLOW-UP: status read-back reads one spx.status.json per node synchronously

Wiring `createNodeStatusProvider` into `spx spec status` adds one synchronous `readNodeStatus` (`src/lib/node-status/read.ts`, `readFileSync`) per node, because `SpecTreeEvidenceProvider.stateForNode` (`src/lib/spec-tree/index.ts`) is a synchronous interface the node-status architecture ADR mandates. For a large spec tree this is one blocking read per node within `readSpecTree`. Each read is a small JSON file (most absent until `--update` runs), so the cost is expected to stay within the under-100ms CLI budget in `spx/spx.product.md`, but it is unmeasured.

**Resolution:** if the latency budget is ever threatened, either make `SpecTreeEvidenceProvider.stateForNode` async (and update `deriveState`/`readSpecTree`) or have the provider factory pre-read every `spx.status.json` in one async pass into an in-memory map the synchronous `stateForNode` consults. Both touch the spec-tree provider interface, so the change is governed by `spx/31-spec-domain.enabler/21-node-status.enabler/21-node-status-architecture.adr.md`.

**Skills:** `spec-tree:applying` (implementation), `typescript:architecting-typescript` (interface change).

## FOLLOW-UP: spx spec status --update emits every per-node run's output to stderr

`spx spec status --update` routes each per-node run's stdout to stderr (`createRunnerDepsFor(productDir, process.stderr)` in `src/interfaces/cli/spec.ts`), so stdout carries only the status rollup and `--json` stays machine-parseable. The output is still verbose: every stale, failing, or absent node's full test output prints to stderr before the rollup.

**Resolution:** if the stderr verbosity is unwanted, give the status path a quiet or capturing runner variant that suppresses or summarizes per-node output, surfacing detail only on failure. That variant will also need `createCommandRunner` (`src/interfaces/cli/test-runner-deps.ts`) to expose an `errStream` parameter analogous to `outStream` — it currently hardcodes `child.stderr?.pipe(process.stderr)` — so per-node stderr can be suppressed or captured alongside stdout.

**Skills:** `spec-tree:applying` (implementation).

## FOLLOW-UP: a node's outcome covers its whole subtree, not only its co-located tests

`createNodeOutcomeResolver` derives a node's test paths by subtree prefix (`filterNodeTestPaths`), and the per-node run scopes to the same subtree (`passingScope: { include: [nodePath] }`), so a node with both its own tests and tested descendants has its outcome reflect the descendants' tests — a failing child test can classify the parent failing even when the parent's own tests pass. This is the path identity `21-status-testing-delegation.adr.md` Invariant 17 mandates: the resolver's evidence selection and the per-node run agree on path identity, and the per-node run's scope is the subtree (`spx test <node>` legitimately tests a subtree). Narrowing a node's outcome to its co-located `tests/` directory is therefore an ADR decision, not a code change.

**Resolution:** if a node's status should reflect only its own co-located tests, amend `21-status-testing-delegation.adr.md` to specify a co-located outcome scope and have the resolver pass a co-located (not subtree) scope to the per-node run, keeping `spx test <node>` subtree-scoped.

**Skills:** `spec-tree:authoring` (ADR decision), `spec-tree:applying` (implementation).

## FOLLOW-UP: a node whose tests are all gated out re-runs on every --update

A test-outcome-stage node whose tests are all in an absent language records a zero-outcome run that covers none of its discovered test paths, so `selectLatestTerminalTestRunForNode` never selects it and the resolver re-runs the node on every `--update`. A node with tests in more than one language where only some runners are present is the same case partially: the run executes the present languages but leaves the absent ones' paths unexecuted. The resolver classifies both as not-passing — unexecuted paths receive `not-run` per-path outcomes, which roll up to `partial` or `not-run` rather than `passed`, so a partial run never overclaims — and re-runs on every `--update`, staying conservative-correct but repeating work. The final semantics (whether an absent-language node is failing, specified, or judged only on its present languages) is the zero-outcome / per-node-non-match question tracked in `spx/41-test.enabler/ISSUES.md`; the empty-run contract is decided there.

**Skills:** `spec-tree:authoring` (decision in 41-test), `spec-tree:applying` (implementation).

## FOLLOW-UP: the production resolver lacks real-runner integration coverage

The `--update` scenario tests drive `createNodeOutcomeResolver` with a recording command runner (`createRecordingCommandRunner`) that intercepts `runCommand` without executing vitest, and the l2 contract test exercises the process boundary only with no-test (declared) nodes where the resolver is never consulted. So no test runs a real vitest invocation through the resolver into a recorded outcome and a node classification.

**Resolution:** add an l2 test that runs `spx spec status --update` over a node with a real co-located passing (and failing) test file through the actual registry runner, asserting the recorded `spx.status.json` reflects the real outcome.

**Skills:** `typescript:testing-typescript` (l2 test).
