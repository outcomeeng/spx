import { describe, expect, it } from "vitest";

import { EVIDENCE_REQUIREMENT } from "@/domains/verify/evidence-rejection";
import {
  evidenceValidatorFor,
  VERIFY_EVIDENCE_KIND,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import type { JournalEvent, JsonValue } from "@/lib/agent-run-journal";
import { arbitraryChangesetCoherenceScenario } from "@testing/generators/verify/audit";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

function validateChangesetScopedAudit(
  payload: JsonValue,
  events: readonly JournalEvent[],
  scopeIdentity: string,
) {
  return evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.SCOPE)?.({
    payload,
    events,
    selector: { scopeType: VERIFY_SCOPE_TYPE.CHANGESET, scopeIdentity },
  });
}

function validateFileScopedAudit(payload: JsonValue, events: readonly JournalEvent[], scopeIdentity: string) {
  return evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.AUDIT, VERIFY_EVIDENCE_KIND.SCOPE)?.({
    payload,
    events,
    selector: { scopeType: VERIFY_SCOPE_TYPE.FILE, scopeIdentity },
  });
}

function unmetRequirement(result: ReturnType<typeof validateChangesetScopedAudit>): string {
  return result?.ok === false ? result.reason : "";
}

describe("changeset coherence root conformance", () => {
  it("accepts a required parentless coherence root named for the run's changeset scope", () => {
    assertProperty(
      arbitraryChangesetCoherenceScenario(),
      (scenario) => {
        expect(validateChangesetScopedAudit(scenario.rootPayload, [], scenario.scopeIdentity)).toEqual({
          ok: true,
          value: scenario.rootPayload,
        });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects a coherence root that is optional, parented, mis-subjected, or recorded late", () => {
    assertProperty(
      arbitraryChangesetCoherenceScenario(),
      (scenario) => {
        for (const payload of [scenario.optionalRootPayload, scenario.mismatchedSubjectRootPayload]) {
          expect(unmetRequirement(validateChangesetScopedAudit(payload, [], scenario.scopeIdentity)))
            .toContain(EVIDENCE_REQUIREMENT.AUDIT_CHANGESET_ROOT_IS_COHERENCE);
        }
        expect(unmetRequirement(
          validateChangesetScopedAudit(scenario.parentedRootPayload, [], scenario.scopeIdentity),
        )).toContain(EVIDENCE_REQUIREMENT.AUDIT_CHANGESET_ROOT_IS_COHERENCE);
        expect(unmetRequirement(validateChangesetScopedAudit(
          scenario.lateRootPayload,
          [scenario.rootEvent],
          scenario.scopeIdentity,
        ))).toContain(EVIDENCE_REQUIREMENT.AUDIT_CHANGESET_ROOT_IS_COHERENCE);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects a review unit opening the run or naming a parent that is not the coherence root", () => {
    assertProperty(
      arbitraryChangesetCoherenceScenario(),
      (scenario) => {
        expect(unmetRequirement(
          validateChangesetScopedAudit(scenario.reviewUnitFirstPayload, [], scenario.scopeIdentity),
        )).toContain(EVIDENCE_REQUIREMENT.AUDIT_REVIEW_UNIT_PARENT_IS_COHERENCE_ROOT);
        expect(unmetRequirement(validateChangesetScopedAudit(
          scenario.unrootedReviewUnitPayload,
          [scenario.rootEvent],
          scenario.scopeIdentity,
        ))).toContain(EVIDENCE_REQUIREMENT.AUDIT_REVIEW_UNIT_PARENT_IS_COHERENCE_ROOT);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("accepts every review unit that names the recorded coherence root as its parent", () => {
    assertProperty(
      arbitraryChangesetCoherenceScenario(),
      (scenario) => {
        expect(
          scenario.reviewUnitPayloads.map((payload) =>
            validateChangesetScopedAudit(payload, [scenario.rootEvent], scenario.scopeIdentity)
          ),
        ).toStrictEqual(scenario.reviewUnitPayloads.map((payload) => ({ ok: true, value: payload })));
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects a changeset-class unit recorded in a file-scoped run", () => {
    assertProperty(
      arbitraryChangesetCoherenceScenario(),
      (scenario) => {
        expect(unmetRequirement(
          validateFileScopedAudit(scenario.rootPayload, [], scenario.fileScopeIdentity),
        )).toContain(EVIDENCE_REQUIREMENT.AUDIT_CHANGESET_CLASS_NEEDS_CHANGESET_SCOPE);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
