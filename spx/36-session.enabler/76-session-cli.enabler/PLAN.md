# PLAN

## Reconcile the CLI command bindings to the CLI composition convention

[`spx/14-cli-composition.adr.md`](../../14-cli-composition.adr.md) requires every command domain's pure computation to live under `src/domains/{domain}/` with no Commander or process access, its process-agnostic I/O handlers under `src/commands/{domain}/`, and its Commander registration descriptor at `src/interfaces/cli/{domain}.ts`, with dependency flowing `interfaces/cli → commands → domains` and the composition root iterating a static descriptor registry.

The reconciliation rolls out incrementally — one descriptor relocation per PR, with the static registry introduced once every descriptor lives in the CLI-interface layer (the registry imports all of them). Each step runs through `/spec-tree:applying` with the TypeScript architecture and code audit gates.

### Done

- The `session` descriptor moved from `src/domains/session/index.ts` to `src/interfaces/cli/session.ts`; `src/cli.ts` imports it from the new location; `src/domains/session/` holds only pure modules. Behaviour and the node's `node bin/spx.js` evidence are unchanged.

### Remaining

- Relocate the remaining descriptors to `src/interfaces/cli/{domain}.ts`: `claude` (its `src/domains/claude/` holds only the descriptor), `config`, `spec`, and `validation`. `audit` is the exception — it has no `src/commands/audit/` tier, so its reconciliation also creates that tier and extracts the handler logic (`runVerifyCommand`) out of `src/domains/audit/cli.ts`, leaving the domain layer pure.
- Introduce the static descriptor registry in the CLI-interface layer once every descriptor lives there, switch `src/cli.ts` to register domains by iterating it instead of naming each by hand, and remove the dead `src/domains/registry.ts` (the imperative Map the static registry replaces).
- Move process-boundary writes out of the command handlers into the descriptors — for example, `src/commands/session/handoff.ts:123` returns its warning text for the descriptor to emit instead of calling `process.stderr.write`.

Remove this note once every descriptor lives under `src/interfaces/cli/`, the static registry drives the composition root, and no command handler carries a process-boundary write.
