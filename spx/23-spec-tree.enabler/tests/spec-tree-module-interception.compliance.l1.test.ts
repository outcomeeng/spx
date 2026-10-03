import { describe, expect, it } from "vitest";

import { arbitrarySpecTreeTestFilePath } from "@testing/generators/literal/literal";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  observeSpecTreeLintErrors,
  SPEC_TREE_MODULE_INTERCEPTION_FIXTURES,
} from "@testing/harnesses/spec-tree/lint-boundary";

describe("spec-tree test module interception", () => {
  it("accepts a spec-tree test that injects its source explicitly", async () => {
    expect(
      await observeSpecTreeLintErrors(
        SPEC_TREE_MODULE_INTERCEPTION_FIXTURES.INJECTED_SOURCE,
        sampleGeneratedValue(arbitrarySpecTreeTestFilePath()),
      ),
    ).toEqual([]);
  });

  it("rejects a spec-tree test that intercepts a module with vi.mock()", async () => {
    expect(
      await observeSpecTreeLintErrors(
        SPEC_TREE_MODULE_INTERCEPTION_FIXTURES.VI_MOCK,
        sampleGeneratedValue(arbitrarySpecTreeTestFilePath()),
      ),
    ).not.toEqual([]);
  });

  it("rejects a spec-tree test that intercepts a module with vi.doMock()", async () => {
    expect(
      await observeSpecTreeLintErrors(
        SPEC_TREE_MODULE_INTERCEPTION_FIXTURES.VI_DO_MOCK,
        sampleGeneratedValue(arbitrarySpecTreeTestFilePath()),
      ),
    ).not.toEqual([]);
  });

  it("rejects a spec-tree test that intercepts a module with jest.mock()", async () => {
    expect(
      await observeSpecTreeLintErrors(
        SPEC_TREE_MODULE_INTERCEPTION_FIXTURES.JEST_MOCK,
        sampleGeneratedValue(arbitrarySpecTreeTestFilePath()),
      ),
    ).not.toEqual([]);
  });

  it("rejects a spec-tree test that replaces the filesystem with memfs", async () => {
    expect(
      await observeSpecTreeLintErrors(
        SPEC_TREE_MODULE_INTERCEPTION_FIXTURES.MEMFS,
        sampleGeneratedValue(arbitrarySpecTreeTestFilePath()),
      ),
    ).not.toEqual([]);
  });
});
