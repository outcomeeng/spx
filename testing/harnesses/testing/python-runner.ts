import { execa } from "execa";
import { copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PYTEST_INVOKE_ARGS } from "@/testing/languages/python";
import type { TestRunCommandResult, TestRunnerDependencies } from "@/testing/languages/types";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const PYTEST_FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "pytest");
const TEMP_PROJECT_PREFIX = "spx-pytest-";
// Copied to a fixed pytest-collectible basename the l2 test forwards as the runner's testPaths.
const COPIED_SUITE_NAME = "test_suite.py";

const UV_WITH_FLAG = "--with";
const PYTEST_PACKAGE = "pytest";
// The descriptor builds `uv run pytest …`, and the spx repository declares no managed Python
// environment, so the real-runner test splices an ephemeral `--with pytest` immediately before the
// `pytest` command token. The position is derived from the descriptor's own command layout, so an
// added intermediate uv-run flag cannot silently misplace the splice.
const PYTEST_COMMAND_INDEX = PYTEST_INVOKE_ARGS.indexOf(PYTEST_PACKAGE);
const EXIT_OK = 0;

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

// A real command runner that runs `uv` from the temp project so pytest collects from that
// working directory; `--with pytest` provisions pytest ephemerally since the repo has none.
export function repoRootedPytestCommandRunner(projectRoot: string): TestRunnerDependencies {
  return {
    isLanguagePresent: () => true,
    runCommand: async (command, args): Promise<TestRunCommandResult> => {
      const provisioned = [
        ...args.slice(0, PYTEST_COMMAND_INDEX),
        UV_WITH_FLAG,
        PYTEST_PACKAGE,
        ...args.slice(PYTEST_COMMAND_INDEX),
      ];
      const result = await execa(command, provisioned, { cwd: projectRoot, reject: false });
      return { exitCode: result.exitCode ?? EXIT_OK };
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
    const suitePath = join(projectRoot, COPIED_SUITE_NAME);
    await copyFile(join(PYTEST_FIXTURE_DIR, fixture), suitePath);
    await callback({ projectRoot, suitePath });
  });
}
