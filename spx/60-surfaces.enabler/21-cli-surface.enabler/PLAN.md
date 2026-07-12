# Plan: CLI surface command-family cascade

> Reconcile against `spx/60-surfaces.enabler/PLAN.md` and `spx/PLAN.md` first. This note carries CLI-surface coordination only. Product truth lives in specs and decisions.

`spx/60-surfaces.enabler/21-cli-surface.enabler` owns the SPX CLI public contract: command groups, command-family nouns, verbs, options, help, output modes, terminal rendering, machine-readable output, bounded defaults, color behavior, and invocation diagnostics. CLI nodes do not own storage, state, verification, composition operations, backend, delivery, or library semantics.

## Materialized command-surface nodes

| Path                                                                                           | Coordination                                                                                      |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `spx/60-surfaces.enabler/21-cli-surface.enabler/15-command-surface-governance.enabler/PLAN.md` | Shared public command vocabulary and command-surface enforcement child grouping.                  |
| `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler/PLAN.md`               | Verification command-family child structure (record-run, execute-run) and lower-layer cascade.    |
| `spx/60-surfaces.enabler/21-cli-surface.enabler/21-journal.enabler/PLAN.md`                    | Transitional journal-surface correction; only the thin `spx journal` binding stays under surface. |

## Verification-run cascade

The public verification-run command shape is declared by:

- `spx/60-surfaces.enabler/21-cli-surface.enabler/13-verify-command-surface.pdr.md`
- `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler/verification.md`

Remaining implementation-bearing work:

1. Align the verification library tests and source under `spx/34-verification.enabler/32-verify.enabler` from legacy command names to the interface-neutral lifecycle operations consumed by the CLI surface.
2. Update the CLI descriptor and command handlers to expose `spx verification run`, including `scope add` and `finding add`.
3. Add the L2 CLI tests that exercise Commander parsing for the noun-grouped command paths, selector placement, stdin input, payload source, and idempotency key.
4. Remove legacy command paths without compatibility aliases.
5. Run the CLI-surface release sequence after merge because this changes public CLI command vocabulary.

## Plugin-skill follow-up

SPX owns the CLI command contract and deterministic enforcement. The Outcome Engineering plugin repository owns agent skills that teach or audit against that contract, including `spx-command-standards`, `author-spx-command`, and `audit-spx-command` if those skills are created. Do not create SPX product nodes for those skills unless SPX later ships or manages their installation/status through harness-environment plugin bootstrap.
