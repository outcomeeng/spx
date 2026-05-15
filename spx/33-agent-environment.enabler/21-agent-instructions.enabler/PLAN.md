# Plan: Agent Instructions

## Purpose

Manage `AGENTS.md` and runtime-specific instruction files through deterministic generated sections.

## Governing Specs

- `spx/33-agent-environment.enabler/agent-environment.md`
- `spx/spx.product.md`

## Implementation Notes

- Define managed-section markers before writing any files.
- Preserve unmanaged content exactly.
- Emit stable ordering for configured instruction fragments.
- Include product language rules such as `productDir` where configured.

## Evidence Required

- Config-format tests cover JSON, YAML, and TOML instruction-fragment configuration.
- Golden-output tests cover create, update, idempotent re-run, and unmanaged-content preservation.
- Safety tests cover malformed markers and conflicting managed sections.

## Parallelization

This depends on the agent environment descriptor shape and E2 runtime config so instruction targets come from configured runtimes rather than a hardcoded runtime list. It can proceed independently from plugin bootstrap once those APIs are stable.

## Agent Pickup Prompt

```text
Before branching, follow the common packet rules in `spx/16-config.enabler/PLAN.md`, including the branch-existence guard and settled-prerequisite checks.

Start from fresh origin/main on work/agent-instructions after the agent environment descriptor shape and E2 runtime config are stable. Invoke spec-tree:understanding if needed, then spec-tree:contextualizing for spx/33-agent-environment.enabler/21-agent-instructions.enabler/. Read this PLAN and the governing specs it names. Invoke spec-tree:applying, spec-tree:testing, typescript:testing-typescript, and typescript:coding-typescript before edits.

Before branching, verify `git ls-tree origin/main -- spx/33-agent-environment.enabler/` reports the E0 descriptor-shape artifacts and `git ls-tree origin/main -- spx/33-agent-environment.enabler/32-runtime-config.enabler/` reports the E2 runtime-config artifacts. Implement deterministic instruction-file reconciliation for AGENTS.md and runtime-specific instruction files. Define managed-section markers before writing files, preserve unmanaged content byte-for-byte, and emit stable ordering for configured instruction fragments. Prove create, update, idempotent re-run, unmanaged-content preservation, malformed markers, conflicting managed sections, and config-format coverage. Open one PR and ask reviewers to audit instruction safety and deterministic output.
```
