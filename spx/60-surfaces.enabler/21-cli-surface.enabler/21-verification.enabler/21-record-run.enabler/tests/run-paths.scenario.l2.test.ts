import { basename, dirname, join, sep } from "node:path";
import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_EXIT_CODE,
  VERIFY_PATHS_REPORT_FIELD,
  VERIFY_START_REPORT_FIELD,
  VERIFY_WRITE_DIRECTORY_FIELD,
  VERIFY_WRITE_DIRECTORY_ROLE,
  type VerifyPathsReport,
  type VerifyStartReport,
} from "@/commands/verify/cli";
import { VERIFY_PAYLOAD_PATH, VERIFY_SCOPE_TYPE } from "@/domains/verify/verify";
import { STATE_STORE_SCOPE_PATH } from "@/lib/state-store";
import { RUN_PAYLOAD_REPORTING_FIXTURE } from "@testing/fixtures/verify/record-run/run-payload-reporting";
import { CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import { observeBuiltRunPathsAgainstStart } from "@testing/harnesses/verify/built-cli";
import { REPOSITORY_STATE_ENTRY_KIND, type RepositoryStateEntry } from "@testing/harnesses/verify/repository";

const pathsOf = (kind: string, state: readonly RepositoryStateEntry[]): string[] =>
  state.filter((entry) => entry.kind === kind).map((entry) => entry.path);

describe("run payload reporting through the built executable", () => {
  it(
    "run-paths-report: writes one JSON document naming the three absent write directories, exits zero, and creates no file or directory",
    async () => {
      await observeBuiltRunPathsAgainstStart(RUN_PAYLOAD_REPORTING_FIXTURE).then((observation) => {
        expect(pathsOf(REPOSITORY_STATE_ENTRY_KIND.DIRECTORY, observation.stateBeforePaths)).not.toContain(
          join(observation.productDir, STATE_STORE_SCOPE_PATH.SPX_DIR),
        );
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
        expect(report.resolvedScope.scopeIdentity).toBe(RUN_PAYLOAD_REPORTING_FIXTURE.filePath);
        expect(report.branchSlug).not.toHaveLength(0);
        expect(report.writeDirectories).toHaveLength(3);
        expect(report.writeDirectories.map((directory) => directory.role)).toEqual(
          expect.arrayContaining([
            VERIFY_WRITE_DIRECTORY_ROLE.JOURNAL_RUNS,
            VERIFY_WRITE_DIRECTORY_ROLE.VERIFICATION_CONTEXT,
            VERIFY_WRITE_DIRECTORY_ROLE.PAYLOADS,
          ]),
        );
        expect(observation.stateAfterPaths).toEqual(observation.stateBeforePaths);

        const directoriesBefore = pathsOf(REPOSITORY_STATE_ENTRY_KIND.DIRECTORY, observation.stateBeforePaths);
        const directoriesAfterStart = pathsOf(REPOSITORY_STATE_ENTRY_KIND.DIRECTORY, observation.stateAfterStart);
        const filesBefore = pathsOf(REPOSITORY_STATE_ENTRY_KIND.FILE, observation.stateBeforePaths);
        const directoriesStartCreated = directoriesAfterStart.filter((path) => !directoriesBefore.includes(path));
        const filesStartCreated = pathsOf(REPOSITORY_STATE_ENTRY_KIND.FILE, observation.stateAfterStart)
          .filter((path) => !filesBefore.includes(path));

        const { payloadDirectory } = JSON.parse(observation.start.stdout) as VerifyStartReport;

        report.writeDirectories.forEach((directory) => {
          expect(Object.keys(directory)).toEqual(
            expect.arrayContaining(Object.values(VERIFY_WRITE_DIRECTORY_FIELD)),
          );
          expect(directory.exists).toBe(false);
          expect(Array.isArray(directory.missingDirectories)).toBe(true);
          expect(directory.path).toContain(`${sep}${report.branchSlug}${sep}`);
          // The directory the run started for the same type, scope, and branch writes into: the journal
          // runs and context directories receive files, and the payload root receives the run's payload
          // directory.
          expect(directoriesAfterStart).toContain(directory.path);
          if (directory.role === VERIFY_WRITE_DIRECTORY_ROLE.PAYLOADS) {
            expect(dirname(payloadDirectory)).toBe(directory.path);
            expect(directoriesAfterStart).toContain(payloadDirectory);
          } else {
            expect(filesStartCreated.some((file) => file.startsWith(`${directory.path}${sep}`))).toBe(true);
          }
          // The missing directories are the ones the run's start created on the way to the directory.
          const createdOnTheWay = directoriesStartCreated
            .filter((created) => directory.path === created || directory.path.startsWith(`${created}${sep}`))
            .sort((left, right) => left.length - right.length);
          expect(directory.missingDirectories).toEqual(createdOnTheWay);
        });
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );

  it(
    "start-reports-payload-directory: reports the run's existing payload directory inside the payloads directory paths reported",
    async () => {
      await observeBuiltRunPathsAgainstStart(RUN_PAYLOAD_REPORTING_FIXTURE).then((observation) => {
        expect(observation.paths.exitCode, observation.paths.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(observation.start.exitCode, observation.start.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const report = JSON.parse(observation.paths.stdout) as VerifyPathsReport;
        const started = JSON.parse(observation.start.stdout) as VerifyStartReport;
        expect(Object.keys(started)).toEqual(expect.arrayContaining(Object.values(VERIFY_START_REPORT_FIELD)));
        const payloadRoots = report.writeDirectories
          .filter((directory) => directory.role === VERIFY_WRITE_DIRECTORY_ROLE.PAYLOADS)
          .map((directory) => directory.path);
        expect(payloadRoots).toHaveLength(1);
        expect(basename(started.payloadDirectory)).toBe(
          `${VERIFY_PAYLOAD_PATH.RUN_DIRECTORY_PREFIX}${started.runToken}`,
        );
        expect(dirname(started.payloadDirectory)).toBe(payloadRoots[0]);
        expect(pathsOf(REPOSITORY_STATE_ENTRY_KIND.DIRECTORY, observation.stateAfterStart)).toContain(
          started.payloadDirectory,
        );
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );
});
