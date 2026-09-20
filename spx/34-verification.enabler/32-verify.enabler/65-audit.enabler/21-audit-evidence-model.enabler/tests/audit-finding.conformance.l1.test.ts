import { describe, expect, it } from "vitest";

import {
  evidenceValidatorFor,
  validateAuditFinding,
  VERIFY_EVIDENCE_KIND,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import {
  arbitraryAuditFindingValidationScenario,
  arbitraryFiledOrStaleAuditFinding,
} from "@testing/generators/verify/audit";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("audit finding payload conformance", () => {
  it("accepts complete audit findings only when their unit identity is already recorded", async () => {
    assertProperty(
      arbitraryAuditFindingValidationScenario(),
      (scenario) => {
        expect(
          evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.FINDING)?.({
            payload: JSON.parse(JSON.stringify(scenario.finding)),
            events: [scenario.scopeEvent],
            selector: { scopeType: VERIFY_SCOPE_TYPE.CHANGESET, scopeIdentity: scenario.scopeIdentity },
          }),
        ).toEqual({ ok: true, value: scenario.finding });
        expect(
          evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.FINDING)?.({
            payload: JSON.parse(JSON.stringify(scenario.unknownUnitFinding)),
            events: [scenario.scopeEvent],
            selector: { scopeType: VERIFY_SCOPE_TYPE.CHANGESET, scopeIdentity: scenario.scopeIdentity },
          }).ok,
        ).toBe(false);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("accepts filed and stale findings carrying their entry reference and base-ref evidence, read back unchanged", async () => {
    assertProperty(
      arbitraryFiledOrStaleAuditFinding(),
      (finding) => {
        expect(validateAuditFinding(JSON.parse(JSON.stringify(finding)))).toEqual({ ok: true, value: finding });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
