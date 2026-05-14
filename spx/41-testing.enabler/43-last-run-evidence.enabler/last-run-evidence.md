# Last-Run Evidence

PROVIDES persisted spec-tree test observations for fast status reporting
SO THAT status commands
CAN report observed results and staleness without invoking test runners

## Assertions

### Compliance

- ALWAYS: persisted testing state records runner outcomes, timestamps, discovered test path sets, discovered test content digests, descriptor-declared product input digests, and the resolved testing config digest ([review])
- ALWAYS: deleting persisted testing state changes only fast-status availability, never passing-scope policy ([review])
- ALWAYS: cached evidence is stale when any recorded staleness input differs from the current input ([review])
- NEVER: infer passing scope from persisted testing state ([review])
