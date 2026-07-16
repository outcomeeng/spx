import { describe, expect, it } from "vitest";

import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import {
  TERMINAL_METADATA_VALIDATION_ERROR,
  validateAuditTerminal,
  VERIFY_SCOPE_TYPE,
} from "@/domains/verify/verify";
import { arbitraryFileAuditScopeScenario } from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("audit file-root terminal compliance", () => {
  it("rejects approval when a file-scoped run has more than one root", () => {
    assertProperty(
      arbitraryFileAuditScopeScenario(),
      (scenario) => {
        expect(validateAuditTerminal({
          terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
          events: [scenario.rootEvent, scenario.duplicateRootEvent],
          selector: { scopeType: VERIFY_SCOPE_TYPE.FILE, scopeIdentity: scenario.scopeIdentity },
        })).toStrictEqual({
          ok: false,
          error: TERMINAL_METADATA_VALIDATION_ERROR.STATUS_CONFLICT,
        });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
