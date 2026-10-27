import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import {
  sampleVerificationInputValue,
  VERIFICATION_INPUT_TEST_GENERATOR,
} from "@testing/generators/verification-input";
import { CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import { runBuiltInputInspect } from "@testing/harnesses/verification-input/built-cli";
import { withVerificationInputEnv } from "@testing/harnesses/verification-input/harness";

describe("verification input inspect is read-only through the built executable", () => {
  it(
    "leaves the worktree, run store included, exactly as it was after inspecting a product file",
    async () => {
      const scenario = sampleVerificationInputValue(VERIFICATION_INPUT_TEST_GENERATOR.fileScenario());

      await withVerificationInputEnv(async (env) => {
        await env.writeFile(scenario.path, scenario.bytes);
        const before = await env.snapshot();

        const run = await runBuiltInputInspect(env.root, scenario.path);

        expect(run.exitCode, run.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(await env.snapshot()).toEqual(before);
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );

  it(
    "leaves the worktree exactly as it was when the inspection is rejected",
    async () => {
      const scenario = sampleVerificationInputValue(VERIFICATION_INPUT_TEST_GENERATOR.rejectionScenario());

      await withVerificationInputEnv(async (env) => {
        const before = await env.snapshot();

        const run = await runBuiltInputInspect(env.root, scenario.path);

        expect(run.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(await env.snapshot()).toEqual(before);
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );
});
