import { execa } from "execa";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { TestRunCommandResult, TestRunnerDependencies } from "@/test/languages/types";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const PYTEST_FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "pytest");
const TEMP_PROJECT_PREFIX = "spx-pytest-";
const COPIED_SUITE_DIR = ".spx-pytest-cases";
// Copied under a pytest-ignored directory so the l2 test proves explicit test-path forwarding.
const COPIED_SUITE_NAME = "test_suite.py";
const UV_CACHE_DIR_NAME = ".uv-cache";

export const PYTEST_EXIT_CODE = {
  OK: 0,
  NO_TESTS_COLLECTED: 5,
} as const;

// Committed inert fixture suites copied into a temp project for the real-pytest run.
export const PYTEST_FIXTURE = {
  PASSING: "passing.test_suite.py.fixture",
  FAILING: "failing.test_suite.py.fixture",
} as const;

export type PytestFixture = (typeof PYTEST_FIXTURE)[keyof typeof PYTEST_FIXTURE];

// Records the commands the runner constructs and returns a configured exit code
// (Stage 5 exception 6: observability + exception 1-style controllable result).
export interface RecordingCommandRunner extends TestRunnerDependencies {
  readonly calls: ReadonlyArray<{ readonly command: string; readonly args: readonly string[] }>;
}

export function createRecordingCommandRunner(options: {
  readonly present: boolean;
  readonly exitCode: number;
}): RecordingCommandRunner {
  const calls: Array<{ readonly command: string; readonly args: readonly string[] }> = [];
  return {
    calls,
    isLanguagePresent: () => options.present,
    runCommand: (command, args) => {
      calls.push({ command, args });
      return Promise.resolve({ exitCode: options.exitCode });
    },
  };
}

// A real command runner that runs `uv` from the temp project so pytest collects
// from that working directory. The environment must provide pytest before this
// runner executes; the harness does not provision runner dependencies.
export function repoRootedPytestCommandRunner(projectRoot: string): TestRunnerDependencies {
  return {
    isLanguagePresent: () => true,
    runCommand: async (command, args): Promise<TestRunCommandResult> => {
      const result = await execa(command, [...args], {
        cwd: projectRoot,
        env: { UV_CACHE_DIR: join(projectRoot, UV_CACHE_DIR_NAME) },
        reject: false,
      });
      return { exitCode: result.exitCode ?? PYTEST_EXIT_CODE.OK };
    },
  };
}

// A temp pytest project: the temp root and the absolute path of the copied suite the
// runner is asked to execute.
export interface TempPytestProject {
  readonly projectRoot: string;
  readonly suitePath: string;
}

// Copies a committed fixture suite into a temp project outside the repo so pytest resolves
// no inherited configuration, and hands back the suite path for the runner to execute.
export function withTempPytestProject(
  fixture: PytestFixture,
  callback: (project: TempPytestProject) => Promise<void>,
): Promise<void> {
  return withTempDir(TEMP_PROJECT_PREFIX, async (projectRoot) => {
    const suiteDir = join(projectRoot, COPIED_SUITE_DIR);
    const suitePath = join(suiteDir, COPIED_SUITE_NAME);
    await mkdir(suiteDir);
    await copyFile(join(PYTEST_FIXTURE_DIR, fixture), suitePath);
    await callback({ projectRoot, suitePath });
  });
}
