import { describe, expect, it } from "vitest";

import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { TERMINAL_METADATA_VALIDATION_ERROR, validateAuditTerminal, VERIFY_SCOPE_TYPE } from "@/domains/verify/verify";
import { arbitraryFileAuditScopeScenario } from "@testing/generators/verify/audit";
import { sampleVerifyTestValue } from "@testing/generators/verify/verify";

describe("audit file-root terminal mapping", () => {
  it("maps fully audited rooted coverage to approved", () => {
    expect(validateAuditTerminal({
      terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
      events: [
        sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).rootEvent,
        sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).childEvent,
      ],
      selector: {
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        scopeIdentity: sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).scopeIdentity,
      },
    })).toStrictEqual({ ok: true, value: undefined });
  });

  it("maps required not-applicable coverage to approved", () => {
    expect(validateAuditTerminal({
      terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
      events: [
        sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).rootEvent,
        sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).requiredNotApplicableEvent,
      ],
      selector: {
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        scopeIdentity: sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).scopeIdentity,
      },
    })).toStrictEqual({ ok: true, value: undefined });
  });

  it("maps optional uncovered coverage to approved", () => {
    expect(validateAuditTerminal({
      terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
      events: [
        sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).rootEvent,
        sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).optionalUncoveredEvent,
      ],
      selector: {
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        scopeIdentity: sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).scopeIdentity,
      },
    })).toStrictEqual({ ok: true, value: undefined });
  });

  it("maps zero valid scope units to rejected", () => {
    expect(validateAuditTerminal({
      terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED,
      events: [],
      selector: {
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        scopeIdentity: sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).scopeIdentity,
      },
    })).toStrictEqual({ ok: true, value: undefined });
  });

  it("maps every required uncovered status to rejected", () => {
    expect(
      sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).requiredUncoveredEvents.map((event) =>
        validateAuditTerminal({
          terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED,
          events: [sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).rootEvent, event],
          selector: {
            scopeType: VERIFY_SCOPE_TYPE.FILE,
            scopeIdentity: sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).scopeIdentity,
          },
        })
      ),
    ).toStrictEqual(
      sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).requiredUncoveredEvents.map(() => ({
        ok: true,
        value: undefined,
      })),
    );
  });

  it("maps a required coverage gap to rejected", () => {
    expect(validateAuditTerminal({
      terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED,
      events: [
        sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).rootEvent,
        sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).requiredCoverageGapEvent,
      ],
      selector: {
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        scopeIdentity: sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).scopeIdentity,
      },
    })).toStrictEqual({ ok: true, value: undefined });
  });

  it("maps every audit finding severity to rejected", () => {
    expect(
      sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).findingEvents.map((event) =>
        validateAuditTerminal({
          terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED,
          events: [sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).rootEvent, event],
          selector: {
            scopeType: VERIFY_SCOPE_TYPE.FILE,
            scopeIdentity: sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).scopeIdentity,
          },
        })
      ),
    ).toStrictEqual(
      sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).findingEvents.map(() => ({
        ok: true,
        value: undefined,
      })),
    );
  });

  it("maps a mismatched file root to rejected", () => {
    expect(validateAuditTerminal({
      terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
      events: [sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).mismatchedRootEvent],
      selector: {
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        scopeIdentity: sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).scopeIdentity,
      },
    })).toStrictEqual({
      ok: false,
      error: TERMINAL_METADATA_VALIDATION_ERROR.STATUS_CONFLICT,
    });
    expect(validateAuditTerminal({
      terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED,
      events: [sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).mismatchedRootEvent],
      selector: {
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        scopeIdentity: sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).scopeIdentity,
      },
    })).toStrictEqual({ ok: true, value: undefined });
  });
});
