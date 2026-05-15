# Plan: Plugin Bootstrap

## Purpose

Bootstrap configured plugin marketplaces, plugins, and skills for supported agent runtimes.

## Governing Specs

- `spx/33-agent-environment.enabler/agent-environment.md`
- `spx/33-agent-environment.enabler/32-runtime-config.enabler/runtime-config.md`

## Implementation Notes

- Define config shape before adding network-capable installation behavior.
- Separate local status reporting from installation or update actions.
- Keep core status and reconciliation commands offline-capable.
- Record exact installed versions or digests when the underlying runtime exposes them.

## Evidence Required

- Status tests cover installed, missing, stale, and failed entries.
- Dry-run tests cover planned marketplace, plugin, and skill actions without writes.
- Safety tests cover offline mode and malformed configured entries.

## Parallelization

Can proceed after `spx/33-agent-environment.enabler/32-runtime-config.enabler/runtime-config.md` declares the runtime config descriptor shape. Installation actions should be separate from status reporting.

## Agent Pickup Prompt

```text
Before branching, follow the common packet rules in `spx/16-config.enabler/PLAN.md`, including the branch-existence guard and settled-prerequisite checks.

Start from fresh origin/main on work/plugin-bootstrap-status after E2 (`spx/33-agent-environment.enabler/32-runtime-config.enabler/`) merges. Invoke spec-tree:understanding if needed, then spec-tree:contextualizing for spx/33-agent-environment.enabler/43-plugin-bootstrap.enabler/. Read this PLAN and the governing specs it names. Invoke spec-tree:applying, spec-tree:testing, typescript:testing-typescript, and typescript:coding-typescript before edits.

Before branching, verify `git cat-file -e origin/main:spx/33-agent-environment.enabler/32-runtime-config.enabler/runtime-config.md` succeeds for the E2 runtime-config artifacts. Implement deterministic status and dry-run planning for configured plugin marketplaces, plugins, and skills. Separate local status reporting from install or update actions. Keep core status offline-capable and record exact installed versions or digests when the runtime exposes them. Prove installed, missing, stale, failed, dry-run actions without writes, offline mode, and malformed configured entries. Open one PR and ask reviewers to audit offline guarantees and action/status separation.
```
