import { describe, expect, it } from "vitest";

import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import {
  TERMINAL_METADATA_VALIDATION_ERROR,
  TERMINAL_REQUIREMENT,
  validateAuditTerminal,
  VERIFY_SCOPE_TYPE,
} from "@/domains/verify/verify";
import {
  arbitraryAuditChangesetProjectionScenario,
  arbitraryChangesetCoherenceScenario,
  AUDIT_FILE_SCOPE_GENERATORS,
} from "@testing/generators/verify/audit";
import { sampleVerifyTestValue } from "@testing/generators/verify/verify";

describe.each(Object.entries(AUDIT_FILE_SCOPE_GENERATORS))("audit terminal rollup: %s", (_kind, scenarioArbitrary) => {
  it("maps clean changeset coverage to approved", () => {
    expect(validateAuditTerminal({
      terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
      events: [
        sampleVerifyTestValue(arbitraryAuditChangesetProjectionScenario()).rootEvent,
        sampleVerifyTestValue(arbitraryAuditChangesetProjectionScenario()).specEvent,
        sampleVerifyTestValue(arbitraryAuditChangesetProjectionScenario()).implementationEvent,
      ],
      selector: {
        scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
        scopeIdentity: sampleVerifyTestValue(arbitraryAuditChangesetProjectionScenario()).scopeIdentity,
      },
    })).toStrictEqual({ ok: true, value: undefined });
  });

  it("maps fully audited rooted coverage to approved", () => {
    expect(validateAuditTerminal({
      terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
      events: [
        sampleVerifyTestValue(scenarioArbitrary()).rootEvent,
        sampleVerifyTestValue(scenarioArbitrary()).childEvent,
      ],
      selector: {
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        scopeIdentity: sampleVerifyTestValue(scenarioArbitrary()).scopeIdentity,
      },
    })).toStrictEqual({ ok: true, value: undefined });
  });

  it("maps required not-applicable coverage to approved", () => {
    expect(validateAuditTerminal({
      terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
      events: [
        sampleVerifyTestValue(scenarioArbitrary()).rootEvent,
        sampleVerifyTestValue(scenarioArbitrary()).requiredNotApplicableEvent,
      ],
      selector: {
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        scopeIdentity: sampleVerifyTestValue(scenarioArbitrary()).scopeIdentity,
      },
    })).toStrictEqual({ ok: true, value: undefined });
  });

  it("maps optional uncovered coverage to approved", () => {
    expect(validateAuditTerminal({
      terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
      events: [
        sampleVerifyTestValue(scenarioArbitrary()).rootEvent,
        sampleVerifyTestValue(scenarioArbitrary()).optionalUncoveredEvent,
      ],
      selector: {
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        scopeIdentity: sampleVerifyTestValue(scenarioArbitrary()).scopeIdentity,
      },
    })).toStrictEqual({ ok: true, value: undefined });
  });

  it("maps zero valid scope units to rejected", () => {
    expect(validateAuditTerminal({
      terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED,
      events: [],
      selector: {
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        scopeIdentity: sampleVerifyTestValue(scenarioArbitrary()).scopeIdentity,
      },
    })).toStrictEqual({ ok: true, value: undefined });
  });

  it("maps optional and parented sole roots to rejected", () => {
    expect(validateAuditTerminal({
      terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED,
      events: [sampleVerifyTestValue(scenarioArbitrary()).optionalRootEvent],
      selector: {
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        scopeIdentity: sampleVerifyTestValue(scenarioArbitrary()).scopeIdentity,
      },
    })).toStrictEqual({ ok: true, value: undefined });
    expect(validateAuditTerminal({
      terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED,
      events: [sampleVerifyTestValue(scenarioArbitrary()).parentedRootEvent],
      selector: {
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        scopeIdentity: sampleVerifyTestValue(scenarioArbitrary()).scopeIdentity,
      },
    })).toStrictEqual({ ok: true, value: undefined });
  });

  it("maps every required uncovered status to rejected", () => {
    expect(
      sampleVerifyTestValue(scenarioArbitrary()).requiredUncoveredEvents.map((event) =>
        validateAuditTerminal({
          terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED,
          events: [sampleVerifyTestValue(scenarioArbitrary()).rootEvent, event],
          selector: {
            scopeType: VERIFY_SCOPE_TYPE.FILE,
            scopeIdentity: sampleVerifyTestValue(scenarioArbitrary()).scopeIdentity,
          },
        })
      ),
    ).toStrictEqual(
      sampleVerifyTestValue(scenarioArbitrary()).requiredUncoveredEvents.map(() => ({
        ok: true,
        value: undefined,
      })),
    );
  });

  it("maps a required coverage gap to rejected", () => {
    expect(validateAuditTerminal({
      terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED,
      events: [
        sampleVerifyTestValue(scenarioArbitrary()).rootEvent,
        sampleVerifyTestValue(scenarioArbitrary()).requiredCoverageGapEvent,
      ],
      selector: {
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        scopeIdentity: sampleVerifyTestValue(scenarioArbitrary()).scopeIdentity,
      },
    })).toStrictEqual({ ok: true, value: undefined });
  });

  it("maps every audit finding severity to rejected", () => {
    expect(
      sampleVerifyTestValue(scenarioArbitrary()).findingEvents.map((event) =>
        validateAuditTerminal({
          terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED,
          events: [sampleVerifyTestValue(scenarioArbitrary()).rootEvent, event],
          selector: {
            scopeType: VERIFY_SCOPE_TYPE.FILE,
            scopeIdentity: sampleVerifyTestValue(scenarioArbitrary()).scopeIdentity,
          },
        })
      ),
    ).toStrictEqual(
      sampleVerifyTestValue(scenarioArbitrary()).findingEvents.map(() => ({
        ok: true,
        value: undefined,
      })),
    );
  });

  it("maps more than one recorded review unit to rejected", () => {
    expect(validateAuditTerminal({
      terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED,
      events: [
        sampleVerifyTestValue(arbitraryChangesetCoherenceScenario()).rootEvent,
        ...sampleVerifyTestValue(arbitraryChangesetCoherenceScenario()).reviewUnitEvents,
      ],
      selector: {
        scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
        scopeIdentity: sampleVerifyTestValue(arbitraryChangesetCoherenceScenario()).scopeIdentity,
      },
    })).toStrictEqual({ ok: true, value: undefined });
  });

  it("maps a mismatched file root to rejected", () => {
    expect(validateAuditTerminal({
      terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
      events: [sampleVerifyTestValue(scenarioArbitrary()).mismatchedRootEvent],
      selector: {
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        scopeIdentity: sampleVerifyTestValue(scenarioArbitrary()).scopeIdentity,
      },
    })).toStrictEqual({
      ok: false,
      error: TERMINAL_METADATA_VALIDATION_ERROR.STATUS_CONFLICT,
      reason: expect.stringContaining(TERMINAL_REQUIREMENT.STATUS_MATCHES_EVIDENCE),
    });
    expect(validateAuditTerminal({
      terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED,
      events: [sampleVerifyTestValue(scenarioArbitrary()).mismatchedRootEvent],
      selector: {
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        scopeIdentity: sampleVerifyTestValue(scenarioArbitrary()).scopeIdentity,
      },
    })).toStrictEqual({ ok: true, value: undefined });
  });
});
