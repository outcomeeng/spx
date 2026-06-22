import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import { PYTHON_RUNNER_TEST_GENERATOR } from "@testing/generators/testing/python-runner";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/python-runner";

describe("recording command runner", () => {
  it("reports configured presence, records each invocation in order, and returns the configured exit code", async () => {
    const projectRoot = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());

    await fc.assert(
      fc.asyncProperty(
        PYTHON_RUNNER_TEST_GENERATOR.present(),
        PYTHON_RUNNER_TEST_GENERATOR.exitCode(),
        fc.array(fc.tuple(arbitraryDomainLiteral(), fc.array(arbitraryDomainLiteral()))),
        async (present, exitCode, invocations) => {
          const runner = createRecordingCommandRunner({ present, exitCode });

          expect(runner.isLanguagePresent?.(projectRoot)).toBe(present);

          for (const [command, args] of invocations) {
            const result = await runner.runCommand(command, args);
            expect(result.exitCode).toBe(exitCode);
          }

          expect(runner.calls).toEqual(invocations.map(([command, args]) => ({ command, args })));
        },
      ),
    );
  });
});

describe("python runner test-path generator", () => {
  it("yields a non-empty list of distinct python test paths", () => {
    fc.assert(
      fc.property(PYTHON_RUNNER_TEST_GENERATOR.nonEmptyTestPaths(), (paths) => {
        expect(paths.length).toBeGreaterThan(0);
        expect(new Set(paths).size).toBe(paths.length);
      }),
    );
  });
});
