import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { VITEST_ARGS } from "@/lib/precommit/build-args";
import { PRECOMMIT_RUN, type PrecommitDeps, runPrecommitTests, shouldRunTests } from "@/lib/precommit/run";
import { PRECOMMIT_TEST_GENERATOR, samplePrecommitTestValue } from "@testing/generators/precommit/precommit";

const otherFile = () => samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.otherPath());
const sourceFile = () => samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.sourcePath());

describe("shouldRunTests", () => {
  it("returns true when any test file is present", () => {
    fc.assert(
      fc.property(fc.array(PRECOMMIT_TEST_GENERATOR.testPath(), { minLength: 1 }), (files) => {
        expect(shouldRunTests(files)).toBe(true);
      }),
    );
  });

  it("returns true when any source file is present", () => {
    fc.assert(
      fc.property(fc.array(PRECOMMIT_TEST_GENERATOR.sourcePath(), { minLength: 1 }), (files) => {
        expect(shouldRunTests(files)).toBe(true);
      }),
    );
  });

  it("returns false when only other files are present", () => {
    fc.assert(
      fc.property(fc.array(PRECOMMIT_TEST_GENERATOR.otherPath(), { minLength: 1 }), (files) => {
        expect(shouldRunTests(files)).toBe(false);
      }),
    );
  });

  it("returns false for empty list", () => {
    expect(shouldRunTests([])).toBe(false);
  });
});

describe("runPrecommitTests compliance", () => {
  it("exits zero when no test-relevant files are staged", async () => {
    const deps: PrecommitDeps = {
      getStagedFiles: async () => [otherFile(), otherFile()],
      runVitest: async () => ({ exitCode: PRECOMMIT_RUN.EXIT_CODES.FAILURE, output: "" }),
      log: () => {},
    };

    const result = await runPrecommitTests(deps);

    expect(result.exitCode).toBe(PRECOMMIT_RUN.EXIT_CODES.SUCCESS);
    expect(result.skipped).toBe(true);
  });

  it("does not invoke vitest when no test-relevant files are staged", async () => {
    let vitestCalled = false;
    const deps: PrecommitDeps = {
      getStagedFiles: async () => [otherFile()],
      runVitest: async () => {
        vitestCalled = true;
        return { exitCode: PRECOMMIT_RUN.EXIT_CODES.SUCCESS, output: "" };
      },
      log: () => {},
    };

    await runPrecommitTests(deps);

    expect(vitestCalled).toBe(false);
  });

  it("propagates the vitest process exit code", async () => {
    const vitestExitCode = samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.exitCode());
    const deps: PrecommitDeps = {
      getStagedFiles: async () => [sourceFile()],
      runVitest: async () => ({ exitCode: vitestExitCode, output: "" }),
      log: () => {},
    };

    const result = await runPrecommitTests(deps);

    expect(result.exitCode).toBe(vitestExitCode);
  });

  it("passes only retained test-relevant paths to vitest", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(PRECOMMIT_TEST_GENERATOR.sourcePath(), { minLength: 1 }),
        fc.array(PRECOMMIT_TEST_GENERATOR.testPath()),
        fc.array(PRECOMMIT_TEST_GENERATOR.otherPath(), { minLength: 1 }),
        async (sourceFiles, testFiles, otherFiles) => {
          let vitestArgs: string[] = [];
          const deps: PrecommitDeps = {
            getStagedFiles: async () => [...sourceFiles, ...testFiles, ...otherFiles],
            runVitest: async (args) => {
              vitestArgs = args;
              return { exitCode: PRECOMMIT_RUN.EXIT_CODES.SUCCESS, output: "" };
            },
            log: () => {},
          };

          await runPrecommitTests(deps);

          expect(vitestArgs[0]).toBe(VITEST_ARGS.RELATED);
          expect(vitestArgs[1]).toBe(VITEST_ARGS.RUN);
          for (const source of sourceFiles) expect(vitestArgs).toContain(source);
          for (const test of testFiles) expect(vitestArgs).not.toContain(test);
          for (const other of otherFiles) expect(vitestArgs).not.toContain(other);
        },
      ),
    );
  });
});
