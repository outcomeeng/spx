import { describe, it } from "vitest";

import {
  assertAuditCleanCoverageDoesNotInventFinding,
  assertAuditScopeProjectionPreservesUnits,
} from "@testing/harnesses/verify/harness";

describe("audit scope projection", () => {
  it("preserves nested audit units in the run projection", async () => {
    await assertAuditScopeProjectionPreservesUnits();
  });

  it("represents clean audited coverage without adding a finding", async () => {
    await assertAuditCleanCoverageDoesNotInventFinding();
  });
});
