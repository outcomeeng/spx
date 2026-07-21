# Plan: verification-run lifecycle

> Reconcile against `spx/34-verification.enabler/verification.md`, `spx/34-verification.enabler/PLAN.md`, and affected child node specs and decisions first. This note coordinates pending work under the materialized `spx/34-verification.enabler/32-verify.enabler` lifecycle node; it does not declare product truth.

## Delivered lifecycle slice

1. `spx verification run` owns the individual verification-run lifecycle: `start`, `input`, `scope add`, `finding add`, `finish`, `status`, and `render`.
2. Scope, finding, and terminal metadata validation dispatch through the shared evidence-validator registry keyed by verification type and evidence kind.
3. Registered verification types are `review` and `audit`; both validate scope and finding payloads, and both participate in terminal-status validation.
4. CLI command vocabulary stays under `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler`; this node owns the library and command-layer lifecycle behavior behind that surface.

## Remaining lifecycle work

1. Resolve `spx/34-verification.enabler/32-verify.enabler/ISSUES.md` next-action filtering before a verification type can register only part of the evidence-action surface.
2. Keep run-set context projection out of the individual-run lifecycle; `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler` owns it as the separate run-set layer.
3. Treat `spx journal read-set` as a raw journal substrate only; verification producers consume the run-set projection `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler` provides.

## Expansion structure

The next expansion has two independent product dimensions:

1. Run-set envelope and orchestration: `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler`.
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
- `status` and `render` report next legal lifecycle actions from terminal state and the verification type's registered scope and finding validators.
- Verification type names remain `review` and `audit`; subtypes, classes, and producer details belong in payload schemas.
