import { describe, expect, it } from "vitest";

import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { TERMINAL_METADATA_VALIDATION_ERROR, validateAuditTerminal, VERIFY_SCOPE_TYPE } from "@/domains/verify/verify";
import { arbitraryFileAuditScopeScenario } from "@testing/generators/verify/audit";
import { sampleVerifyTestValue } from "@testing/generators/verify/verify";

describe("audit file-root terminal compliance", () => {
  it("rejects approval when a file-scoped run has more than one root", () => {
    expect(validateAuditTerminal({
      terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
      events: [
        sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).rootEvent,
        sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).duplicateRootEvent,
      ],
      selector: {
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        scopeIdentity: sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).scopeIdentity,
      },
    })).toMatchObject({
      ok: false,
      error: TERMINAL_METADATA_VALIDATION_ERROR.STATUS_CONFLICT,
    });
    expect(validateAuditTerminal({
      terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
      events: [sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).mismatchedRootEvent],
      selector: {
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        scopeIdentity: sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).scopeIdentity,
      },
    })).toMatchObject({
      ok: false,
      error: TERMINAL_METADATA_VALIDATION_ERROR.STATUS_CONFLICT,
    });
    expect(validateAuditTerminal({
      terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
      events: [sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).optionalRootEvent],
      selector: {
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        scopeIdentity: sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).scopeIdentity,
      },
    })).toMatchObject({
      ok: false,
      error: TERMINAL_METADATA_VALIDATION_ERROR.STATUS_CONFLICT,
    });
    expect(validateAuditTerminal({
      terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
      events: [sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).parentedRootEvent],
      selector: {
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        scopeIdentity: sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).scopeIdentity,
      },
    })).toMatchObject({
      ok: false,
      error: TERMINAL_METADATA_VALIDATION_ERROR.STATUS_CONFLICT,
    });
  });
});
