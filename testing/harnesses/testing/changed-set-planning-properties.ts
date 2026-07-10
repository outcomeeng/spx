import { collectHarnessTestCases, describe, expect, it } from "@testing/harnesses/vitest-registration";
import * as fc from "fast-check";

import { mergeChangedSetOperands, partitionChangedPaths } from "@/domains/test/changed-set-planning";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { arbitrarySourceFilePath } from "@testing/generators/literal/literal";
import { nodeOperand, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

interface ChangedPathEntry {
  readonly node: string;
  readonly path: string;
}

interface ChangedPathPartitionCase {
  readonly nodeEntries: readonly ChangedPathEntry[];
  readonly sourcePaths: readonly string[];
}

interface ChangedOperandMergeCase {
  readonly node: string;
  readonly relatedTestPath: string;
}

function arbitraryChangedSpecPath(): fc.Arbitrary<ChangedPathEntry> {
  return TEST_DISPATCH_GENERATOR.nodePath().map((node) => {
    return { node, path: TEST_DISPATCH_GENERATOR.specFileUnder(node) };
  });
}

function arbitraryChangedTestPath(): fc.Arbitrary<ChangedPathEntry> {
  return TEST_DISPATCH_GENERATOR.nodePath().chain((node) =>
    TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, node).map((path) => ({ node, path }))
  );
}

function arbitraryChangedPathPartitionCase(): fc.Arbitrary<ChangedPathPartitionCase> {
  return fc.record({
    nodeEntries: fc.array(fc.oneof(arbitraryChangedSpecPath(), arbitraryChangedTestPath()), {
      minLength: 1,
      maxLength: 8,
    }),
    sourcePaths: fc.array(arbitrarySourceFilePath(), { minLength: 1, maxLength: 8 }),
  });
}

function arbitraryChangedOperandMergeCase(): fc.Arbitrary<ChangedOperandMergeCase> {
  return TEST_DISPATCH_GENERATOR.nodePath().chain((node) =>
    TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, node).map((relatedTestPath) => ({
      node,
      relatedTestPath,
    }))
  );
}

function expectChangedPathsPartitionIndependentOfOrder({
  nodeEntries,
  sourcePaths,
}: ChangedPathPartitionCase): void {
  const changedPaths = [...nodeEntries.map((entry) => entry.path), ...sourcePaths];
  const repeated = [...changedPaths, ...changedPaths].reverse();

  const base = partitionChangedPaths(changedPaths);
  const repeatedPartition = partitionChangedPaths(repeated);

  expect(repeatedPartition.operands).toEqual(base.operands);
  expect(repeatedPartition.sourceFiles).toEqual(base.sourceFiles);
  expect(new Set(base.operands).size).toBe(base.operands.length);
  expect(new Set(base.sourceFiles).size).toBe(base.sourceFiles.length);
}

function expectChangedSetOperandsDeduplicated({
  node,
  relatedTestPath,
}: ChangedOperandMergeCase): void {
  const operand = nodeOperand(node);

  const merged = mergeChangedSetOperands([operand, operand], [relatedTestPath, relatedTestPath]);

  expect(merged.filter((entry) => entry === operand)).toHaveLength(1);
  expect(merged.filter((entry) => entry === relatedTestPath)).toHaveLength(1);
  expect(new Set(merged).size).toBe(merged.length);
}

export function registerChangedSetPlanningPropertyTests(): void {
  describe("changed-set planning invariants", () => {
    it("partitions changed paths independent of order and repetition", () => {
      assertProperty(
        arbitraryChangedPathPartitionCase(),
        expectChangedPathsPartitionIndependentOfOrder,
        { level: PROPERTY_LEVEL.L1 },
      );
    });

    it("deduplicates the union of path-selected operands and related test paths", () => {
      assertProperty(
        arbitraryChangedOperandMergeCase(),
        expectChangedSetOperandsDeduplicated,
        { level: PROPERTY_LEVEL.L1 },
      );
    });
  });
}

export const changedSetPlanningPropertyCases = collectHarnessTestCases(registerChangedSetPlanningPropertyTests);
