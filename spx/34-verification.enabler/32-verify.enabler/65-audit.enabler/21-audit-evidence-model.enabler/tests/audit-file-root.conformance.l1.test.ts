import { describe, expect, it } from "vitest";

import { EVIDENCE_REQUIREMENT } from "@/domains/verify/evidence-rejection";
import {
  evidenceValidatorFor,
  VERIFY_EVIDENCE_KIND,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import type { JournalEvent, JsonValue } from "@/lib/agent-run-journal";
import { arbitraryFileAuditScopeScenario } from "@testing/generators/verify/audit";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

/** Project one file-scoped audit scope validation, so a case reads the reason or the accepted value. */
function validateFileScopedAuditScope(
  payload: JsonValue,
  events: readonly JournalEvent[],
  scopeIdentity: string,
) {
  return evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.SCOPE)?.({
    payload,
    events,
    selector: { scopeType: VERIFY_SCOPE_TYPE.FILE, scopeIdentity },
  });
}

describe("audit file-root conformance", () => {
  it("requires a matching root before accepting a related child", () => {
    assertProperty(
      arbitraryFileAuditScopeScenario(),
      (scenario) => {
        const rootless = validateFileScopedAuditScope(scenario.childPayload, [], scenario.scopeIdentity);
        expect(rootless?.ok).toBe(false);
        expect(rootless?.ok === false ? rootless.reason : "").toContain(
          EVIDENCE_REQUIREMENT.AUDIT_FIRST_UNIT_IS_ROOT,
        );
        expect(validateFileScopedAuditScope(scenario.rootPayload, [], scenario.scopeIdentity)).toEqual({
          ok: true,
          value: scenario.rootPayload,
        });
        expect(
          validateFileScopedAuditScope(scenario.childPayload, [scenario.rootEvent], scenario.scopeIdentity),
        ).toEqual({ ok: true, value: scenario.childPayload });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects a root whose subject differs from the selected file, naming the requirement it misses", () => {
    assertProperty(
      arbitraryFileAuditScopeScenario(),
      (scenario) => {
        const mismatched = validateFileScopedAuditScope(
          scenario.mismatchedRootPayload,
          [],
          scenario.scopeIdentity,
        );
        expect(mismatched?.ok).toBe(false);
        expect(mismatched?.ok === false ? mismatched.reason : "").toContain(
          EVIDENCE_REQUIREMENT.AUDIT_FILE_ROOT_MATCHES_SCOPE,
        );
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects a first unit with a parent or optional coverage, naming the requirement each misses", () => {
    assertProperty(
      arbitraryFileAuditScopeScenario(),
      (scenario) => {
        const parented = validateFileScopedAuditScope(scenario.parentedRootPayload, [], scenario.scopeIdentity);
        expect(parented?.ok).toBe(false);
        expect(parented?.ok === false ? parented.reason : "").toContain(
          EVIDENCE_REQUIREMENT.AUDIT_FIRST_UNIT_IS_ROOT,
        );
        const optional = validateFileScopedAuditScope(scenario.optionalRootPayload, [], scenario.scopeIdentity);
        expect(optional?.ok).toBe(false);
        expect(optional?.ok === false ? optional.reason : "").toContain(
          EVIDENCE_REQUIREMENT.AUDIT_FILE_ROOT_MATCHES_SCOPE,
        );
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects a second root in a file-scoped run, naming the requirement it misses", () => {
    assertProperty(
      arbitraryFileAuditScopeScenario(),
      (scenario) => {
        const secondRoot = validateFileScopedAuditScope(
          scenario.rootPayload,
          [scenario.rootEvent],
          scenario.scopeIdentity,
        );
        expect(secondRoot?.ok).toBe(false);
        expect(secondRoot?.ok === false ? secondRoot.reason : "").toContain(
          EVIDENCE_REQUIREMENT.AUDIT_FILE_RUN_HAS_ONE_ROOT,
        );
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects a child naming a parent absent from the run, naming the requirement it misses", () => {
    assertProperty(
      arbitraryFileAuditScopeScenario(),
      (scenario) => {
        const orphan = validateFileScopedAuditScope(
          scenario.orphanChildPayload,
          [scenario.rootEvent],
          scenario.scopeIdentity,
        );
        expect(orphan?.ok).toBe(false);
        expect(orphan?.ok === false ? orphan.reason : "").toContain(
          EVIDENCE_REQUIREMENT.AUDIT_PARENT_IS_RECORDED,
        );
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
