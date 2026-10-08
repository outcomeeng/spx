import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE, VERIFY_STATUS_REPORT_FIELD } from "@/commands/verify/cli";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import { observeBuiltRunStartChange } from "@testing/harnesses/verify/built-cli";

describe("record-run start Change identity through the built executable", () => {
  it(
    "records the Change named by spx verification run start --change, and status reports it back",
    async () => {
      const change = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.changeIdentity());
      await observeBuiltRunStartChange(change).then((observation) => {
        expect(observation.start.exitCode, observation.start.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(observation.status?.exitCode, observation.status?.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(observation.statusReport?.[VERIFY_STATUS_REPORT_FIELD.CHANGE]).toBe(change);
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );
});
