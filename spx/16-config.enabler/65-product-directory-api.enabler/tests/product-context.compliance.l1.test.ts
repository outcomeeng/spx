import { describe, expect, it } from "vitest";

import { arbitraryProductContextCase } from "@testing/generators/config/product-context";
import { parseProductContextJsonConfig, productContextTestingConfig } from "@testing/harnesses/product-context/cli";
import { observeDirtyCallerProductContext } from "@testing/harnesses/product-context/compliance";
import {
  PRODUCT_CONTEXT_CLASSIFICATION,
  PRODUCT_CONTEXT_TEST_OPTIONS,
} from "@testing/harnesses/product-context/mapping";
import { assertProperty } from "@testing/harnesses/property/property";

describe("product context compliance", () => {
  it(
    "resolves config from -C target instead of a dirty unrelated caller worktree",
    PRODUCT_CONTEXT_TEST_OPTIONS,
    async () => {
      await assertProperty(arbitraryProductContextCase(), async (scenario) => {
        const { productDir, result } = await observeDirtyCallerProductContext(scenario);

        expect(result.exitCodes).toEqual([0]);
        expect(result.stderr).toHaveLength(0);
        expect(productContextTestingConfig(parseProductContextJsonConfig(result.stdout, productDir))).toEqual(
          scenario.testing.expected,
        );
      }, PRODUCT_CONTEXT_CLASSIFICATION);
    },
  );
});
