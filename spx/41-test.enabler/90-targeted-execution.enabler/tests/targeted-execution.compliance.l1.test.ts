import { describe, expect, it } from "vitest";

import { runTests } from "@/commands/test";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { testingRegistry } from "@/test/registry";
import { nodeOperand, sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { withTestingTempProductDir, writeTestFileFixture } from "@testing/harnesses/testing/harness";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/typescript-runner";

function invokedArgs(
  runner: { readonly calls: ReadonlyArray<{ readonly args: readonly string[] }> },
): readonly string[] {
  return runner.calls.flatMap((call) => call.args);
}

describe("targeted execution passing-scope interaction", () => {
  it("filters operands under passing scope while running them unfiltered under plain test", async () => {
    const [keptNode, excludedNode] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
    const keptFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, keptNode));
    const excludedFile = sampleDispatchValue(
      TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, excludedNode),
    );
    const operands = [nodeOperand(keptNode), nodeOperand(excludedNode)];
    const passingScope = { exclude: [nodeOperand(excludedNode)] };

    await withTestingTempProductDir(async (productDir) => {
      await writeTestFileFixture(productDir, keptFile);
      await writeTestFileFixture(productDir, excludedFile);

      // Under `passing`, the passing-scope exclusion drops the excluded operand's file.
      const passingRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      await runTests(
        { productDir, registry: testingRegistry, targets: { operands, recursive: false }, passingScope },
        { runnerDepsFor: () => passingRunner },
      );
      expect(invokedArgs(passingRunner)).toContain(keptFile);
      expect(invokedArgs(passingRunner)).not.toContain(excludedFile);

      // Without passing scope, both operands' files dispatch unfiltered.
      const plainRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      await runTests(
        { productDir, registry: testingRegistry, targets: { operands, recursive: false } },
        { runnerDepsFor: () => plainRunner },
      );
      expect(invokedArgs(plainRunner)).toContain(keptFile);
      expect(invokedArgs(plainRunner)).toContain(excludedFile);
    });
  });
});
