import { describe, expect, it } from "vitest";

import { runTestsCommand } from "@/commands/test";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { nodeOperand, sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { invokedArgs, testingCommandDependencies } from "@testing/harnesses/testing/command-support";
import {
  withTestingTempProductDir,
  writeTestFileFixture,
  writeTestingConfig,
} from "@testing/harnesses/testing/harness";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/typescript-runner";

describe("targeted execution passing-scope interaction", () => {
  it("filters operands under the configured passing scope while running them unfiltered under plain test", async () => {
    const [keptNode, excludedNode] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
    const keptFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, keptNode));
    const excludedFile = sampleDispatchValue(
      TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, excludedNode),
    );
    const targets = { operands: [nodeOperand(keptNode), nodeOperand(excludedNode)], recursive: false };

    await withTestingTempProductDir(async (productDir) => {
      await writeTestFileFixture(productDir, keptFile);
      await writeTestFileFixture(productDir, excludedFile);
      await writeTestingConfig(productDir, { exclude: [nodeOperand(excludedNode)] });

      // `spx test passing` reads the exclusion from the staged config and drops the excluded
      // operand's file from the operand-selected set.
      const passingRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      await runTestsCommand({ productDir, passing: true, targets }, testingCommandDependencies(passingRunner));
      expect(invokedArgs(passingRunner)).toContain(keptFile);
      expect(invokedArgs(passingRunner)).not.toContain(excludedFile);

      // Plain `spx test` leaves the same configured exclusion unread, so both files dispatch.
      const plainRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      await runTestsCommand({ productDir, passing: false, targets }, testingCommandDependencies(plainRunner));
      expect(invokedArgs(plainRunner)).toContain(keptFile);
      expect(invokedArgs(plainRunner)).toContain(excludedFile);
    });
  });
});
