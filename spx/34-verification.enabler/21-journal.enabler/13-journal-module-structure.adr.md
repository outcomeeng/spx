# Journal Module Structure

The journal command follows the three-layer CLI composition of `spx/14-cli-composition.adr.md`: pure rules under `src/domains/journal/`, process-agnostic orchestration under `src/commands/journal/`, and a Commander descriptor at `src/interfaces/cli/journal.ts`. `src/domains/journal/` owns the pure rules — the run-state projection fold, terminal-status classification, run-scope path construction, and backend resolution from an injected environment snapshot — accessing no filesystem or process. `src/commands/journal/` binds the resolved backend and the agent-run-journal contract of `spx/15-agent-run-journal.enabler`, performing every append, read, seal, and render. A backend registry resolves the bound backend from the environment: the local Appendable backend of `spx/18-state.enabler/71-appendable-journal-store.enabler` by default, the GitHub Snapshot backend of `spx/21-infrastructure.enabler/43-github-ci.enabler/21-snapshot-adapter.enabler` under a continuous-integration GitHub pull request. No module carries a verification-type identifier.

## Rationale

The run-state fold, terminal-status classification, and scope-path construction verify over in-memory inputs without a real repository, so the pure rules stay testable in isolation; concentrating backend binding and journal I/O in the command layer keeps the domain free of the filesystem and process boundaries the layer split removes. The run-state model, event vocabulary, and projection are identical for every verification kind, so they live once in `src/domains/journal/` parameterized by the opaque `<type>` scope segment.

Backend resolution is a pure function of an injected environment snapshot, and the registry binds the two adapters behind one selection point, so a new backend is one registry entry and selection logic verifies without reading the real process environment. The journal domain composes the local Appendable backend and the GitHub Snapshot backend at the edge; it does not reimplement persistence.

Rejected: a per-kind run-state module (`audit/run-state`, `review/run-state`) — the model is identical across kinds, so one parameterized module serves every kind; backend selection by a CLI flag or threaded through each verb — selection is an environment property resolved once, not a per-verb argument; and binding a concrete backend inside the domain layer — it reintroduces the I/O boundary the layer split removes and defeats isolated verification.

## Invariants

- `src/domains/journal/` accesses no filesystem or process; it operates on in-memory events, run records, and an injected environment snapshot.
- The run-state projection fold is pure: the same events always produce the same envelope.
- Backend resolution is a pure function of the injected environment snapshot; the registry exposes exactly the registered backends and rejects an unknown selector.
- No module under `src/domains/journal/` or `src/commands/journal/` references a verification-type name.

## Verification

### Audit

- ALWAYS: the journal run-state projection fold, terminal-status classification, and run-scope path construction live in `src/domains/journal/` as pure functions with no filesystem or process access ([audit])
- ALWAYS: backend binding and all journal append, read, seal, and render I/O happen in `src/commands/journal/`, against the agent-run-journal contract and the backend resolved from the registry ([audit])
- ALWAYS: the backend registry resolves the bound backend from an injected environment snapshot — the local Appendable backend by default, the GitHub Snapshot backend under a continuous-integration GitHub pull request — and rejects an unknown selector naming the registered backends ([audit])
- ALWAYS: the journal domain accepts the agent-run-journal contract, the backend, and the environment snapshot as injected dependencies, so the verbs verify over a controlled backend and environment without a real repository ([audit])
- NEVER: a module under `src/domains/journal/` imports `node:fs`, `node:fs/promises`, process globals, or `src/commands/journal/` ([audit])
- NEVER: a module under `src/domains/journal/` or `src/commands/journal/` carries a verification-type identifier (`audit`, `review`) — the run is parameterized by the opaque `<type>` scope segment ([audit])
- NEVER: a concrete backend is selected by a verb argument or constructed inside the domain layer — selection is resolved from the environment through the registry, and backends are injected ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or `memfs` substitutes for the backend, the journal contract, or the environment — tests inject controlled implementations and exercise the real code paths ([audit])
