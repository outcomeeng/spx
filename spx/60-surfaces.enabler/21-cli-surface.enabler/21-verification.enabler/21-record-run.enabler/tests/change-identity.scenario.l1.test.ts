import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_RUN_CONTEXT_EVENT_FIELD } from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { observeVerificationRunStartChange } from "@testing/harnesses/verify/harness";

describe("record-run start Change identity", () => {
  it("records the Change named by spx verification run start --change on the started run", async () => {
    const change = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.changeIdentity());
    await observeVerificationRunStartChange(change).then((observation) => {
      expect(observation.rejectedByCommander).toBe(false);
      expect(observation.startOptions).toMatchObject([{ change }]);
      expect(observation.startResults.map((result) => result.exitCode)).toStrictEqual([VERIFY_CLI_EXIT_CODE.OK]);
      expect(observation.runContextData[VERIFY_RUN_CONTEXT_EVENT_FIELD.CHANGE]).toBe(change);
    });
  });
});
