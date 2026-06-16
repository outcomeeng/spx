/**
 * Pre-commit entrypoint for the fixture-exclusion sync check.
 *
 * Boundary code: it injects the real `.sonarcloud.properties` read and the real
 * `git ls-files` listing into the pure {@link checkFixtureExclusions} logic, prints
 * a drift report when the lists disagree, and maps the result to an exit code.
 * Lefthook invokes this on pre-commit; see `lefthook.yml`.
 *
 * @module lib/sonarqube-cloud/check-fixture-exclusions
 */

import { execFileSync } from "node:child_process";

import { isDirectPrecommitEntrypoint, PRECOMMIT_ENTRYPOINT } from "../precommit/entrypoint";
import {
  checkFixtureExclusions,
  EXCLUSION_CHECK_EXIT,
  type ExclusionCheckDeps,
  FIXTURE_ROOT,
  formatDriftReport,
} from "./exclusions";

export const SONARQUBE_CLOUD_PROPERTIES_FILE = ".sonarcloud.properties";
const GIT_INDEX_PATH_PREFIX = ":";
const GIT_SHOW_COMMAND = "show";
const GIT_LS_FILES_COMMAND = "ls-files";
const GIT_LS_FILES_ZERO_FLAG = "-z";
const GIT_LS_FILES_CACHED_FLAG = "--cached";
// NUL-terminated output so paths are raw bytes regardless of git's core.quotePath.
const GIT_LS_FILES_SEPARATOR = "\0";

interface EntrypointDeps extends ExclusionCheckDeps {
  readonly writeError: (message: string) => void;
}

interface EntrypointBoundaryDeps {
  readonly execGit: (args: readonly string[]) => string;
  readonly writeError: (message: string) => void;
}

export function gitShowPropertiesIndexArgs(): readonly string[] {
  return [GIT_SHOW_COMMAND, `${GIT_INDEX_PATH_PREFIX}${SONARQUBE_CLOUD_PROPERTIES_FILE}`];
}

export function gitListCachedFixtureFilesArgs(): readonly string[] {
  return [GIT_LS_FILES_COMMAND, GIT_LS_FILES_ZERO_FLAG, GIT_LS_FILES_CACHED_FLAG, FIXTURE_ROOT];
}

export function createFixtureExclusionEntrypointDeps(deps: EntrypointBoundaryDeps): EntrypointDeps {
  return {
    readProperties: () => deps.execGit(gitShowPropertiesIndexArgs()),
    listTrackedFixtureFiles: () =>
      deps
        .execGit(gitListCachedFixtureFilesArgs())
        .split(GIT_LS_FILES_SEPARATOR)
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    writeError: deps.writeError,
  };
}

function realDeps(): EntrypointDeps {
  return createFixtureExclusionEntrypointDeps({
    execGit: (args) => execFileSync("git", [...args], { encoding: "utf8" }),
    writeError: (message: string) => process.stderr.write(`${message}\n`),
  });
}

/**
 * Run the check against injected boundaries and return the exit code: clean maps to
 * {@link EXCLUSION_CHECK_EXIT.CLEAN}; drift writes the report and maps to
 * {@link EXCLUSION_CHECK_EXIT.DRIFT}.
 */
export function runFixtureExclusionCheck(deps: EntrypointDeps): number {
  const { ok, drift } = checkFixtureExclusions(deps);
  if (ok) {
    return EXCLUSION_CHECK_EXIT.CLEAN;
  }
  deps.writeError(formatDriftReport(drift));
  return EXCLUSION_CHECK_EXIT.DRIFT;
}

if (isDirectPrecommitEntrypoint(import.meta.url, process.argv[1], PRECOMMIT_ENTRYPOINT.SONARQUBE_CLOUD_EXCLUSIONS)) {
  process.exit(runFixtureExclusionCheck(realDeps()));
}
