# Agent Session Resume

CONSTRAINS how SPX discovers resumable agent sessions and launches one
TO a pure discovery capability over the agents the agent registry module of [spx/33-harness-environment.enabler/21-harness-environment-descriptor.adr.md](spx/33-harness-environment.enabler/21-harness-environment-descriptor.adr.md) lists, where each agent's resume adapter in its agent module owns its resume scopes, session-store resolution, metadata-head parsing, candidate normalization, working-directory record forms and native launch mapping, and filesystem, clock, agent-directory and worktree-root dependencies are injected
SO THAT discovery stays bounded by fixed read windows, verifies through controlled fixtures, and grows by one agent module rather than by orchestration control flow

## Test.Mapping: record-reader-forms

An agent module may declare working-directory record forms that discovery reads inside the fixed metadata-head and activity-tail windows, and each form yields a filesystem path.

| Case          | Record form                                      | Working directory                      |
| ------------- | ------------------------------------------------ | -------------------------------------- |
| plain-path    | a record carrying a plain-path working directory | that path                              |
| file-uri      | a record carrying a file-URI working directory   | the URI decoded to a filesystem path   |
| none-declared | the agent module declares no record form         | the opening recorded working directory |

## Test.Compliance: worktree scope

- worktree-scope-classification: ALWAYS: worktree-scope classification includes a candidate when its opening working directory, or any bounded-window working-directory record, resolves inside the invocation worktree root, and the candidate's resolved working directory is the newest in-scope record, with opening metadata as the fallback.
- bounded-record-reads: NEVER: working-directory record identification reads transcript bytes beyond the fixed metadata-head and activity-tail windows discovery already reads for candidate identity and activity.

## Audit: discovery

- bounded-discovery: ALWAYS: discovery resolves the active scope's reference once, reads only the metadata head and activity tail of each candidate in the active-window file set, yields at most the newest few sessions per agent, and never parses whole transcripts, resolves a worktree root per candidate, or shells out to an external scanner.
- scope-filter: ALWAYS: each resume adapter declares its supported scopes, and discovery filters unsupported adapters before invoking their session-store collectors.
- injected-dependencies: ALWAYS: discovery takes filesystem, clock, agent-directory and worktree-root dependencies through explicit parameters, never reads the developer environment from pure domain code, and takes no runtime dependency beyond the injected filesystem, clock, agent-directory, worktree-root and numeric activity-window inputs.
- agent-specific-adapters: ALWAYS: each agent's transcript parsing lives in its agent module, called through the agent registry module, and every adapter emits the same candidate shape for command and interface layers.
- registry-enumeration: NEVER: adapter selection depends on dynamic filesystem or package scanning; the agent registry module of [spx/33-harness-environment.enabler/21-harness-environment-descriptor.adr.md](spx/33-harness-environment.enabler/21-harness-environment-descriptor.adr.md) is the one enumeration of resume adapters.
- store-resolution-order: ALWAYS: an agent module's session-store resolution honors the precedence among the store variables and default directory that module declares, and its launch mapping resumes the selected source path rather than reconstructing a different session identity.
- branch-without-metadata: NEVER: branch scope invents branch identity for an agent whose transcript metadata omits it; those sessions stay available through worktree scope only.
- no-handoff-sessions: NEVER: agent session discovery reads or writes `.spx/sessions/`; SPX handoff sessions remain under `spx/36-session.enabler`.
- no-module-replacement: NEVER: resume discovery tests replace injected filesystem, clock, agent-directory, worktree-root, picker or foreground-launch dependencies through framework-level module replacement; they use controlled implementations supplied through dependency injection.

## Audit: candidates

- deterministic-ordering: ALWAYS: candidate eligibility and ordering are deterministic for the same discovered rows, known transcript activity timestamps, current time, active scope and activity window.
- launch-derivation: ALWAYS: a launch command derives only from the candidate agent, session id, source path and resolved working directory.
- opening-only-resolution: ALWAYS: worktree scope reads each recent candidate's bounded tail only for an agent module that declares a working-directory record form; every other agent and scope combination resolves from opening metadata alone and skips the tail read for an out-of-scope candidate.
- branch-scope-working-directory: ALWAYS: a branch-scoped candidate's resolved working directory is its opening recorded working directory.

## Audit: CLI boundary

- duration-parsing: ALWAYS: the CLI descriptor parses `--since <duration>` through the `parse-duration-ms` runtime dependency, rejects results that are absent, non-positive, non-finite, or outside the safe-integer range, and passes only milliseconds into command and domain layers.
- cli-owned-io: ALWAYS: Commander option parsing, TTY checks, Ink rendering and foreground process handoff live under `src/interfaces/cli/` per [spx/13-cli.enabler/21-terminal-ui.adr.md](spx/13-cli.enabler/21-terminal-ui.adr.md).
- no-duration-grammar: NEVER: SPX implements duration-string grammar or passes raw duration text into the resume discovery domain.
