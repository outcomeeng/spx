# Plan: Consumer boundary repair

> **Reconcile against `spx/PLAN.md` first.** This node is the intermediate
> composition layer. The root plan governs the migration from current holding
> paths toward persistence, verification, interface, and surface receivers.

## Ownership target

`spx/31-spec-domain.enabler` consumes the spec-tree logical foundation and
exposes cross-library composition operations that
`spx/60-surfaces.enabler` wraps:

- composition operations over spec-tree, verification, and testing providers
- interface-neutral operations shared by CLI, MCP, web API, and UI surfaces
- projection objects that surfaces render
- structured diagnostics that surfaces report

It does not own:

- node-state vocabulary or status semantics
- stale/fresh dependency semantics
- persistence schemas
- language dependency discovery
- executable evidence semantics
- CLI verbs, flags, help text, or terminal rendering

## Node-status holding area

`spx/31-spec-domain.enabler/21-node-status.enabler` remains a migration
holding area. Its logical status behavior moves to the spec-tree provider and
its status-file behavior moves to persistence. Spec-domain retains only the
composition that calls providers, accepts resolved surface options, produces
projections, and returns structured diagnostics.

## Interface model

```text
spx/60-surfaces.enabler
        ↓
spx/31-spec-domain.enabler
        ↓
spx/23-spec-tree.enabler
```

A surface consumes the intermediate composition boundary. One surface never
shells out to another.

## Next steps

1. Create the required provider nodes and review their ownership boundaries.
2. Rewrite spec-domain specs to consume provider operations.
3. Move status logic and persistence behavior to their owning providers.
4. Keep command modules thin over provider operations until their surface
   wrappers move under `spx/60-surfaces.enabler`.
