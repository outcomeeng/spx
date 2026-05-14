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

Can proceed independently from plugin bootstrap once the agent environment descriptor shape is stable.
