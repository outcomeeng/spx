import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_RUN_CONTEXT_EVENT_FIELD, VERIFY_SCOPE_TYPE } from "@/domains/verify/verify";
import { GIT_SUCCESS_EXIT_CODE } from "@/lib/git/tracked-paths";
import {
  withVerifyHeadCommitRepository,
  withVerifyOutsideRepositoryDirectory,
  withVerifyUnbornHeadRepository,
} from "@testing/harnesses/verify/repository";

// Inside a Git repository, the repository's checkout is detached at the base commit while its
// changeset ranges end at a branch naming the head commit. A changeset run judges the commit its range
// head names; every other scope judges the checkout's HEAD when `start` runs. Outside any Git
// repository, and in a repository whose HEAD is unborn because it holds no commit, there is no commit
// to judge, so a run starts and records no head commit.
describe("verify start head commit", () => {
  it.each(Object.values(VERIFY_SCOPE_TYPE))(
    "records on the run-context event the commit the %s scope judges",
    async (scopeType) => {
      await withVerifyHeadCommitRepository(async (repository) => {
        await repository.startRun(scopeType).then((run) => {
          expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
          expect(run.runContextData).toHaveLength(1);
          expect(run.runContextData[0]?.[VERIFY_RUN_CONTEXT_EVENT_FIELD.HEAD_COMMIT]).toBe(
            scopeType === VERIFY_SCOPE_TYPE.CHANGESET ? repository.headCommit : repository.baseCommit,
          );
        });
      });
    },
  );

  it("starts a file-scope run outside any Git repository and records no head commit on its run-context event", async () => {
    await withVerifyOutsideRepositoryDirectory(async (directory) => {
      expect(directory.gitEntries).toEqual([]);
      await directory.startFileRun().then((run) => {
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(run.runContextData).toHaveLength(1);
        expect(run.runContextData[0]).not.toHaveProperty(VERIFY_RUN_CONTEXT_EVENT_FIELD.HEAD_COMMIT);
      });
    });
  });

  it("starts a file-scope run in a Git repository holding no commit and records no head commit on its run-context event", async () => {
    await withVerifyUnbornHeadRepository(async (repository) => {
      expect(repository.headVerifyExitCode).not.toBe(GIT_SUCCESS_EXIT_CODE);
      await repository.startFileRun().then((run) => {
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(run.runContextData).toHaveLength(1);
        expect(run.runContextData[0]).not.toHaveProperty(VERIFY_RUN_CONTEXT_EVENT_FIELD.HEAD_COMMIT);
      });
    });
  });
});
