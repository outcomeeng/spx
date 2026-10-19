import { describe, expect, it } from "vitest";

import { CONTENT_NORMALIZATION, inspectVerificationInput } from "@/lib/verification-input";
import {
  referenceSha256,
  sampleVerificationInputValue,
  VERIFICATION_INPUT_TEST_GENERATOR,
} from "@testing/generators/verification-input";
import { withVerificationInputEnv } from "@testing/harnesses/verification-input/harness";

describe("verification input inspection", () => {
  it("maps a product file to its canonical path and both content digests", async () => {
    const scenario = sampleVerificationInputValue(VERIFICATION_INPUT_TEST_GENERATOR.textFileScenario());

    await withVerificationInputEnv(async (env) => {
      await env.writeFile(scenario.path, scenario.variants.first);

      const result = await inspectVerificationInput({
        operand: scenario.path,
        invocationDir: env.root,
        worktreeRoot: env.root,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.path).toBe(scenario.path);
      expect(result.value.contentDigests[CONTENT_NORMALIZATION.NONE]).toEqual({
        sha256: referenceSha256(scenario.variants.first),
      });
      expect(result.value.contentDigests[CONTENT_NORMALIZATION.UTF8_UNIVERSAL_NEWLINES]).toEqual({
        version: 1,
        sha256: referenceSha256(scenario.variants.canonical),
      });
    });
  });
});
