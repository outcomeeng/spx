import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import { observeBuiltRunListForChange } from "@testing/harnesses/verify/built-cli";
import { parseChangeRunsReport } from "@testing/harnesses/verify/change-runs";

describe("verification run list through the built executable", () => {
  it(
    "reports the Change's listing as JSON, including the run spx verification run start --change recorded",
    async () => {
      const change = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.changeIdentity());
      await observeBuiltRunListForChange(change).then((observation) => {
        expect(observation.start.exitCode, observation.start.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(observation.list?.exitCode, observation.list?.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(parseChangeRunsReport(observation.list?.stdout ?? "").change).toBe(change);
        expect(
          Object.values(parseChangeRunsReport(observation.list?.stdout ?? "").runs)
            .flat()
            .map((run) => run.runToken),
        ).toContain(observation.startReport?.runToken);
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );
});
