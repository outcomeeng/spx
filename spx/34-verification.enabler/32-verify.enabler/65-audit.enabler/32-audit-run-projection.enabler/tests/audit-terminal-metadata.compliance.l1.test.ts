import { describe, expect, it } from "vitest";

import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { TERMINAL_METADATA_VALIDATION_ERROR, validateAuditTerminal, VERIFY_SCOPE_TYPE } from "@/domains/verify/verify";
import { arbitraryAuditTerminalMetadataScenario } from "@testing/generators/verify/audit";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("audit terminal metadata", () => {
  it("rejects supplied terminal metadata", async () => {
    assertProperty(
      arbitraryAuditTerminalMetadataScenario(),
      (scenario) => {
        expect(validateAuditTerminal({
          terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
          metadata: scenario.metadata,
          events: [scenario.scope.rootEvent],
          selector: { scopeType: VERIFY_SCOPE_TYPE.FILE, scopeIdentity: scenario.scope.scopeIdentity },
        })).toStrictEqual({
          ok: false,
          error: TERMINAL_METADATA_VALIDATION_ERROR.METADATA_INVALID,
        });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
