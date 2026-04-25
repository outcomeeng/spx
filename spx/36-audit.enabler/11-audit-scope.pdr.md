# Audit Domain Scope

## Purpose

This decision governs what the `spx audit` domain is responsible for and what it is not.

## Context

**Business impact:** The `typescript:auditing-typescript-tests` skill produces audit verdict XML files that require formal verification before being acted on by CI pipelines or agents. A CLI success criterion makes completion state mechanical and reproducible across agents and sessions.

**Technical constraints:** Verdict files are ephemeral artifacts produced at review time, not durable specifications. The spec tree is tracked by git and carries product truth; verdict files are gitignored local state analogous to sessions.

## Decision

The `spx audit` domain manages audit verdict artifacts:

- `spx audit verify <file>` is the formal success criterion for the `typescript:auditing-typescript-tests` skill. Exit 0 means the verdict is internally consistent and ready to act on. Exit 1 means the verdict is malformed and must be fixed before reporting.
- Verdict artifacts are stored in `.spx/nodes/{encoded-node-path}/` — never in the spec tree.
- The domain will expand to own the full artifact lifecycle: create, list, archive, verify. The current scope is verify only.

## Rationale

A CLI success criterion makes the auditing skill's completion state mechanical and reproducible. Without it, "audit complete" is a judgment call that varies across agents and sessions.

Storing verdicts in `.spx/nodes/` follows the same separation as sessions: the spec tree holds durable declarations; `.spx/` holds ephemeral local state. A verdict file placed in the spec tree would appear as an untracked spec-tree artifact, confuse validation tooling, and pollute commits.

Scoping the domain to a full lifecycle (not just verify) enables future commands such as `spx audit list` to enumerate prior audits per node, and retention logic to prune old verdicts — analogous to `spx session archive` and `spx session prune`.

## Trade-offs accepted

| Trade-off                          | Mitigation / reasoning                                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Full lifecycle not yet implemented | CLI index 76 reserves sibling slots at 43, 54, 65 for future identity, store, and retention enablers without restructuring |
| Verdict files are not committed    | Consistent with session design; agents that need to share verdicts pass file paths explicitly                              |

## Product invariants

- `spx audit verify` exit code 0 is the sole completion criterion for the `typescript:auditing-typescript-tests` skill
- Audit verdict files are never committed to the repository

## Compliance

### MUST

- Store verdict files in `.spx/nodes/{encoded-node-path}/` at the main repository root per PDR-15 ([review](../15-worktree-resolution.pdr.md))
- Accept any file path as the argument to `spx audit verify` — the command is not restricted to `.spx/nodes/` contents ([review])

### NEVER

- Write verdict files into the `spx/` spec tree ([review])
- Treat a non-zero exit from `spx audit verify` as a silent warning — it must surface as an error ([review])
