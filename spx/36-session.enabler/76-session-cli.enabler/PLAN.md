# PLAN

## Reconcile the session command binding to the domain–command split

[`spx/36-session.enabler/32-domain-command-split.adr.md`](../32-domain-command-split.adr.md) requires every module under `src/domains/session/` to be pure domain logic — no import from `src/commands/session/`, no direct filesystem or process access — and names the command handlers under `src/commands/session/` as the sole site of I/O.

`src/domains/session/index.ts`, the Commander registration descriptor that backs this node, is in violation of that rule once the ADR names `src/domains/session/` as the domain layer: it imports the command handlers from `@/commands/session/index`, performs process I/O (`process.stdin`, `process.exit`), and owns the Commander wiring. It is the only module under `src/domains/session/` that violates the split — every other module in the directory is pure.

Reconcile by relocating the Commander binding and the registration descriptor out of `src/domains/session/` into the command/CLI layer, leaving `src/domains/session/` holding only pure modules. The node's observable behaviour and its `node bin/spx.js` evidence are unaffected by the move — only the module's location and import direction change. Resolve through `/spec-tree:applying` with the TypeScript architecture and code audit gates, and remove this note in the same change.
