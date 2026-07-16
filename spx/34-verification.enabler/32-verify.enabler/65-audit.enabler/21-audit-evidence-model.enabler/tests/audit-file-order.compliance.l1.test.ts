import { describe, expect, it } from "vitest";

import {
  evidenceValidatorFor,
  VERIFY_EVIDENCE_KIND,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import { arbitraryFileAuditScopeScenario } from "@testing/generators/verify/audit";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("audit file-scope append order", () => {
  it("requires the root first and each child after its recorded parent", () => {
    assertProperty(
      arbitraryFileAuditScopeScenario(),
      (scenario) => {
        expect(
          evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.SCOPE)?.({
            payload: scenario.childPayload,
            events: [],
            selector: { scopeType: VERIFY_SCOPE_TYPE.FILE, scopeIdentity: scenario.scopeIdentity },
          }),
        ).toBeUndefined();
        expect(
          evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.SCOPE)?.({
            payload: scenario.orphanChildPayload,
            events: [scenario.rootEvent],
            selector: { scopeType: VERIFY_SCOPE_TYPE.FILE, scopeIdentity: scenario.scopeIdentity },
          }),
        ).toBeUndefined();
        expect(
          evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.SCOPE)?.({
            payload: scenario.childPayload,
            events: [scenario.rootEvent],
            selector: { scopeType: VERIFY_SCOPE_TYPE.FILE, scopeIdentity: scenario.scopeIdentity },
          }),
        ).toEqual(scenario.childPayload);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
