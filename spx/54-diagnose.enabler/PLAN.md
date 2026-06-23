# Plan: Diagnose

## Landed

The deterministic engine — manifest parsing with availability and conditional-fact validation, the verdict fold and exit-code map, report rendering in text and JSON, and the check registry — and all five checks: `spx-reachability`, `session-environment`, `worktree-pool`, `session-store`, and `marketplace-install`. Each is a child enabler beside the others with a pure verdict classifier (unit-tested against its verdict table) and a default probe wired into the descriptor's registry; an l2 scenario runs the whole check set through the built CLI.

`src/domains/diagnose/manifest.ts` `CHECK_NAME` declares the check vocabulary, and `13-diagnose-engine.adr.md` governs the engine that runs only the checks the build's registry provides.

## Remaining

### Dual-mode invocation (prerequisite to publish)

`spx diagnose` must run in two modes plus graceful degradation, so a user runs it bare (`/doctor`-style) and a plugin drives it with an explicit manifest:

- **User mode (bare `spx diagnose`):** resolve the diagnostic facts (`spx_floor`, `marketplace`, `expected_plugins`, `checks`) from a new `diagnose` config descriptor in `spx.config.{toml,json,yaml}` under `spx/16-config.enabler`, per the product principle that configuration comes through `spx.config` rather than ad hoc files.
- **Plugin mode (`--manifest <path>`):** an explicit manifest overrides config. `--manifest` becomes optional; precedence is manifest → config → safe defaults.
- **No config and no manifest:** every check still runs with safe defaults — `spx-reachability` reports presence and version with no floor comparison, `marketplace-install` reports not-applicable, and `session-environment` / `worktree-pool` / `session-store` run normally; a check carries actionable remediation only where no default can apply. Bare `spx diagnose` never errors with a bare required-option message.

This needs: a PDR on `spx/54-diagnose.enabler` declaring the dual-mode + safe-default contract; a `diagnose` config descriptor under `spx/16-config.enabler`; the descriptor (`--manifest` optional, config resolution, precedence), the manifest contract (facts optional per check), and the per-check classifiers degrading gracefully when a fact is absent; and `diagnose.md` assertions for the two modes and the safe-default behavior. Route through `/contextualize spx/54-diagnose.enabler` and `/contextualize spx/16-config.enabler` → `/author` (PDR + spec + descriptor spec) → `/apply` → `/pr` → `/merge`.

### Publish (after dual-mode lands)

Publish an `@outcomeeng/spx` release exposing the working `spx diagnose`, then the consuming plugins repository advances its `REQUIRED_SPX_VERSION` floor and rewires its diagnose skill to a thin invoker (its own session tracks that work). The publish is outward-facing and needs operator authorization.
