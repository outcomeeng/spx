import { describe, expect, it } from "vitest";

import { arbitrarySourceFilePath } from "@testing/generators/literal/literal";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  observeSpecTreeLintErrors,
  SPEC_TREE_IMPORT_BOUNDARY_FIXTURES,
} from "@testing/harnesses/spec-tree/lint-boundary";

describe("spec-tree library import boundary", () => {
  it("accepts a source consumer that imports spec-tree contracts through the public surface", async () => {
    expect(
      await observeSpecTreeLintErrors(
        SPEC_TREE_IMPORT_BOUNDARY_FIXTURES.PUBLIC_SURFACE_CONSUMER,
        sampleGeneratedValue(arbitrarySourceFilePath()),
      ),
    ).toEqual([]);
  });

  it("rejects a source consumer that imports an internal spec-tree module", async () => {
    expect(
      await observeSpecTreeLintErrors(
        SPEC_TREE_IMPORT_BOUNDARY_FIXTURES.INTERNAL_MODULE_CONSUMER,
        sampleGeneratedValue(arbitrarySourceFilePath()),
      ),
    ).not.toEqual([]);
  });
});
