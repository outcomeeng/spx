import { realpath } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { detectLocalProductRoot } from "@/lib/git/root";
import { localProductRootCases } from "@testing/generators/product-root/local-product-root";
import { withLocalProductRootEnv } from "@testing/harnesses/product-root/local-product-root";

describe("detectLocalProductRoot — each layout maps to the local product root the worktree-management decision defines", () => {
  it.each(
    localProductRootCases().map((layoutCase) =>
      [`${layoutCase.layout} (${layoutCase.configFilename})`, layoutCase] as const
    ),
  )(
    "%s",
    async (_name, layoutCase) => {
      await withLocalProductRootEnv(layoutCase, async (env) => {
        const result = await detectLocalProductRoot(env.invocationDir);
        expect(await realpath(result.productDir)).toBe(env.expectedProductDir);
        expect(result.isGitRepo).toBe(layoutCase.insideGit);
        expect(result.warning === undefined).toBe(layoutCase.insideGit);
      });
    },
  );
});
