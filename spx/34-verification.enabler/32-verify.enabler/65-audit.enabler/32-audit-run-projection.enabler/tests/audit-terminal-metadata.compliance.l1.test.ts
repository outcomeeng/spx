import { describe, expect, it } from "vitest";

import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { TERMINAL_METADATA_VALIDATION_ERROR, validateAuditTerminal, VERIFY_SCOPE_TYPE } from "@/domains/verify/verify";
import { arbitraryAuditTerminalMetadataScenario } from "@testing/generators/verify/audit";
import { sampleVerifyTestValue } from "@testing/generators/verify/verify";

describe("audit terminal metadata", () => {
  it("rejects supplied terminal metadata", () => {
    expect(validateAuditTerminal({
      terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
      metadata: sampleVerifyTestValue(arbitraryAuditTerminalMetadataScenario()).metadata,
      events: [sampleVerifyTestValue(arbitraryAuditTerminalMetadataScenario()).scope.rootEvent],
      selector: {
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        scopeIdentity: sampleVerifyTestValue(arbitraryAuditTerminalMetadataScenario()).scope.scopeIdentity,
      },
    })).toStrictEqual({
      ok: false,
      error: TERMINAL_METADATA_VALIDATION_ERROR.METADATA_INVALID,
    });
  });
});
