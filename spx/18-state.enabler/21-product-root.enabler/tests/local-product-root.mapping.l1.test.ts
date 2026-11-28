import { realpath } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveLocalProductRoot } from "@/lib/git/root";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { arbitraryNestedProductLayout } from "@testing/generators/state/nested-product-layout";
import {
  LOCAL_PRODUCT_ROOT_ROWS,
  productContextUnderDirectoryOption,
} from "@testing/harnesses/product-root/local-product-root";
import { materializeNestedProductLayout } from "@testing/harnesses/state/nested-product-layout";

describe("local-product-root — each layout maps to the local product root, with and without -C", () => {
  it.each(Object.entries(LOCAL_PRODUCT_ROOT_ROWS))("%s", async (_row, standsForRow) => {
    const layout = sampleGeneratedValue(arbitraryNestedProductLayout().filter(standsForRow));

    await materializeNestedProductLayout(layout, async ({ rootDir, invocationDir }) => {
      const expected = await realpath(join(rootDir, layout.declaredLocalProductRoot));

      const withoutDirectoryOption = await resolveLocalProductRoot(invocationDir);
      expect(await realpath(withoutDirectoryOption.productDir)).toBe(expected);
      expect(withoutDirectoryOption.isGitRepo).toBe(layout.insideRepository);

      const underDirectoryOption = productContextUnderDirectoryOption(invocationDir);
      expect(await realpath(underDirectoryOption.productDir)).toBe(expected);
      expect(underDirectoryOption.warning === undefined).toBe(layout.insideRepository);
    });
  });
});
