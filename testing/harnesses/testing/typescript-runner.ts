import { execa } from "execa";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runTestsCommand } from "@/commands/test";
import { SPEC_TREE_EVIDENCE_FILE } from "@/lib/spec-tree";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import type { TestRunnerDependencies } from "@/test/languages/types";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { TYPESCRIPT_MARKER } from "@/validation/discovery/language-finder";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import {
  sampleTypescriptRunnerValue,
  TYPESCRIPT_RUNNER_TEST_GENERATOR,
} from "@testing/generators/testing/typescript-runner";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { testingCommandDependencies } from "@testing/harnesses/testing/command-support";
import {
  withTestingTempProductDir,
  writeTestFileFixture,
  writeTestingConfig,
} from "@testing/harnesses/testing/harness";
import { collectHarnessTestCases, describe, expect, it } from "@testing/harnesses/vitest-registration";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const VITEST_FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
  "vitest",
);
const TEMP_PROJECT_PREFIX = "spx-vitest-";
const TYPESCRIPT_TEST_FILE_PATTERN_ORACLE = [
  "*.test.ts",
  "*.test.tsx",
] as const;
export const COPIED_SUITE_NAME = "suite.test.ts";

// Committed inert fixture suites copied into a temp project for the real-vitest run.
export const VITEST_FIXTURE = {
  PASSING: "passing.test.ts.fixture",
  FAILING: "failing.test.ts.fixture",
} as const;

export type VitestFixture = (typeof VITEST_FIXTURE)[keyof typeof VITEST_FIXTURE];

// Records the commands the runner constructs and returns a configured exit code
// (Stage 5 exception 6: observability + exception 1-style controllable result).
export interface RecordingCommandRunner extends TestRunnerDependencies {
  readonly calls: ReadonlyArray<{
    readonly command: string;
    readonly args: readonly string[];
  }>;
}

export function createRecordingCommandRunner(options: {
  readonly present: boolean;
  readonly exitCode: number;
}): RecordingCommandRunner {
  const calls: Array<{
    readonly command: string;
    readonly args: readonly string[];
  }> = [];
  return {
    calls,
    isLanguagePresent: () => options.present,
    runCommand: (command, args) => {
      calls.push({ command, args });
      return Promise.resolve({ exitCode: options.exitCode });
    },
  };
}

// A real command runner that executes from the repo root (where vitest resolves);
// the runner's `--root <projectRoot>` flag isolates vitest to the temp project.
export function repoRootedCommandRunner(): TestRunnerDependencies {
  return createRepoRootedRecordingCommandRunner();
}

export function createRepoRootedRecordingCommandRunner(): RecordingCommandRunner {
  const calls: Array<{
    readonly command: string;
    readonly args: readonly string[];
  }> = [];
  return {
    calls,
    isLanguagePresent: () => true,
    runCommand: async (command, args) => {
      calls.push({ command, args });
      const result = await execa(command, [...args], {
        cwd: process.cwd(),
        reject: false,
      });
      return { exitCode: result.exitCode ?? 0 };
    },
  };
}

function oracleTypescriptExcludeFlag(nodePath: string): string {
  return `--exclude=${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${nodePath}/**`;
}

function generatedTestPathForPattern(pattern: string): string {
  const nodePath = sampleTypescriptRunnerValue(
    TYPESCRIPT_RUNNER_TEST_GENERATOR.nodePath(),
  );
  const generatedName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
  return [
    SPEC_TREE_CONFIG.ROOT_DIRECTORY,
    nodePath,
    SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME,
    pattern.replace("*", generatedName),
  ].join("/");
}

// Copies a committed fixture suite into a temp project outside the repo so vitest
// resolves no inherited config and runs the suite under defaults.
export function withTempVitestProject(
  fixture: VitestFixture,
  callback: (projectRoot: string) => Promise<void>,
): Promise<void> {
  return withTempVitestProjectAt(fixture, COPIED_SUITE_NAME, callback);
}

export function withTempVitestProjectAt(
  fixture: VitestFixture,
  relativeTestPath: string,
  callback: (productDir: string) => Promise<void>,
): Promise<void> {
  return withTempDir(TEMP_PROJECT_PREFIX, async (projectRoot) => {
    const targetPath = join(projectRoot, relativeTestPath);
    await mkdir(dirname(targetPath), { recursive: true });
    await copyFile(join(VITEST_FIXTURE_DIR, fixture), targetPath);
    await callback(projectRoot);
  });
}

export async function writeVitestFixture(
  productDir: string,
  relativePath: string,
  fixture: VitestFixture,
): Promise<void> {
  const target = join(productDir, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(VITEST_FIXTURE_DIR, fixture), target);
}

export function registerTypescriptRunnerScenarioL1Tests(): void {
  describe("typescript test runner invocation", () => {
    it("passes config-derived node exclusions to vitest for spx test passing", async () => {
      const [excludedNodePath, includedNodePath] = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.distinctNodePaths(),
      );
      const excludedTestPath = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, excludedNodePath),
      );
      const includedTestPath = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, includedNodePath),
      );
      const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, excludedTestPath);
        await writeTestFileFixture(productDir, includedTestPath);
        await writeTestingConfig(productDir, {
          exclude: [`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${excludedNodePath}`],
        });

        await runTestsCommand(
          { productDir, passing: true },
          testingCommandDependencies(runner),
        );

        const invokedArgs = runner.calls.flatMap((call) => call.args);
        expect(runner.calls).toHaveLength(1);
        expect(invokedArgs).toContain(oracleTypescriptExcludeFlag(excludedNodePath));
        expect(invokedArgs).toContain(includedTestPath);
        expect(invokedArgs).not.toContain(excludedTestPath);
      });
    });

    it("does not invoke vitest through spx test when TypeScript is absent", async () => {
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const testPath = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath),
      );
      const runner = createRecordingCommandRunner({
        present: false,
        exitCode: sampleTypescriptRunnerValue(
          TYPESCRIPT_RUNNER_TEST_GENERATOR.exitCode(),
        ),
      });

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, testPath);

        const result = await runTestsCommand(
          { productDir, passing: false },
          testingCommandDependencies(runner),
        );

        expect(result.dispatch.reports).toHaveLength(0);
        expect(runner.calls).toHaveLength(0);
      });
    });

    it("propagates the command runner exit code when vitest is invoked", async () => {
      await assertProperty(
        TYPESCRIPT_RUNNER_TEST_GENERATOR.exitCode(),
        async (exitCode) => {
          const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
          const testPath = sampleDispatchValue(
            TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath),
          );
          await withTestingTempProductDir(async (productDir) => {
            const runner = createRecordingCommandRunner({ present: true, exitCode });
            await writeTestFileFixture(productDir, testPath);

            const result = await runTestsCommand(
              { productDir, passing: false },
              testingCommandDependencies(runner),
            );

            expect(result.dispatch.exitCode).toBe(exitCode);
            expect(runner.calls).toHaveLength(1);
          });
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });
  });
}

export function registerTypescriptRunnerScenarioL2Tests(): void {
  describe("typescript test runner drives real vitest", () => {
    it("invokes vitest against a passing product and exits zero", async () => {
      const [testPath, failingDecoyPath] = sampleTypescriptRunnerValue(
        TYPESCRIPT_RUNNER_TEST_GENERATOR.testPathPair(),
      );
      await withTempVitestProjectAt(
        VITEST_FIXTURE.PASSING,
        testPath,
        async (productDir) => {
          await writeVitestFixture(
            productDir,
            failingDecoyPath,
            VITEST_FIXTURE.FAILING,
          );
          const runner = createRepoRootedRecordingCommandRunner();
          const result = await runTestsCommand(
            {
              productDir,
              passing: false,
              targets: { operands: [testPath], recursive: false },
            },
            testingCommandDependencies(runner),
          );

          expect(result.dispatch.exitCode).toBe(0);
          expect(runner.calls.flatMap((call) => call.args)).toContain(testPath);
        },
      );
    });

    it("invokes vitest against a failing product and exits non-zero", async () => {
      const testPath = sampleTypescriptRunnerValue(
        TYPESCRIPT_RUNNER_TEST_GENERATOR.testFilePath(),
      );
      await withTempVitestProjectAt(
        VITEST_FIXTURE.FAILING,
        testPath,
        async (productDir) => {
          const runner = createRepoRootedRecordingCommandRunner();
          const result = await runTestsCommand(
            {
              productDir,
              passing: false,
              targets: { operands: [testPath], recursive: false },
            },
            testingCommandDependencies(runner),
          );

          expect(result.dispatch.exitCode).not.toBe(0);
          expect(runner.calls.flatMap((call) => call.args)).toContain(testPath);
        },
      );
    });
  });
}

export function registerTypescriptRunnerMappingTests(): void {
  describe("typescript test runner file matching and exclusion flags", () => {
    it("declares every spec-defined TypeScript test-file pattern", () => {
      expect(typescriptTestingLanguage.testFilePatterns).toEqual(
        TYPESCRIPT_TEST_FILE_PATTERN_ORACLE,
      );
    });

    it.each(TYPESCRIPT_TEST_FILE_PATTERN_ORACLE)(
      "routes registered test-file pattern %s through spx test",
      async (pattern) => {
        const testPath = generatedTestPathForPattern(pattern);
        const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });
        expect(
          typescriptTestingLanguage.matchesTestFile(testPath),
        ).toBe(true);
        await withTestingTempProductDir(async (productDir) => {
          await writeTestFileFixture(productDir, testPath);

          await runTestsCommand(
            { productDir, passing: false },
            testingCommandDependencies(runner),
          );

          expect(runner.calls.flatMap((call) => call.args)).toContain(testPath);
        });
      },
    );

    it.each(
      sampleTypescriptRunnerValue(
        TYPESCRIPT_RUNNER_TEST_GENERATOR.nodePathPair(),
      ),
    )(
      "maps excluded node %s to the independent CLI flag oracle",
      async (nodePath) => {
        const includedNodePath = sampleDispatchValue(
          TEST_DISPATCH_GENERATOR.distinctNodePaths(),
        ).find((candidate) => candidate !== nodePath);
        expect(includedNodePath).toBeDefined();
        if (includedNodePath === undefined) return;
        const excludedTestPath = sampleDispatchValue(
          TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath),
        );
        const includedTestPath = sampleDispatchValue(
          TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, includedNodePath),
        );
        const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });

        await withTestingTempProductDir(async (productDir) => {
          await writeTestFileFixture(productDir, excludedTestPath);
          await writeTestFileFixture(productDir, includedTestPath);
          await writeTestingConfig(productDir, {
            exclude: [`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${nodePath}`],
          });

          await runTestsCommand(
            { productDir, passing: true },
            testingCommandDependencies(runner),
          );

          expect(runner.calls.flatMap((call) => call.args)).toContain(
            oracleTypescriptExcludeFlag(nodePath),
          );
        });
      },
    );
  });
}

export function registerTypescriptRunnerComplianceTests(): void {
  describe("typescript test runner gating on TypeScript presence", () => {
    it("invokes vitest exactly when TypeScript is present", async () => {
      await assertProperty(
        TYPESCRIPT_RUNNER_TEST_GENERATOR.present(),
        async (present) => {
          const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
          const testPath = sampleDispatchValue(
            TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath),
          );
          await withTestingTempProductDir(async (productDir) => {
            const runner = createRecordingCommandRunner({ present, exitCode: 0 });
            await writeTestFileFixture(productDir, testPath);

            const result = await runTestsCommand(
              { productDir, passing: false },
              testingCommandDependencies(runner),
            );

            expect(result.dispatch.reports).toHaveLength(present ? 1 : 0);
            expect(runner.calls).toHaveLength(present ? 1 : 0);
          });
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });

    it("detect reflects the injected presence predicate", () => {
      assertProperty(
        TYPESCRIPT_RUNNER_TEST_GENERATOR.present(),
        (present) => {
          expect(
            typescriptTestingLanguage.detect(
              sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir()),
              { isLanguagePresent: () => present },
            ),
          ).toBe(present);
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });

    it("detect falls back to marker-based TypeScript detection", async () => {
      await withTestingTempProductDir(async (productDir) => {
        expect(typescriptTestingLanguage.detect(productDir)).toBe(false);
        await writeFile(join(productDir, TYPESCRIPT_MARKER), "");
        expect(typescriptTestingLanguage.detect(productDir)).toBe(true);
      });
    });
  });
}

export const typescriptRunnerScenarioL1Cases = collectHarnessTestCases(
  registerTypescriptRunnerScenarioL1Tests,
);
export const typescriptRunnerScenarioL2Cases = collectHarnessTestCases(
  registerTypescriptRunnerScenarioL2Tests,
);
export const typescriptRunnerMappingCases = collectHarnessTestCases(
  registerTypescriptRunnerMappingTests,
);
export const typescriptRunnerComplianceCases = collectHarnessTestCases(
  registerTypescriptRunnerComplianceTests,
);
