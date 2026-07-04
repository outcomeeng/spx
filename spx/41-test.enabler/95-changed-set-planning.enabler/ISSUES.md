# Issues: Changed-Set Planning

Coordination notes for `spx test --changed` planning.

## FOLLOW-UP: full-tree product-input runs still report unrelated unresolved source files

`spx test --changed --base origin/main` on `feat/release-notes-impl` exited 0 after running the focused branch-diff gate:

```text
Test Files  421 passed (421)
Tests  2559 passed (2559)
```

The same run also printed:

```text
No related-test capability resolved these changed source files:
src/agent/agent-runner.ts
```

The branch changes `package.json` and `pnpm-lock.yaml`, which are TypeScript testing product inputs. Changed-set planning therefore selects the recursive `spx` operand and runs the full discovered spec test tree. The warning is a report-precision issue for this branch because the full recursive selection already covers the release-note tests that import the release agent-runner harness path. It still reduces confidence in the planner output because the unresolved-source label reads like a coverage gap even when product-input selection has widened the run.

**Resolution:** decide whether product-input-changed selection should suppress unresolved changed-source reporting, annotate it differently, or keep the current warning with a clearer label. Cover the decision in `spx/41-test.enabler/95-changed-set-planning.enabler/tests/changed-set-planning.scenario.l1.test.ts` and the CLI reporting path.

**Revisit condition:** the next change to `src/commands/test/changed-set-planning.ts`, `src/test/languages/typescript.ts`, or `src/interfaces/cli/test.ts`.

**Evidence:** `spx test --changed --base origin/main` on `feat/release-notes-impl`; operator selected tracked deferral on July 4, 2026.

**Skills:** `spec-tree:contextualize`, `spec-tree:test`, `spec-tree:refocus`.
