# Plan: Atomic File Write

The ADR (`21-atomic-file-write.adr.md`) declares that every atomic file replacement in the product routes through `writeFileAtomic`. The primitive and its tests land first; the call-site migrations follow as separate PRs.

## Landed

- `src/lib/atomic-file-write.ts` primitive (`writeFileAtomic`, `atomicWriteTempPath`) over an injected filesystem and `node:crypto` random-bytes source.
- Co-located property/scenario/compliance tests and the `@testing/harnesses/atomic-file-write` recording harness.

## Pending call-site migration

- Route `src/lib/claude/settings/writer.ts` through `writeFileAtomic` — removes its `Math.random` temp suffix (SonarQube `typescript:S2245`) and its `os.tmpdir()` cross-device rename. Update its co-located tests in the agent-environment node.
- Route `src/validation/literal/allowlist-existing.ts` `productionWriter` through `writeFileAtomic` — removes its `Math.random` temp suffix (`typescript:S2245`). Update its co-located tests.
- Route `src/domains/worktree/occupancy-store.ts` `writeClaim` through `writeFileAtomic`, dropping the `claimWriteToken` threading through `src/domains/worktree/claim.ts`, `src/commands/worktree/claim.ts`, `src/interfaces/cli/worktree.ts`, `src/interfaces/cli/hook.ts`, `src/interfaces/hooks/{cli-runner,session-start}.ts`, and `src/lib/worktree-claim-write-token.ts`. Reconcile the occupancy-store spec node's `claimTempFilePath`/`writeToken` assertions and the `testing/generators/worktree/worktree.ts` generator. This migration consolidates the `RandomBytes` type onto `src/lib/atomic-file-write.ts` and removes the duplicate export from `src/lib/worktree-claim-write-token.ts`, so a single canonical `RandomBytes` remains.

Route per migration: `/contextualize <owning-node>` → `/apply` (whole-changeset audit gates, since each reroute is cross-node) → `/merge`.
