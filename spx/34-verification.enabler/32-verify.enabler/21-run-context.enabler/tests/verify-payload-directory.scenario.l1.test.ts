import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_EXIT_CODE,
  VERIFY_PAYLOAD_PATH,
  VERIFY_START_REPORT_FIELD,
  VERIFY_WRITE_DIRECTORY_ROLE,
  type VerifyPathsReport,
} from "@/commands/verify/cli";
import { VERIFY_SCOPE_TYPE, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { worktreeScopeDir } from "@/lib/state-store";
import {
  REPOSITORY_STATE_ENTRY_KIND,
  VERIFICATION_TYPE_CASE_TITLE,
  withVerifyHeadCommitRepository,
} from "@testing/harnesses/verify/repository";

// The run's payload directory is `.spx/worktree/<verification-type>/payloads/run-<run-token>/` below the
// local worktree root. The layout the specification states is the oracle: it is composed here from the
// worktree state directory, the verification type, and the run token each run reports, and is set against
// the payload root the write-path report names for the same verification type and scope. The linked
// worktree's root differs from the repository's checkout, so a directory created at the wrong root fails.
describe("verify run payload directory", () => {
  describe.each(Object.values(VERIFY_VERIFICATION_TYPE))(VERIFICATION_TYPE_CASE_TITLE, (verificationType) => {
    it("creates the payload directory of a caller-started run at the worktree root, inside the reported payload root, and reports it as payloadDirectory", async () => {
      await withVerifyHeadCommitRepository(async (repository) => {
        const worktree = await repository.linkWorktree();
        const reported = await worktree.reportWritePaths(VERIFY_SCOPE_TYPE.CHANGESET, verificationType);
        const run = await worktree.startRun(VERIFY_SCOPE_TYPE.CHANGESET, verificationType);
        const entries = await worktree.snapshotState();

        expect(reported.exitCode, reported.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const payloadRoot = (JSON.parse(reported.output) as VerifyPathsReport).writeDirectories.find((directory) =>
          directory.role === VERIFY_WRITE_DIRECTORY_ROLE.PAYLOADS
        )?.path;
        const startReport = JSON.parse(run.started.output) as Record<string, unknown>;
        const expectedDirectory = join(
          worktreeScopeDir(worktree.worktreeDir),
          verificationType,
          VERIFY_PAYLOAD_PATH.ROOT_SEGMENT,
          `${VERIFY_PAYLOAD_PATH.RUN_DIRECTORY_PREFIX}${run.runToken}`,
        );

        expect(startReport[VERIFY_START_REPORT_FIELD.PAYLOAD_DIRECTORY]).toBe(expectedDirectory);
        expect(payloadRoot).toBe(
          join(worktreeScopeDir(worktree.worktreeDir), verificationType, VERIFY_PAYLOAD_PATH.ROOT_SEGMENT),
        );
        expect(entries.find((entry) => entry.path === expectedDirectory)?.kind).toBe(
          REPOSITORY_STATE_ENTRY_KIND.DIRECTORY,
        );
      });
    });

    it("creates the payload directory of a run spx opens at the worktree root", async () => {
      await withVerifyHeadCommitRepository(async (repository) => {
        const worktree = await repository.linkWorktree();
        const locator = await worktree.startSpxRun(VERIFY_SCOPE_TYPE.CHANGESET, verificationType);
        const entries = await worktree.snapshotState();
        const expectedDirectory = join(
          worktreeScopeDir(worktree.worktreeDir),
          verificationType,
          VERIFY_PAYLOAD_PATH.ROOT_SEGMENT,
          `${VERIFY_PAYLOAD_PATH.RUN_DIRECTORY_PREFIX}${locator.runToken}`,
        );

        expect(entries.find((entry) => entry.path === expectedDirectory)?.kind).toBe(
          REPOSITORY_STATE_ENTRY_KIND.DIRECTORY,
        );
      });
    });
  });
});
