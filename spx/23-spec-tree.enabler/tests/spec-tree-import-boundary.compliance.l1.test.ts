import { describe, expect, it } from "vitest";

import { TEST_RELEVANT_SOURCE_ROOT_PREFIXES } from "@/config/source-roots";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  observeSpecTreeLintErrors,
  SPEC_TREE_IMPORT_BOUNDARY_FIXTURES,
} from "@testing/harnesses/spec-tree/lint-boundary";

function sampledConsumerPath(rootPrefix: string): string {
  return `${rootPrefix}${sampleGeneratedValue(arbitraryDomainLiteral())}.ts`;
}

describe("spec-tree library import boundary", () => {
  it.each(TEST_RELEVANT_SOURCE_ROOT_PREFIXES)(
    "accepts a consumer under %s that imports spec-tree contracts through the public surface",
    async (rootPrefix) => {
      expect(
        await observeSpecTreeLintErrors(
          SPEC_TREE_IMPORT_BOUNDARY_FIXTURES.PUBLIC_SURFACE_CONSUMER,
          sampledConsumerPath(rootPrefix),
        ),
      ).toEqual([]);
    },
  );

  it.each(TEST_RELEVANT_SOURCE_ROOT_PREFIXES)(
    "rejects a consumer under %s that imports an internal spec-tree module",
    async (rootPrefix) => {
      expect(
        await observeSpecTreeLintErrors(
          SPEC_TREE_IMPORT_BOUNDARY_FIXTURES.INTERNAL_MODULE_CONSUMER,
          sampledConsumerPath(rootPrefix),
        ),
      ).not.toEqual([]);
    },
  );
});
