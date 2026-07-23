# Plan: plugin bootstrap

## Harness vocabulary guard

Before applying this plan, read `spx/12-agent-harness.pdr.md` and use its vocabulary as the authority: agent harness, agent, agent adapter, and agent session. Treat nearby `agent`, `runtime`, `session`, `Claude`, or `Codex` wording as lower-layer/local vocabulary until reconciled; every touched spec, command text, source name, test, and pickup prompt names the precise harness role it describes.

## Purpose

Bootstrap configured plugin marketplaces, plugins, and skills for supported agents.

## Governing specs

- `spx/33-harness-environment.enabler/harness-environment.md`
- `spx/33-harness-environment.enabler/32-agent-config.enabler/agent-config.md`

## Governing decision

`spx/13-agent-capability-lifecycle.pdr.md` separates read-only capability status, exact apply, methodology-compatible update, and methodology migration while prohibiting user-scope mutation and cross-agent artifact translation.

## Implementation notes

- Define config shape before adding network-capable installation behavior.
- Separate local status reporting from apply and update actions.
- Keep status offline-capable; apply and update resolve declared network sources.
- Persist exact compatible package pins through the config owner before update applies them.
- Record exact installed versions or digests when the coding agent exposes them.
- Consume coding-agent-native packages from declared sources without translating another coding agent's artifacts.

## Evidence required

- Status tests cover installed, missing, stale, and failed entries.
- Dry-run tests cover planned marketplace, plugin, and skill actions without writes.
- Safety tests cover offline mode and malformed configured entries.

## Parallelization

Can proceed after `spx/33-harness-environment.enabler/32-agent-config.enabler/agent-config.md` declares the agent config descriptor shape. Installation actions should be separate from status reporting.

## Agent pickup prompt

```text
Before branching, follow the common packet rules in `spx/16-config.enabler/PLAN.md`, including the branch-existence guard and settled-prerequisite checks.

Start from fresh origin/main on work/plugin-bootstrap-status after E2 (`spx/33-harness-environment.enabler/32-agent-config.enabler/`) merges. Invoke spec-tree:understanding if needed, then spec-tree:contextualizing for spx/33-harness-environment.enabler/43-plugin-bootstrap.enabler/. Read this PLAN and the governing specs it names. Invoke spec-tree:applying, spec-tree:testing, typescript:testing-typescript, and typescript:coding-typescript before edits.

Before branching, verify `git cat-file -e origin/main:spx/33-harness-environment.enabler/harness-environment.md` succeeds for E0 and `git cat-file -e origin/main:spx/33-harness-environment.enabler/32-agent-config.enabler/agent-config.md` succeeds for the E2 agent config artifacts. Implement deterministic status and dry-run planning for configured plugin marketplaces, plugins, and skills. Separate local status reporting from install or update actions. Keep core status offline-capable and record exact installed versions or digests when the agent exposes them. Prove installed, missing, stale, failed, dry-run actions without writes, offline mode, and malformed configured entries. Open one PR and ask reviewers to audit offline guarantees and action/status separation.
```
