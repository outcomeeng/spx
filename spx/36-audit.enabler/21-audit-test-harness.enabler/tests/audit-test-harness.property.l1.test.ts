/**
 * Property test for the audit test harness: branch run-file directory derivation
 * is deterministic for all product directory and branch slug inputs.
 *
 * Test Level: l1.
 */

import { AUDIT_RUN_STATE_TEST_GENERATOR } from "@testing/generators/audit/run-state";
import { auditBranchRunsDir, createAuditHarness } from "@testing/harnesses/audit/harness";
import * as fc from "fast-check";
import { describe, it } from "vitest";

describe("auditBranchRunsDir", () => {
  it("GIVEN any branch slug WHEN called twice THEN both calls return the same path", async () => {
    // Real bug class: derivation that reads a stateful counter, Date.now(), or
    // random produces non-repeatable output and would fail this property.
    const harness = await createAuditHarness();
    try {
      fc.assert(
        fc.property(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug(), (branchSlug) => {
          return auditBranchRunsDir(harness.productDir, branchSlug)
            === auditBranchRunsDir(harness.productDir, branchSlug);
        }),
      );
    } finally {
      await harness.cleanup();
    }
  });
});
