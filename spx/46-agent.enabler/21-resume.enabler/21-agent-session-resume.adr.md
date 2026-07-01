# Agent Session Resume

Agent-session resume discovery is a pure domain capability over injected filesystem, clock, home-directory, and worktree-root dependencies, with one adapter per supported agent. Discovery is bounded: it resolves the active scope's reference once — the invocation worktree root for worktree scope, or the target branch for branch scope, which needs no resolution — reads only the metadata slice of each candidate transcript, and yields at most the newest few sessions per agent within the active scope, never parsing whole transcripts, resolving a worktree root per candidate, or shelling out to an external scanner. The CLI descriptor owns Commander options, terminal interactivity checks, the Ink picker, and foreground process handoff; the command layer composes discovery with text and JSON presentation.

## Rationale

Codex and Claude Code store transcript metadata in agent-owned JSONL stores with different directory layouts and row shapes. Codex records its working directory and branch once in the opening `session_meta` row; Claude Code encodes the working directory in the project directory name and repeats the branch on each row. Discovery reads each store through the shape that avoids work: the Claude project directory name resolves the working directory without opening a file, and only the head of a transcript — or, for a per-row field, a bounded scan — is read. Resolving the invocation worktree root once and comparing recorded working directories against it replaces a per-candidate git subprocess, the dominant cost when a store holds thousands of recent transcripts. Branch scope selects a session by the branch recorded in its opening metadata, so it resolves against a fixed target name and reads no live git at all. Bounding the result to the newest few sessions per agent keeps discovery within the CLI latency budget regardless of total store size.

Keeping store parsing pure and injected lets tests cover both formats without touching a developer's home directory, while the descriptor stays the only layer that reads terminal state or hands the process to a native agent command. A shared parser with agent-specific branches would make the store vocabulary harder to audit; one adapter per agent keeps each contract explicit. Discovery derives every value from the injected dependencies rather than an external scanner binary, so it adds no runtime dependency and stays verifiable through controlled fixtures.

## Invariants

- Candidate ordering is deterministic for the same discovered agent rows, current time, and active scope.
- A launch command is derived only from the candidate agent, session id, and recorded current working directory.
- The transcript reads and per-candidate worktree resolution discovery performs are bounded by the active scope and the per-agent candidate cap, not by the total number of stored sessions.

## Verification

### Audit

- ALWAYS: agent session discovery accepts filesystem, clock, home-directory, and worktree-root dependencies through explicit parameters rather than reading the developer environment directly from pure domain code ([audit])
- ALWAYS: Codex and Claude Code transcript parsing lives in agent-specific adapters under the resume domain, and each adapter emits the same candidate shape for command and interface layers ([audit])
- ALWAYS: Commander option parsing, TTY checks, Ink rendering, and foreground process handoff live under `src/interfaces/cli/` per `spx/13-cli.enabler/21-terminal-ui.adr.md` ([audit])
- NEVER: discovery shells out to an external file-scanning binary or takes a runtime dependency beyond the injected filesystem, clock, home-directory, and worktree-root ports ([audit])
- NEVER: tests for resume discovery replace injected filesystem, clock, home-directory, worktree-root, picker, or foreground-launch dependencies through framework-level module replacement; they use explicit controlled implementations supplied through dependency injection ([audit])
- NEVER: agent session discovery reads or writes `.spx/sessions/`; SPX handoff sessions remain under `spx/36-session.enabler` ([audit])
