import { sep } from "node:path";
import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_EXIT_CODE,
  VERIFY_PATHS_REPORT_FIELD,
  VERIFY_WRITE_DIRECTORY_FIELD,
  VERIFY_WRITE_DIRECTORY_ROLE,
  type VerifyPathsReport,
} from "@/commands/verify/cli";
import { VERIFY_SCOPE_TYPE } from "@/domains/verify/verify";
import { CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import { observeBuiltRunPathsAgainstStart } from "@testing/harnesses/verify/built-cli";
import { REPOSITORY_STATE_ENTRY_KIND } from "@testing/harnesses/verify/repository";

describe("record-run paths through the built executable", () => {
  it(
    "writes the write-path report as one JSON document on standard output, exits zero, and creates no file or directory",
    async () => {
      await observeBuiltRunPathsAgainstStart().then((observation) => {
        expect(observation.paths.exitCode, observation.paths.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(observation.start.exitCode, observation.start.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const report = JSON.parse(observation.paths.stdout) as VerifyPathsReport;
        expect(Object.keys(report)).toEqual(
          expect.arrayContaining([
            VERIFY_PATHS_REPORT_FIELD.RESOLVED_SCOPE,
            VERIFY_PATHS_REPORT_FIELD.BRANCH_SLUG,
            VERIFY_PATHS_REPORT_FIELD.WRITE_DIRECTORIES,
          ]),
        );
        expect(report.resolvedScope.scopeType).toBe(VERIFY_SCOPE_TYPE.FILE);
        expect(report.resolvedScope.scopeIdentity).toBe(observation.filePath);
        expect(report.branchSlug).not.toHaveLength(0);
        const roles = Object.values(VERIFY_WRITE_DIRECTORY_ROLE);
        expect(report.writeDirectories).toHaveLength(roles.length);
        expect(report.writeDirectories.map((directory) => directory.role)).toEqual(expect.arrayContaining(roles));
        expect(observation.stateAfterPaths).toEqual(observation.stateBeforePaths);

        const pathsOf = (kind: string, state: typeof observation.stateAfterStart): string[] =>
          state.filter((entry) => entry.kind === kind).map((entry) => entry.path);
        const directoriesBefore = pathsOf(REPOSITORY_STATE_ENTRY_KIND.DIRECTORY, observation.stateBeforePaths);
        const directoriesAfterStart = pathsOf(REPOSITORY_STATE_ENTRY_KIND.DIRECTORY, observation.stateAfterStart);
        const filesBefore = pathsOf(REPOSITORY_STATE_ENTRY_KIND.FILE, observation.stateBeforePaths);
        const directoriesStartCreated = directoriesAfterStart.filter((path) => !directoriesBefore.includes(path));
        const filesStartCreated = pathsOf(REPOSITORY_STATE_ENTRY_KIND.FILE, observation.stateAfterStart)
          .filter((path) => !filesBefore.includes(path));

        report.writeDirectories.forEach((directory) => {
          expect(Object.keys(directory)).toEqual(
            expect.arrayContaining(Object.values(VERIFY_WRITE_DIRECTORY_FIELD)),
          );
          expect(Array.isArray(directory.missingDirectories)).toBe(true);
          expect(directory.path).toContain(`${sep}${report.branchSlug}${sep}`);
          // The directory the run started for the same type, scope, and branch writes into.
          expect(directoriesAfterStart).toContain(directory.path);
          expect(filesStartCreated.some((file) => file.startsWith(`${directory.path}${sep}`))).toBe(true);
          // Existence and the missing directories are what the filesystem held before the run started.
          expect(directory.exists).toBe(directoriesBefore.includes(directory.path));
          const createdOnTheWay = directoriesStartCreated
            .filter((created) => directory.path === created || directory.path.startsWith(`${created}${sep}`))
            .sort((left, right) => left.length - right.length);
          expect(directory.missingDirectories).toEqual(createdOnTheWay);
        });
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );
});
