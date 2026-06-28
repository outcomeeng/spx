# Agent Session Resume

Agent-session resume discovery is a pure domain capability over injected filesystem, clock, home-directory, and worktree-root dependencies, with one adapter per supported agent. The CLI descriptor owns Commander options, terminal interactivity checks, the Ink picker, and foreground process handoff; the command layer composes discovery with text and JSON presentation.

## Rationale

Codex and Claude Code store transcript metadata in agent-owned JSONL stores with different directory layouts and row shapes. Keeping store parsing pure and injected lets tests cover both formats without touching a developer's home directory, while the descriptor stays the only layer that reads terminal state or hands the process to a native agent command. A shared parser with agent-specific branches would make the store vocabulary harder to audit; one adapter per agent keeps each contract explicit.

## Invariants

- Candidate ordering is deterministic for the same discovered agent rows, current time, and worktree root.
- A launch command is derived only from the candidate agent, session id, and recorded current working directory.

## Verification

### Audit

- ALWAYS: agent session discovery accepts filesystem, clock, home-directory, and worktree-root dependencies through explicit parameters rather than reading the developer environment directly from pure domain code ([audit])
- ALWAYS: Codex and Claude Code transcript parsing lives in agent-specific adapters under the resume domain, and each adapter emits the same candidate shape for command and interface layers ([audit])
- ALWAYS: Commander option parsing, TTY checks, Ink rendering, and foreground process handoff live under `src/interfaces/cli/` per `spx/13-cli.enabler/21-terminal-ui.adr.md` ([audit])
- NEVER: tests for resume discovery replace injected filesystem, clock, home-directory, worktree-root, picker, or foreground-launch dependencies through framework-level module replacement; they use explicit controlled implementations supplied through dependency injection ([audit])
- NEVER: agent session discovery reads or writes `.spx/sessions/`; SPX handoff sessions remain under `spx/36-session.enabler` ([audit])
