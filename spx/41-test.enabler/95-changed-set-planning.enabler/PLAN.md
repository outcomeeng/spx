# Plan: Changed-Set Planning (`spx test --changed`)

## Harness vocabulary guard

Before applying this plan to focused agent defaults or agent-facing test planning, read `spx/12-agent-harness.pdr.md` and use its vocabulary as the authority: agent harness, configured agent, agent adapter, and agent session. Treat nearby `agent`, `runtime`, `session`, `Claude`, or `Codex` wording as lower-layer/local vocabulary until reconciled; command vocabulary such as agent-focused defaults must stay distinct from configured agents, agent adapters, and agent sessions.

## Implementation route

The spec (`changed-set-planning.md`) and resolution ADR
(`11-changed-set-resolution.adr.md`) are authored; the node is listed in
`spx/EXCLUDE` (specified, not implemented). The resolved changed-set feeds the
existing `spx/41-test.enabler/90-targeted-execution.enabler` resolver → dispatch
→ passing-scope → last-run recording pipeline as another operand source, so the
flow is test → implementation → audit gates, architecture already settled by the
ADR.

Route: `/understand` → `/contextualize
spx/41-test.enabler/95-changed-set-planning.enabler` → `/apply` → reconcile the
items below in the same change → `/merge`.

## Post-completion reconciliation (retire the intermediate state)

While `spx test --changed` does not exist, the product runs a deliberately
intermediate form: the focused agent path is explicit-node selection
(`spx test spx/<node>`), and two paths still bypass the product verb. Completing
this node MUST reconcile every item below in the same change, retiring that
intermediate form to the target:

- **Product `CLAUDE.md` running-tests STOP TRIGGER.** It names
  `spx test spx/<node>` as the focused agent default and
  `spx test --changed [--base origin/main]` as the not-yet-built target. On
  completion, make `spx test --changed` the focused agent default and demote
  explicit-node selection to the fallback for targeting a specific node. Update
  the "Run tests for work in progress" row in the "Which `spx` to invoke" table
  to match.
- **Pre-commit hook** (`src/lib/precommit/`). It drives raw Vitest on staged
  files. Point it at the changed-set path so the hook stops bypassing the
  product verb. This is the highest-value dogfood the slice unlocks — the hook
  runs on every commit.
- **`spx/41-test.enabler/ISSUES.md` dogfooding note.** It records `--changed` and
  the pre-commit hook as the remaining dogfooding gaps. On completion, mark them
  delivered and close the dogfooding gap; the only remaining raw-Vitest paths
  are then the deliberate `pnpm test` broad gate and the human `test:coverage` /
  `test:watch`.
- **`spx/EXCLUDE`.** Remove the
  `41-test.enabler/95-changed-set-planning.enabler` line so the node joins the
  quality gate.

## Deferred, optional (decide during `/apply`)

Whether to dogfood the `pnpm test` package script
(`pnpm run build && vitest run` → `spx test`) and `publish:check`'s `vitest run`
→ `spx test passing`. This is governed by `spx/13-cli.enabler` — the CLI-boundary
compliance assertion in `cli.md`, its `tests/package-scripts.compliance.l1.test.ts`,
and the invocation constants in `src/interfaces/cli/invocation.ts` — so it is an
`/apply` change there, with script edits only inside that node's workflow. It is the lowest-value dogfood
(the full-suite `pnpm test` should rarely run and is STOP-triggered for agents);
land it only if the boundary contract is being revisited anyway.
