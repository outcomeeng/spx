import { describe, expect, it } from "vitest";

import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { AUDIT_KIND, projectVerifyRun, validateAuditTerminal, VERIFY_SCOPE_TYPE } from "@/domains/verify/verify";
import { arbitraryChangesetCoherenceScenario } from "@testing/generators/verify/audit";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("coherence review-unit rollup and order", () => {
  it("rolls a run recording more than one review unit up to rejected", () => {
    assertProperty(
      arbitraryChangesetCoherenceScenario(),
      (scenario) => {
        const events = [scenario.rootEvent, ...scenario.reviewUnitEvents];
        expect(validateAuditTerminal({
          terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED,
          events,
          selector: { scopeType: VERIFY_SCOPE_TYPE.CHANGESET, scopeIdentity: scenario.scopeIdentity },
        })).toStrictEqual({ ok: true, value: undefined });
        expect(validateAuditTerminal({
          terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED,
          events: [...events, scenario.findingEvent],
          selector: { scopeType: VERIFY_SCOPE_TYPE.CHANGESET, scopeIdentity: scenario.scopeIdentity },
        })).toStrictEqual({ ok: true, value: undefined });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rolls a run recording one review unit up to approved", () => {
    assertProperty(
      arbitraryChangesetCoherenceScenario(),
      (scenario) => {
        expect(validateAuditTerminal({
          terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
          events: [scenario.rootEvent, scenario.soleReviewUnitEvent],
          selector: { scopeType: VERIFY_SCOPE_TYPE.CHANGESET, scopeIdentity: scenario.scopeIdentity },
        })).toStrictEqual({ ok: true, value: undefined });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("projects review units in the order the run recorded them", () => {
    assertProperty(
      arbitraryChangesetCoherenceScenario(),
      (scenario) => {
        expect(
          projectVerifyRun([scenario.rootEvent, ...scenario.reviewUnitEvents])
            .auditScopeUnits
            .filter((unit) => unit.auditKind === AUDIT_KIND.REVIEW_UNIT)
            .map((unit) => unit.unitId),
        ).toStrictEqual(scenario.reviewUnitIds);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
