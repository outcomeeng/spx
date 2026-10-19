import { describe, expect, it } from "vitest";

import {
  CONTENT_NORMALIZATION,
  inspectVerificationInput,
  VERIFICATION_INPUT_REJECTION,
} from "@/lib/verification-input";
import {
  referenceSha256,
  sampleVerificationInputValue,
  VERIFICATION_INPUT_TEST_GENERATOR,
} from "@testing/generators/verification-input";
import { withVerificationInputEnv } from "@testing/harnesses/verification-input/harness";

describe("verification input rejection", () => {
  it("rejects an operand that resolves to no file", async () => {
    const scenario = sampleVerificationInputValue(VERIFICATION_INPUT_TEST_GENERATOR.rejectionScenario());

    await withVerificationInputEnv(async (env) => {
      const result = await inspectVerificationInput({
        operand: scenario.path,
        invocationDir: env.root,
        worktreeRoot: env.root,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.diagnostic.operand).toBe(scenario.path);
      expect(result.diagnostic.reason).toBe(VERIFICATION_INPUT_REJECTION.UNRESOLVED);
    });
  });

  it("rejects an operand that resolves to several files", async () => {
    const scenario = sampleVerificationInputValue(VERIFICATION_INPUT_TEST_GENERATOR.rejectionScenario());

    await withVerificationInputEnv(async (env) => {
      await env.writeFile(`${scenario.firstDirectory}/${scenario.name}`, scenario.name);
      await env.writeFile(`${scenario.secondDirectory}/${scenario.name}`, scenario.name);

      const result = await inspectVerificationInput({
        operand: scenario.name,
        invocationDir: env.root,
        worktreeRoot: env.root,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.diagnostic.operand).toBe(scenario.name);
      expect(result.diagnostic.reason).toBe(VERIFICATION_INPUT_REJECTION.AMBIGUOUS);
    });
  });

  it("rejects an operand that is not a regular file", async () => {
    const scenario = sampleVerificationInputValue(VERIFICATION_INPUT_TEST_GENERATOR.rejectionScenario());

    await withVerificationInputEnv(async (env) => {
      await env.makeDirectory(scenario.path);

      const result = await inspectVerificationInput({
        operand: scenario.path,
        invocationDir: env.root,
        worktreeRoot: env.root,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.diagnostic.operand).toBe(scenario.path);
      expect(result.diagnostic.reason).toBe(VERIFICATION_INPUT_REJECTION.NOT_REGULAR_FILE);
    });
  });

  it("rejects an operand whose file is unreadable", async () => {
    const scenario = sampleVerificationInputValue(VERIFICATION_INPUT_TEST_GENERATOR.rejectionScenario());

    await withVerificationInputEnv(async (env) => {
      await env.writeFile(scenario.path, scenario.name);
      await env.makeUnreadable(scenario.path);

      const result = await inspectVerificationInput({
        operand: scenario.path,
        invocationDir: env.root,
        worktreeRoot: env.root,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.diagnostic.operand).toBe(scenario.path);
      expect(result.diagnostic.reason).toBe(VERIFICATION_INPUT_REJECTION.UNREADABLE);
    });
  });

  it("rejects an operand that leaves the worktree root through lexical traversal", async () => {
    const scenario = sampleVerificationInputValue(VERIFICATION_INPUT_TEST_GENERATOR.rejectionScenario());

    await withVerificationInputEnv(async (env) => {
      const outside = await env.writeOutside(scenario.name, scenario.name);
      const operand = env.relativeFromRoot(outside);

      const result = await inspectVerificationInput({
        operand,
        invocationDir: env.root,
        worktreeRoot: env.root,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.diagnostic.operand).toBe(operand);
      expect(result.diagnostic.reason).toBe(VERIFICATION_INPUT_REJECTION.OUTSIDE_ROOT_TRAVERSAL);
    });
  });

  it("rejects an operand that leaves the worktree root through a symbolic link", async () => {
    const scenario = sampleVerificationInputValue(VERIFICATION_INPUT_TEST_GENERATOR.rejectionScenario());

    await withVerificationInputEnv(async (env) => {
      const outside = await env.writeOutside(scenario.name, scenario.name);
      await env.symlink(outside, scenario.path);

      const result = await inspectVerificationInput({
        operand: scenario.path,
        invocationDir: env.root,
        worktreeRoot: env.root,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.diagnostic.operand).toBe(scenario.path);
      expect(result.diagnostic.reason).toBe(VERIFICATION_INPUT_REJECTION.OUTSIDE_ROOT_SYMLINK);
    });
  });

  it("rejects an operand whose bytes fail strict UTF-8 decoding", async () => {
    const scenario = sampleVerificationInputValue(VERIFICATION_INPUT_TEST_GENERATOR.rejectionScenario());
    const invalid = sampleVerificationInputValue(VERIFICATION_INPUT_TEST_GENERATOR.invalidUtf8());

    await withVerificationInputEnv(async (env) => {
      await env.writeFile(scenario.path, invalid);

      const result = await inspectVerificationInput({
        operand: scenario.path,
        invocationDir: env.root,
        worktreeRoot: env.root,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.diagnostic.operand).toBe(scenario.path);
      expect(result.diagnostic.reason).toBe(VERIFICATION_INPUT_REJECTION.INVALID_UTF8);
    });
  });

  it("keeps a byte-order mark as text in the raw digest and the universal-newline digest", async () => {
    const scenario = sampleVerificationInputValue(VERIFICATION_INPUT_TEST_GENERATOR.byteOrderMarkScenario());

    await withVerificationInputEnv(async (env) => {
      await env.writeFile(scenario.path, scenario.bytes);

      const result = await inspectVerificationInput({
        operand: scenario.path,
        invocationDir: env.root,
        worktreeRoot: env.root,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.contentDigests[CONTENT_NORMALIZATION.NONE].sha256).toBe(referenceSha256(scenario.bytes));
      expect(result.value.contentDigests[CONTENT_NORMALIZATION.UTF8_UNIVERSAL_NEWLINES].sha256).toBe(
        referenceSha256(scenario.canonicalTextWithMark),
      );
    });
  });
});
