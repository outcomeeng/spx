import { describe, expect, it } from "vitest";

import { inspectVerificationInput } from "@/lib/verification-input";
import {
  sampleVerificationInputValue,
  VERIFICATION_INPUT_TEST_GENERATOR,
} from "@testing/generators/verification-input";
import { withVerificationInputEnv } from "@testing/harnesses/verification-input/harness";

describe("verification input inspection effects", () => {
  it("leaves the worktree tree byte for byte unchanged and writes no state", async () => {
    const scenario = sampleVerificationInputValue(VERIFICATION_INPUT_TEST_GENERATOR.fileScenario());

    await withVerificationInputEnv(async (env) => {
      await env.writeFile(scenario.path, scenario.bytes);
      const before = await env.snapshot();

      await inspectVerificationInput({ operand: scenario.path, invocationDir: env.root, worktreeRoot: env.root });
      await inspectVerificationInput({ operand: scenario.otherPath, invocationDir: env.root, worktreeRoot: env.root });

      expect(await env.snapshot()).toEqual(before);
    });
  });
});
