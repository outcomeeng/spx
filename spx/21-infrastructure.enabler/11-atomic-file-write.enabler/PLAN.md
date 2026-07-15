# Plan: Atomic File Write

The ADR (`21-atomic-file-write.adr.md`) declares that every atomic file replacement in the product routes through `writeFileAtomic`. The primitive and its tests land first; the call-site migrations follow as separate PRs.

## Landed

- `src/lib/atomic-file-write.ts` primitive (`writeFileAtomic`, `atomicWriteTempPath`) over an injected filesystem and `node:crypto` random-bytes source.
- Co-located property/scenario/compliance tests and the `@testing/harnesses/atomic-file-write` recording harness.

## Landed call-site migration

- Route `src/validation/literal/allowlist-existing.ts` `productionWriter` through `writeFileAtomic` — removes its `Math.random` temp suffix (`typescript:S2245`). Update its co-located tests.
- Route `src/domains/worktree/occupancy-store.ts` `writeClaim` through `writeFileAtomic`, with claim writes receiving the shared `RandomBytes` type from `src/lib/atomic-file-write.ts`. Reconcile the occupancy-store spec node and worktree generator around injected random bytes, so a single canonical `RandomBytes` remains.
