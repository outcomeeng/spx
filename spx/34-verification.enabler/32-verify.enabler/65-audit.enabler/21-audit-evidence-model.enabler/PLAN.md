# Plan: audit evidence model

> Reconcile against `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/audit.md`, `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/15-audit-payload.pdr.md`, and `spx/34-verification.enabler/32-verify.enabler/PLAN.md` first. This note coordinates remaining audit evidence implementation work; shared lifecycle mechanics remain in `spx/34-verification.enabler/32-verify.enabler`.

## Pending work

1. Migrate audit run drivers and leaf skill producer callers to `spx verification run` for individual audit runs; prior-run context consumes `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler`.

## Local Change audit contract

The contract in `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/15-audit-payload.pdr.md` declares `auditClass: coordination` and `auditKind: change`. The implementation and linked evidence cover the pair, its incompatible classifications, file-root requirements, terminal rollup, and prior-context selection.

The consumer is the spec-tree plugin's Change auditor. Authors draft, revise, and repair one local Change file. An independent auditor reads that file and records coverage and findings through `spx verification run`. Passing verification permits the authoring workflow to publish the approved file to its configured Change store. SPX's audit contract remains independent of that store. Verification records stay outside the Change body.

1. Finish the focused deterministic checks and independent audits for this node and `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/32-audit-run-projection.enabler` on the committed implementation.
2. Deliver and release the SPX capability. The plugin consumer must require the published version that supports the pair before enabling its auditor. An unreleased executable cannot satisfy that dependency.

No new eval work, Python scripts, publication command, or Change-file storage policy is part of this contract addition. Local working-file location and publication belong to the authoring workflow and configured coordination infrastructure.
