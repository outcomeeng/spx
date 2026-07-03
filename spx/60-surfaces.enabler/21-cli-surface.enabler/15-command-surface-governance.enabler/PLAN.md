# Plan: command surface governance

> Reconcile against `spx/60-surfaces.enabler/21-cli-surface.enabler/PLAN.md` and `spx/PLAN.md` first. This note carries child-structure coordination only; product truth lives in the node spec and governing PDRs.

## Deferred child grouping

| Planned child                            | Role                                                                                                                                                                                 | Ordering                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `21-public-command-vocabulary.enabler`   | Public command-path vocabulary: noun-grouping, user-intent verbs, bounded output and widening vocabulary, and banned implementation/storage terms outside explicit storage surfaces. | Provider for enforcement and command families. |
| `32-command-surface-enforcement.enabler` | Deterministic validation or tests that reject public command paths exposing forbidden implementation/storage vocabulary.                                                             | Depends on public command vocabulary.          |

## Plugin-skill follow-up

SPX owns the CLI command contract and deterministic enforcement. The Outcome Engineering plugin repository owns agent skills that teach or audit against that contract, including `spx-command-standards`, `author-spx-command`, and `audit-spx-command` if those skills are created.
