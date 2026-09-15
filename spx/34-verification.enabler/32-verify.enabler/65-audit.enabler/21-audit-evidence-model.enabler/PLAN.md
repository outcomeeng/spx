# Plan: audit evidence model

> Reconcile against `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/audit.md`, `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/15-audit-payload.pdr.md`, and `spx/34-verification.enabler/32-verify.enabler/PLAN.md` first. This note coordinates remaining audit evidence implementation work; shared lifecycle mechanics remain in `spx/34-verification.enabler/32-verify.enabler`.

## Pending work

1. Migrate audit run drivers and leaf skill producer callers to `spx verification run` for individual audit runs; prior-run context consumes `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler`.

## Local Change audit contract

The contract in `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/15-audit-payload.pdr.md` declares `auditClass: coordination` and `auditKind: change`. The implementation and linked evidence cover the pair, its incompatible classifications, file-root requirements, terminal rollup, and prior-context selection.

The consumer is the spec-tree plugin's Change auditor. Authors draft, revise, and repair one local Change file. An independent auditor reads that file and records coverage and findings through `spx verification run`. Passing verification permits the authoring workflow to publish the approved file to its configured Change store. SPX's audit contract remains independent of that store. Verification records stay outside the Change body.

1. Preserve the passing focused checks and the approved evidence-model and terminal-reason audits. The latest projection audit stopped with incomplete dependency inspection; the implementation audit recorded shared-harness and draft-generator findings. Their operator-approved prototype disposition is recorded in `spx/34-verification.enabler/32-verify.enabler/ISSUES.md` and `spx/25-outcomeeng.enabler/31-changes.enabler/ISSUES.md`. Complete changeset review and the remaining delivery checks without expanding this slice into the deferred repairs.
2. Deliver and release the SPX capability. The plugin consumer must require the published version that supports the pair before enabling its auditor. An unreleased executable cannot satisfy that dependency.

This delivery combines coordination/change audit support with local working-draft storage and its CLI, governed by `spx/25-outcomeeng.enabler/31-changes.enabler/21-change-store.pdr.md` and `spx/25-outcomeeng.enabler/31-changes.enabler/26-local-drafts.adr.md`. The authoring workflow uses the returned local file coordinates for independent audit and owns publication through its configured remote Change store. Drafts survive unsuccessful audit or publication; verification records remain separate from the Change. No new eval work, Python implementation scripts, or remote-publication command is included.
