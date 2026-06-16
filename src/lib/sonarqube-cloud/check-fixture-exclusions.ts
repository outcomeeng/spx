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
import { readFileSync } from "node:fs";

import {
  checkFixtureExclusions,
  EXCLUSION_CHECK_EXIT,
  type ExclusionCheckDeps,
  FIXTURE_ROOT,
  formatDriftReport,
} from "./exclusions";

const SONARQUBE_CLOUD_PROPERTIES_FILE = ".sonarcloud.properties";
const ENTRYPOINT_SUFFIX = "/check-fixture-exclusions.ts";
// NUL-terminated output so paths are raw bytes regardless of git's core.quotePath.
const GIT_LS_FILES_SEPARATOR = "\0";

interface EntrypointDeps extends ExclusionCheckDeps {
  readonly writeError: (message: string) => void;
}

function realDeps(): EntrypointDeps {
  return {
    readProperties: () => readFileSync(SONARQUBE_CLOUD_PROPERTIES_FILE, "utf8"),
    listTrackedFixtureFiles: () =>
      execFileSync("git", ["ls-files", "-z", FIXTURE_ROOT], { encoding: "utf8" })
        .split(GIT_LS_FILES_SEPARATOR)
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    writeError: (message: string) => process.stderr.write(`${message}\n`),
  };
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

if (import.meta.url.endsWith(ENTRYPOINT_SUFFIX)) {
  process.exit(runFixtureExclusionCheck(realDeps()));
}
