# Plan: Audit domain collapses into the generic `journal` domain

> Central restructure context: `spx/15-agent-run-journal.enabler/PLAN.md`. Read it first.
> Details are settled during execution, not pre-fixed here.

## What happens to this domain

`spx/36-audit.enabler` is **removed**. spx does not orchestrate agentic verification —
agents call spx. So there is no `spx audit` subcommand and no audit-aware code in spx. The
run-journal mechanics this subtree built are not audit-specific; they generalize into the
type-agnostic `journal` domain (verbs `open`/`append`/`read --from <cursor>`/`seal`/
`render`, backend bound at the edge, run scope `.spx/branch/<slug>/<type>/...`).

Node-by-node disposition (confirm exact moves during `/refactor`):

- `65-auditor-execution.enabler` — **delete.** Its premise (spx spawns auditors
  hermetically) is void: spx never spawns or calls agents.
- `43-audit-config.enabler` (auditors, target filters, base ref) — **delete from spx.**
  Which sub-agents run and over what targets is the calling skill/agent's concern, not
  spx's.
- `76-audit-cli.enabler` (`spx audit init/progress/close/status`) — **delete.** Replaced by
  the generic `journal` verbs. Reconcile the lifecycle shape into the generic verbs when
  authoring `journal`.
- `87-audit-status.enabler` — **delete.** Status/list become `journal render` projections.
- `54-branch-run-state.enabler` — its `AuditRunState` event-journal + projection fold +
  terminal seal + branch-scope run files are the **generic** run-state model. **Migrate**
  the mechanics into `journal`, dropping the audit identity (auditors/targets). This is the
  one subtree whose substance survives, generalized.
- `21-audit-test-harness.enabler` — re-home or generalize as the `journal` test harness.
- `15-audit-directory.adr.md`, `11-audit-scope.pdr.md`, `21-audit-module-structure.adr.md`
  — superseded by the spx `verification`/`journal` decisions realizing the plugin's
  `13-run-journal.adr.md`. Carry forward only the generic guarantees (event-journal sole
  source of truth, seal, branch-scope, state-store path sourcing).

## Why (do not re-derive)

See central PLAN. Governing truth: the plugin repo's
`spx/21-spec-tree.enabler/16-verification.enabler/13-run-journal.adr.md` (run-journal
channel, backend at edge) and `16-verification.enabler/PLAN.md` (spx owns the journal +
backends + verbs). spx is the channel; the verification type is an opaque parameter.

## ISSUES.md

The symlink/mkdir and repeated-walk follow-ups tracked in this node's `ISSUES.md` pertain
to the run-state filesystem mechanics that migrate into `journal`; carry the still-relevant
ones forward to the `journal` node when migrating, drop those tied to removed audit code.
