# Plan: Diagnose

## Landed

The deterministic engine — manifest parsing with availability and conditional-fact validation, the verdict fold and exit-code map, report rendering in text and JSON, and the check registry — and all five checks: `spx-reachability`, `session-environment`, `worktree-pool`, `session-store`, and `marketplace-install`. Each is a child enabler beside the others with a pure verdict classifier (unit-tested against its verdict table) and a default probe wired into the descriptor's registry; an l2 scenario runs the whole check set through the built CLI.

`src/domains/diagnose/manifest.ts` `CHECK_NAME` declares the check vocabulary, and `13-diagnose-engine.adr.md` governs the engine that runs only the checks the build's registry provides.

Dual-mode invocation: `spx diagnose` runs bare (`/doctor`-style) by resolving its diagnostic facts from the `diagnose` section of `spx.config` and per-check safe defaults, or fully instrumented through an explicit `--manifest` that overrides configuration, per `11-invocation-modes.pdr.md`. The `diagnose` config descriptor lives at `src/domains/diagnose/config.ts` (registered in `src/config/registry.ts`), the shared fact validators at `src/domains/diagnose/facts.ts`, and the precedence resolver at `src/domains/diagnose/resolve.ts`; `--manifest` is optional and resolves manifest → config → defaults. `spx-reachability` reports presence and version when no floor is configured (the `present` verdict), and `marketplace-install` reports not-applicable when its facts are absent.

`@outcomeeng/spx@0.6.2` is published exposing the working `spx diagnose` (CI OIDC Trusted Publishing on the `v0.6.2` tag).

## Remaining

### Downstream plugin rewire

The consuming plugins repository advances its `REQUIRED_SPX_VERSION` floor to 0.6.2 and rewires its diagnose skill to a thin invoker of `spx diagnose`. Its own session tracks that work.
