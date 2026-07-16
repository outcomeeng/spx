import { describe, expect, it } from "vitest";

import { projectVerifyRun, VERIFY_APPEND_EVENT_TYPE } from "@/domains/verify/verify";
import { arbitraryFileAuditScopeScenario } from "@testing/generators/verify/audit";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("audit scope projection", () => {
  it("preserves nested audit units in the run projection", async () => {
    assertProperty(
      arbitraryFileAuditScopeScenario(),
      (scenario) => {
        expect(projectVerifyRun([scenario.rootEvent, scenario.childEvent])).toMatchObject({
          auditScopeUnits: [scenario.rootPayload, scenario.childPayload],
          findingCount: 0,
        });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("represents clean audited coverage without adding a finding", async () => {
    assertProperty(
      arbitraryFileAuditScopeScenario(),
      (scenario) => {
        expect(projectVerifyRun([scenario.rootEvent]).findingCount).toBe(0);
        expect([scenario.rootEvent].filter((event) => event.type === VERIFY_APPEND_EVENT_TYPE.FINDING)).toHaveLength(0);
        expect([scenario.rootEvent].filter((event) => event.type === VERIFY_APPEND_EVENT_TYPE.SCOPE)).toHaveLength(1);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
