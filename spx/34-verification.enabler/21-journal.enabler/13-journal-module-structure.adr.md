# Journal Module Structure

The journal command follows the three-layer CLI composition of `spx/14-cli-composition.adr.md`: pure rules under `src/domains/journal/`, process-agnostic orchestration under `src/commands/journal/`, and a Commander descriptor at `src/interfaces/cli/journal.ts`. `src/domains/journal/` owns the pure rules — the run-state projection fold, terminal-status classification, run-scope path construction, and backend resolution from an injected environment snapshot — accessing no filesystem or process. `src/commands/journal/` binds the resolved Appendable journal store and streaming surface and the agent-run-journal contract of `spx/15-agent-run-journal.enabler`, performing every append, read, seal, and render over injected capabilities. A backend registry resolves the bound store and surface from the environment: the local Appendable store of `spx/18-state.enabler/71-appendable-journal-store.enabler` with stdout by default, and the GitHub Appendable store of `spx/21-infrastructure.enabler/43-github-ci.enabler/21-artifact-journal-store.enabler` with the Snapshot projection of `spx/21-infrastructure.enabler/43-github-ci.enabler/21-snapshot-adapter.enabler` to the pull-request comment under a continuous-integration GitHub pull request. No module carries a verification-type identifier.

## Rationale

The run-state fold, terminal-status classification, and scope-path construction verify over in-memory inputs without a real repository, so the pure rules stay testable in isolation; concentrating backend binding and journal I/O in the command layer keeps the domain free of the filesystem and process boundaries the layer split removes. The run-state model, event vocabulary, and projection are identical for every verification kind, so they live once in `src/domains/journal/` parameterized by the opaque `<type>` scope segment.

Backend resolution is a pure function of an injected environment snapshot, and the registry binds the Appendable store and the streaming surface behind one selection point, so a new backend is one registry entry and selection logic verifies without reading the real process environment. The journal command composes an injected Appendable store — local or GitHub — with an injected streaming surface — stdout or the GitHub Snapshot projection — at the edge; it does not reimplement backend transport.

Rejected: a per-kind run-state module (`audit/run-state`, `review/run-state`) — the model is identical across kinds, so one parameterized module serves every kind; backend selection by a CLI flag or threaded through each verb — selection is an environment property resolved once, not a per-verb argument; and binding a concrete backend inside the domain layer — it reintroduces the I/O boundary the layer split removes and defeats isolated verification.

## Invariants

- `src/domains/journal/` accesses no filesystem or process; it operates on in-memory events, run records, and an injected environment snapshot.
- The run-state projection fold is pure: the same events always produce the same envelope.
- Backend resolution is a pure function of the injected environment snapshot; the registry exposes exactly the registered journal backend identifiers and rejects an unknown selector.
- No module under `src/domains/journal/` or `src/commands/journal/` references a verification-type name.
- GitHub mechanics are owned at the edge: durable artifact transport by the verification workflow's `actions/upload-artifact` and `actions/download-artifact` steps via the run-scoped naming of `spx/21-infrastructure.enabler/43-github-ci.enabler/21-artifact-journal-store.enabler`, and the pull-request projection by the `gh` client of `spx/21-infrastructure.enabler/43-github-ci.enabler/21-snapshot-adapter.enabler`; journal command modules consume only the injected store and surface capabilities and reach no Actions runtime.

## Verification

### Audit

- ALWAYS: the journal run-state projection fold, terminal-status classification, and run-scope path construction live in `src/domains/journal/` as pure functions with no filesystem or process access ([audit])
- ALWAYS: journal append, read, seal, and render orchestration happens in `src/commands/journal/`, against the agent-run-journal contract and injected streaming capabilities resolved from the registry ([audit])
- ALWAYS: the backend registry resolves the bound journal backend identifier from an injected environment snapshot — local by default, github-pr under a continuous-integration GitHub pull request — and rejects an unknown selector naming the registered backends ([audit])
- ALWAYS: the journal domain accepts the agent-run-journal contract, the backend, and the environment snapshot as injected dependencies, so the verbs verify over a controlled backend and environment without a real repository ([audit])
- ALWAYS: under the GitHub pull-request environment the journal binds the GitHub Appendable store of `spx/21-infrastructure.enabler/43-github-ci.enabler/21-artifact-journal-store.enabler` — the runner-local run history whose sealed file the verification workflow retains as an artifact — and the Snapshot projection of `spx/21-infrastructure.enabler/43-github-ci.enabler/21-snapshot-adapter.enabler` for the pull-request comment, so the journal command performs runner-local-file and `gh`-comment I/O only and reaches no Actions-runtime artifact state in-process ([audit])
- NEVER: a module under `src/domains/journal/` imports `node:fs`, `node:fs/promises`, process globals, or `src/commands/journal/` ([audit])
- NEVER: a module under `src/domains/journal/` or `src/commands/journal/` carries a verification-type identifier (`audit`, `review`) — the run is parameterized by the opaque `<type>` scope segment ([audit])
- NEVER: a concrete backend is selected by a verb argument or constructed inside the domain layer — selection is resolved from the environment through the registry, and backends are injected ([audit])
- NEVER: journal command modules own `gh`, network, Actions-artifact, or GitHub API request construction; they persist events through the injected Appendable store and pass rendered projections to the injected Snapshot capability ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or `memfs` substitutes for the backend, the journal contract, or the environment — tests inject controlled implementations and exercise the real code paths ([audit])
