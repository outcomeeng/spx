# Plan: verify command

> **Reconcile against `spx/PLAN.md` first.** The corrected model renames "materialization" → `backend`, separates `persistence` (records / journals / snapshots) from `backend` and `delivery`, makes verification the five types that *consume* the journal (never contain it), names `spx verification run` the SPX projection/validation home, requires additive migration (never a wholesale move), defers `.surface`, and builds the changes domain first. Where this note predates that model, the root plan governs.

## Harness vocabulary alignment

Before applying this plan, read `spx/12-agent-harness.pdr.md` and use its vocabulary as the authority: agent harness, agent, agent adapter, and agent session. Treat nearby `agent`, `runtime`, `session`, `Claude`, or `Codex` wording as lower-layer/local vocabulary until reconciled; every touched spec, command text, source name, test, and pickup prompt names the precise harness role it describes.

`spx/12-agent-harness.pdr.md` includes top-level domains that journal verification runs executed by coding agents. Align this node's specs, verify lifecycle vocabulary, and verification-run vocabulary so the run journal is described as evidence for verification runs executed by agents, distinct from agent sessions, agent adapters, and SPX handoff session files. Keep CLI command names, help text, rendering, and bounded-output rules out of this library node; the `spx verification run` and `spx journal` command surfaces live under `spx/60-surfaces.enabler/21-cli-surface.enabler`.

1. Apply the parent `spx/34-verification.enabler/32-verify.enabler` cross-lifecycle assertions: lock the full operation mapping and the journal-event boundary, extend the existing-run scope-type and changeset-scope validation uniformly to the `input`, evidence-scope-add, and evidence-finding-add operations (the finish, status, and render operations already validate through `resolveExistingRun`), add the `spx verification run` descriptor's L2 CLI test for stdin and Commander wiring, then remove the parent entry from `spx/EXCLUDE` as its implementation begins passing.
2. Continue under `spx/34-verification.enabler/32-verify.enabler/PLAN.md`. That child plan owns the next expansion: run-set orchestration for repeated runs with expanding scope, and same-index type-specific placeholders for `review` and `audit`.
3. Keep prompt wording changes separate from the CLI-interface slice; the command contract is the durable interface that prompt cleanup consumes.
