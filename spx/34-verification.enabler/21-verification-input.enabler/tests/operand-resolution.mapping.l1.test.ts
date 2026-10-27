import { describe, expect, it } from "vitest";

import { inspectVerificationInput, OPERAND_SPELLING, VERIFICATION_INPUT_REJECTION } from "@/lib/verification-input";
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
  it.each(Object.values(OPERAND_SPELLING))(
    "keeps a file inside the root whose first path component begins with two dots when spelled by %s",
    async (spelling) => {
      const relativePath = sampleVerificationInputValue(
        VERIFICATION_INPUT_TEST_GENERATOR.leadingDotsProductRelativePath(true),
      );

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

  it.each([
    OPERAND_SPELLING.ABSOLUTE,
    OPERAND_SPELLING.FROM_INVOCATION_DIRECTORY,
    OPERAND_SPELLING.FROM_WORKTREE_ROOT,
  ])(
    "keeps a file named with two leading dots directly under the root when spelled by %s",
    async (spelling) => {
      const relativePath = sampleVerificationInputValue(
        VERIFICATION_INPUT_TEST_GENERATOR.leadingDotsProductRelativePath(false),
      );

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

  it("collapses the candidates every source yields for one file to its one identity", async () => {
    const relativePath = sampleVerificationInputValue(VERIFICATION_INPUT_TEST_GENERATOR.nestedProductRelativePath());

    await withVerificationInputEnv(async (env) => {
      await env.writeFile(relativePath, relativePath);

      const result = await inspectVerificationInput({
        operand: relativePath,
        invocationDir: env.root,
        worktreeRoot: env.root,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.path).toBe(relativePath);
    });
  });

  it("discards a candidate outside the worktree root and accepts the one identity inside it", async () => {
    const relativePath = sampleVerificationInputValue(VERIFICATION_INPUT_TEST_GENERATOR.nestedProductRelativePath());
    const name = relativePath.split("/").at(-1) ?? relativePath;

    await withVerificationInputEnv(async (env) => {
      await env.writeFile(relativePath, relativePath);
      await env.writeOutside(name, name);

      const result = await inspectVerificationInput({
        operand: name,
        invocationDir: env.outsideDir,
        worktreeRoot: env.root,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.path).toBe(relativePath);
    });
  });

  it("resolves a symbolic link inside the worktree root to the identity of the file it names", async () => {
    const scenario = sampleVerificationInputValue(VERIFICATION_INPUT_TEST_GENERATOR.rejectionScenario());
    const targetPath = `${scenario.firstDirectory}/${scenario.name}`;
    const linkPath = `${scenario.secondDirectory}/${scenario.name}`;

    await withVerificationInputEnv(async (env) => {
      const target = await env.writeFile(targetPath, scenario.name);
      await env.symlink(target, linkPath);

      const result = await inspectVerificationInput({
        operand: linkPath,
        invocationDir: env.root,
        worktreeRoot: env.root,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.path).toBe(targetPath);
    });
  });

  it("matches a suffix only on complete path components", async () => {
    const relativePath = sampleVerificationInputValue(VERIFICATION_INPUT_TEST_GENERATOR.nestedProductRelativePath());
    const name = relativePath.split("/").at(-1) ?? relativePath;

    await withVerificationInputEnv(async (env) => {
      await env.writeFile(relativePath, relativePath);

      const result = await inspectVerificationInput({
        operand: name.slice(1),
        invocationDir: env.root,
        worktreeRoot: env.root,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.diagnostic.reason).toBe(VERIFICATION_INPUT_REJECTION.UNRESOLVED);
    });
  });

  it("matches a suffix over a file git lists as tracked", async () => {
    const relativePath = sampleVerificationInputValue(VERIFICATION_INPUT_TEST_GENERATOR.nestedProductRelativePath());

    await withVerificationInputEnv(async (env) => {
      await env.writeFile(relativePath, relativePath);
      await env.track(relativePath);

      const result = await inspectVerificationInput({
        operand: relativePath.split("/").slice(1).join("/"),
        invocationDir: env.outsideDir,
        worktreeRoot: env.root,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.path).toBe(relativePath);
    });
  });

  it("matches no suffix over a file git ignores", async () => {
    const relativePath = sampleVerificationInputValue(VERIFICATION_INPUT_TEST_GENERATOR.nestedProductRelativePath());

    await withVerificationInputEnv(async (env) => {
      await env.writeFile(relativePath, relativePath);
      await env.ignore(relativePath);

      const result = await inspectVerificationInput({
        operand: relativePath.split("/").slice(1).join("/"),
        invocationDir: env.root,
        worktreeRoot: env.root,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.diagnostic.reason).toBe(VERIFICATION_INPUT_REJECTION.UNRESOLVED);
    });
  });
});
