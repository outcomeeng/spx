# PLAN

## Reconcile the session command binding to the CLI composition convention

[`spx/14-cli-composition.adr.md`](../../14-cli-composition.adr.md) requires every command domain's pure computation to live under `src/domains/{domain}/` with no Commander or process access, its process-agnostic I/O handlers under `src/commands/{domain}/`, and its Commander registration descriptor at `src/interfaces/cli/{domain}.ts`, with dependency flowing `interfaces/cli → commands → domains` and the composition root iterating a static descriptor registry.

`src/domains/session/index.ts`, the Commander registration descriptor that backs this node, sits in the domain layer: it imports the command handlers from `@/commands/session/index`, performs process I/O (`process.stdin`, `process.exit`), and owns the Commander wiring. It is the only module under `src/domains/session/` that carries Commander or process coupling — every other module in the directory is pure.

Reconcile by relocating the descriptor to `src/interfaces/cli/session.ts` and registering it through the static descriptor registry, leaving `src/domains/session/` holding only pure modules. The node's observable behaviour and its `node bin/spx.js` evidence are unaffected by the move — only the module's location and import direction change. Resolve through `/spec-tree:applying` with the TypeScript architecture and code audit gates, and remove this note in the same change.

The reconciliation is one instance of the product-wide convention: the same relocation applies to every domain's descriptor — `session` here, and likewise `audit`, `claude`, `config`, `spec`, and `validation` — and the dead `src/domains/registry.ts` is replaced by the static descriptor registry in the CLI-interface layer.
