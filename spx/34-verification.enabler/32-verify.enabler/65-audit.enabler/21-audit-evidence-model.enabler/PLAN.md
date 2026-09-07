# Plan: audit evidence model

> Reconcile against `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/audit.md`, `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/15-audit-payload.pdr.md`, and `spx/34-verification.enabler/32-verify.enabler/PLAN.md` first. This note coordinates remaining audit evidence implementation work; shared lifecycle mechanics remain in `spx/34-verification.enabler/32-verify.enabler`.

## Pending work

1. Migrate audit run drivers and leaf skill producer callers to `spx verification run` for individual audit runs; prior-run context consumes `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler`.

## Local Change audit contract

The contract addition in `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/15-audit-payload.pdr.md` declares `auditClass: coordination` and `auditKind: change`. This changeset prepares the declaration; the implementation and its evidence remain to be updated.

The consumer is the spec-tree plugin's Change auditor. Authors draft, revise, and repair one local Change file. An independent auditor reads that file and records coverage and findings through `spx verification run`. Passing verification permits the authoring workflow to publish the approved file to its configured Change store. SPX's audit contract remains independent of that store. Verification records stay outside the Change body.

1. Through `/apply` and `/verify`, extend the linked audit-scope conformance evidence and payload validator for the new class/kind pair. Cover acceptance of `coordination`/`change`, rejection of `change` with every other class, rejection of other executed kinds with `coordination`, and the existing uncovered-only `coverage-gap` behavior for the new class.
2. Exercise the existing file-root contract with a local Change file. Preserve normalized repository-relative scope, required root coverage, stable producer identity, and findings attached to the recorded unit. Do not require a GitHub URL, issue revision, provider token, new subject type, or Change-store subsystem.
3. Verify the pair is preserved by the existing scope projection and prior-context selectors under `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/32-audit-run-projection.enabler`. Preserve the existing derived terminal rules: clean complete coverage approves; uncovered required scope or any finding rejects. The caller supplies no verdict override.
4. Run the focused deterministic checks and required independent audits, then deliver and release the SPX capability. The plugin consumer must require the published version that supports the pair before enabling its auditor. A declaration-only commit or an unreleased executable cannot satisfy that dependency.

No new eval work, Python scripts, publication command, or Change-file storage policy is part of this contract addition. Local working-file location and publication belong to the authoring workflow and configured coordination infrastructure.
