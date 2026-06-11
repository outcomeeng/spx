# Compact

PROVIDES compact resume stash storage for agent transcript compaction
SO THAT post-compaction hooks
CAN restore spec-tree context from deterministic worktree-session state

## Assertions

### Scenarios

- Given a transcript with `SPEC_TREE_FOUNDATION` and escaped `SPEC_TREE_CONTEXT target=\"spx/...\"` markers and an agent-session environment identity, when `spx compact store --transcript <path>` runs, then the latest compact record contains the last active node and `has_foundation: true` ([test](tests/compact-cli.scenario.l2.test.ts))
- Given a transcript with `SPEC_TREE_FOUNDATION` and unescaped `SPEC_TREE_CONTEXT target="spx/..."` markers, when compact transcript extraction runs, then the extracted compact record contains the last active node and `has_foundation: true` ([test](tests/compact.scenario.l1.test.ts))
- Given a transcript without `SPEC_TREE_FOUNDATION`, when compact store runs, then no compact record is written and the command exits successfully ([test](tests/compact-cli.scenario.l2.test.ts))
- Given multiple compact records for one worktree-session scope, when `spx compact retrieve` runs with the same agent-session environment identity, then it emits the latest record as JSON on stdout ([test](tests/compact-cli.scenario.l2.test.ts))
- Given no compact record for a worktree-session scope, when compact retrieve runs, then it emits no stdout and exits non-zero ([test](tests/compact-cli.scenario.l2.test.ts))
- Given no agent-session environment identity, when compact store or retrieve runs, then no compact record is written, no stdout is emitted, and the command exits non-zero ([test](tests/compact-cli.scenario.l2.test.ts))

### Compliance

- ALWAYS: compact state is stored under `.spx/worktree/{session-token}/compact/stash.jsonl` at the local worktree root ([test](tests/compact.scenario.l1.test.ts))
- ALWAYS: compact store and retrieve use the shared state-store scope and JSONL helpers ([test](tests/compact-cli.scenario.l2.test.ts))
- ALWAYS: compact store and retrieve resolve the session token through `spx/36-session.enabler/32-session-identity.enabler` rather than a command-line flag ([test](tests/compact-cli.scenario.l2.test.ts))
- NEVER: compact emits `/spec-tree:*` instructions or presentation prose ([test](tests/compact-cli.scenario.l2.test.ts))
