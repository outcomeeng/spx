import { describe, expect, it } from "vitest";

import {
  evidenceValidatorFor,
  VERIFY_EVIDENCE_KIND,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import {
  arbitraryAuditChangesetProjectionScenario,
  arbitraryFileAuditScopeScenario,
} from "@testing/generators/verify/audit";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("audit scope append order", () => {
  it("requires the root first and each child after its recorded parent for changesets", () => {
    assertProperty(
      arbitraryAuditChangesetProjectionScenario(),
      (scenario) => {
        expect(
          evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.SCOPE)?.({
            payload: scenario.specPayload,
            events: [],
            selector: { scopeType: VERIFY_SCOPE_TYPE.CHANGESET, scopeIdentity: scenario.scopeIdentity },
          }).ok,
        ).toBe(false);
        expect(
          evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.SCOPE)?.({
            payload: scenario.orphanChildPayload,
            events: [scenario.rootEvent],
            selector: { scopeType: VERIFY_SCOPE_TYPE.CHANGESET, scopeIdentity: scenario.scopeIdentity },
          }).ok,
        ).toBe(false);
        expect(
          evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.SCOPE)?.({
            payload: scenario.lateRootPayload,
            events: [scenario.rootEvent],
            selector: { scopeType: VERIFY_SCOPE_TYPE.CHANGESET, scopeIdentity: scenario.scopeIdentity },
          }),
        ).toEqual({ ok: true, value: scenario.lateRootPayload });
        expect(
          evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.SCOPE)?.({
            payload: scenario.lateRootPayload,
            events: [scenario.rootEvent, scenario.specEvent],
            selector: { scopeType: VERIFY_SCOPE_TYPE.CHANGESET, scopeIdentity: scenario.scopeIdentity },
          }).ok,
        ).toBe(false);
        expect(
          evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.SCOPE)?.({
            payload: scenario.rootPayload,
            events: [],
            selector: { scopeType: VERIFY_SCOPE_TYPE.CHANGESET, scopeIdentity: scenario.scopeIdentity },
          }),
        ).toEqual({ ok: true, value: scenario.rootPayload });
        expect(
          evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.SCOPE)?.({
            payload: scenario.specPayload,
            events: [scenario.rootEvent],
            selector: { scopeType: VERIFY_SCOPE_TYPE.CHANGESET, scopeIdentity: scenario.scopeIdentity },
          }),
        ).toEqual({ ok: true, value: scenario.specPayload });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("requires the selected file root first and each child after its recorded parent", () => {
    assertProperty(
      arbitraryFileAuditScopeScenario(),
      (scenario) => {
        expect(
          evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.SCOPE)?.({
            payload: scenario.childPayload,
            events: [],
            selector: { scopeType: VERIFY_SCOPE_TYPE.FILE, scopeIdentity: scenario.scopeIdentity },
          }).ok,
        ).toBe(false);
        expect(
          evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.SCOPE)?.({
            payload: scenario.rootPayload,
            events: [],
            selector: { scopeType: VERIFY_SCOPE_TYPE.FILE, scopeIdentity: scenario.scopeIdentity },
          }),
        ).toEqual({ ok: true, value: scenario.rootPayload });
        expect(
          evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.SCOPE)?.({
            payload: scenario.orphanChildPayload,
            events: [scenario.rootEvent],
            selector: { scopeType: VERIFY_SCOPE_TYPE.FILE, scopeIdentity: scenario.scopeIdentity },
          }).ok,
        ).toBe(false);
        expect(
          evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.SCOPE)?.({
            payload: scenario.childPayload,
            events: [scenario.rootEvent],
            selector: { scopeType: VERIFY_SCOPE_TYPE.FILE, scopeIdentity: scenario.scopeIdentity },
          }),
        ).toEqual({ ok: true, value: scenario.childPayload });
        expect(
          evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.SCOPE)?.({
            payload: scenario.duplicateRootPayload,
            events: [scenario.rootEvent, scenario.childEvent],
            selector: { scopeType: VERIFY_SCOPE_TYPE.FILE, scopeIdentity: scenario.scopeIdentity },
          }).ok,
        ).toBe(false);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
