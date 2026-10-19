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
    "resolves the %s spelling of a file to its one canonical identity through its own candidate source",
    async (spelling) => {
      const relativePath = sampleVerificationInputValue(VERIFICATION_INPUT_TEST_GENERATOR.nestedProductRelativePath());

      await withVerificationInputEnv(async (env) => {
        await env.writeFile(relativePath, relativePath);
        const { operand, invocationDir, listedByGit } = operandForSpelling(
          spelling,
          { root: env.root, elsewhere: env.outsideDir },
          relativePath,
        );
        if (!listedByGit) await env.ignore(relativePath);

        const result = await inspectVerificationInput({ operand, invocationDir, worktreeRoot: env.root });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.path).toBe(relativePath);
      });
    },
  );
});
