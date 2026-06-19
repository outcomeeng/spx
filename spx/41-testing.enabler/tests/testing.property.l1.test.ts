import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { discoverTestFiles } from "@/commands/testing";
import {
  aggregateTestExitCode,
  groupTestFiles,
  NO_RUNNER_INVOCATION_EXIT_CODE,
  SUCCESS_EXIT_CODE,
} from "@/domains/testing";
import { testingRegistry } from "@/testing/registry";
import { TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { withTestingTempProductDir, writeTestFileFixture } from "@testing/harnesses/testing/harness";

describe("spx test exit-code aggregation", () => {
  it("exits zero exactly when a selected runner ran and no runner or unsupported selection failed", () => {
    fc.assert(
      fc.property(
        fc.array(TEST_DISPATCH_GENERATOR.invocation()),
        TEST_DISPATCH_GENERATOR.unsupportedSelectionCount(),
        (invocations, unsupportedSelectionCount) => {
          const anyNonZero = invocations.some(
            (invocation) => invocation.invoked && invocation.exitCode !== SUCCESS_EXIT_CODE,
          );
          const firstNonZeroInvocation = invocations.find(
            (invocation) => invocation.invoked && invocation.exitCode !== SUCCESS_EXIT_CODE,
          );
          const anyUnsupportedSelections = unsupportedSelectionCount > 0;
          const noSelectedRunnerInvoked =
            invocations.length > 0 && invocations.every((invocation) => !invocation.invoked);
          const result = aggregateTestExitCode(invocations, unsupportedSelectionCount);
          expect(result === SUCCESS_EXIT_CODE).toBe(
            !anyNonZero && !anyUnsupportedSelections && !noSelectedRunnerInvoked,
          );
          if (firstNonZeroInvocation?.invoked === true) {
            expect(result).toBe(firstNonZeroInvocation.exitCode);
          } else if (!anyUnsupportedSelections && noSelectedRunnerInvoked) {
            expect(result).toBe(NO_RUNNER_INVOCATION_EXIT_CODE);
          }
        },
      ),
    );
  });
});

describe("spx test discovery determinism", () => {
  it("produces the same grouped test-file set on repeated discovery of one tree", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(TEST_DISPATCH_GENERATOR.testFilePath(), { minLength: 1, maxLength: 6 }),
        async (testFiles) => {
          await withTestingTempProductDir(async (productDir) => {
            for (const testFile of testFiles) {
              await writeTestFileFixture(productDir, testFile);
            }

            const first = await discoverTestFiles(productDir);
            const second = await discoverTestFiles(productDir);

            expect([...second].sort()).toEqual([...first].sort());
            expect(groupTestFiles(second, testingRegistry.languages)).toEqual(
              groupTestFiles(first, testingRegistry.languages),
            );
          });
        },
      ),
      { numRuns: 15 },
    );
  });
});
