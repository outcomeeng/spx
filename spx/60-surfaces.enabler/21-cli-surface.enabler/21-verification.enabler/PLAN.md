# Plan: verification command family

> Reconcile against `spx/60-surfaces.enabler/21-cli-surface.enabler/PLAN.md` and `spx/34-verification.enabler/PLAN.md` first. This note carries child-structure coordination only; product truth lives in the node specs and `spx/60-surfaces.enabler/21-cli-surface.enabler/13-verify-command-surface.pdr.md`.

## Child structure

The `spx verification` family splits by **who drives the run** — an axis independent of verdict mode:

| Child                                                                                           | Command paths                                                                                        |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler/21-record-run.enabler`  | caller-driven `spx verification run <verb>` — `start`, `input`, `scope add`, `finding add`, `finish` |
| `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler/21-execute-run.enabler` | spx-driven `spx verification <type> run <paths…>`                                                    |

The two are **independent peers at index 21**: the shared run selectors and the run-inspection command paths (`status`, `render`) are family-level and live in the parent, so neither child constrains the other.

## Pending work

- `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler/21-execute-run.enabler` is declared without implementation and carries an `spx/EXCLUDE` entry. `spx verification <type> run` is unbuilt; `test` is the first type exposed, per `spx/34-verification.enabler/PLAN.md`. Remove the exclusion when `/apply` implements the command path.
- `spx/60-surfaces.enabler/21-cli-surface.enabler/13-verify-command-surface.pdr.md` still declares `spx validation` and `spx test` the top-level deterministic execution surfaces and forbids moving them under the verification surface. The program in `spx/34-verification.enabler/PLAN.md` amends it to the `spx verification <type> run` grammar.
- Splitting `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler/21-record-run.enabler` further — run lifecycle, evidence append, and inspection as separate command-path groups — stays deferred; its assertion count does not warrant it.

## Lower-layer cascade

The next implementation-bearing slice aligns the verification library tests and source under `spx/34-verification.enabler/32-verify.enabler` from legacy command names to the interface-neutral lifecycle operations consumed by this CLI surface.
