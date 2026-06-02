# Status To Testing Delegation

For each node whose classification reaches the test-outcome stage — one with co-located tests that is not listed in `spx/EXCLUDE` — `spx spec status --update` resolves its pass/fail outcome through a dependency-injected node-outcome resolver that the command layer composes over the testing domain: the resolver reports the node's latest usable last-run evidence and invokes the testing domain's registry-based per-node run only when that evidence is stale, failing, or absent. A node with no co-located tests (`declared`) or one listed in `spx/EXCLUDE` (`specified`) classifies structurally per `spx/31-spec-domain.enabler/21-node-status.enabler/node-status.md` and invokes no per-node run. The node-status `--update` orchestration accepts the resolver as a parameter and composes no language-specific runner. Recorded evidence is usable when it is fresh — every staleness digest matches per `spx/41-testing.enabler/43-last-run-evidence.enabler/43-staleness-comparison.adr.md` — and its `TestRunState.status` (`spx/41-testing.enabler/43-last-run-evidence.enabler/11-last-run-directory.adr.md`) is `passed`; it is stale when any staleness digest mismatches, failing when a present valid `state.json` records a non-`passed` status (`failed` or `interrupted`), and absent when no valid terminal `state.json` exists — each triggers a fresh per-node run.

## Rationale

Keeping the per-node outcome behind an injected resolver preserves the node-status classifier's `l1` verifiability — its precedence logic runs against supplied facts without executing a suite (`spx/31-spec-domain.enabler/21-node-status.enabler/21-node-status-architecture.adr.md`) — while the decision of how an outcome is obtained moves to the command edge. Composing the production resolver over the testing domain means one execution path, the testing registry (`spx/19-language-registration.adr.md`), produces every test outcome; the status command names no language and duplicates no runner dispatch. Reading recorded evidence first and invoking testing only on stale, failing, or absent evidence honors the read-versus-refresh split the status-file contract declares (`spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md`), so a plain status stays fast and `--update` does the minimum execution required. Composition lives at the command layer per `spx/14-cli-composition.adr.md`, so the pure node-status and testing libraries stay independent.

A status-owned per-node runner is rejected: it duplicates the testing registry's dispatch and forces the status path to know each language's runner. Unconditional re-running of every node's tests is rejected: it ignores valid recorded evidence. The node-status library importing the testing domain directly is rejected: it couples pure classification to test execution and reverses the composition direction.

## Invariants

- The `--update` orchestration obtains every per-node outcome through the injected resolver; it imports no language runner and no testing-domain runner directly.
- The resolver invokes a fresh per-node run only when the node's recorded testing evidence is stale, failing, or absent; usable evidence — fresh and `passed` — triggers no run.
- The resolver is consulted only for nodes whose classification reaches the test-outcome stage (co-located tests present, not in `spx/EXCLUDE`); `declared` and `specified` nodes classify structurally without a per-node run.

## Verification

### Audit

- ALWAYS: `spx spec status --update` accepts the per-node outcome resolver as a dependency-injected parameter ([audit])
- ALWAYS: the production resolver reports the node's latest usable last-run evidence and invokes the testing domain's registry-based per-node run only when that evidence is stale, failing, or absent ([audit])
- ALWAYS: the per-node run reaches each language through `src/testing/registry.ts` per `spx/19-language-registration.adr.md` — the status path names no language ([audit])
- ALWAYS: the status-to-testing resolver is composed at the command layer per `spx/14-cli-composition.adr.md`; the pure node-status and testing libraries stay independent ([audit])
- NEVER: the node-status library imports a language-specific test runner or the testing-domain runner directly — the outcome arrives through the injected resolver ([audit])
- NEVER: `spx spec status` without `--update` invokes the resolver or executes tests — only `--update` refreshes evidence ([audit])
- NEVER: a node's outcome is resolved by mocking the testing domain — the resolver is exercised against a real testing surface or an injected test double implementing its interface, never `vi.mock()`/`jest.mock()` ([audit])
