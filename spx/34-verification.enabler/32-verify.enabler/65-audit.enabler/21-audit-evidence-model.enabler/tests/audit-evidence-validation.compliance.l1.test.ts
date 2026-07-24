import { describe, expect, it } from "vitest";

import { EVIDENCE_REQUIREMENT } from "@/domains/verify/evidence-rejection";
import {
  evidenceValidatorFor,
  VERIFY_EVIDENCE_KIND,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import {
  arbitraryAuditFindingMissingRequiredField,
  arbitraryAuditFindingValidationScenario,
  arbitraryAuditScopeMissingRequiredField,
  arbitraryInvalidAuditFindingScenario,
  arbitraryInvalidAuditScopeScenario,
  invalidCoveredCoverageGapAuditScopePayloads,
} from "@testing/generators/verify/audit";
import { sampleVerifyTestValue } from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("audit evidence validation", () => {
  it("rejects invalid audit scope payloads before append", () => {
    assertProperty(
      arbitraryInvalidAuditScopeScenario(),
      (scenario) => {
        expect(
          evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.SCOPE)?.({
            payload: scenario.payload,
            events: [],
            selector: { scopeType: VERIFY_SCOPE_TYPE.CHANGESET, scopeIdentity: scenario.scopeIdentity },
          }).ok,
        ).toBe(false);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects covered coverage-gap statuses before append", () => {
    expect(
      invalidCoveredCoverageGapAuditScopePayloads().map((payload) =>
        evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.SCOPE)?.({
          payload,
          events: [],
          selector: {
            scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
            scopeIdentity: sampleVerifyTestValue(arbitraryInvalidAuditScopeScenario()).scopeIdentity,
          },
        })?.ok
      ),
    ).toStrictEqual([false, false]);
  });

  it("rejects invalid audit finding payloads before append", () => {
    assertProperty(
      arbitraryInvalidAuditFindingScenario(),
      (scenario) => {
        expect(
          evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.FINDING)?.({
            payload: scenario.payload,
            events: [],
            selector: { scopeType: VERIFY_SCOPE_TYPE.CHANGESET, scopeIdentity: scenario.scopeIdentity },
          }).ok,
        ).toBe(false);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects audit findings that reference units absent from scope evidence before append", () => {
    assertProperty(
      arbitraryAuditFindingValidationScenario(),
      (scenario) => {
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

  it("rejects audit findings that omit observed-versus-expected evidence before append", () => {
    assertProperty(
      arbitraryAuditFindingValidationScenario(),
      (scenario) => {
        expect(
          evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.FINDING)?.({
            payload: scenario.emptyEvidenceFinding,
            events: [scenario.scopeEvent],
            selector: { scopeType: VERIFY_SCOPE_TYPE.CHANGESET, scopeIdentity: scenario.scopeIdentity },
          }).ok,
        ).toBe(false);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
  it("names the missing required field when it rejects an audit scope payload", () => {
    assertProperty(
      arbitraryAuditScopeMissingRequiredField(),
      (scenario) => {
        const result = evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.SCOPE)?.({
          payload: scenario.payload,
          events: [],
          selector: { scopeType: VERIFY_SCOPE_TYPE.CHANGESET, scopeIdentity: scenario.scopeIdentity },
        });
        expect(result?.ok).toBe(false);
        expect(result?.ok === false ? result.reason : "").toContain(scenario.missingField);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("names the missing required field when it rejects an audit finding payload", () => {
    assertProperty(
      arbitraryAuditFindingMissingRequiredField(),
      (scenario) => {
        const result = evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.FINDING)?.({
          payload: scenario.payload,
          events: [],
          selector: { scopeType: VERIFY_SCOPE_TYPE.CHANGESET, scopeIdentity: scenario.scopeIdentity },
        });
        expect(result?.ok).toBe(false);
        expect(result?.ok === false ? result.reason : "").toContain(scenario.missingField);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("names the unmet structural requirement when a finding references an unrecorded unit", () => {
    assertProperty(
      arbitraryAuditFindingValidationScenario(),
      (scenario) => {
        const result = evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.FINDING)?.({
          payload: JSON.parse(JSON.stringify(scenario.unknownUnitFinding)) as never,
          events: [scenario.scopeEvent],
          selector: { scopeType: VERIFY_SCOPE_TYPE.CHANGESET, scopeIdentity: scenario.scopeIdentity },
        });
        expect(result?.ok).toBe(false);
        expect(result?.ok === false ? result.reason : "").toContain(
          EVIDENCE_REQUIREMENT.AUDIT_FINDING_UNIT_IS_RECORDED,
        );
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
