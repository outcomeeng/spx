# Issues: run context

The entries below come from test-evidence audit run 1 of this node at `65e35d2b15b8ca92dd8afdc0ee5f4b95bf67d272`. That run returned `REJECTED` with 8 REJECT findings and 1 WARNING. Every cited line lies outside the `origin/main..HEAD` diff of the changeset under audit. The Change-identity assertions and their evidence drew no finding. The harness-owned predicate findings against `testing/harnesses/verify/harness.ts`, and the WARNING that repeats that class, are recorded under "Shared verification harness owns test predicates and unclassified Git doubles" in [`spx/34-verification.enabler/32-verify.enabler/ISSUES.md`](spx/34-verification.enabler/32-verify.enabler/ISSUES.md).

## The start scenario takes its expected context and input digest from production code

`tests/verify-start.scenario.l1.test.ts`, lines 19–23, compares the reported `contextDigest`, the persisted context, and `input.digest` with `expectedContext` and `expectedInputDigest`. `observeStartedRunContext` in `testing/harnesses/verify/harness.ts` (lines 3065–3083) builds those values with `scenarioContextDocument(scenario)` and `expectedRunInputDigest(scenario)`. Both helpers call the production canonicalizer and digest that `start` itself uses.

**Class:** oracle independence. The auditor gave a class, not a rule id.

**Impact:** the expected values come from the same code that produces the reported values. A defect in canonicalization or digesting changes both sides of the comparison together, so the scenario still passes. The scenario does not show that `start` reports the digest of the context it persisted.

**Settlement condition:** the scenario's expected digest and canonical document come from a source that does not share the production canonicalizer and digest, such as an independent digest of the persisted bytes or a fixed known-answer document, and a test-evidence audit of this node accepts the oracle.

## The spx-driven drive-mode case never reaches the path where spx opens a run

`tests/verify-drive-mode.compliance.l1.test.ts`, lines 20–26, supports the assertion that `start` records spx-driven drive mode only when spx opens the run. It calls `observeSpxStartDriveMode`. That harness function, `observeStartDriveMode` in `testing/harnesses/verify/harness.ts` (lines 1702–1722), injects `VERIFY_DRIVE_MODE.SPX` directly into the verify dependencies through `verifyDepsWithDriveMode`. Production sets spx-driven mode at a different place: line 82 of `src/commands/verification-exec/recorder-operations.ts`, when the executor opens its run.

**Class:** the evidence does not exercise the production path the assertion names. The auditor gave a class, not a rule id.

**Impact:** the case proves only that `start` records a drive mode it is handed. If the executor stopped setting spx-driven mode, or set the wrong mode, this case would still pass.

**Settlement condition:** the spx-driven case opens its run through the executor's recorder operations in `src/commands/verification-exec/recorder-operations.ts` and observes the recorded drive mode on that run, and a test-evidence audit of this node accepts the evidence.

## The scope mapping hand-lists the supported scope types

`tests/verify-scope.mapping.l1.test.ts`, line 7, iterates `verifyScopeMappingCases()`. That function, `testing/generators/verify/verify.ts` lines 648–676, returns two hand-written cases, one for `changeset` and one for `file`. It does not enumerate the scope types from the closed resolver registry that [`spx/34-verification.enabler/32-verify.enabler/13-verify-module-structure.adr.md`](spx/34-verification.enabler/32-verify.enabler/13-verify-module-structure.adr.md) makes source-owned.

**Class:** mapping case provenance. The cases are not derived from the source-owned finite domain. The auditor gave a class, not a rule id.

**Impact:** a scope type added to the resolver registry gets no mapping case, and the mapping still passes. The assertion covers "supported scope types", but the evidence covers only the two types the generator names.

**Settlement condition:** the mapping cases are keyed by the source-owned scope-type registry, so a registry entry with no mapping case fails the mapping, and a test-evidence audit of this node accepts the evidence.

## The run-not-found diagnostic case checks only the namespace label

`tests/verify-input.compliance.l1.test.ts`, lines 53–71, supports the assertion that a run-not-found diagnostic names the storage namespace among its other selector fields. Line 63 checks only that the output contains the `VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.NAMESPACE` label (`namespace=`). It does not check the namespace value that follows the label.

**Class:** a partial predicate. The check falsifies only the label and not the field the assertion names. The auditor gave a class, not a rule id.

**Impact:** a diagnostic that prints `namespace=` with an empty or wrong storage namespace still passes. The assertion's requirement to name the storage namespace is unproven.

**Settlement condition:** the case checks the expected storage-namespace value after its label, taken from a source independent of the diagnostic renderer, and a test-evidence audit of this node accepts the evidence.
