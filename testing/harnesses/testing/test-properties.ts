import { collectHarnessTestCases, describe, expect, it } from "@testing/harnesses/vitest-registration";
import * as fc from "fast-check";

import { discoverTestFiles } from "@/commands/test";
import {
  aggregateTestExitCode,
  groupTestFiles,
  NO_RUNNER_INVOCATION_EXIT_CODE,
  SUCCESS_EXIT_CODE,
  UNSUPPORTED_TEST_SELECTION_EXIT_CODE,
} from "@/domains/test";
import { compareAsciiStrings } from "@/lib/state-store";
import { testingRegistry } from "@/test/registry";
import { TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { withTestingTempProductDir, writeTestFileFixture } from "@testing/harnesses/testing/harness";

export function registerTestPropertyTests(): void {
  describe("spx test exit-code aggregation", () => {
    it("exits zero exactly when a selected runner ran and no runner or unsupported selection failed", () => {
      assertProperty(
        fc.tuple(
          fc.array(TEST_DISPATCH_GENERATOR.invocation()),
          TEST_DISPATCH_GENERATOR.unsupportedSelectionCount(),
          TEST_DISPATCH_GENERATOR.unsupportedSelectionCount(),
        ),
        ([invocations, unsupportedSelectionCount, unresolvedTargetCount]) => {
          const anyNonZero = invocations.some(
            (invocation) => invocation.invoked && invocation.exitCode !== SUCCESS_EXIT_CODE,
          );
          const firstNonZeroInvocation = invocations.find(
            (invocation) => invocation.invoked && invocation.exitCode !== SUCCESS_EXIT_CODE,
          );
          const selectionFailureCount = unsupportedSelectionCount + unresolvedTargetCount;
          const anySelectionFailures = selectionFailureCount > 0;
          const noSelectedRunnerInvoked = invocations.length > 0
            && invocations.every((invocation) => !invocation.invoked);
          const result = aggregateTestExitCode(invocations, selectionFailureCount);
          expect(result === SUCCESS_EXIT_CODE).toBe(
            !anyNonZero && !anySelectionFailures && !noSelectedRunnerInvoked,
          );
          if (firstNonZeroInvocation?.invoked === true) {
            expect(result).toBe(firstNonZeroInvocation.exitCode);
          } else if (anySelectionFailures) {
            expect(result).toBe(UNSUPPORTED_TEST_SELECTION_EXIT_CODE);
          } else if (noSelectedRunnerInvoked) {
            expect(result).toBe(NO_RUNNER_INVOCATION_EXIT_CODE);
          }
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });
  });

  describe("spx test discovery determinism", () => {
    it("produces the same grouped test-file set on repeated discovery of one tree", async () => {
      await assertProperty(
        fc.uniqueArray(TEST_DISPATCH_GENERATOR.testFilePath(), { minLength: 1, maxLength: 6 }),
        async (testFiles) => {
          await withTestingTempProductDir(async (productDir) => {
            for (const testFile of testFiles) {
              await writeTestFileFixture(productDir, testFile);
            }

            const first = await discoverTestFiles(productDir);
            const second = await discoverTestFiles(productDir);

            expect([...second].sort(compareAsciiStrings)).toEqual([...first].sort(compareAsciiStrings));
            expect(groupTestFiles(second, testingRegistry.languages)).toEqual(
              groupTestFiles(first, testingRegistry.languages),
            );
          });
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });
  });
}

export const testPropertyCases = collectHarnessTestCases(registerTestPropertyTests);
