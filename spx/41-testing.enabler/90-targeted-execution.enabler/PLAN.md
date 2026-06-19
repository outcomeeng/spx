# Targeted Execution Plan

Implements Slice 2 of the parent testing PLAN.md: explicit target operands for
`spx test` and `spx test passing`, so agents verify only the node or file they
changed instead of the full suite.

## Resolved design decisions

- **Tree placement:** own child enabler at
  `spx/41-testing.enabler/90-targeted-execution.enabler`, consuming the language
  adapters (`21-typescript-testing`, `21-python-testing`), passing-scope config
  (`32-testing-config`), last-run recording (`43-last-run-evidence`), and the
  agent-output contract (`85-agent-test-output`).
- **Node-path operand scope:** default resolves a node-path operand to that
  node's own `tests/` files only; an explicit recursive flag (`--recursive` /
  `-r`) extends it to the node plus all descendant nodes' test files.
- **Passing-scope interaction:** `spx test passing` with operands applies the
  configured passing-scope exclusions to the operand-selected set; plain
  `spx test` with operands routes the selected set unfiltered.
- **Operand semantics:** operand resolution runs over the git-agnostic
  `spx/**/tests/` discovery set (no git-ignore layer participates), so resolution
  is a pure function of the discovered set and the operands; multiple operands
  select the deduplicated union of their resolved files.
- **Empty-match behavior:** an operand resolving to no discovered test file
  reports the unresolved operand and exits non-zero, consistent with the
  existing unmatched-files failure and the explicit-caller-intent contract.

## Scope boundary

This node delivers operand selection only. The `--changed`/`--base` planner
(Slice 3), CI environment (Slice 4), and product dogfooding (Slice 5) remain in
the parent testing PLAN.md.
