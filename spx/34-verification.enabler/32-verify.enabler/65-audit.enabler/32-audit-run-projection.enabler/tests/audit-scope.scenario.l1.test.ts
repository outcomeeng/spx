import { describe, expect, it } from "vitest";

import { projectVerifyRun, VERIFY_APPEND_EVENT_TYPE } from "@/domains/verify/verify";
import { arbitraryFileAuditScopeScenario } from "@testing/generators/verify/audit";
import { sampleVerifyTestValue } from "@testing/generators/verify/verify";

describe("audit scope projection", () => {
  it("preserves nested audit units in the run projection", () => {
    expect(projectVerifyRun([
      sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).rootEvent,
      sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).childEvent,
    ])).toMatchObject({
      auditScopeUnits: [
        sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).rootPayload,
        sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).childPayload,
      ],
      findingCount: 0,
    });
  });

  it("represents clean audited coverage without adding a finding", () => {
    expect(
      projectVerifyRun([
        sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).rootEvent,
      ]).findingCount,
    ).toBe(0);
    expect([
      sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).rootEvent,
    ].filter((event) => event.type === VERIFY_APPEND_EVENT_TYPE.FINDING)).toHaveLength(0);
    expect([
      sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).rootEvent,
    ].filter((event) => event.type === VERIFY_APPEND_EVENT_TYPE.SCOPE)).toHaveLength(1);
  });
});
