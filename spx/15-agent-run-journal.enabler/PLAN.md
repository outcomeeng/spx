# Plan: Agent run journal

> **Reconcile against `spx/PLAN.md` first.** The corrected model renames "materialization" → `backend`, separates `persistence` (records / journals / snapshots) from `backend` and `delivery`, makes verification the five types that *consume* the journal (never contain it), names `spx verification run` the SPX projection/validation home, requires additive migration (never a wholesale move), defers `.surface`, and builds the changes domain first. Where this note predates that model, the root plan governs.

## Harness vocabulary alignment

Before applying this plan, read `spx/12-agent-harness.pdr.md` and use its vocabulary as the authority: agent harness, agent, agent adapter, and agent session. Treat nearby `agent`, `runtime`, `session`, `Claude`, or `Codex` wording as lower-layer/local vocabulary until reconciled; every touched spec, command text, source name, test, and pickup prompt names the precise harness role it describes.

`spx/12-agent-harness.pdr.md` distinguishes agents, agent adapters, and agent sessions from verification-run identity. Align this node's specs, journal event vocabulary, and projection text so run records identify the agent-related subject they describe without collapsing verification runs into agent sessions.
