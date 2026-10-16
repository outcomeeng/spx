import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import { observeBuiltExpectationsOption } from "@testing/harnesses/verify/built-cli";

describe("record-run --expectations option placement through the built executable", () => {
  it(
    "accepts --expectations on start and rejects it on reconcile and finish without changing the run",
    async () => {
      await observeBuiltExpectationsOption().then((observation) => {
        expect(observation.start.exitCode, observation.start.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(observation.reconcileWithExpectations.exitCode).not.toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(observation.reconcileWithExpectations.stderr).toContain(observation.expectationsFlag);
        expect(observation.finishWithExpectations.exitCode).not.toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(observation.finishWithExpectations.stderr).toContain(observation.expectationsFlag);
        expect(observation.statusReport.sealed).toBe(false);
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );
});
