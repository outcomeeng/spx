# Plan: verification-run lifecycle

> Reconcile against `spx/PLAN.md` and `spx/34-verification.enabler/PLAN.md` first. This note coordinates pending work under the materialized `spx/34-verification.enabler/32-verify.enabler` lifecycle node; it does not declare product truth.

## Existing lifecycle slice

1. Finish applying the parent cross-lifecycle assertions in `spx/34-verification.enabler/32-verify.enabler/verify.md`: operation mapping, journal-event construction boundary, uniform existing-run validation, and CLI descriptor wiring for stdin and Commander behavior.
2. Remove `spx/34-verification.enabler/32-verify.enabler` from `spx/EXCLUDE` when the parent and child lifecycle tests pass.
3. Keep CLI command vocabulary under `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification-command-family.enabler`; this node owns the library and command-layer lifecycle behavior behind that surface.

## Expansion structure

The next expansion has two independent product dimensions:

1. Run-set envelope and orchestration: `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler/PLAN.md`.
2. Verification-type payload semantics:
   - `spx/34-verification.enabler/32-verify.enabler/65-review.enabler/PLAN.md`.
   - `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/PLAN.md`.

## Ordering evidence

| Predecessor                                                                                                                                                                                                                        | Basis               | Successor                                                                                                                              | Reason                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spx/34-verification.enabler/32-verify.enabler/21-run-context.enabler`, `spx/34-verification.enabler/32-verify.enabler/32-evidence-append.enabler`, `spx/34-verification.enabler/32-verify.enabler/43-terminal-projection.enabler` | Provider / consumer | `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler`                                                       | Run-set orchestration groups and projects completed or in-flight single runs; it cannot define merge-period state without stable run locators, evidence append semantics, and terminal projections. |
| `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler`                                                                                                                                                   | Shared substrate    | `spx/34-verification.enabler/32-verify.enabler/65-review.enabler` and `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler` | Review and audit both need a merge-period envelope, prior-run context, active/resolved finding identity, and expanding-scope projection.                                                            |
| `spx/34-verification.enabler/32-verify.enabler/65-review.enabler`                                                                                                                                                                  | Same-index peer     | `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler`                                                                       | Review and audit are separate verification types. Neither type's payload schema or validator governs the other.                                                                                     |

## Parent pointers

The type-specific nodes must avoid duplicating lifecycle mechanics already owned here:

- `scope add` records inspected or classified coverage units.
- `finding add` records validated findings anchored to a scope unit.
- `finish`, `status`, and `render` project the journal through the verification-run lifecycle.
- Verification type names remain `review` and `audit`; subtypes, classes, and producer details belong in payload schemas.
