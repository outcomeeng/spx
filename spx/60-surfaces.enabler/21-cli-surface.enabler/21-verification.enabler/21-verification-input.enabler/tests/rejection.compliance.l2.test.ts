import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import {
  sampleVerificationInputValue,
  VERIFICATION_INPUT_TEST_GENERATOR,
} from "@testing/generators/verification-input";
import { CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import { runBuiltInputInspect } from "@testing/harnesses/verification-input/built-cli";
import { withVerificationInputEnv } from "@testing/harnesses/verification-input/harness";

describe("verification input inspect rejection through the built executable", () => {
  it(
    "exits 1 with the operand on standard error and empty standard output when the operand resolves to no file",
    async () => {
      const scenario = sampleVerificationInputValue(VERIFICATION_INPUT_TEST_GENERATOR.rejectionScenario());

      await withVerificationInputEnv(async (env) => {
        const run = await runBuiltInputInspect(env.root, scenario.path);

        expect(run.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(run.stdout).toHaveLength(0);
        expect(run.stderr).toContain(scenario.path);
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );

  it(
    "names an operand carrying a control byte on standard error with the byte escaped",
    async () => {
      const scenario = sampleVerificationInputValue(VERIFICATION_INPUT_TEST_GENERATOR.controlByteOperand());

      await withVerificationInputEnv(async (env) => {
        const run = await runBuiltInputInspect(env.root, scenario.operand);

        expect(run.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(run.stdout).toHaveLength(0);
        expect(run.stderr).toContain(scenario.printablePrefix);
        expect(run.stderr).not.toContain(scenario.controlByte);
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );
});
