import { describe, expect, it } from "vitest";

import { VERIFY_CLI_ERROR, VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { observeStartWithChangeIdentityState } from "@testing/harnesses/verify/harness";

describe("verify start Change identity compliance", () => {
  it("rejects a Change identity outside the canonical owner/repo#N form before any run state exists", async () => {
    await assertProperty(
      VERIFY_TEST_GENERATOR.nonCanonicalChangeIdentity(),
      async (change) => {
        const observation = await observeStartWithChangeIdentityState(change);
        expect(observation.started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(observation.started.output).toBe(VERIFY_CLI_ERROR.CHANGE_IDENTITY_INVALID);
        expect(observation.stateRootExists).toBe(false);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("accepts a canonical Change identity and creates the run state", async () => {
    await assertProperty(
      VERIFY_TEST_GENERATOR.changeIdentity(),
      async (change) => {
        const observation = await observeStartWithChangeIdentityState(change);
        expect(observation.started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(observation.stateRootExists).toBe(true);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
