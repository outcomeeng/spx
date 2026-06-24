# Plan: Diagnose

## Landed

The deterministic engine — manifest parsing with availability and conditional-fact validation, the verdict fold and exit-code map, report rendering in text and JSON, and the check registry — and all five checks: `spx-reachability`, `session-environment`, `worktree-pool`, `session-store`, and `marketplace-install`. Each is a child enabler beside the others with a pure verdict classifier (unit-tested against its verdict table) and a default probe wired into the descriptor's registry; an l2 scenario runs the whole check set through the built CLI.

`src/domains/diagnose/manifest.ts` `CHECK_NAME` declares the check vocabulary, and `13-diagnose-engine.adr.md` governs the engine that runs only the checks the build's registry provides.

Dual-mode invocation: `spx diagnose` runs bare (`/doctor`-style) by resolving its diagnostic facts from the `diagnose` section of `spx.config` and per-check safe defaults, or fully instrumented through an explicit `--manifest` that overrides configuration, per `11-invocation-modes.pdr.md`. The `diagnose` config descriptor lives at `src/domains/diagnose/config.ts` (registered in `src/config/registry.ts`), the shared fact validators at `src/domains/diagnose/facts.ts`, and the precedence resolver at `src/domains/diagnose/resolve.ts`; `--manifest` is optional and resolves manifest → config → defaults. `spx-reachability` reports presence and version when no floor is configured (the `present` verdict), and `marketplace-install` reports not-applicable when its facts are absent.

`@outcomeeng/spx@0.6.2` is published exposing the working `spx diagnose` (CI OIDC Trusted Publishing on the `v0.6.2` tag).

## Remaining

### Downstream plugin rewire

The consuming plugins repository advances its `REQUIRED_SPX_VERSION` floor to 0.6.2 and rewires its diagnose skill to a thin invoker of `spx diagnose`. Its own session tracks that work.

### Re-architect the worktree probes to one in-memory snapshot, with reality-anchored tests

Keep this separate from the running/free vocabulary collapse (already landed) and from check-reliability hardening, which is explicitly deferred — this is a structure-and-test-strategy concern, not a correctness one.

**Problem.** Each worktree-touching check — `worktree-pool`, `session-environment`, `session-store` — gathers occupancy independently, and `worktree-pool` spawned `spx worktree status` per worktree, forking a whole CLI per pool member. That made `spx diagnose` fork a process per worktree and turned the l2 E2E suite into a subprocess storm under Vitest worker concurrency. A contained fix has landed: the `worktree-pool` probe now reads each claim in-process (mirroring `claimedSessionIds` in the same file), so no per-worktree CLI fork. The `session-environment` and `session-store` probes still shell `spx`/`git` once each; folding them into the shared gather is the remaining work.

**Re-architecture.** One in-process gather pass parses the worktree/occupancy state once into a single `WorktreePoolSnapshot` data structure — bare?, linked?, and per-worktree `{ name, status }` from in-process `readClaim` + `classifyOccupancy` — and all three checks classify over that one snapshot. One parse of reality, many pure classifications. This changes the probe-gather contract, so it needs an ADR.

**Test strategy — break the author-introspection illusion.** The current l1 mapping tests feed the pure classifiers synthetic `Reading` structs the author invented, so they verify the code against the author's own model and are blind exactly at the reality→structure seam: nothing checks whether the real probe ever produces the `Reading`s that were enumerated, nor whether the probe maps reality→structure correctly. The discipline that breaks the circularity:

- generate the raw inputs (claim bytes, process-table states, captured `git worktree list` output) and run the real gather + classify over them, not author-picked `Reading`s;
- anchor the parse layer to captured real artifacts, materializing a real pool sparingly;
- use spec-derived metamorphic properties as the oracle — adding a dead claim never degrades a healthy verdict; a free worktree never degrades the pool;
- one snapshot type emitted by both the parser and the generator, with a property that every parser-emitted snapshot classifies into a valid verdict.

This mirrors the spec domain: it builds spec-tree node structures as data via the `@testing/generators/...` arbitraries and materializes only some trees on disk (e.g. `withWorktreeLayoutEnv`), so the bulk of coverage runs over generated data while a thin set of tests materialize reality to pin the parse.
