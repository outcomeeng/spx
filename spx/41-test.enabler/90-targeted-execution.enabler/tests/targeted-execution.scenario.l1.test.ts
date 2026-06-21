import { describe, expect, it } from "vitest";

import { type RecordedTestRun, runTests, type TestDispatchResult } from "@/commands/test";
import { resolveTargetedTestFiles, UNSUPPORTED_TEST_SELECTION_EXIT_CODE } from "@/domains/test";
import { TESTING_CLI } from "@/interfaces/cli/test";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { testingRegistry } from "@/test/registry";
import { TEST_RUN_STATE_FIELDS, TEST_RUN_STATE_STATUS } from "@/test/run-state";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { nodeOperand, sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { runTestingCli, type TestingCliCall, testingCliDeps } from "@testing/harnesses/testing/cli";
import { withTestingTempProductDir, writeTestFileFixture } from "@testing/harnesses/testing/harness";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/typescript-runner";

// Irrelevant stub fields for a RecordedTestRun whose dispatch is all this test
// observes; each draws a generic literal rather than reusing a semantically
// unrelated value, matching the sibling agent-test-output fixtures.
function sampleText(): string {
  return sampleLiteralTestValue(arbitraryDomainLiteral());
}

function recordedRun(dispatch: TestDispatchResult): RecordedTestRun {
  return {
    dispatch,
    runFile: {
      runsDir: sampleText(),
      runFilePath: sampleText(),
      runFileName: sampleText(),
      runToken: sampleText(),
      runId: sampleText(),
      startedAt: sampleText(),
    },
    recorded: {
      branchName: sampleText(),
      headSha: sampleText(),
      testingConfigDigest: sampleText(),
      runnerOutcomes: [],
      discoveredTestPathsDigest: sampleText(),
      discoveredTestContentDigest: sampleText(),
      productInputDigests: [],
      startedAt: sampleText(),
      completedAt: sampleText(),
      [TEST_RUN_STATE_FIELDS.STATUS]: TEST_RUN_STATE_STATUS.FAILED,
    },
  };
}

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

  it("resolves a node operand with a trailing slash like one without", () => {
    const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
    const ownFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));

    const resolution = resolveTargetedTestFiles([ownFile], {
      operands: [`${nodeOperand(nodePath)}/`],
      recursive: false,
    });

    expect(resolution.selected).toContain(ownFile);
    expect(resolution.unresolved).toEqual([]);
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

describe("targeted execution operator output", () => {
  it("warns and exits non-zero when an operand resolves to no test file", async () => {
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const operand = nodeOperand(sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()));
    const agentCalls: TestingCliCall[] = [];
    const streamCalls: TestingCliCall[] = [];
    const run = recordedRun({
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
    const run = recordedRun({
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
