# Last-Run Evidence

PROVIDES persisted spec-tree test observations for fast status reporting
SO THAT status commands
CAN report observed results and staleness without invoking test runners

## Assertions

### Scenarios

- Given a terminal test run, when its state is persisted, then the state is stored under `.spx/worktree/test/runs/run-{run-token}.jsonl` at the local worktree root, a settled state is never overwritten, malformed run files are classified as incomplete evidence, and, for each node, the latest terminal run covering that node is the one fast status reads ([test](tests/run-state.scenario.l1.test.ts))

### Properties

- Persisted state round-trips every recorded field — runner outcomes, timestamps, discovered test path set, discovered test content digest, descriptor-declared product input digests, and the resolved testing config digest — through write and read ([test](tests/run-state.property.l1.test.ts))
- Cached evidence is stale when any recorded staleness input differs from the current input, and fresh only when the resolved testing config digest, discovered test path-set digest, discovered test content digest, and product input digests all match ([test](tests/staleness.property.l1.test.ts))

### Compliance

- ALWAYS: deleting persisted testing state changes only fast-status availability, never passing-scope policy ([test](tests/passing-scope.compliance.l1.test.ts))
- NEVER: infer passing scope from persisted testing state — passing scope resolves from the testing config descriptor, and the last-run state module exposes no passing-scope resolution ([audit])
