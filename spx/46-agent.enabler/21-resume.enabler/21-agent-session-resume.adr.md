# Agent Session Resume

Agent-session resume discovery is a pure domain capability over a static typed adapter registry and injected filesystem, clock, agent-directory, and worktree-root dependencies. Each supported adapter owns its supported resume scopes, session-store resolution, metadata-head parsing, candidate normalization, and native launch mapping. Discovery filters adapters by the active scope before invoking any session-store collection. Discovery is bounded: it resolves the active scope's reference once — the invocation worktree root for worktree scope, or the target branch for branch scope, which needs no resolution — reads the metadata head and activity tail of each candidate transcript, and yields at most the newest few sessions per agent within the active scope and activity window, never parsing whole transcripts, resolving a worktree root per candidate, or shelling out to an external scanner. The CLI descriptor owns Commander options, duration-string parsing through `parse-duration-ms`, terminal interactivity checks, the Ink picker, and foreground process handoff; the command layer composes discovery with text and JSON presentation, while the domain receives only a positive safe-integer duration in milliseconds.

Each adapter takes its session-store resolution order, opening-metadata shape, native launch invocation, and supported scopes from the facts its own agent node declares, so this decision governs adapter structure without restating any agent's contract.

## Rationale

Supported agents store transcript metadata in agent-owned JSONL stores whose directory layouts and row shapes differ, each declared by that agent's own node. Discovery reads each store through the shape that avoids work: an agent whose layout encodes the working directory in a directory name resolves it without opening a file, each adapter's bounded head identifies the session, and a bounded tail scan identifies the latest transcript activity timestamp when one is present. The default activity window preserves timestamp-less sessions after timestamped candidates, while an explicit `--since` window requires timestamp evidence because the caller is asking for observed transcript activity. File modification time bounds which transcripts are read; the bounded tail timestamp decides explicit-window eligibility and ordering. Resolving the invocation worktree root once and comparing recorded working directories against it replaces a per-candidate git subprocess, the dominant cost when a store holds thousands of recent transcripts. Branch scope selects a session only when its agent records the initial branch in transcript metadata, so it resolves against a fixed target name and reads no live git at all. Discovery caps output to the newest few sessions per agent, and input work is bounded by the active-window file set, fixed head and tail byte windows, and fixed read concurrency.

Keeping store parsing pure and injected lets tests cover every format without touching a developer's agent directories, while the descriptor stays the only layer that interprets CLI duration text, reads terminal state, or hands the process to a native agent command. `parse-duration-ms` accepts the human-readable duration vocabulary at that boundary and returns milliseconds or `undefined`, so SPX validates positivity and safe-integer range without implementing duration grammar. A shared transcript parser with agent-specific branches would make the store vocabulary harder to audit; one adapter per agent keeps each contract explicit. Discovery derives every value from injected dependencies rather than an external scanner binary and stays verifiable through controlled fixtures.

## Invariants

- Candidate eligibility and ordering are deterministic for the same discovered agent rows, known transcript activity timestamps, current time, active scope, and activity window.
- A launch command is derived only from the candidate agent, session id, source path, and recorded current working directory.
- Every supported resume adapter emits the same candidate shape and is enumerated exactly once by the static registry.
- The transcript reads and per-candidate worktree resolution discovery performs are bounded by the active scope and fixed head and tail byte windows, not by whole-transcript size.

## Verification

### Audit

- ALWAYS: agent session discovery accepts filesystem, clock, agent-directory, and worktree-root dependencies through explicit parameters rather than reading the developer environment directly from pure domain code ([audit])
- ALWAYS: transcript parsing lives in agent-specific adapters under the resume domain — one per agent declaring an adapter contract — and each adapter emits the same candidate shape for command and interface layers ([audit])
- ALWAYS: resume discovery enumerates supported agents through one static typed adapter registry, so adding an adapter changes the adapter module and registry rather than orchestration control flow ([audit])
- ALWAYS: each resume adapter declares its supported scopes, and discovery filters unsupported adapters before invoking their session-store collectors ([audit])
- ALWAYS: each adapter's session-store resolution follows the order its agent's node declares, and its launch mapping resumes the selected source rather than reconstructing a different session identity ([audit])
- ALWAYS: the CLI descriptor parses `--since <duration>` through the `parse-duration-ms` runtime dependency, rejects results that are absent, non-positive, non-finite, or outside the safe-integer range, and passes only milliseconds into command and domain layers ([audit])
- ALWAYS: Commander option parsing, TTY checks, Ink rendering, and foreground process handoff live under `src/interfaces/cli/` per `spx/13-cli.enabler/21-terminal-ui.adr.md` ([audit])
- NEVER: SPX implements duration-string grammar or passes raw duration text into the resume discovery domain ([audit])
- NEVER: discovery shells out to an external file-scanning binary or takes a runtime dependency beyond the injected filesystem, clock, agent-directory, worktree-root, and numeric activity-window inputs ([audit])
- NEVER: branch scope invents branch identity for an adapter whose transcript metadata omits it; those sessions remain available through worktree scope only ([audit])
- NEVER: adapter selection depends on dynamic filesystem or package scanning; the registry is explicit and statically enumerable ([audit])
- NEVER: tests for resume discovery replace injected filesystem, clock, agent-directory, worktree-root, picker, or foreground-launch dependencies through framework-level module replacement; they use explicit controlled implementations supplied through dependency injection ([audit])
- NEVER: agent session discovery reads or writes `.spx/sessions/`; SPX handoff sessions remain under `spx/36-session.enabler` ([audit])
