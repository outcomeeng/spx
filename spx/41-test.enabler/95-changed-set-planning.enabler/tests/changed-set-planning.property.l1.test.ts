import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { mergeChangedSetOperands, partitionChangedPaths } from "@/domains/test/changed-set-planning";
import { KIND_REGISTRY } from "@/lib/spec-tree/config";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { arbitrarySourceFilePath } from "@testing/generators/literal/literal";
import { nodeOperand, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";

function arbitraryChangedSpecPath(): fc.Arbitrary<{ readonly node: string; readonly path: string }> {
  return TEST_DISPATCH_GENERATOR.nodePath().map((node) => {
    const segment = node.split("/").at(-1) ?? node;
    const slug = segment.replace(/^\d+-/, "").replace(KIND_REGISTRY.enabler.suffix, "");
    return { node, path: `${nodeOperand(node)}/${slug}.md` };
  });
}

function arbitraryChangedTestPath(): fc.Arbitrary<{ readonly node: string; readonly path: string }> {
  return TEST_DISPATCH_GENERATOR.nodePath().chain((node) =>
    TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, node).map((path) => ({ node, path }))
  );
}

describe("changed-set planning invariants", () => {
  it("partitions changed paths independent of order and repetition", () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(arbitraryChangedSpecPath(), arbitraryChangedTestPath()), { minLength: 1, maxLength: 8 }),
        fc.array(arbitrarySourceFilePath(), { minLength: 1, maxLength: 8 }),
        (nodeEntries, sourcePaths) => {
          const changedPaths = [...nodeEntries.map((entry) => entry.path), ...sourcePaths];
          const repeated = [...changedPaths, ...changedPaths].reverse();

          const base = partitionChangedPaths(changedPaths);
          const repeatedPartition = partitionChangedPaths(repeated);

          expect(repeatedPartition.operands).toEqual(base.operands);
          expect(repeatedPartition.sourceFiles).toEqual(base.sourceFiles);
          expect(new Set(base.operands).size).toBe(base.operands.length);
          expect(new Set(base.sourceFiles).size).toBe(base.sourceFiles.length);
        },
      ),
    );
  });

  it("deduplicates the union of path-selected operands and related test paths", () => {
    fc.assert(
      fc.property(
        TEST_DISPATCH_GENERATOR.nodePath().chain((node) =>
          TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, node).map((relatedTestPath) => ({
            node,
            relatedTestPath,
          }))
        ),
        ({ node, relatedTestPath }) => {
          const operand = nodeOperand(node);

          const merged = mergeChangedSetOperands([operand, operand], [relatedTestPath, relatedTestPath]);

          expect(merged.filter((entry) => entry === operand)).toHaveLength(1);
          expect(merged.filter((entry) => entry === relatedTestPath)).toHaveLength(1);
          expect(new Set(merged).size).toBe(merged.length);
        },
      ),
    );
  });
});
