# Plan: Diagnose

## Foundation (landed)

The deterministic engine — manifest parsing with availability and conditional-fact validation, the verdict fold and exit-code map, report rendering in text and JSON, and the check registry — plus the first check, `spx/54-diagnose.enabler/43-spx-reachability.enabler`, with its real PATH/version probe and CLI descriptor wired into the command registry.

## Remaining checks (follow-up slices)

`src/domains/diagnose/manifest.ts` `CHECK_NAME` declares the full check vocabulary, and `13-diagnose-engine.adr.md` governs the engine that runs only the checks the build's registry provides, so a manifest naming an unbuilt check is rejected at the parse boundary. Each remaining check needs a child enabler node beside `43-spx-reachability.enabler`, a pure verdict function over its injected readings, and a runner registered in `DEFAULT_REGISTRY`:

- `session-environment` — the `SessionStart`-hook round-trip (working / identity-only / silent-no-op / unknown / not-applicable).
- `worktree-pool` — `git worktree list` joined to `spx worktree status` occupancy (compliant / stale-claims / non-compliant / unknown).
- `session-store` — `spx session list` joined to the worktree occupancy backing each doing claim (consistent / orphaned-claims / unknown).
- `marketplace-install` — the `claude plugin` / `codex plugin` surfaces, offered-against-enabled (installed / drifted / unregistered / not-applicable / unknown). The manifest already carries the `marketplace` and `expected_plugins` facts and validates them when this check is selected; the runner and node are pending.

## After the checks land

Publish an `@outcomeeng/spx` release exposing `spx diagnose`, then the consuming plugins repository advances its `REQUIRED_SPX_VERSION` floor and rewires its diagnose skill to a thin invoker (its own session tracks that work).
