# Plan: surfaces restructuring

> **Reconcile against `spx/PLAN.md` first.** This note carries only surface-layer coordination. Product truth remains in specs and decisions; this file only points to node-local plans that a future session must reconcile before acting.

`spx/60-surfaces.enabler` owns product interaction surfaces: CLI, API, MCP, web frontend, and future concrete interfaces. A surface node owns interface contracts — command or operation names, option or protocol grammar, help, rendering, defaults, output modes, and invocation diagnostics. Interface-neutral semantics, persistence, delivery, backend adapters, use-case orchestration, and domain-library behavior stay with their owning lower-index nodes.

## Child coordination

| Path                                                                                            | Purpose                                                                                                                              |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `spx/60-surfaces.enabler/21-cli-surface.enabler/PLAN.md`                                        | CLI command-surface governance, command-family organization, verification-run command shape, and current journal-surface correction. |
| `spx/60-surfaces.enabler/21-cli-surface.enabler/15-command-surface-governance.enabler/PLAN.md`  | Shared public command vocabulary and command-surface enforcement child grouping.                                                     |
| `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification-command-family.enabler/PLAN.md` | Verification-run command-family child grouping.                                                                                      |
| Future API surface                                                                              | Add only when an API interface contract needs its own durable surface node.                                                          |
| Future MCP surface                                                                              | Add only when an MCP operation contract needs its own durable surface node.                                                          |
| Future web frontend surface                                                                     | Add only when a web frontend contract needs its own durable surface node.                                                            |

## Boundary notes

- CLI-surface work is the only concrete surface restructuring currently named here; use `spx/60-surfaces.enabler/21-cli-surface.enabler/PLAN.md` for details.
- The journal node under the CLI surface is a transitional catalyst misplacement; its node-local note remains at `spx/60-surfaces.enabler/21-cli-surface.enabler/21-journal.enabler/PLAN.md`.
- Do not create placeholder surface children for API, MCP, or web frontend until a concrete interface contract exists.
