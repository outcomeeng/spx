import { describe, expect, it } from "vitest";

import {
  arbitraryNestedProductContextCase,
  arbitraryProductContextCase,
} from "@testing/generators/config/product-context";
import {
  parseProductContextJsonConfig,
  productContextTestingConfig,
  specStatusNodeIds,
} from "@testing/harnesses/product-context/cli";
import {
  observeDirtyCallerProductContext,
  observeNestedProductContext,
  observeProductDirUnderInheritedGitEnvironment,
} from "@testing/harnesses/product-context/compliance";
import {
  PRODUCT_CONTEXT_MAPPING_TEST_OPTIONS,
  runProductContextCases,
} from "@testing/harnesses/product-context/mapping";
import { fixtureNodePath } from "@testing/harnesses/spec-tree/spec-cli-commands";

describe("product context compliance", () => {
  it("resolves config from -C target instead of a dirty unrelated caller worktree", async () => {
    await runProductContextCases(arbitraryProductContextCase(), async (scenario) => {
      const { productDir, result } = await observeDirtyCallerProductContext(scenario);

      expect(result.exitCodes).toEqual([0]);
      expect(result.stderr).toHaveLength(0);
      expect(productContextTestingConfig(parseProductContextJsonConfig(result.stdout, productDir))).toEqual(
        scenario.testing.expected,
      );
    });
  });

  it(
    "resolves config, markdown validation and spec status from the nested product under -C, never the enclosing repository",
    PRODUCT_CONTEXT_MAPPING_TEST_OPTIONS,
    async () => {
      await runProductContextCases(arbitraryNestedProductContextCase(), async (scenario) => {
        const { innerProductDir, config, markdown, status } = await observeNestedProductContext(scenario);

        expect(config.exitCodes).toEqual([0]);
        expect(productContextTestingConfig(parseProductContextJsonConfig(config.stdout, innerProductDir))).toEqual(
          scenario.inner.testing.expected,
        );

        expect(status.exitCodes).toEqual([]);
        expect(specStatusNodeIds(status.stdout)).toContain(fixtureNodePath(scenario.inner.tree.root));
        expect(specStatusNodeIds(status.stdout)).not.toContain(fixtureNodePath(scenario.enclosing.tree.root));

        expect(markdown.stdout + markdown.stderr).toContain(scenario.inner.markdown.citingFileName);
        expect(markdown.stdout + markdown.stderr).not.toContain(scenario.enclosing.markdown.citingFileName);
      });
    },
  );

  it("resolves the product directory from the invocation directory's repository under inherited GIT_DIR and GIT_WORK_TREE", async () => {
    const { repositoryDir, resolvedProductDir } = await observeProductDirUnderInheritedGitEnvironment();

    expect(resolvedProductDir).toBe(repositoryDir);
  });
});
