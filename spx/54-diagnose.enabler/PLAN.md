# Plan: Diagnose

## Landed

The deterministic engine — manifest parsing with availability and conditional-fact validation, the verdict fold and exit-code map, report rendering in text and JSON, and the check registry — and all five checks: `spx-reachability`, `session-environment`, `worktree-pool`, `session-store`, and `marketplace-install`. Each is a child enabler beside the others with a pure verdict classifier (unit-tested against its verdict table) and a default probe wired into the descriptor's registry; an l2 scenario runs the whole check set through the built CLI.

`src/domains/diagnose/manifest.ts` `CHECK_NAME` declares the check vocabulary, and `13-diagnose-engine.adr.md` governs the engine that runs only the checks the build's registry provides.

## Probe heuristics to refine

The classifiers are exact (the contract); the default probes in `src/interfaces/cli/diagnose-probes.ts` gather readings best-effort and degrade to unknown on failure. Two read surfaces whose precise shape is runtime-specific and worth confirming against the real environment:

- `session-environment` detects the SessionStart hook by the presence of an agent-session env var (`CLAUDE_SESSION_ID` / `CODEX_THREAD_ID`); a runtime that ships the hook under a different signal would need that signal added.
- `marketplace-install` reads `claude plugin marketplace list` and `claude plugin list` by substring over the marketplace name/source and the expected plugin names; a stricter offered-version comparison would parse each CLI's structured output.

## Remaining

Publish an `@outcomeeng/spx` release exposing `spx diagnose`, then the consuming plugins repository advances its `REQUIRED_SPX_VERSION` floor and rewires its diagnose skill to a thin invoker (its own session tracks that work).
