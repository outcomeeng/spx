# Executor Architecture

The spx-driven verification executor is a command module under `src/commands/verification-exec/` that drives a verification type's deterministic runner — resolved through that type's own registry (`src/test/registry.ts` for `test`) so the executor names no language — and records the run only through the verify recorder lifecycle operations of `spx/34-verification.enabler/32-verify.enabler`. Within one invocation it opens a run in spx drive mode, backs the streaming runner's evidence sink with the recorder's scope-append and finding-append operations, maps the runner's terminal status onto the recorder terminal-status vocabulary through a total function, and finishes and seals the run, constructing no journal event and performing no journal I/O itself. A runner that reports a present language whose product directory supplies no runner is an outcome of its own: the `test` type's fold carries it out of the registry languages, the executor seals the run `interrupted`, and the executor's result names the product directory searched, so a caller distinguishes a product without the runner from a language that detection gated out and from a run that started and failed.

## Rationale

The runner's TypeScript participation exposes a language-neutral seam: `src/test/languages/journal-reporter.ts` translates Vitest lifecycle events into `TestScopeUnit` and `TestFinding` values forwarded to an injected `TestRunEvidenceSink`, and returns a terminal status. The executor implements that sink over the recorder's evidence-append operations and adapts the returned terminal status. Placing the seam here keeps the language-specific reporter free of the recorder domain — its own boundary rule — while the language-neutral executor owns the composition, resolving the runner through the verification type's registry so `19-language-registration.adr.md` holds: the reporter is TypeScript's registry participation, not the executor's.

Composing the recorder's lifecycle operations rather than a second recording path honors `spx/34-verification.enabler/32-verify.enabler/verify.md` — a caller never hand-formats a run's journal events — and `spx/34-verification.enabler/32-verify.enabler/13-verify-module-structure.adr.md`, which places verifier execution outside the verify module as a separate command module the single `spx verification` descriptor wires alongside the recorder. The executor is that module.

spx opens, streams, and seals a run within one invocation, so no caller ever appends to an spx-driven run. A run records its drive mode at start, and the recorder projection advertises no caller evidence-append action for an unsealed spx-driven run — the drive-mode filter, not seal-on-abort, is the mechanism, because a `SIGKILL` runs no cleanup that could seal an aborted run.

The runner reports `passed`, `failed`, or `interrupted`; the recorder terminal-status vocabulary is `approved`, `rejected`, `failed`, `interrupted`, and `passed`. The two share `failed` and `interrupted`, and the deterministic success value `passed` lets the executor map the runner's terminal status onto the recorder vocabulary as a total, information-preserving function rather than routing a deterministic test pass through the agentic `approved` disposition.

A language descriptor's journal-streaming run reports three outcomes: gated out by language detection, unresolvable because the product directory supplies no runner, and invoked with a terminal status. The `test` type's fold over the registry languages preserves the middle one: when a present language's runner is unresolvable the run cannot have covered that language's tests, so the fold reports the unresolved runner — naming the product directory searched — whenever no language streamed, and reports `interrupted` when other languages did stream, because the run is then incomplete rather than failed. The executor seals an unresolved runner `interrupted`, the status the `test` type's terminal vocabulary already holds for a run that completed no work, and carries the searched product directory in its result rather than in terminal metadata, which the `test` terminal validator rejects; the command surface that reports the outcome to a caller reads it from the result. Folding the unresolved runner into a bare gate-out is rejected: the two outcomes call for different caller actions — installing the runner versus adding the language — and the descriptor already tells them apart.

## Invariants

- The executor's durable effects flow only through the recorder's injected lifecycle operations and the runner's injected sink; it constructs no journal event and reads or writes no journal storage directly.
- Every runner terminal status maps to exactly one recorder terminal status.
- An spx-driven run is opened, streamed, and finished within one executor invocation.
- A present language whose runner is unresolvable never records as a gate-out: the `test` fold reports the unresolved runner or `interrupted`, never a bare gated-out invocation.

## Verification

### Testing

- ALWAYS: the `test` runner fold reports an unresolved runner naming the product directory searched when a present language's runner is unresolvable and no language streamed, and `interrupted` when another language streamed alongside it ([compliance])
- ALWAYS: the executor seals an unresolved-runner outcome `interrupted` and its result names the product directory searched, distinct from the result of a gated-out run ([compliance])
- ALWAYS: the executor records a run's scope, finding, and terminal evidence through the verify recorder lifecycle operations of `spx/34-verification.enabler/32-verify.enabler` ([compliance])
- ALWAYS: the executor backs the runner's `TestRunEvidenceSink` with the recorder's scope-append and finding-append operations supplied as injected dependencies ([compliance])
- ALWAYS: the executor opens a run in spx drive mode, recorded at start, so the recorder projection advertises no caller evidence-append next action for that run ([compliance])
- ALWAYS: the executor resolves the `test` verification type's deterministic runner through `src/test/registry.ts` ([compliance])
- ALWAYS: an unsupported verification type opens no run ([compliance])
- ALWAYS: the executor maps every runner terminal status onto a recorder terminal status through a total function before it finishes the run ([mapping])
- ALWAYS: a runner failure after the run opens finishes the run with an `interrupted` terminal status before the failure surfaces, so the executor leaves no opened run unsealed ([compliance])
- ALWAYS: the interrupted seal on runner failure is best-effort — a finish failure during cleanup does not mask the runner failure, which surfaces instead ([compliance])

### Audit

- ALWAYS: no module under `src/commands/verification-exec/` names a language, so a language's runner and reporter reach the executor only through the registry and injected dependencies ([audit])
- ALWAYS: the executor constructs no journal event and reads or writes no journal storage directly — it composes the recorder's injected lifecycle operations, which own event construction and backend binding ([audit])
- ALWAYS: the executor accepts its runner resolver and recorder lifecycle operations through injected parameters and backs the runner's evidence sink with those operations, so its behavior verifies against controlled implementations without process, filesystem, or journal I/O of its own ([audit])
- NEVER: the executor spawns, configures, or selects a verification agent — spx drives a deterministic runner, and an agentic verification is judged by an agent the agent harness launches, per `spx/12-agent-harness.pdr.md` ([audit])
- NEVER: a module under `src/commands/verification-exec/` imports Commander or writes to the process boundary — `process.exit`, `process.stdout`, `process.stderr`, `process.stdin` — the `spx verification <type> run` command path is a separate descriptor concern under `spx/60-surfaces.enabler/21-cli-surface.enabler` ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or module replacement substitutes for the executor's injected runner, sink, or recorder operations — tests inject controlled implementations through the public parameters ([audit])
