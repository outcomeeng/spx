import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { discoverTestFiles } from "@/commands/testing";
import { aggregateTestExitCode, groupTestFiles } from "@/domains/testing";
import { testingRegistry } from "@/testing/registry";
import { TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { withTestingTempProductDir, writeTestFileFixture } from "@testing/harnesses/testing/harness";

describe("spx test exit-code aggregation", () => {
  it("exits zero exactly when no runner or unsupported selection failed", () => {
    fc.assert(
      fc.property(
        fc.array(TEST_DISPATCH_GENERATOR.invocation()),
        TEST_DISPATCH_GENERATOR.unsupportedSelectionCount(),
        (invocations, unsupportedSelectionCount) => {
          const anyNonZero = invocations.some(
            (invocation) => invocation.invoked && invocation.exitCode !== 0,
          );
          const anyUnsupportedSelections = unsupportedSelectionCount > 0;
          expect(aggregateTestExitCode(invocations, unsupportedSelectionCount) === 0).toBe(
            !anyNonZero && !anyUnsupportedSelections,
          );
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
