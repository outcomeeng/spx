import { describe, expect, it } from "vitest";

import { runTests } from "@/commands/testing";
import { resolveTargetedTestFiles } from "@/domains/testing";
import { typescriptTestingLanguage } from "@/testing/languages/typescript";
import { testingRegistry } from "@/testing/registry";
import { nodeOperand, sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { withTestingTempProductDir, writeTestFileFixture } from "@testing/harnesses/testing/harness";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/typescript-runner";

describe("targeted execution operand resolution", () => {
  it("selects a test-file-path operand's own file and nothing else", () => {
    const [nodeA, nodeB] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
    const fileA = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodeA));
    const fileB = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodeB));

    const resolution = resolveTargetedTestFiles([fileA, fileB], { operands: [fileA], recursive: false });

    expect(resolution.selected).toEqual([fileA]);
    expect(resolution.unresolved).toEqual([]);
  });

  it("selects only a node operand's own tests by default, excluding reachable descendant nodes", () => {
    const [parent, descendant] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodeWithDescendant());
    const ownFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, parent));
    const descendantFile = sampleDispatchValue(
      TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, descendant),
    );
    const discovered = [ownFile, descendantFile];

    // Non-vacuity guards: the descendant file is a distinct discovered candidate
    // genuinely nested under the parent, and the recursive scope reaches it — so the
    // default-mode assertion below drops a real reachable candidate, not an absent one.
    expect(descendantFile).not.toBe(ownFile);
    expect(descendantFile.startsWith(`${nodeOperand(parent)}/`)).toBe(true);
    const recursiveSelected = resolveTargetedTestFiles(discovered, {
      operands: [nodeOperand(parent)],
      recursive: true,
    }).selected;
    expect(recursiveSelected).toContain(descendantFile);

    const resolution = resolveTargetedTestFiles(discovered, {
      operands: [nodeOperand(parent)],
      recursive: false,
    });

    expect(resolution.selected).toContain(ownFile);
    expect(resolution.selected).not.toContain(descendantFile);
  });

  it("selects a node operand's own and descendant tests under the recursive flag", () => {
    const [parent, descendant] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodeWithDescendant());
    const ownFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, parent));
    const descendantFile = sampleDispatchValue(
      TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, descendant),
    );

    const resolution = resolveTargetedTestFiles([ownFile, descendantFile], {
      operands: [nodeOperand(parent)],
      recursive: true,
    });

    expect(resolution.selected).toContain(ownFile);
    expect(resolution.selected).toContain(descendantFile);
  });

  it("reports an operand matching no discovered test file as unresolved", () => {
    const [nodeA, nodeB] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
    const fileA = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodeA));

    const resolution = resolveTargetedTestFiles([fileA], { operands: [nodeOperand(nodeB)], recursive: false });

    expect(resolution.selected).toEqual([]);
    expect(resolution.unresolved).toEqual([nodeOperand(nodeB)]);
  });

  it("makes the dispatch exit non-zero when an operand resolves to no test file", async () => {
    const [nodeA, nodeB] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
    const fileA = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodeA));
    const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });

    await withTestingTempProductDir(async (productDir) => {
      await writeTestFileFixture(productDir, fileA);

      const result = await runTests(
        { productDir, registry: testingRegistry, targets: { operands: [nodeOperand(nodeB)], recursive: false } },
        { runnerDepsFor: () => runner },
      );

      expect(result.unresolvedTargets).toEqual([nodeOperand(nodeB)]);
      expect(result.exitCode).not.toBe(0);
    });
  });
});
