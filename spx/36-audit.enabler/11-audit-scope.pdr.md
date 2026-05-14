# Audit Domain Scope

## Purpose

This decision governs what the `spx audit` domain is responsible for and what it is not.

## Context

**Business impact:** The `typescript:auditing-typescript-tests` skill produces audit verdict XML files that require formal verification before being acted on by CI pipelines or agents. A CLI success criterion makes completion state mechanical and reproducible across agents and sessions.

**Technical constraints:** Verdict files are ephemeral artifacts produced at review time, not durable specifications. The spec tree is tracked by git and carries product truth; verdict files are gitignored local state analogous to sessions. Audit execution settings and storage defaults are resolved through the registered config descriptor system.

## Decision

The `spx audit` domain manages audit verdict artifacts:

- `spx audit verify <file>` is the formal success criterion for the `typescript:auditing-typescript-tests` skill. Exit 0 means the verdict is internally consistent and ready to act on. Exit 1 means the verdict is malformed and must be fixed before reporting.
- Verdict artifacts and audit run state are stored in `.spx/audit/{branch-slug}/` — never in the spec tree.
- The domain owns the full artifact lifecycle: create, list, archive, verify, and branch-scoped state inspection.
- Audit execution settings are read from the `audit` config descriptor in `spx.config.{toml,json,yaml}`.

## Rationale

A CLI success criterion makes the auditing skill's completion state mechanical and reproducible. Without it, "audit complete" is a judgment call that varies across agents and sessions.

Storing verdicts in `.spx/audit/{branch-slug}/` follows the same separation as sessions: the spec tree holds durable declarations; `.spx/` holds ephemeral local state. Branch scoping prevents one local audit run from contaminating another branch's evidence.

Scoping the domain to a full lifecycle enables commands such as `spx audit list` to enumerate prior audits per branch, and retention logic to prune verdicts by retention policy — analogous to `spx session archive` and `spx session prune`.

## Trade-offs accepted

| Trade-off                                                    | Mitigation / reasoning                                                                        |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Branch-scoped lifecycle is broader than verify-only behavior | Verify behavior remains the artifact consistency check inside the broader lifecycle           |
| Verdict files are not committed                              | Consistent with session design; agents that need to share verdicts pass file paths explicitly |

## Product invariants

- `spx audit verify` exit code 0 is the sole completion criterion for the `typescript:auditing-typescript-tests` skill
- Audit verdict files are never committed to the repository
- Audit state is branch-scoped under `.spx/audit/{branch-slug}`
- Audit execution settings are resolved through the registered config descriptor system

## Compliance

### MUST

- Store verdict files in `.spx/audit/{branch-slug}/` at the Git common-dir product root per `spx/15-worktree-resolution.pdr.md` ([review](../15-worktree-resolution.pdr.md))
- Accept any file path as the argument to `spx audit verify` — the command is not restricted to `.spx/audit/` contents ([review])
- Register audit configuration through the config descriptor system rather than parsing raw `spx.config.*` content in audit code ([review](../16-config.enabler/21-descriptor-registration.adr.md))

### NEVER

- Write verdict files into the `spx/` spec tree ([review])
- Treat a non-zero exit from `spx audit verify` as a silent warning — it must surface as an error ([review])
