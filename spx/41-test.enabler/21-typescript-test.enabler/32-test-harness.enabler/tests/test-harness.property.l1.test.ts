import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import { TYPESCRIPT_RUNNER_TEST_GENERATOR } from "@testing/generators/testing/typescript-runner";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/typescript-runner";

describe("typescript recording command runner", () => {
  it("reports configured presence, records each Vitest invocation in order, and returns the configured exit code", async () => {
    const projectRoot = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());

    await fc.assert(
      fc.asyncProperty(
        TYPESCRIPT_RUNNER_TEST_GENERATOR.present(),
        TYPESCRIPT_RUNNER_TEST_GENERATOR.exitCode(),
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

describe("typescript runner node-path generator", () => {
  it("yields a non-empty list of distinct node paths", () => {
    fc.assert(
      fc.property(TYPESCRIPT_RUNNER_TEST_GENERATOR.nodePaths(), (nodePaths) => {
        expect(nodePaths.length).toBeGreaterThan(0);
        expect(new Set(nodePaths).size).toBe(nodePaths.length);
      }),
    );
  });
});
