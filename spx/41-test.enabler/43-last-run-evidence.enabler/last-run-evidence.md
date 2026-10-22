# Last-Run Evidence

PROVIDES persisted spec-tree test observations for fast status reporting
SO THAT status commands
CAN report observed results and staleness without invoking test runners

## Assertions

### Scenarios

- Given a terminal test run, when its state is persisted, then the state is stored under `.spx/worktree/test/runs/run-{run-token}.jsonl` at the local worktree root, a settled state is never overwritten, malformed run files are classified as incomplete evidence, and, for each node, the latest terminal run covering that node is the one fast status reads ([test](tests/run-state.scenario.l1.test.ts))

### Mappings

- A recorded run satisfies a request only when its terminal status is `passed`, it covers every selected test file, all four staleness digests equal the current values, its recorded head commit equals the current head commit, and the worktree holds no uncommitted change to a git-visible product file; any other recorded run satisfies no request ([test](tests/recorded-run-satisfaction.mapping.l1.test.ts))

### Properties

- Persisted state round-trips every recorded field — runner outcomes with each outcome's per-path verdicts, timestamps, discovered test path set, discovered test content digest, descriptor-declared product input digests, and the resolved testing config digest — through write and read ([test](tests/run-state.property.l1.test.ts))
- Cached evidence is stale when the resolved testing config digest, discovered test path-set digest, discovered test content digest, or any testing-language-declared product input digest differs from the value recorded with the cached observation, and fresh only when all four match ([test](tests/staleness.property.l1.test.ts))

### Compliance

- NEVER: taking a result from a recorded run adds, rewrites, or removes a run file under `.spx/worktree/test/runs/` ([test](tests/recorded-run-reuse.compliance.l1.test.ts))
- ALWAYS: deleting persisted testing state changes only fast-status availability, never passing-scope policy ([test](tests/passing-scope.compliance.l1.test.ts))
- NEVER: infer passing scope from persisted testing state — passing scope resolves from the testing config descriptor, and the last-run state module exposes no passing-scope resolution ([audit])
