import { describe, expect, it } from "vitest";

import { inspectVerificationInput, VERIFICATION_INPUT_REJECTION } from "@/lib/verification-input";
import {
  sampleVerificationInputValue,
  VERIFICATION_INPUT_TEST_GENERATOR,
} from "@testing/generators/verification-input";
import { arrangeRejectionCase, withVerificationInputEnv } from "@testing/harnesses/verification-input/harness";

describe("verification input rejection", () => {
  it.each(Object.values(VERIFICATION_INPUT_REJECTION))(
    "rejects an operand violating %s with a diagnostic naming the operand",
    async (reason) => {
      const relativePath = sampleVerificationInputValue(VERIFICATION_INPUT_TEST_GENERATOR.productRelativePath());

      await withVerificationInputEnv(async (env) => {
        const arranged = await arrangeRejectionCase(env, reason, relativePath);

        const result = await inspectVerificationInput({
          operand: arranged.operand,
          invocationDir: env.root,
          worktreeRoot: env.root,
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.diagnostic.operand).toBe(arranged.operand);
        expect(result.diagnostic.reason).toBe(reason);
      });
    },
  );

  it("keeps a byte-order mark as text rather than rejecting the file", async () => {
    const relativePath = sampleVerificationInputValue(VERIFICATION_INPUT_TEST_GENERATOR.productRelativePath());

    await withVerificationInputEnv(async (env) => {
      await env.writeFile(relativePath, Uint8Array.from([0xef, 0xbb, 0xbf, 0x61]));

      const result = await inspectVerificationInput({
        operand: relativePath,
        invocationDir: env.root,
        worktreeRoot: env.root,
      });

      expect(result.ok).toBe(true);
    });
  });
});
