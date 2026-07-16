import { describe, expect, it } from "vitest";

import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { TERMINAL_METADATA_VALIDATION_ERROR, validateAuditTerminal, VERIFY_SCOPE_TYPE } from "@/domains/verify/verify";
import { arbitraryFileAuditScopeScenario } from "@testing/generators/verify/audit";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("audit file-root terminal mapping", () => {
  it("maps matching rooted coverage to approved and mismatched coverage to rejected", () => {
    assertProperty(
      arbitraryFileAuditScopeScenario(),
      (scenario) => {
        expect(validateAuditTerminal({
          terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
          events: [scenario.rootEvent, scenario.childEvent],
          selector: { scopeType: VERIFY_SCOPE_TYPE.FILE, scopeIdentity: scenario.scopeIdentity },
        })).toStrictEqual({ ok: true, value: undefined });
        expect(validateAuditTerminal({
          terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
          events: [scenario.rootEvent, scenario.requiredNotApplicableEvent],
          selector: { scopeType: VERIFY_SCOPE_TYPE.FILE, scopeIdentity: scenario.scopeIdentity },
        })).toStrictEqual({ ok: true, value: undefined });
        expect(validateAuditTerminal({
          terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
          events: [scenario.rootEvent, scenario.optionalUncoveredEvent],
          selector: { scopeType: VERIFY_SCOPE_TYPE.FILE, scopeIdentity: scenario.scopeIdentity },
        })).toStrictEqual({ ok: true, value: undefined });
        expect(validateAuditTerminal({
          terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED,
          events: [],
          selector: { scopeType: VERIFY_SCOPE_TYPE.FILE, scopeIdentity: scenario.scopeIdentity },
        })).toStrictEqual({ ok: true, value: undefined });
        for (const requiredUncoveredEvent of scenario.requiredUncoveredEvents) {
          expect(validateAuditTerminal({
            terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED,
            events: [scenario.rootEvent, requiredUncoveredEvent],
            selector: { scopeType: VERIFY_SCOPE_TYPE.FILE, scopeIdentity: scenario.scopeIdentity },
          })).toStrictEqual({ ok: true, value: undefined });
        }
        expect(validateAuditTerminal({
          terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED,
          events: [scenario.rootEvent, scenario.requiredCoverageGapEvent],
          selector: { scopeType: VERIFY_SCOPE_TYPE.FILE, scopeIdentity: scenario.scopeIdentity },
        })).toStrictEqual({ ok: true, value: undefined });
        for (const findingEvent of scenario.findingEvents) {
          expect(validateAuditTerminal({
            terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED,
            events: [scenario.rootEvent, findingEvent],
            selector: { scopeType: VERIFY_SCOPE_TYPE.FILE, scopeIdentity: scenario.scopeIdentity },
          })).toStrictEqual({ ok: true, value: undefined });
        }
        expect(validateAuditTerminal({
          terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
          events: [scenario.mismatchedRootEvent],
          selector: { scopeType: VERIFY_SCOPE_TYPE.FILE, scopeIdentity: scenario.scopeIdentity },
        })).toStrictEqual({
          ok: false,
          error: TERMINAL_METADATA_VALIDATION_ERROR.STATUS_CONFLICT,
        });
        expect(validateAuditTerminal({
          terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED,
          events: [scenario.mismatchedRootEvent],
          selector: { scopeType: VERIFY_SCOPE_TYPE.FILE, scopeIdentity: scenario.scopeIdentity },
        })).toStrictEqual({ ok: true, value: undefined });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
