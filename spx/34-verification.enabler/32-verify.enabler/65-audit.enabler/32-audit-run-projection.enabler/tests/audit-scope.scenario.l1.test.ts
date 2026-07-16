import { describe, expect, it } from "vitest";

import { projectVerifyRun } from "@/domains/verify/verify";
import {
  arbitraryAuditChangesetProjectionScenario,
  arbitraryFileAuditScopeScenario,
} from "@testing/generators/verify/audit";
import { sampleVerifyTestValue } from "@testing/generators/verify/verify";

describe("audit scope projection", () => {
  it("preserves nested audit units in the run projection", () => {
    expect(projectVerifyRun([
      sampleVerifyTestValue(arbitraryAuditChangesetProjectionScenario()).rootEvent,
      sampleVerifyTestValue(arbitraryAuditChangesetProjectionScenario()).specEvent,
      sampleVerifyTestValue(arbitraryAuditChangesetProjectionScenario()).implementationEvent,
    ])).toMatchObject({
      auditScopeUnits: [
        sampleVerifyTestValue(arbitraryAuditChangesetProjectionScenario()).rootPayload,
        sampleVerifyTestValue(arbitraryAuditChangesetProjectionScenario()).specPayload,
        sampleVerifyTestValue(arbitraryAuditChangesetProjectionScenario()).implementationPayload,
      ],
      findingCount: 0,
    });
  });

  it("represents clean audited coverage without adding a finding", () => {
    expect(projectVerifyRun([
      sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).rootEvent,
    ])).toMatchObject({
      auditScopeUnits: [sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).rootPayload],
      findingCount: 0,
    });
  });
});
