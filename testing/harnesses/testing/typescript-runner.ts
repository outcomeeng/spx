import { execa } from "execa";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { TestRunnerDependencies } from "@/testing/languages/types";

const VITEST_FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "vitest");
const TEMP_PROJECT_PREFIX = "spx-vitest-";
const COPIED_SUITE_NAME = "suite.test.ts";

// Committed inert fixture suites copied into a temp project for the real-vitest run.
export const VITEST_FIXTURE = {
  PASSING: "passing.test.ts.fixture",
  FAILING: "failing.test.ts.fixture",
} as const;

export type VitestFixture = (typeof VITEST_FIXTURE)[keyof typeof VITEST_FIXTURE];

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

// A real command runner that executes from the repo root (where vitest resolves);
// the runner's `--root <projectRoot>` flag isolates vitest to the temp project.
export function repoRootedCommandRunner(): TestRunnerDependencies {
  return {
    isLanguagePresent: () => true,
    runCommand: async (command, args) => {
      const result = await execa(command, [...args], { cwd: process.cwd(), reject: false });
      return { exitCode: result.exitCode ?? 0 };
    },
  };
}

// Copies a committed fixture suite into a temp project outside the repo so vitest
// resolves no inherited config and runs the suite under defaults.
export async function withTempVitestProject(
  fixture: VitestFixture,
  callback: (projectRoot: string) => Promise<void>,
): Promise<void> {
  const projectRoot = await mkdtemp(join(tmpdir(), TEMP_PROJECT_PREFIX));
  try {
    await copyFile(join(VITEST_FIXTURE_DIR, fixture), join(projectRoot, COPIED_SUITE_NAME));
    await callback(projectRoot);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}
