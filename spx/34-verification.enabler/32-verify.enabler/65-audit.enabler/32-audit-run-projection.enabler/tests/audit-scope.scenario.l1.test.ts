import { describe, expect, it } from "vitest";

import { projectVerifyRun, VERIFY_APPEND_EVENT_FIELD, VERIFY_APPEND_EVENT_TYPE } from "@/domains/verify/verify";
import { arbitraryFileAuditScopeScenario } from "@testing/generators/verify/audit";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("audit scope projection", () => {
  it("preserves nested audit units in the run projection", async () => {
    assertProperty(
      arbitraryFileAuditScopeScenario(),
      (scenario) => {
        expect(
          [scenario.rootEvent, scenario.childEvent].map((event) =>
            (event.data as { readonly payload: unknown })[VERIFY_APPEND_EVENT_FIELD.PAYLOAD]
          ),
        ).toEqual([scenario.rootPayload, scenario.childPayload]);
        expect(projectVerifyRun([scenario.rootEvent, scenario.childEvent]).findingCount).toBe(0);
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
