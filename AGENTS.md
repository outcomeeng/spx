# Agent guide

Before any other step, read methodology 4.0 in the main checkout of the methodology repository, `/Users/shz/Code/outcomeeng/methodology/methodology/versions/4.0/methodology/`, starting at `index.md`. Pull that checkout before you read it. Methodology 4.0 governs all work in this repository.

Run `/hold-position resume` when a session starts, and `/hold-position hand-off` before its context is cleared. Use no other installed skill. Where a skill and methodology 4.0 differ, methodology 4.0 holds.

A Position stops working only to hand off, or for an answer it cannot settle itself. Before it stops, it mails its overseer.

Work is done only when it is merged into `main` on origin.

## Product commands

- `pnpm run validate` — source validation; for a Markdown-only changeset, `tsx src/cli.ts validation markdown <paths>`
- `pnpm run build` — builds `dist/`, which the CLI level-2 tests run
- `spx test --agent --changed --base origin/main` — tests of the changed scope; `tsx src/cli.ts test --agent --changed --base origin/main` when the change touches `spx test` itself
- `tsx src/cli.ts verification test run` then `tsx src/cli.ts spec status --update --check` — the full suite and status-projection check CI runs
