import { execa } from "execa";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { TestRunCommandResult, TestRunnerDependencies } from "@/testing/languages/types";

const PYTEST_FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "pytest");
const TEMP_PROJECT_PREFIX = "spx-pytest-";
// Copied as a pytest-collectible basename so the runner's empty-scope run discovers it under the temp root.
const COPIED_SUITE_NAME = "test_suite.py";

// `uv run` index where `--with pytest` is spliced: the descriptor builds `uv run pytest …`,
// and the spx repository declares no managed Python environment, so the real-runner test
// provisions pytest ephemerally without changing the descriptor's production command.
const UV_RUN_SUBCOMMAND_INDEX = 1;
const UV_WITH_FLAG = "--with";
const PYTEST_PACKAGE = "pytest";
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
        ...args.slice(0, UV_RUN_SUBCOMMAND_INDEX),
        UV_WITH_FLAG,
        PYTEST_PACKAGE,
        ...args.slice(UV_RUN_SUBCOMMAND_INDEX),
      ];
      const result = await execa(command, provisioned, { cwd: projectRoot, reject: false });
      return { exitCode: result.exitCode ?? EXIT_OK };
    },
  };
}

// Copies a committed fixture suite into a temp project outside the repo so pytest resolves
// no inherited configuration and collects the suite from the temp working directory.
export async function withTempPytestProject(
  fixture: PytestFixture,
  callback: (projectRoot: string) => Promise<void>,
): Promise<void> {
  const projectRoot = await mkdtemp(join(tmpdir(), TEMP_PROJECT_PREFIX));
  try {
    await copyFile(join(PYTEST_FIXTURE_DIR, fixture), join(projectRoot, COPIED_SUITE_NAME));
    await callback(projectRoot);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}
