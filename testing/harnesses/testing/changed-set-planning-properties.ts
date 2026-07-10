import { collectHarnessTestCases, describe, expect, it } from "@testing/harnesses/vitest-registration";
import * as fc from "fast-check";

import { planChangedTestSelection } from "@/commands/test/changed-set-planning";
import { mergeChangedSetOperands, partitionChangedPaths } from "@/domains/test/changed-set-planning";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { arbitrarySourceFilePath } from "@testing/generators/literal/literal";
import { nodeOperand, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import {
  descriptorWithRelatedTests,
  recordingGitRunner,
  registry,
  relatedDeps,
} from "@testing/harnesses/testing/changed-set-planning-support";
import { withTestingTempProductDir, writeTestFileFixture } from "@testing/harnesses/testing/harness";

interface ChangedPathEntry {
  readonly node: string;
  readonly path: string;
  readonly testPath: string;
}

interface ChangedPathPartitionCase {
  readonly nodeEntries: readonly ChangedPathEntry[];
  readonly sourcePaths: readonly string[];
}

interface ChangedOperandMergeCase {
  readonly node: string;
  readonly relatedTestPath: string;
}

interface ChangedSelectionCase extends ChangedPathPartitionCase {
  readonly relatedTestPath: string;
}

function arbitraryChangedSpecPath(): fc.Arbitrary<ChangedPathEntry> {
  return TEST_DISPATCH_GENERATOR.nodePath().chain((node) =>
    TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, node).map((testPath) => ({
      node,
      path: TEST_DISPATCH_GENERATOR.specFileUnder(node),
      testPath,
    }))
  );
}

function arbitraryChangedTestPath(): fc.Arbitrary<ChangedPathEntry> {
  return TEST_DISPATCH_GENERATOR.nodePath().chain((node) =>
    TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, node).map((path) => ({
      node,
      path,
      testPath: path,
    }))
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

function arbitraryChangedSelectionCase(): fc.Arbitrary<ChangedSelectionCase> {
  return arbitraryChangedPathPartitionCase().chain((partition) =>
    TEST_DISPATCH_GENERATOR.testFilePath().map((relatedTestPath) => ({
      ...partition,
      relatedTestPath,
    }))
  );
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

async function expectChangedSelectionIndependentOfOrderAndRepetition({
  nodeEntries,
  sourcePaths,
  relatedTestPath,
}: ChangedSelectionCase): Promise<void> {
  const changedPaths = [...nodeEntries.map((entry) => entry.path), ...sourcePaths];
  const repeatedPaths = [...changedPaths, ...changedPaths].reverse();
  const language = descriptorWithRelatedTests([relatedTestPath], sourcePaths);

  await withTestingTempProductDir(async (productDir) => {
    const candidateTestPaths = [
      ...new Set([
        ...nodeEntries.map((entry) => entry.testPath),
        relatedTestPath,
      ]),
    ];
    await Promise.all(candidateTestPaths.map((path) => writeTestFileFixture(productDir, path)));

    const basePlan = await planChangedTestSelection(
      { productDir },
      {
        git: recordingGitRunner(changedPaths).git,
        registry: registry([language]),
        relatedDepsFor: () => relatedDeps(),
      },
    );
    const repeatedPlan = await planChangedTestSelection(
      { productDir },
      {
        git: recordingGitRunner(repeatedPaths).git,
        registry: registry([language]),
        relatedDepsFor: () => relatedDeps(),
      },
    );

    expect(repeatedPlan).toEqual(basePlan);
    expect(new Set(basePlan.targets.operands).size).toBe(basePlan.targets.operands.length);
    for (const pathSelectedTest of nodeEntries.map((entry) => entry.testPath)) {
      expect(basePlan.targets.operands).toContain(pathSelectedTest);
    }
    expect(basePlan.targets.operands).toContain(relatedTestPath);
  });
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

    it("keeps end-to-end changed selection independent of changed-path order and repetition", async () => {
      await assertProperty(
        arbitraryChangedSelectionCase(),
        expectChangedSelectionIndependentOfOrderAndRepetition,
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });
  });
}

export const changedSetPlanningPropertyCases = collectHarnessTestCases(registerChangedSetPlanningPropertyTests);
