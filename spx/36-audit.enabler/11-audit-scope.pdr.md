# Audit Domain Scope

`spx audit` runs the configured auditor agents over the current branch's target files and records each run as branch-scoped local evidence — a terminal verdict (approved, rejected, failed, or interrupted) together with the run's history — that `spx audit` list and status commands inspect without re-running the auditors. Audit evidence stays local: it is never written to the spec tree and never committed.

## Rationale

Branch-scoping aligns audit evidence with the reviewable unit, so one branch's runs never contaminate another's, and keeping the evidence local and uncommitted keeps verdicts out of the repository, diffs, and pull requests — an agent that needs to share a verdict resolves it from the recorded run rather than a tracked file. Recording each run as inspectable history lets list and status report the latest verdict and surface incomplete runs without paying to re-run the auditors. A run's scope is read from product configuration so auditors, targets, and base ref are configurable rather than fixed.

## Product properties

1. An audit run records a terminal verdict — approved, rejected, failed, or interrupted — that list and status inspect without re-running the auditors.
2. Audit history is isolated per branch — an audit surfaces only the current branch's runs, never another branch's.
3. Audit evidence stays local — it is never committed, so it never appears in the repository, a diff, or a pull request.

## Verification

### Audit

- ALWAYS: `spx audit` runs the configured auditors over the current branch's target files and records the run as inspectable local evidence ([audit])
- ALWAYS: list, status, and latest-run views render from recorded run history without re-running the auditors ([audit])
- NEVER: write audit evidence into the `spx/` spec tree ([audit])
- NEVER: commit audit evidence — audit runs are local branch-scoped state ([audit])
