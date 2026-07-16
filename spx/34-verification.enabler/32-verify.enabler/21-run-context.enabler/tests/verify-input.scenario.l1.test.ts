import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { observeRecordedInputReplay } from "@testing/harnesses/verify/harness";

describe("verify input replay", () => {
  it("returns the exact verification input whose digest was recorded at start", async () => {
    await observeRecordedInputReplay().then(({ scenario, start, startReport, replay, inputReport }) => {
      expect(start.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(replay.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(inputReport.content).toBe(scenario.inputContent);
      expect(inputReport.source).toBe(startReport.input.source);
      expect(inputReport.digest).toBe(startReport.input.digest);
    });
  });
});
