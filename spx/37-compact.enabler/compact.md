# Compact

PROVIDES compact resume stash storage for agent transcript compaction
SO THAT post-compaction hooks
CAN restore spec-tree context from deterministic worktree-session state

## Assertions

### Scenarios

- Given a JSONL transcript with string fields containing `SPEC_TREE_FOUNDATION` and encoded `SPEC_TREE_CONTEXT target=\"spx/...\"` markers, when `spx compact store --session-id <id> --transcript <path>` runs, then the latest compact record under that session's stash contains the last active node and `has_foundation: true` ([test](tests/compact-cli.scenario.l2.test.ts))
- Given a JSONL transcript with markers and an agent-session environment identity but no `--session-id`, when `spx compact store --transcript <path>` runs, then the record is written under the environment-resolved session stash ([test](tests/compact-cli.scenario.l2.test.ts))
- Given a JSONL transcript with string fields containing `SPEC_TREE_FOUNDATION` and encoded `SPEC_TREE_CONTEXT target="spx/..."` or `SPEC_TREE_CONTEXT target=\"spx/...\"` markers, when compact transcript extraction runs, then the extracted compact record contains the last active node and `has_foundation: true` ([test](tests/compact.scenario.l1.test.ts))
- Given a transcript without `SPEC_TREE_FOUNDATION`, when compact store runs, then no compact record is written and the command exits successfully ([test](tests/compact-cli.scenario.l2.test.ts))
- Given multiple compact records for one worktree-session scope, when `spx compact retrieve --session-id <id>` runs for that session, then it emits the latest record as JSON on stdout ([test](tests/compact-cli.scenario.l2.test.ts))
- Given compact retrieve writes a record to stdout, when the command completes, then it records the exit code without terminating the process before stdout drains ([test](tests/compact-cli-io.scenario.l1.test.ts))
- Given both a `--session-id <id>` and a different agent-session environment identity, when compact store or retrieve runs, then the `--session-id` token determines the stash scope ([test](tests/compact-cli.scenario.l2.test.ts))
- Given no compact record for a worktree-session scope, when compact retrieve runs, then it emits no stdout and exits non-zero ([test](tests/compact-cli.scenario.l2.test.ts))
- Given neither a `--session-id` nor an agent-session environment identity, when compact store or retrieve runs, then no compact record is written, no stdout is emitted, and the command exits non-zero ([test](tests/compact-cli.scenario.l2.test.ts))

### Compliance

- ALWAYS: compact state is stored under `.spx/worktree/{session-token}/compact/stash.jsonl` at the local worktree root ([test](tests/compact.scenario.l1.test.ts))
- ALWAYS: compact store and retrieve use the shared state-store scope and JSONL helpers ([test](tests/compact-cli.scenario.l2.test.ts))
- ALWAYS: compact store and retrieve resolve the session token from the `--session-id` argument when it is supplied with a non-empty value, otherwise through `spx/36-session.enabler/32-session-identity.enabler`'s agent-session environment resolver ([test](tests/compact-cli.scenario.l2.test.ts))
- NEVER: compact emits `/spec-tree:*` instructions or presentation prose ([test](tests/compact-cli.scenario.l2.test.ts))
