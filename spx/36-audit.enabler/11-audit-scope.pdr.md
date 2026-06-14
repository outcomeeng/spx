# Audit Domain Scope

The `spx audit` domain manages the full lifecycle of the audit verdict artifacts that auditing skills produce — create, list, archive, verify, and branch-scoped state inspection — with `spx audit verify <file>` as the formal success criterion: exit 0 means the verdict is internally consistent and ready to act on, exit 1 means it is malformed and must be fixed. Verdict artifacts and run state are stored under `.spx/branch/{branch-slug}/audit/`, never in the spec tree.

## Rationale

A CLI success criterion makes the auditing skill's completion state mechanical and reproducible — without it, "audit complete" is a judgment call that varies across agents and sessions. Storing verdicts in `.spx/branch/{branch-slug}/audit/` follows the same separation as sessions: the spec tree holds durable declarations, `.spx/` holds ephemeral local state, and branch scoping prevents one local audit run from contaminating another branch's evidence. Scoping the domain to the full artifact lifecycle (not verify alone) lets commands such as `spx audit list` enumerate prior audits per branch and prune them from branch-scoped local state, analogous to `spx session archive` and `spx session prune`; verify behavior remains the artifact-consistency check inside that broader lifecycle, and because verdict files are not committed, agents that need to share a verdict pass its file path explicitly.

## Product properties

1. `spx audit verify` exit code 0 is the sole completion criterion for the `typescript:auditing-typescript-tests` skill.
2. Audit history is isolated per branch — an audit surfaces only the current branch's verdicts, never another branch's.
3. Audit verdict artifacts stay local: they are never committed, so they never appear in the repository, a diff, or a pull request.

## Verification

### Audit

- ALWAYS: store verdict files in `.spx/branch/{branch-slug}/audit/` at the Git common-dir product root per `spx/15-worktree-management.pdr.md` ([audit])
- ALWAYS: accept any file path as the argument to `spx audit verify` — the command is not restricted to `.spx/branch/{branch-slug}/audit/` contents ([audit])
- NEVER: write verdict files into the `spx/` spec tree ([audit])
- NEVER: treat a non-zero exit from `spx audit verify` as a silent warning — it must surface as an error ([audit])
