/**
 * Child entry script for the temp-directory process-level evidence. It runs under the product's
 * TypeScript runner as its own process: it requests one directory through the process-wide
 * temp-directory primitive, reports what it observed on stdout, and ends normally so the primitive's
 * exit hook runs. It asserts nothing.
 *
 * @module testing/harnesses/temp-directory/child
 */

import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { getProcessTempDirectory, TEMP_DIRECTORY_ENV_VAR } from "@/lib/temp-directory";
import { GIT_TEST_COMMAND, GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";

import { type GitProbeObservation, TEMP_DIRECTORY_CHILD_MODE, type TempDirectoryChildReport } from "./child-protocol";

const CONTENT_FILE_NAME = "child-content";
const MODE_ARGUMENT_INDEX = 2;
const SPAWN_WITHOUT_STATUS = -1;
const OUTPUT_ENCODING = "utf8";

function probeGit(directory: string, env: NodeJS.ProcessEnv): GitProbeObservation {
  const result = spawnSync(
    GIT_TEST_COMMAND,
    [GIT_TEST_SUBCOMMANDS.REV_PARSE, GIT_TEST_FLAGS.IS_INSIDE_WORK_TREE],
    { cwd: directory, env, encoding: OUTPUT_ENCODING },
  );
  return { exitCode: result.status ?? SPAWN_WITHOUT_STATUS, stdout: result.stdout };
}

const directory = await getProcessTempDirectory().createDirectory();
const contentPath = join(directory, CONTENT_FILE_NAME);
writeFileSync(contentPath, "");
const root = process.env[TEMP_DIRECTORY_ENV_VAR.RUN_ROOT];

const base: TempDirectoryChildReport = {
  root,
  directory,
  rootExistedWhileRunning: root !== undefined && existsSync(root),
  contentExistedWhileRunning: existsSync(contentPath),
};

let report: TempDirectoryChildReport = base;
if (process.argv[MODE_ARGUMENT_INDEX] === TEMP_DIRECTORY_CHILD_MODE.GIT_PROBE) {
  const withoutCeiling: NodeJS.ProcessEnv = { ...process.env };
  delete withoutCeiling[TEMP_DIRECTORY_ENV_VAR.GIT_CEILING_DIRECTORIES];
  report = {
    ...base,
    gitUnderExportedEnvironment: probeGit(directory, process.env),
    gitWithoutCeiling: probeGit(directory, withoutCeiling),
  };
}

process.stdout.write(JSON.stringify(report));
