import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { VERIFY_SCOPE_TYPE, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { CHANGE_RUNS_TEST_GENERATOR } from "@testing/generators/verify/change-runs";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { jsonNodes, parseChangeRunsReport, withChangeRunsRepository } from "@testing/harnesses/verify/change-runs";

describe("Change runs listing compliance", () => {
  it("lists only runs whose run-context event records the requested Change identity verbatim", async () => {
    const scenario = sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.scenario());
    await withChangeRunsRepository(scenario, async (repository) => {
      await repository.checkoutNewBranch(scenario.firstBranch);
      const owned = await repository.startRun({
        verificationType: VERIFY_VERIFICATION_TYPE.REVIEW,
        scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
        change: scenario.change,
      });
      const prefixSharing = await repository.startRun({
        verificationType: VERIFY_VERIFICATION_TYPE.REVIEW,
        scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
        change: scenario.prefixSharingChange,
      });
      const other = await repository.startRun({
        verificationType: VERIFY_VERIFICATION_TYPE.REVIEW,
        scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
        change: scenario.otherChange,
      });
      const unowned = await repository.startRun({
        verificationType: VERIFY_VERIFICATION_TYPE.REVIEW,
        scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
      });

      const listings = await Promise.all(
        [scenario.change, scenario.prefixSharingChange, scenario.otherChange].map(async (change) =>
          repository.listChangeRuns(change)
        ),
      );

      for (const listing of listings) expect(listing.exitCode, listing.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(
        listings.map((listing) =>
          Object.values(parseChangeRunsReport(listing.output).runs).flat().map((run) => run.runToken)
        ),
      ).toEqual([[owned.runToken], [prefixSharing.runToken], [other.runToken]]);
      expect(
        listings.flatMap((listing) =>
          Object.values(parseChangeRunsReport(listing.output).runs).flat().map((run) => run.runToken)
        ),
      ).not.toContain(unowned.runToken);
    });
  });

  it("lists a Change's runs from every branch scope, including a renamed branch, a linked worktree's branch, and a detached head", async () => {
    const scenario = sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.scenario());
    await withChangeRunsRepository(scenario, async (repository) => {
      await repository.checkoutNewBranch(scenario.firstBranch);
      const onRenamedBranch = await repository.startRun({
        verificationType: VERIFY_VERIFICATION_TYPE.REVIEW,
        scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
        change: scenario.change,
      });
      await repository.detachHead();
      await repository.renameBranch(scenario.firstBranch, scenario.renamedBranch);
      const onDetachedHead = await repository.startRun({
        verificationType: VERIFY_VERIFICATION_TYPE.AUDIT,
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        change: scenario.change,
      });
      const worktreeDir = await repository.addWorktree(scenario.worktreeDirectory, scenario.worktreeBranch);
      const inLinkedWorktree = await repository.startRun({
        verificationType: VERIFY_VERIFICATION_TYPE.REVIEW,
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        change: scenario.change,
        cwd: worktreeDir,
      });

      const fromMainCheckout = await repository.listChangeRuns(scenario.change);
      const fromLinkedWorktree = await repository.listChangeRuns(scenario.change, worktreeDir);

      expect(fromMainCheckout.exitCode, fromMainCheckout.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(fromLinkedWorktree.exitCode, fromLinkedWorktree.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(
        new Set(Object.values(parseChangeRunsReport(fromMainCheckout.output).runs).flat().map((run) => run.runToken)),
      ).toEqual(new Set([onRenamedBranch.runToken, onDetachedHead.runToken, inLinkedWorktree.runToken]));
      expect(Object.values(parseChangeRunsReport(fromMainCheckout.output).runs).flat()).toHaveLength(
        [onRenamedBranch, onDetachedHead, inLinkedWorktree].length,
      );
      expect(parseChangeRunsReport(fromLinkedWorktree.output)).toEqual(
        parseChangeRunsReport(fromMainCheckout.output),
      );
    });
  });

  it("lists a run that serves the Change but has no recorded-input sidecar with its journal-derived fields and no scope fields, without failing the listing", async () => {
    const scenario = sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.scenario());
    const findings = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewFindingBatch());
    await withChangeRunsRepository(scenario, async (repository) => {
      await repository.checkoutNewBranch(scenario.firstBranch);
      const withoutSidecar = await repository.startRun({
        verificationType: VERIFY_VERIFICATION_TYPE.REVIEW,
        scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
        change: scenario.change,
      });
      await repository.appendFindings(withoutSidecar, findings);
      await repository.finish(withoutSidecar, JOURNAL_RUN_STATE_STATUS.REJECTED);
      const statusBeforeRemoval = await repository.status(withoutSidecar);
      await repository.removeRecordedInput(withoutSidecar);
      const withSidecar = await repository.startRun({
        verificationType: VERIFY_VERIFICATION_TYPE.AUDIT,
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        change: scenario.change,
      });

      const listed = await repository.listChangeRuns(scenario.change);

      expect(listed.exitCode, listed.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      const report = parseChangeRunsReport(listed.output);
      expect(report.runs[VERIFY_VERIFICATION_TYPE.REVIEW]).toEqual([{
        runToken: withoutSidecar.runToken,
        verificationType: withoutSidecar.verificationType,
        driveMode: statusBeforeRemoval.driveMode,
        sealed: statusBeforeRemoval.sealed,
        terminalStatus: statusBeforeRemoval.terminalStatus,
        findingCount: statusBeforeRemoval.findingCount,
        findingCounts: statusBeforeRemoval.findingCounts,
      }]);
      expect(report.runs[VERIFY_VERIFICATION_TYPE.AUDIT]).toEqual([
        expect.objectContaining({
          runToken: withSidecar.runToken,
          scopeType: withSidecar.scopeType,
          scope: withSidecar.scope,
        }),
      ]);
    });
  });

  it("never carries a listed run's finding payloads", async () => {
    const scenario = sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.scenario());
    const findings = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewFindingBatch());
    await withChangeRunsRepository(scenario, async (repository) => {
      await repository.checkoutNewBranch(scenario.firstBranch);
      const run = await repository.startRun({
        verificationType: VERIFY_VERIFICATION_TYPE.REVIEW,
        scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
        change: scenario.change,
      });
      await repository.appendFindings(run, findings);

      const listed = await repository.listChangeRuns(scenario.change);

      expect(listed.exitCode, listed.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(
        parseChangeRunsReport(listed.output).runs[VERIFY_VERIFICATION_TYPE.REVIEW].map((listedRun) =>
          listedRun.findingCount
        ),
      ).toEqual([findings.length]);
      for (const entry of findings) {
        expect(jsonNodes(JSON.parse(listed.output))).not.toContainEqual(entry.finding);
      }
    });
  });
});
