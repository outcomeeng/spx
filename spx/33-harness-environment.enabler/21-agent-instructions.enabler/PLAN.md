# Plan: agent instructions

## Harness vocabulary guard

Before applying this plan, read `spx/12-agent-harness.pdr.md` and use its vocabulary as the authority: agent harness, agent, agent adapter, and agent session. Treat nearby `agent`, `runtime`, `session`, `Claude`, or `Codex` wording as lower-layer/local vocabulary until reconciled; every touched spec, command text, source name, test, and pickup prompt names the precise harness role it describes.

## Purpose

Manage `AGENTS.md` and agent-specific instruction files through deterministic generated sections.

## Governing specs

- `spx/33-harness-environment.enabler/harness-environment.md`
- `spx/spx.product.md`

## Governing decision

`spx/13-agent-capability-lifecycle.pdr.md` requires exact methodology markers, explicit-enabled-plus-available participation, and routine reconciliation that never advances methodology identity.

## Implementation notes

- Define managed-section markers before writing any files.
- Preserve unmanaged content exactly.
- Emit stable ordering for configured instruction fragments.
- Include product language rules such as `productDir` where configured.
- Project instruction files only for participating coding agents.
- Reject routine reconciliation that would advance managed instruction markers beyond the declared methodology version.

## Evidence required

- Config-format tests cover JSON, YAML, and TOML instruction-fragment configuration.
- Golden-output tests cover create, update, idempotent re-run, and unmanaged-content preservation.
- Safety tests cover malformed markers and conflicting managed sections.

## Parallelization

This depends on the harness environment descriptor shape and E2 agent config so instruction targets come from agents rather than a hardcoded agent list. It can proceed independently from plugin bootstrap once those APIs are stable.

## Agent pickup prompt

```text
Before branching, follow the common packet rules in `spx/16-config.enabler/PLAN.md`, including the branch-existence guard and settled-prerequisite checks.

Start from fresh origin/main on work/agent-instructions after the harness environment descriptor shape and E2 agent config are stable. Invoke spec-tree:understanding if needed, then spec-tree:contextualizing for spx/33-harness-environment.enabler/21-agent-instructions.enabler/. Read this PLAN and the governing specs it names. Invoke spec-tree:applying, spec-tree:testing, typescript:testing-typescript, and typescript:coding-typescript before edits.

Before branching, verify `git cat-file -e origin/main:spx/33-harness-environment.enabler/harness-environment.md` succeeds for the E0 descriptor-shape artifacts and `git cat-file -e origin/main:spx/33-harness-environment.enabler/32-agent-config.enabler/agent-config.md` succeeds for the E2 agent config artifacts. Implement deterministic instruction-file reconciliation for AGENTS.md and agent-specific instruction files. Define managed-section markers before writing files, preserve unmanaged content byte-for-byte, and emit stable ordering for configured instruction fragments. Prove create, update, idempotent re-run, unmanaged-content preservation, malformed markers, conflicting managed sections, and config-format coverage. Open one PR and ask reviewers to audit instruction safety and deterministic output.
```
