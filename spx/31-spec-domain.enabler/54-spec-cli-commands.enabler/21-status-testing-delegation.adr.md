# Status To Testing Delegation

`spx spec status --update` folds each node's recorded verification evidence into the committed status claim and executes no verification. For a node whose classification reaches the test-outcome stage — one with co-located tests that is not listed in `spx/EXCLUDE` — the command layer composes a dependency-injected node-outcome resolver over the testing domain that reads the node's latest recorded last-run evidence and never invokes a runner. A reference whose recorded evidence is fresh takes that evidence's outcome; a reference whose evidence is stale or absent keeps the outcome already committed for it. A node with no co-located tests (`declared`) or one listed in `spx/EXCLUDE` (`specified`) classifies structurally per `spx/31-spec-domain.enabler/21-node-status.enabler/node-status.md`. Evidence is fresh when every staleness digest matches per `spx/41-test.enabler/43-last-run-evidence.enabler/43-staleness-comparison.adr.md`, and it carries the outcome its terminal record reports (`spx/41-test.enabler/43-last-run-evidence.enabler/11-last-run-file.adr.md`).

## Rationale

The committed `spx.status.json` is a claim its author publishes and continuous integration reproduces, so the command that writes the claim reads evidence rather than manufacturing it. A status command that executes verification couples reporting to execution: it re-derives per node what a runner schedules in one batch, so a single absent or stale outcome fans out into a serial run per node while the runner's own parallelism sits unused, and the cost of reading a claim scales with the tree rather than with the evidence. Folding recorded evidence keeps the write path proportional to what a run already produced, and leaves reproduction — the authority that refutes a false claim — to continuous integration over a full checkout.

Leaving a stale or evidence-free reference's committed outcome unchanged is deliberate: the author's claim persists until a run replaces it, and continuous integration refutes it if the product no longer holds. Overwriting such a reference from the status path would either forge an outcome no run produced or discard a claim the author still stands behind.

A status-owned per-node runner is rejected: it duplicates the testing registry's dispatch, forces the status path to know each language's runner, and reintroduces the serial per-node execution this decision removes. The node-status library importing the testing domain directly is rejected: it couples pure classification to evidence reading and reverses the composition direction. Composition lives at the command layer per `spx/14-cli-composition.adr.md`, so the pure node-status and testing libraries stay independent.

## Invariants

- `spx spec status`, with or without `--update`, executes no verification; `--update` writes only outcomes a recorded run produced.
- The `--update` orchestration obtains every per-node outcome through the injected resolver; it imports no language runner and no testing-domain runner directly.
- The resolver reads recorded testing evidence and invokes no run; a reference with fresh evidence takes that outcome, and a reference with stale or absent evidence keeps its committed outcome.
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
- NEVER: `--update` writes an outcome for a reference whose recorded evidence is stale or absent — the committed outcome for that reference stands until a run records a replacement ([audit])
- ALWAYS: the resolver computes current staleness inputs through the testing domain's shared current-staleness-inputs function and selects a node's evidence by its discovered test paths from the testing discovery surface — recorded and current inputs share one recipe, and selection and the recording run share one path identity ([audit])
- ALWAYS: the resolver reaches each language's recorded evidence through `src/test/registry.ts` per `spx/19-language-registration.adr.md` — the status path names no language ([audit])
- ALWAYS: the status-to-testing resolver is composed at the command layer per `spx/14-cli-composition.adr.md`; the pure node-status and testing libraries stay independent ([audit])
- NEVER: the node-status library imports a language-specific test runner or the testing-domain evidence reader directly — the outcome arrives through the injected resolver ([audit])
- NEVER: a node's outcome is resolved by mocking the testing domain — the resolver is exercised against a real testing surface or an injected test double implementing its interface, never `vi.mock()`/`jest.mock()` ([audit])
- ALWAYS: a node folds as passing only when recorded outcomes cover every one of its discovered test paths and each reports passing; partially covered evidence never folds as passing ([audit])
