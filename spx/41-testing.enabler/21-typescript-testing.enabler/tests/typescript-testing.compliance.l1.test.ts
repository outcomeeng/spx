import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { typescriptTestingLanguage } from "@/testing/languages/typescript";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { TYPESCRIPT_RUNNER_TEST_GENERATOR } from "@testing/generators/testing/typescript-runner";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/typescript-runner";

describe("typescript test runner gating on TypeScript presence", () => {
  it("ALWAYS: invokes vitest exactly when TypeScript is present", async () => {
    await fc.assert(
      fc.asyncProperty(
        TYPESCRIPT_RUNNER_TEST_GENERATOR.present(),
        TYPESCRIPT_RUNNER_TEST_GENERATOR.exitCode(),
        async (present, exitCode) => {
          const projectRoot = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
          const runner = createRecordingCommandRunner({ present, exitCode });

          const result = await typescriptTestingLanguage.runTests(
            { projectRoot, testPaths: [], excludedNodePaths: [] },
            runner,
          );

          expect(result.invoked).toBe(present);
          expect(runner.calls).toHaveLength(present ? 1 : 0);
        },
      ),
    );
  });

  it("ALWAYS: detect reflects the injected presence predicate", () => {
    fc.assert(
      fc.property(TYPESCRIPT_RUNNER_TEST_GENERATOR.present(), (present) => {
        const projectRoot = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
        expect(typescriptTestingLanguage.detect(projectRoot, { isLanguagePresent: () => present })).toBe(present);
      }),
    );
  });
});
