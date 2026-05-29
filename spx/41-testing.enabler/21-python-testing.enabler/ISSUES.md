# Issues: Python Testing

These follow-ups concern how the (not-yet-built) `spx test` dispatch in `spx/41-testing.enabler/testing.md` must wire the pytest runner descriptor. The descriptor's own logic — detection gating, exclusion-flag generation, exit-code propagation — is complete and tested; these are contract requirements for the parent dispatch that invokes it.

## FOLLOW-UP: the dispatch must run the command runner in the product root

`runTests` builds `uv run pytest …` but delegates the command's working directory to the injected `runCommand`. pytest resolves its rootdir, configuration discovery, and `conftest.py` from the working directory, and `uv run` resolves the project's managed Python environment from the working directory, so the runner's working root is whatever directory the injected command runner executes in. The parent dispatch must bind the injected command runner's working directory to the resolved product root (mirroring how validation threads `ValidationStageContext.cwd`). Without that binding, running `spx test` from a subdirectory would resolve the wrong Python environment and the wrong pytest rootdir.

**Resolution:** when the `spx test` dispatch is built, bind the command runner's cwd to the resolved product root (and consider threading the product root through `TestRunnerDependencies` explicitly, as validation does through its stage context).

**Evidence:** `spx/41-testing.enabler/21-python-testing.enabler/21-python-test-runner.adr.md` (the working-root-is-cwd decision); parallels the same follow-up on the TypeScript peer `spx/41-testing.enabler/21-typescript-testing.enabler/ISSUES.md`.

## FOLLOW-UP: the dispatch must pass discovered spec-tree paths, not rely on empty-scope

`runTests` with `testPaths: []` invokes `uv run pytest` with no positional paths, so pytest collects every `test_*.py` under the working directory — not only `spx/**/tests`. In the intended flow the parent dispatch discovers `spx/**/tests` and passes those paths explicitly (non-empty), so the runner runs exactly the spec-tree tests; the `l2` fixture test forwards the copied suite's path to exercise that forwarding against real pytest. Empty `testPaths` remains a degenerate fallback that collects everything under the working directory.

**Resolution:** when the `spx test` dispatch is built, always pass the discovered spec-tree test paths so the run is scoped to spec-tree tests regardless of the consumer's working-directory contents; do not invoke the runner with empty `testPaths` against a real consumer project.

**Evidence:** `spx/41-testing.enabler/21-python-testing.enabler/21-python-test-runner.adr.md` (the discovered-paths invocation contract); parallels the same follow-up on the TypeScript peer `spx/41-testing.enabler/21-typescript-testing.enabler/ISSUES.md`.

## FOLLOW-UP: the dispatch must filter excluded-node files out of the forwarded paths

pytest's `--ignore=path` excludes a path during collection *walking* only; an explicitly-passed file under an ignored directory still runs. So when the dispatch forwards discovered `testPaths` alongside `excludedNodePaths`, a forwarded file that lives under an excluded node still executes despite the runner's `--ignore=spx/{node}/` flag. The runner correctly passes both per its spec — the `--ignore` flag guards directory-walk discovery — but passing-scope filtering of explicit files is the dispatch's responsibility, per `spx/41-testing.enabler/testing.md` ("test files under that node are filtered out before any runner invocation").

**Resolution:** when the `spx test passing` dispatch is built, remove files under excluded nodes from the discovered `testPaths` before invoking the runner; treat the runner's `--ignore` flags as collection-walk protection, not as a deselect mechanism for explicitly-forwarded paths.

**Evidence:** `spx/41-testing.enabler/testing.md` (passing-scope filtering happens before runner invocation); pytest `--ignore` semantics (collection-walk exclusion, not explicit-path deselection).
