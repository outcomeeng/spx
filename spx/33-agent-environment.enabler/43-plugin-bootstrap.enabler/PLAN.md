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
