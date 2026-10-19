import { describe, expect, it } from "vitest";

import { inspectVerificationInput, OPERAND_SPELLING } from "@/lib/verification-input";
import {
  operandForSpelling,
  sampleVerificationInputValue,
  VERIFICATION_INPUT_TEST_GENERATOR,
} from "@testing/generators/verification-input";
import { withVerificationInputEnv } from "@testing/harnesses/verification-input/harness";

describe("verification input operand resolution", () => {
  it.each(Object.values(OPERAND_SPELLING))(
    "resolves the %s spelling of a file to its one canonical identity",
    async (spelling) => {
      const relativePath = sampleVerificationInputValue(VERIFICATION_INPUT_TEST_GENERATOR.productRelativePath());

      await withVerificationInputEnv(async (env) => {
        await env.writeFile(relativePath, relativePath);
        const { operand, invocationDir } = operandForSpelling(spelling, env.root, relativePath);

        const result = await inspectVerificationInput({ operand, invocationDir, worktreeRoot: env.root });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.path).toBe(relativePath);
      });
    },
  );
});
