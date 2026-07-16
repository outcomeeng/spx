import { describe, expect, it } from "vitest";

import {
  evidenceValidatorFor,
  VERIFY_EVIDENCE_KIND,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import { arbitraryFileAuditScopeScenario } from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("audit file-root conformance", () => {
  it("accepts a matching required root and related child", () => {
    assertProperty(
      arbitraryFileAuditScopeScenario(),
      (scenario) => {
        expect(
          evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.SCOPE)?.({
            payload: scenario.rootPayload,
            events: [],
            selector: { scopeType: VERIFY_SCOPE_TYPE.FILE, scopeIdentity: scenario.scopeIdentity },
          }),
        ).toEqual(scenario.rootPayload);
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

  it("rejects a root whose subject differs from the selected file", () => {
    assertProperty(
      arbitraryFileAuditScopeScenario(),
      (scenario) => {
        expect(
          evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.SCOPE)?.({
            payload: scenario.mismatchedRootPayload,
            events: [],
            selector: { scopeType: VERIFY_SCOPE_TYPE.FILE, scopeIdentity: scenario.scopeIdentity },
          }),
        ).toBeUndefined();
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects a first unit with a parent or optional coverage", () => {
    assertProperty(
      arbitraryFileAuditScopeScenario(),
      (scenario) => {
        expect(
          evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.SCOPE)?.({
            payload: scenario.parentedRootPayload,
            events: [],
            selector: { scopeType: VERIFY_SCOPE_TYPE.FILE, scopeIdentity: scenario.scopeIdentity },
          }),
        ).toBeUndefined();
        expect(
          evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.SCOPE)?.({
            payload: scenario.optionalRootPayload,
            events: [],
            selector: { scopeType: VERIFY_SCOPE_TYPE.FILE, scopeIdentity: scenario.scopeIdentity },
          }),
        ).toBeUndefined();
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
