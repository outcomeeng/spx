# Plan: verify command

## Harness vocabulary alignment

Before applying this plan, read `spx/12-agent-harness.pdr.md` and use its vocabulary as the authority: agent harness, agent, agent adapter, and agent session. Treat nearby `agent`, `runtime`, `session`, `Claude`, or `Codex` wording as lower-layer/local vocabulary until reconciled; every touched spec, command text, source name, test, and pickup prompt names the precise harness role it describes.

`spx/12-agent-harness.pdr.md` includes top-level domains that journal verification runs executed by coding agents. Align this node's specs, verify lifecycle vocabulary, and verification-run vocabulary so the run journal is described as evidence for verification runs executed by agents, distinct from agent sessions, agent adapters, and SPX handoff session files. Keep CLI command names, help text, rendering, and bounded-output rules out of this library node; the `spx verify` and `spx journal` command surfaces live under `spx/60-surfaces.enabler/21-cli-surface.enabler`.

1. Apply `spx/34-verification.enabler/32-verify.enabler/43-terminal-projection.enabler`: add tests for `finish`, `status`, `render`, sealed review finding counts, and terminal run-token output; implement terminal status validation, run sealing, resumable status, and journal projection.
2. Apply the parent `spx/34-verification.enabler/32-verify.enabler` cross-lifecycle assertions: lock the full verb mapping and the journal-event boundary, then remove the parent and child entries from `spx/EXCLUDE` as their implementations begin passing.
3. Wire review-run callers to `spx verify --verification-type review --scope-type changeset --scope <base>..<head> [--input <input-source>] [--run <run-token>] [--payload <payload-source>] [--idempotency-key <key>] [--terminal-status <status>] <verb>` and remove wrapper-owned journal-event construction.
4. Keep prompt wording changes separate from the CLI-interface slice; the command contract is the durable interface that prompt cleanup consumes.
