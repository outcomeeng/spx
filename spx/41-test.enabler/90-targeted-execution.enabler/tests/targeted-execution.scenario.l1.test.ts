import { describe, expect, it } from "vitest";

import { runTests } from "@/commands/test";
import { UNSUPPORTED_TEST_SELECTION_EXIT_CODE } from "@/domains/test";
import { TESTING_CLI } from "@/interfaces/cli/test";
import { resolveTargetedTestFiles } from "@/lib/test-targeting";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { testingRegistry } from "@/test/registry";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import {
  absoluteOperand,
  nodeOperand,
  sampleDispatchValue,
  TEST_DISPATCH_GENERATOR,
} from "@testing/generators/testing/dispatch";
import { recordedTestRun, runTestingCli, type TestingCliCall, testingCliDeps } from "@testing/harnesses/testing/cli";
import { withTestingTempProductDir, writeTestFileFixture } from "@testing/harnesses/testing/harness";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/typescript-runner";

describe("targeted execution operand resolution", () => {
  it("selects every discovered file for each product-root spelling, recursive or not", () => {
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const [nodeA, nodeB] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
    const fileA = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodeA));
    const fileB = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodeB));
    const discovered = [fileA, fileB];
    const spellings = sampleDispatchValue(TEST_DISPATCH_GENERATOR.productRootSpellings(productDir));

    // The bare dot, every trailing-separator variant, and the root's absolute path are all covered
    // in this one run.
    expect(spellings.length).toBeGreaterThan(2);
    for (const spelling of spellings) {
      for (const recursive of [false, true]) {
        const resolution = resolveTargetedTestFiles(discovered, { operands: [spelling], recursive }, { productDir });

        expect(new Set(resolution.selected)).toEqual(new Set(discovered));
        expect(resolution.unresolved).toEqual([]);
      }
    }
  });

  it("resolves an absolute operand inside the product root like its relative spelling", () => {
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const [parent, descendant] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodeWithDescendant());
    const ownFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, parent));
    const descendantFile = sampleDispatchValue(
      TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, descendant),
    );
    const discovered = [ownFile, descendantFile];

    for (const operand of [nodeOperand(parent), ownFile]) {
      for (const recursive of [false, true]) {
        const absolute = resolveTargetedTestFiles(
          discovered,
          { operands: [absoluteOperand(productDir, operand)], recursive },
          { productDir },
        );
        const relative = resolveTargetedTestFiles(discovered, { operands: [operand], recursive }, { productDir });

        expect(absolute.selected).toEqual(relative.selected);
        expect(absolute.unresolved).toEqual([]);
        expect(absolute.selected).toContain(ownFile);
      }
    }
  });

  it("reports an empty, outside, or climbing operand as unresolved", () => {
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const [nodeA, nodeB] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
    const fileA = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodeA));
    const fileB = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodeB));
    const operands = sampleDispatchValue(TEST_DISPATCH_GENERATOR.unresolvableOperands(productDir));

    for (const operand of operands) {
      for (const recursive of [false, true]) {
        const resolution = resolveTargetedTestFiles([fileA, fileB], { operands: [operand], recursive }, { productDir });

        expect(resolution.selected).toEqual([]);
        expect(resolution.unresolved).toEqual([operand]);
      }
    }
  });

  it("selects a test-file-path operand's own file and nothing else", () => {
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const [nodeA, nodeB] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
    const fileA = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodeA));
    const fileB = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodeB));

    const resolution = resolveTargetedTestFiles([fileA, fileB], { operands: [fileA], recursive: false }, {
      productDir,
    });

    expect(resolution.selected).toEqual([fileA]);
    expect(resolution.unresolved).toEqual([]);
  });

  it("selects only a node operand's own tests by default, excluding reachable descendant nodes", () => {
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
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
    }, { productDir }).selected;
    expect(recursiveSelected).toContain(descendantFile);

    const resolution = resolveTargetedTestFiles(discovered, {
      operands: [nodeOperand(parent)],
      recursive: false,
    }, { productDir });

    expect(resolution.selected).toContain(ownFile);
    expect(resolution.selected).not.toContain(descendantFile);
  });

  it("selects a node operand's own and descendant tests under the recursive flag", () => {
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const [parent, descendant] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodeWithDescendant());
    const ownFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, parent));
    const descendantFile = sampleDispatchValue(
      TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, descendant),
    );

    const resolution = resolveTargetedTestFiles([ownFile, descendantFile], {
      operands: [nodeOperand(parent)],
      recursive: true,
    }, { productDir });

    expect(resolution.selected).toContain(ownFile);
    expect(resolution.selected).toContain(descendantFile);
  });

  it("resolves a node operand with a trailing slash like one without", () => {
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const [parent, descendant] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodeWithDescendant());
    const ownFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, parent));
    const descendantFile = sampleDispatchValue(
      TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, descendant),
    );
    const discovered = [ownFile, descendantFile];

    // Both spellings resolve to the same selection under either modifier; the descendant file in
    // the discovered set is what a slash-as-widening reading would wrongly add without the flag.
    for (const recursive of [false, true]) {
      const slashed = resolveTargetedTestFiles(discovered, { operands: [`${nodeOperand(parent)}/`], recursive }, {
        productDir,
      });
      const plain = resolveTargetedTestFiles(discovered, { operands: [nodeOperand(parent)], recursive }, {
        productDir,
      });

      expect(slashed.selected).toEqual(plain.selected);
      expect(slashed.unresolved).toEqual(plain.unresolved);
      expect(slashed.selected).toContain(ownFile);
      expect(slashed.unresolved).toEqual([]);
    }
  });

  it("reports an operand matching no discovered test file as unresolved", () => {
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const [nodeA, nodeB] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
    const fileA = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodeA));

    const resolution = resolveTargetedTestFiles([fileA], { operands: [nodeOperand(nodeB)], recursive: false }, {
      productDir,
    });

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

describe("targeted execution operator output", () => {
  it("warns and exits non-zero when an operand resolves to no test file", async () => {
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const operand = nodeOperand(sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()));
    const agentCalls: TestingCliCall[] = [];
    const streamCalls: TestingCliCall[] = [];
    const run = recordedTestRun({
      exitCode: UNSUPPORTED_TEST_SELECTION_EXIT_CODE,
      groups: [],
      unmatched: [],
      unresolvedTargets: [operand],
      reports: [],
      outcomes: [],
    });

    const result = await runTestingCli(
      [TESTING_CLI.commandName, operand],
      testingCliDeps(productDir, run, agentCalls, streamCalls),
    );

    // The operand parsed by the CLI is forwarded as the selection, and the
    // unresolved operand surfaces in the warning with a non-zero exit.
    expect(streamCalls).toEqual([{ productDir, passing: false, targets: { operands: [operand], recursive: false } }]);
    expect(agentCalls).toEqual([]);
    expect(result.stderr).toContain(operand);
    expect(result.exitCodes).toEqual([UNSUPPORTED_TEST_SELECTION_EXIT_CODE]);
  });

  it("forwards the recursive flag as part of the operand selection", async () => {
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const operand = nodeOperand(sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()));
    const agentCalls: TestingCliCall[] = [];
    const streamCalls: TestingCliCall[] = [];
    const run = recordedTestRun({
      exitCode: UNSUPPORTED_TEST_SELECTION_EXIT_CODE,
      groups: [],
      unmatched: [],
      unresolvedTargets: [operand],
      reports: [],
      outcomes: [],
    });

    await runTestingCli(
      [TESTING_CLI.commandName, TESTING_CLI.recursiveLongFlag, operand],
      testingCliDeps(productDir, run, agentCalls, streamCalls),
    );

    expect(streamCalls).toEqual([{ productDir, passing: false, targets: { operands: [operand], recursive: true } }]);
  });
});
