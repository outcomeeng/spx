# Plan: verification-run lifecycle

> Reconcile against `spx/34-verification.enabler/verification.md`, `spx/34-verification.enabler/PLAN.md`, and affected child node specs and decisions first. This note coordinates pending work under the materialized `spx/34-verification.enabler/32-verify.enabler` lifecycle node; it does not declare product truth.

## Delivered lifecycle slice

1. `spx verification run` owns the individual verification-run lifecycle: `start`, `input`, `scope add`, `finding add`, `finish`, `status`, and `render`.
2. Scope, finding, and terminal metadata validation dispatch through the shared evidence-validator registry keyed by verification type and evidence kind.
3. Registered verification types are `review`, `audit`, and `test`; each validates scope and finding payloads, and each participates in terminal-status validation.
4. CLI command vocabulary stays under `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler`; this node owns the library and command-layer lifecycle behavior behind that surface.

## Remaining lifecycle work

1. Make scope and finding evidence validation reasoned, per `spx/34-verification.enabler/32-verify.enabler/13-verify-module-structure.adr.md`. `EvidenceValidator` in `src/domains/verify/verify.ts` still returns `unknown | undefined`, so a rejection carries no reason; `TerminalMetadataValidator` already returns the reasoned `TerminalMetadataValidationResult` the scope and finding validators mirror. The change replaces that return type, keeps one validation implementation per payload schema from which the reasoned and value-narrowing views derive, updates the registered `review`, `audit`, and `test` validators, and reports the reason through the evidence rejection the command layer emits. Declared and awaiting evidence in:
   - `spx/34-verification.enabler/32-verify.enabler/32-evidence-append.enabler` — the append boundary reports the verification-type validation reason (`tests/verify-finding.compliance.l1.test.ts`).
   - `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/21-audit-evidence-model.enabler` — the audit validator names the failing field path or unmet structural requirement (`tests/audit-evidence-validation.compliance.l1.test.ts`).
   - `spx/34-verification.enabler/32-verify.enabler/65-test-evidence-model.enabler` — the test validator names the same (`tests/test-evidence-validation.compliance.l1.test.ts`).

   Consumer sites: `src/domains/verify/run-set.ts` derives its value-narrowing view from the reasoned result rather than keeping a second check, and `src/commands/verify/cli.ts` carries the reason into the scope-invalid and finding-invalid diagnostics, which are one fixed string per verb today.

   The rejection diagnostic on standard error orients a human reader: the command and the rejection on the first line, then labeled `verification type`, `evidence kind`, and `reason` lines, then a closing line stating that the run is unchanged and the same idempotency key remains valid for the retry. The single structured JSON result on standard output stays the machine contract and gains the reason as a field. Composing that block through `src/lib/terminal-text/` closes the unescaped-site entry in `spx/34-verification.enabler/32-verify.enabler/ISSUES.md`, whose revisit condition is the next changeset touching this node's terminal output path: schema field names are product-authored and keep their bytes, while any reason segment echoing payload values is escaped where it is embedded.

2. Resolve `spx/34-verification.enabler/32-verify.enabler/ISSUES.md` next-action filtering before a verification type can register only part of the evidence-action surface.
3. Keep run-set context projection out of the individual-run lifecycle; `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler` owns it as the separate run-set layer.
4. Treat `spx journal read-set` as a raw journal substrate only; verification producers consume the run-set projection `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler` provides.

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
