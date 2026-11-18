# Agent guide

Before any other step, read methodology 4.0 in the main checkout of the methodology repository, `/Users/shz/Code/outcomeeng/methodology/methodology/versions/4.0/methodology/`, starting at `index.md`. Pull that checkout before you read it. Methodology 4.0 governs all work in this repository.

Run `/hold-position resume` when a session starts, and `/hold-position hand-off` before its context is cleared. Use no other installed skill, except the skills that carry a Change, `product-tree:author-change`, `product-tree:manage-change`, `product-tree:apply-change` and `product-tree:merge`, with every skill they invoke, and the pane skills an overseer uses to read, prompt, clear and resume the panes of the Positions it oversees: `coding-agents:operate-prowl` and `coding-agents:operate-herdr`. Where a skill and methodology 4.0 differ, methodology 4.0 holds.

Until https://github.com/outcomeeng/changes/issues/944 closes Applied, spx writes no Audit File, so CI keeps each Audit entry that has no Audit File on its pin. From 944's close on, the gate fails each Audit entry without an Audit File, as methodology 4.0 states.

When a Position needs an answer from the Operator and the orchestration file sets `operator_available = true`, it asks through AskUserQuestion. This holds however many earlier questions the Operator dismissed.

A Position stops working only to hand off, or for an answer it cannot settle itself. Before it stops, it asks the Operator through AskUserQuestion when the orchestration file sets `operator_available = true`, and otherwise mails its overseer.

Until further notice, the SPX Advisor takes the Roles of Auditor and Reviewer: it carries out every Audit and every Review in this repository. Before each Audit or Review, it reads the whole of methodology 4.0.

Work is done only when it is merged into `main` on origin.

## Product commands

- `pnpm run validate` — source validation; for a Markdown-only changeset, `tsx src/cli.ts validation markdown <paths>`
- `pnpm run build` — builds `dist/`, which the CLI level-2 tests run
- `spx test --agent --changed --base origin/main` — tests of the changed scope; `tsx src/cli.ts test --agent --changed --base origin/main` when the change touches `spx test` itself
- `tsx src/cli.ts verification test run` then `tsx src/cli.ts spec status --update --check` — the full suite and status-projection check CI runs
