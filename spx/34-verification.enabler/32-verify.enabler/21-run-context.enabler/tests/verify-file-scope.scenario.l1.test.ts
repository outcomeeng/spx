import { describe, expect, it } from "vitest";

import { VERIFY_CLI_ERROR, VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { VERIFICATION_CONTEXT_SUBJECT_KIND } from "@/domains/verification-context/context";
import { VERIFY_SCOPE_TYPE } from "@/domains/verify/verify";
import {
  arbitraryFileScopeCanonicalizationScenario,
  arbitraryFileScopeIdentityScenario,
  sampleVerifyTestValue,
} from "@testing/generators/verify/verify";
import { runFileScopeExistingCommandsScenario, startFileScopeRun } from "@testing/harnesses/verify/harness";

describe("verify file scope", () => {
  it("records and reports a file subject without diff discovery", async () => {
    await expect(
      startFileScopeRun(sampleVerifyTestValue(arbitraryFileScopeIdentityScenario()).input),
    ).resolves.toMatchObject({
      report: {
        resolvedScope: [sampleVerifyTestValue(arbitraryFileScopeIdentityScenario()).normalized],
      },
      context: {
        context: {
          subject: {
            kind: VERIFICATION_CONTEXT_SUBJECT_KIND.FILE,
            path: sampleVerifyTestValue(arbitraryFileScopeIdentityScenario()).normalized,
          },
        },
      },
      nameStatusCalls: 0,
    });
  });

  it("addresses every existing-run command through the canonical file selector", async () => {
    await expect(
      runFileScopeExistingCommandsScenario(
        sampleVerifyTestValue(arbitraryFileScopeCanonicalizationScenario()),
      ),
    ).resolves.toMatchObject({
      selectorFormsDiffer: true,
      start: { exitCode: VERIFY_CLI_EXIT_CODE.OK },
      startReport: { locator: { scopeType: VERIFY_SCOPE_TYPE.FILE } },
      appendScope: { exitCode: VERIFY_CLI_EXIT_CODE.OK },
      appendFinding: { exitCode: VERIFY_CLI_EXIT_CODE.OK },
      status: { exitCode: VERIFY_CLI_EXIT_CODE.OK },
      statusReport: { scopeType: VERIFY_SCOPE_TYPE.FILE },
      mismatchedStatus: {
        exitCode: VERIFY_CLI_EXIT_CODE.ERROR,
        output: expect.stringContaining(VERIFY_CLI_ERROR.RUN_SELECTOR_MISMATCH),
      },
      render: { exitCode: VERIFY_CLI_EXIT_CODE.OK },
      renderReport: { findingCount: 1 },
      finish: { exitCode: VERIFY_CLI_EXIT_CODE.OK },
      finishReport: { terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED },
    });
  });
});
