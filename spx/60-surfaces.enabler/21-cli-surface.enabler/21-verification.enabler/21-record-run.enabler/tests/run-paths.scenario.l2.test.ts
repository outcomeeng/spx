import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_EXIT_CODE,
  VERIFY_PATHS_REPORT_FIELD,
  VERIFY_WRITE_DIRECTORY_FIELD,
  VERIFY_WRITE_DIRECTORY_ROLE,
  type VerifyPathsReport,
} from "@/commands/verify/cli";
import { CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import { observeBuiltRunPaths } from "@testing/harnesses/verify/built-cli";

describe("record-run paths through the built executable", () => {
  it(
    "writes the write-path report as one JSON document on standard output, exits zero, and creates no file or directory",
    async () => {
      await observeBuiltRunPaths().then((observation) => {
        expect(observation.run.exitCode, observation.run.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const report = JSON.parse(observation.run.stdout) as VerifyPathsReport;
        expect(Object.keys(report)).toEqual(
          expect.arrayContaining([
            VERIFY_PATHS_REPORT_FIELD.RESOLVED_SCOPE,
            VERIFY_PATHS_REPORT_FIELD.BRANCH_SLUG,
            VERIFY_PATHS_REPORT_FIELD.WRITE_DIRECTORIES,
          ]),
        );
        expect(report).toEqual(JSON.parse(observation.inProcessReport));
        expect(report.writeDirectories.map((directory) => directory.role)).toEqual(
          expect.arrayContaining(Object.values(VERIFY_WRITE_DIRECTORY_ROLE)),
        );
        report.writeDirectories.forEach((directory) => {
          expect(Object.keys(directory)).toEqual(
            expect.arrayContaining(Object.values(VERIFY_WRITE_DIRECTORY_FIELD)),
          );
        });
        expect(observation.stateAfter).toEqual(observation.stateBefore);
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );
});
