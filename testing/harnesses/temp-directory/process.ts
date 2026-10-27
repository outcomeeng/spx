/**
 * Process-level harness for the temp-directory primitive: runs the child entry script as its own
 * process inside a freshly initialized Git repository that stands in for one worktree, and returns the
 * child's report together with the filesystem state observed after the child exited.
 *
 * The child starts from a Git-clean environment that carries no inherited run root, so it creates a run
 * root of its own in the fixture worktree. The harness owns lifecycle, environment, and cleanup; it
 * returns observations and asserts nothing.
 *
 * @module testing/harnesses/temp-directory/process
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { execa } from "execa";

import { TEMP_DIRECTORY_ENV_VAR } from "@/lib/temp-directory";
import { PRODUCT_ROOT } from "@testing/harnesses/constants";
import { buildGitTestEnvironment, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

import type { TempDirectoryChildMode, TempDirectoryChildReport } from "./child-protocol";

const FIXTURE_TEMP_DIR_PREFIX = "spx-temp-directory-process-";
const RUNNER_RELATIVE_PATH = ["node_modules", ".bin", "tsx"] as const;
const TSCONFIG_FILE_NAME = "tsconfig.json";
const TSCONFIG_FLAG = "--tsconfig";
const CHILD_SCRIPT_PATH = fileURLToPath(new URL("./child.ts", import.meta.url));

export interface TempDirectoryChildRun {
  readonly exitCode: number | undefined;
  readonly stderr: string;
  readonly report: TempDirectoryChildReport;
  /** Whether the run root the child reported still existed after the child exited. */
  readonly rootExistsAfterExit: boolean;
  /** Whether the directory the child reported still existed after the child exited. */
  readonly directoryExistsAfterExit: boolean;
}

/**
 * Runs the child entry script in `mode` as its own process and observes the filesystem after it exits.
 * Throws when the TypeScript runner is not installed.
 */
export async function runTempDirectoryChild(mode: TempDirectoryChildMode): Promise<TempDirectoryChildRun> {
  const runner = join(PRODUCT_ROOT, ...RUNNER_RELATIVE_PATH);
  if (!existsSync(runner)) {
    throw new Error(`TypeScript runner not found at ${runner}; run the package install first`);
  }

  return withTempDir(FIXTURE_TEMP_DIR_PREFIX, async (fixtureRoot) => {
    await runGit(fixtureRoot, [GIT_TEST_SUBCOMMANDS.INIT]);

    const env = buildGitTestEnvironment();
    delete env[TEMP_DIRECTORY_ENV_VAR.RUN_ROOT];

    const result = await execa(
      runner,
      [TSCONFIG_FLAG, join(PRODUCT_ROOT, TSCONFIG_FILE_NAME), CHILD_SCRIPT_PATH, mode],
      { cwd: fixtureRoot, env, extendEnv: false, reject: false },
    );

    const report: TempDirectoryChildReport = JSON.parse(result.stdout);
    return {
      exitCode: result.exitCode,
      stderr: result.stderr,
      report,
      rootExistsAfterExit: report.root !== undefined && existsSync(report.root),
      directoryExistsAfterExit: existsSync(report.directory),
    };
  });
}
