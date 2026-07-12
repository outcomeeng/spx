# Plan: surfaces restructuring

> **Reconcile against `spx/PLAN.md` first.** This note carries only surface-layer coordination. Product truth remains in specs and decisions; this file only points to node-local plans that sessions must reconcile before acting.

`spx/60-surfaces.enabler` owns concrete product interaction surfaces: CLI, API, MCP, web frontend, and other interaction boundaries. A surface node owns surface contracts — command or operation names, option or protocol grammar, help, rendering, defaults, output modes, and invocation diagnostics. Interface contracts remain interface-owned consumption contracts that surfaces adapt or expose. Interface-neutral semantics, persistence, delivery, backend adapters, composition operations, and domain-library behavior stay with their owning lower-index nodes.

## Child coordination

| Path                                                                                           | Purpose                                                                                                                                 |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `spx/60-surfaces.enabler/21-cli-surface.enabler/PLAN.md`                                       | CLI command-surface governance, command-family organization, verification-run command shape, and journal-surface correction.            |
| `spx/60-surfaces.enabler/21-cli-surface.enabler/15-command-surface-governance.enabler/PLAN.md` | Shared public command vocabulary and command-surface enforcement child grouping.                                                        |
| `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler/PLAN.md`               | Verification command-family child structure: record-run and execute-run.                                                                |
| API surface                                                                                    | Add when an API interaction boundary needs its own durable surface node for protocol grammar, operation exposure, and defaults.         |
| MCP surface                                                                                    | Add when an MCP interaction boundary needs its own durable surface node for operation grammar, tool or resource exposure, and defaults. |
| Web frontend surface                                                                           | Add when a web frontend interaction boundary needs its own durable surface node for visual interaction and presentation behavior.       |

## Boundary notes

- CLI-surface work is the concrete surface restructuring named here; use `spx/60-surfaces.enabler/21-cli-surface.enabler/PLAN.md` for details.
- The journal node under the CLI surface is a catalyst misplacement; its node-local note remains at `spx/60-surfaces.enabler/21-cli-surface.enabler/21-journal.enabler/PLAN.md`.
- Do not create placeholder surface children for API, MCP, or web frontend without a concrete surface contract.
