import { describe, expect, it } from "vitest";

import { EVIDENCE_REQUIREMENT } from "@/domains/verify/evidence-rejection";
import {
  AUDIT_PAYLOAD_FIELD,
  evidenceValidatorFor,
  VERIFY_EVIDENCE_KIND,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import {
  arbitraryAuditFindingMissingDispositionEvidence,
  arbitraryAuditFindingMissingRequiredField,
  arbitraryAuditFindingValidationScenario,
  arbitraryAuditScopeCoverageGapWithProvenance,
  arbitraryAuditScopeIncompatibleKind,
  arbitraryAuditScopeMissingRequiredField,
  arbitraryAuditScopeParentedToSelf,
  arbitraryInvalidAuditFindingScenario,
  arbitraryInvalidAuditScopeScenario,
  invalidCoveredCoverageGapAuditScopePayloads,
} from "@testing/generators/verify/audit";
import { sampleVerifyTestValue } from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { AUDIT_FIXTURE, withVerificationFixtureRun } from "@testing/harnesses/verify/audit-fixtures";

describe("audit evidence validation", () => {
  it("rejects whole invalid payload files without appending journal events and identifies the violation", async () => {
    await withVerificationFixtureRun(async (env) => {
      const beforeRoot = await env.events();
      const invalidScope = await env.appendScope(AUDIT_FIXTURE.MISSING_CLASS);
      expect(invalidScope.exitCode).not.toBe(0);
      expect(invalidScope.output).toContain(AUDIT_PAYLOAD_FIELD.AUDIT_CLASS);
      expect(await env.events()).toEqual(beforeRoot);

      expect((await env.appendScope(AUDIT_FIXTURE.ROOT)).exitCode).toBe(0);
      const beforeFindings = await env.events();
      expect(beforeFindings.length).toBeGreaterThan(beforeRoot.length);
      const missingMessage = await env.appendFinding(AUDIT_FIXTURE.MISSING_MESSAGE);
      expect(missingMessage.exitCode).not.toBe(0);
      expect(missingMessage.output).toContain(AUDIT_PAYLOAD_FIELD.MESSAGE);
      expect(await env.events()).toEqual(beforeFindings);
      const unknownUnit = await env.appendFinding(AUDIT_FIXTURE.UNKNOWN_UNIT);
      expect(unknownUnit.exitCode).not.toBe(0);
      expect(unknownUnit.output).toContain(EVIDENCE_REQUIREMENT.AUDIT_FINDING_UNIT_IS_RECORDED);
      expect(await env.events()).toEqual(beforeFindings);
      const emptyEvidence = await env.appendFinding(AUDIT_FIXTURE.EMPTY_EVIDENCE);
      expect(emptyEvidence.exitCode).not.toBe(0);
      expect(emptyEvidence.output).toContain(AUDIT_PAYLOAD_FIELD.EVIDENCE);
      expect(await env.events()).toEqual(beforeFindings);
    });
  });
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
    ).toStrictEqual(invalidCoveredCoverageGapAuditScopePayloads().map(() => false));
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

  it("rejects a filed or stale finding lacking its entry reference or base-ref evidence, naming the missing field path", () => {
    assertProperty(
      arbitraryAuditFindingMissingDispositionEvidence(),
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

  it("names the unmet structural requirement when a scope payload carries a covered coverage-gap status", () => {
    for (const payload of invalidCoveredCoverageGapAuditScopePayloads()) {
      const result = evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.SCOPE)?.({
        payload,
        events: [],
        selector: {
          scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
          scopeIdentity: sampleVerifyTestValue(arbitraryInvalidAuditScopeScenario()).scopeIdentity,
        },
      });
      expect(result?.ok).toBe(false);
      expect(result?.ok === false ? result.reason : "").toContain(
        EVIDENCE_REQUIREMENT.AUDIT_COVERAGE_GAP_IS_UNCOVERED,
      );
    }
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
  it("names the unmet structural requirement for each audit scope pairing rule", () => {
    const pairings = [
      {
        payloads: arbitraryAuditScopeIncompatibleKind(),
        requirement: EVIDENCE_REQUIREMENT.AUDIT_KIND_MATCHES_CLASS,
      },
      {
        payloads: arbitraryAuditScopeCoverageGapWithProvenance(),
        requirement: EVIDENCE_REQUIREMENT.AUDIT_COVERAGE_GAP_HAS_NO_PROVENANCE,
      },
      {
        payloads: arbitraryAuditScopeParentedToSelf(),
        requirement: EVIDENCE_REQUIREMENT.AUDIT_PARENT_IS_NOT_SELF,
      },
    ];
    for (const pairing of pairings) {
      assertProperty(
        pairing.payloads,
        (payload) => {
          const result = evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.SCOPE)?.({
            payload,
            events: [],
            selector: {
              scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
              scopeIdentity: sampleVerifyTestValue(arbitraryInvalidAuditScopeScenario()).scopeIdentity,
            },
          });
          expect(result?.ok).toBe(false);
          expect(result?.ok === false ? result.reason : "").toContain(pairing.requirement);
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    }
  });
});
