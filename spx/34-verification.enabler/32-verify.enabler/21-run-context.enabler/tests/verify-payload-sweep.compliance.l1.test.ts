import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_SCOPE_TYPE, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { CHANGE_RUNS_TEST_GENERATOR } from "@testing/generators/verify/change-runs";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { withVerifyHeadCommitRepository } from "@testing/harnesses/verify/repository";

// Before `start` creates its run's payload directory it removes the payload directory of every run of the
// worktree whose journal is closed — by a terminal-completion event or by a seal — or that no branch scope
// holds a journal for, under every verification type's payload root, and keeps the payload directory of a
// run whose journal is open. The violating cases are directories staged for runs of each closed or absent
// kind, with a file inside each; the conforming cases are the directory of an open run and the directory of
// the run `start` creates. Every run starts from a linked worktree whose root differs from the repository's
// checkout, so a sweep that scans another root leaves the worktree's staged directories in place. The
// worktree's paths before and after the starting run are the oracle.
describe("verify start payload directory sweep", () => {
  it("removes the payload directories of closed and absent runs under every verification type and keeps those of open runs", async () => {
    await withVerifyHeadCommitRepository(async (checkout) => {
      const repository = await checkout.linkWorktree();
      const finishedRun = await repository.startRun(VERIFY_SCOPE_TYPE.FILE, VERIFY_VERIFICATION_TYPE.AUDIT);
      const sealedRun = await repository.startRun(VERIFY_SCOPE_TYPE.FILE, VERIFY_VERIFICATION_TYPE.REVIEW);
      const openRun = await repository.startRun(VERIFY_SCOPE_TYPE.FILE, VERIFY_VERIFICATION_TYPE.TEST);
      const finished = await repository.finish(
        finishedRun,
        sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.evidenceFreeTerminalStatuses())[
          VERIFY_VERIFICATION_TYPE.AUDIT
        ],
      );
      const sealed = await repository.sealJournal(sealedRun);
      const absentToken = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());
      const stagedName = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());
      const finishedDirectory = repository.payloadDirectory(VERIFY_VERIFICATION_TYPE.AUDIT, finishedRun.runToken ?? "");
      const sealedDirectory = repository.payloadDirectory(VERIFY_VERIFICATION_TYPE.REVIEW, sealedRun.runToken ?? "");
      const openDirectory = repository.payloadDirectory(VERIFY_VERIFICATION_TYPE.TEST, openRun.runToken ?? "");
      const absentDirectory = repository.payloadDirectory(VERIFY_VERIFICATION_TYPE.TEST, absentToken);
      await repository.stagePayloadFile(finishedDirectory, stagedName);
      await repository.stagePayloadFile(sealedDirectory, stagedName);
      await repository.stagePayloadFile(openDirectory, stagedName);
      await repository.stagePayloadFile(absentDirectory, stagedName);
      const before = new Set((await repository.snapshotState()).map((entry) => entry.path));

      const starting = await repository.startRun(VERIFY_SCOPE_TYPE.FILE, VERIFY_VERIFICATION_TYPE.AUDIT);
      const after = new Set((await repository.snapshotState()).map((entry) => entry.path));

      expect(finished.exitCode, finished.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(sealed.exitCode, sealed.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(starting.started.exitCode, starting.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(
        [finishedDirectory, sealedDirectory, openDirectory, absentDirectory].map((directory) => before.has(directory)),
      ).toEqual([true, true, true, true]);
      expect(
        [finishedDirectory, sealedDirectory, openDirectory, absentDirectory].map((directory) =>
          [...after].filter((path) => path.startsWith(directory)).length
        ),
      ).toEqual([0, 0, 2, 0]);
      expect(after.has(repository.payloadDirectory(VERIFY_VERIFICATION_TYPE.AUDIT, starting.runToken ?? ""))).toBe(
        true,
      );
    });
  });

  it("removes the payload directory of a run closed on another branch and keeps that of a run open on another branch after the worktree's head moves", async () => {
    await withVerifyHeadCommitRepository(async (checkout) => {
      const repository = await checkout.linkWorktree();
      const closedRun = await repository.startRun(VERIFY_SCOPE_TYPE.FILE, VERIFY_VERIFICATION_TYPE.AUDIT);
      const openRun = await repository.startRun(VERIFY_SCOPE_TYPE.FILE, VERIFY_VERIFICATION_TYPE.AUDIT);
      const sealed = await repository.sealJournal(closedRun);
      const stagedName = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());
      const closedDirectory = repository.payloadDirectory(VERIFY_VERIFICATION_TYPE.AUDIT, closedRun.runToken ?? "");
      const openDirectory = repository.payloadDirectory(VERIFY_VERIFICATION_TYPE.AUDIT, openRun.runToken ?? "");
      await repository.stagePayloadFile(closedDirectory, stagedName);
      await repository.stagePayloadFile(openDirectory, stagedName);
      await repository.detachHead(checkout.headCommit);
      const before = new Set((await repository.snapshotState()).map((entry) => entry.path));

      const starting = await repository.startRun(VERIFY_SCOPE_TYPE.FILE, VERIFY_VERIFICATION_TYPE.AUDIT);
      const after = new Set((await repository.snapshotState()).map((entry) => entry.path));

      expect(sealed.exitCode, sealed.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(starting.started.exitCode, starting.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect([closedDirectory, openDirectory].map((directory) => before.has(directory))).toEqual([true, true]);
      expect(
        [closedDirectory, openDirectory].map((directory) =>
          [...after].filter((path) => path.startsWith(directory)).length
        ),
      ).toEqual([0, 2]);
    });
  });
});
