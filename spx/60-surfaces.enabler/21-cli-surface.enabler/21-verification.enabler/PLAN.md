# Plan: verification command family

> Reconcile against `spx/60-surfaces.enabler/21-cli-surface.enabler/PLAN.md` and `spx/34-verification.enabler/PLAN.md` first. This note carries child-structure coordination only; product truth lives in the node specs and `spx/60-surfaces.enabler/21-cli-surface.enabler/13-verify-command-surface.pdr.md`.

## Child structure

The `spx verification` family splits by **who drives the run** — an axis independent of verdict mode:

| Child                                                                                           | Command paths                                                                                        |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler/21-record-run.enabler`  | caller-driven `spx verification run <verb>` — `start`, `input`, `scope add`, `finding add`, `finish` |
| `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler/21-execute-run.enabler` | spx-driven `spx verification <type> run <paths…>`                                                    |

The two are **independent peers at index 21**: the shared run selectors and the run-inspection command paths (`status`, `render`) are family-level and live in the parent, so neither child constrains the other.

## Tracing this node's history across its move

The node moved from `21-verification-command-family.enabler` with `git mv`, but its spec and coordination note were rewritten in the same change, so their content similarity falls below git's default rename threshold and `git log --follow` on `verification.md` and `PLAN.md` does not reach the old paths. Trace them with `git log --follow --find-renames=20% -- <path>`, or read the move commit directly. The status file and the record-run test file moved with their content intact and are detected as renames normally. A move whose history continuity matters is split into a rename commit and a content commit.

## Pending work

- `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler/21-execute-run.enabler` is declared without implementation and carries an `spx/EXCLUDE` entry. `spx verification <type> run` is unbuilt; `test` is the first type exposed, per `spx/34-verification.enabler/PLAN.md`. Remove the exclusion when `/apply` implements the command path.
- `spx/60-surfaces.enabler/21-cli-surface.enabler/13-verify-command-surface.pdr.md` declares the `spx verification <type> run` grammar these children realize. `spx test` and `spx validation` still exist as top-level commands, so the CLI is in violation of it until they retire into the verification surface — gated on the per-reference equivalence evidence recorded in `spx/34-verification.enabler/PLAN.md`.
- Splitting `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler/21-record-run.enabler` further — run lifecycle, evidence append, and inspection as separate command-path groups — stays deferred; its assertion count does not warrant it.

## Lower-layer cascade

The next implementation-bearing slice aligns the verification library tests and source under `spx/34-verification.enabler/32-verify.enabler` from legacy command names to the interface-neutral lifecycle operations consumed by this CLI surface.
