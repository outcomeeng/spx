# Codex

PROVIDES the Codex coding agent's own adapter facts — registered agent id,
session-store resolution, agent-session identity variable, transcript metadata
shape, native resume command, hook stdout policy default, and capability package
format
SO THAT hook agent classification, harness environment configuration, session
identity resolution, agent resume and search, and environment diagnosis
CAN address Codex through its declared facts without any of them enumerating
which coding agents SPX supports

## Assertions

### Compliance

- ALWAYS: Codex sessions resolve from `CODEX_HOME` plus `sessions` when that variable is set, and from `~/.codex/sessions` otherwise ([test](tests/codex.compliance.l1.test.ts))
- ALWAYS: a command running inside a Codex agent session reads its agent session identity from `CODEX_THREAD_ID` ([test](tests/codex.compliance.l1.test.ts))
- ALWAYS: Codex resolves `hooks.sessionStart.compactStdout` to false, so a compact-source `session-start` invocation classified as Codex emits no hook stdout ([test](tests/codex.compliance.l1.test.ts))
- ALWAYS: Codex candidate transcripts are interactive transcripts, excluding non-interactive exec transcripts and subagent-thread transcripts, because resume launches through the interactive native command ([test](tests/codex.compliance.l1.test.ts))
- NEVER: Codex capability packages are produced by translating another coding agent's capability artifacts into the Codex native package format ([audit])

### Mappings

- The Codex transcript's opening `session_meta` row maps to the session's recorded working directory and initial branch, so Codex participates in both worktree scope and branch scope ([test](tests/codex.mapping.l1.test.ts))
- A Codex candidate maps to the native resume invocation `codex resume <session-id>` launched from the candidate's recorded working directory ([test](tests/codex.mapping.l1.test.ts))
