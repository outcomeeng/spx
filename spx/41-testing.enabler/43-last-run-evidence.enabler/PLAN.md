# Plan: Last-Run Evidence

## Purpose

Persist spec-tree test observations so status commands can report fast test status and staleness.

## Governing Specs

- `spx/41-testing.enabler/testing.md`
- `spx/41-testing.enabler/43-last-run-evidence.enabler/11-last-run-directory.adr.md`
- `spx/41-testing.enabler/32-testing-config.enabler/testing-config.md`
- `spx/16-config.enabler/54-canonical-descriptor-digest.enabler/canonical-descriptor-digest.md`
- `spx/22-test-environment.enabler/32-spec-tree-fixtures.enabler/spec-tree-fixtures.md`

## Implementation Notes

- Compute discovery once per command and reuse it for runner dispatch and staleness comparison.
- Store observed runner results and all staleness inputs in `.spx/testing/{branch-slug}/runs/{run-directory}/state.json`.
- Keep policy reads config-backed; state is only evidence.
- Use `withSpecTreeEnv` for filesystem and in-memory fixture tests when assertions require a spec-tree shape.

## Evidence Required

- State tests prove status reads cached observations without invoking runners.
- State tests prove stale status for changed config digest, test path set, test content digest, and descriptor-declared product input digest.
- Deletion tests prove missing state does not change passing scope.
- Performance instrumentation or regression tests prove one discovery pass is reused.

## Parallelization

This depends on the testing descriptor and canonical descriptor digest. It can proceed independently from audit state once those APIs exist.

## Agent Pickup Prompt

```text
Start from fresh origin/main on work/testing-last-run-evidence after the canonical descriptor digest API is available. Invoke spec-tree:understanding if needed, then spec-tree:contextualizing for spx/41-testing.enabler/43-last-run-evidence.enabler/. Read this PLAN and the governing specs it names. Invoke spec-tree:applying, spec-tree:testing, typescript:testing-typescript, and typescript:coding-typescript before edits.

Before branching, verify `git ls-tree origin/main -- spx/41-testing.enabler/32-testing-config.enabler/`, `git ls-tree origin/main -- spx/16-config.enabler/43-domain-execution-descriptors.enabler/`, and `git ls-tree origin/main -- spx/16-config.enabler/54-canonical-descriptor-digest.enabler/` report the settled testing descriptor and C1 artifacts. Persist testing observations under `.spx/testing/{branch-slug}/runs/{run-directory}/state.json` at the Git common-dir product root. Compute discovery once per command and reuse the result for runner dispatch and staleness comparison. Record runner outcomes, timestamps, discovered path sets, content digests, descriptor-declared product input digests, and the resolved testing config digest. Prove deleting state changes only fast-status availability. Open one PR and ask reviewers to audit staleness inputs, state ownership, and no-policy-from-state behavior.
```
