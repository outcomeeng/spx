# Hooks Issues

## Local interview artifact is preserved outside git

- Evidence: `git status --short --branch` reports `?? spx/21-infrastructure.enabler/54-hooks.enabler/.hooks.interview-state.json`.
- Impact: the generated interview-state artifact preserves the full interview transcript state for local continuation, while durable product truth must live in this node's spec, PDR, and ADR.
- Revisit condition: before deleting, moving, or regenerating the artifact, verify that every durable interview decision is represented in this node's declare-layer artifacts and keep `.hooks.interview-state.json` untracked in place.
