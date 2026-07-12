# Status To Testing Delegation

`spx spec status --update` folds each node's recorded verification evidence into the committed status claim and executes no verification. For a node whose classification reaches the test-outcome stage — one with co-located tests that is not listed in `spx/EXCLUDE` — the command layer composes a dependency-injected node-outcome resolver over the testing domain that reads the node's latest recorded last-run evidence and never invokes a runner. A reference a recorded run covers takes that run's outcome when the evidence is fresh, and keeps the outcome already committed for it when the evidence is stale. A reference no recorded run covers is `not-run`: preserving a committed outcome for evidence no run produces would let a regenerated projection reproduce that outcome forever, so continuous integration could never refute it. A node with no co-located tests (`declared`) or one listed in `spx/EXCLUDE` (`specified`) classifies structurally per `spx/31-spec-domain.enabler/21-node-status.enabler/node-status.md`. Evidence is fresh when every staleness digest matches per `spx/41-test.enabler/43-last-run-evidence.enabler/43-staleness-comparison.adr.md`, and it carries the outcome its terminal record reports (`spx/41-test.enabler/43-last-run-evidence.enabler/11-last-run-file.adr.md`).

## Rationale

The committed `spx.status.json` is a claim its author publishes and continuous integration reproduces, so the command that writes the claim reads evidence rather than manufacturing it. A status command that executes verification couples reporting to execution: it re-derives per node what a runner schedules in one batch, so a single absent or stale outcome fans out into a serial run per node while the runner's own parallelism sits unused, and the cost of reading a claim scales with the tree rather than with the evidence. Folding recorded evidence keeps the write path proportional to what a run already produced, and leaves reproduction — the authority that refutes a false claim — to continuous integration over a full checkout.

Leaving a stale reference's committed outcome unchanged is deliberate: the author's claim persists until a run replaces it, and continuous integration — whose run covers that reference and is fresh — reproduces or refutes it. Overwriting such a reference from the status path would discard a claim the author still stands behind. An uncovered reference is the opposite case: no run produces an outcome for it in any checkout, so preserving one would make every regeneration reproduce the same unproduced value and put it beyond refutation. It reads `not-run`, which no run's evidence can contradict.

A status-owned per-node runner is rejected: it duplicates the testing registry's dispatch, forces the status path to know each language's runner, and reintroduces the serial per-node execution this decision removes. The node-status library importing the testing domain directly is rejected: it couples pure classification to evidence reading and reverses the composition direction. Composition lives at the command layer per `spx/14-cli-composition.adr.md`, so the pure node-status and testing libraries stay independent.

## Invariants

- `spx spec status`, with or without `--update`, executes no verification; every outcome `--update` writes was produced by some recorded run — the one it folds for a covered reference whose evidence is fresh, or the earlier run whose committed outcome a covered-but-stale reference keeps — and an uncovered reference, which no run produced an outcome for, is `not-run`.
- The `--update` orchestration obtains every per-node outcome through the injected resolver; it imports no language runner and no testing-domain runner directly.
- The resolver reads recorded testing evidence and invokes no run; a reference a run covers takes that run's outcome when fresh and keeps its committed outcome when stale, while a reference no run covers is `not-run`.
- The resolver is consulted only for nodes whose classification reaches the test-outcome stage (co-located tests present, not in `spx/EXCLUDE`); `declared` and `specified` nodes classify structurally.
- The resolver derives a node's current staleness inputs through the testing domain's shared current-staleness-inputs function — the same recipe the recording path records with per `spx/41-test.enabler/71-execution-recording.adr.md` — so freshly recorded evidence is never judged stale through recipe drift.
- The resolver identifies a node's test paths through the testing domain's discovery surface — the same one a run records against — so evidence selection and the recording run agree on path identity.
- A node folds as passing only when recorded outcomes cover every one of its discovered test paths and each reports passing; evidence that leaves any node test path uncovered never folds as passing.

## Verification

### Testing

- ALWAYS: within one `spx spec status --update` resolver instance, current staleness inputs are computed once for each identical covered test-path set, so full-product recorded evidence reused across multiple covered nodes does not reread the same covered files per node ([compliance])

### Audit

- ALWAYS: `spx spec status --update` accepts the per-node outcome resolver as a dependency-injected parameter ([audit])
- ALWAYS: the production resolver reports the node's outcome from recorded last-run evidence ([audit])
- NEVER: `spx spec status`, with or without `--update`, invokes a test runner or executes verification — the claim is folded from evidence a run recorded ([audit])
- ALWAYS: `--update` keeps the committed outcome of a reference a recorded run covers whose evidence is stale — the claim stands until a run records a replacement ([audit])
- NEVER: `--update` keeps a committed outcome for a reference no recorded run covers — an uncovered reference is `not-run`, so a regenerated projection refutes a claim no run produces rather than reproducing it ([audit])
- ALWAYS: the resolver computes current staleness inputs through the testing domain's shared current-staleness-inputs function and selects a node's evidence by its discovered test paths from the testing discovery surface — recorded and current inputs share one recipe, and selection and the recording run share one path identity ([audit])
- ALWAYS: the resolver reaches each language's recorded evidence through `src/test/registry.ts` per `spx/19-language-registration.adr.md` — the status path names no language ([audit])
- ALWAYS: the status-to-testing resolver is composed at the command layer per `spx/14-cli-composition.adr.md`; the pure node-status and testing libraries stay independent ([audit])
- NEVER: the node-status library imports a language-specific test runner or the testing-domain evidence reader directly — the outcome arrives through the injected resolver ([audit])
- NEVER: a node's outcome is resolved by mocking the testing domain — the resolver is exercised against a real testing surface or an injected test double implementing its interface, never `vi.mock()`/`jest.mock()` ([audit])
- ALWAYS: a node folds as passing only when recorded outcomes cover every one of its discovered test paths and each reports passing; partially covered evidence never folds as passing ([audit])
