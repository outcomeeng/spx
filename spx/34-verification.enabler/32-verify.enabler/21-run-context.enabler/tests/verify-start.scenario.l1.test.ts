import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_INPUT_SOURCE, VERIFY_SCOPE_TYPE } from "@/domains/verify/verify";
import { pathsFromNameStatus } from "@/lib/git/name-status";
import {
  observeLinkedWorktreeStart,
  observeNestedDirectoryStart,
  observePersistedRunJournal,
  observeStartedRunContext,
} from "@testing/harnesses/verify/harness";

describe("verify start run context", () => {
  it("creates a context, opens a run journal, and reports the run token, digest, changed scope, input, and locator", async () => {
    await observeStartedRunContext().then(
      ({ scenario, command, report, expectedContext, expectedInputDigest, persistedContext }) => {
        expect(command.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(report.runToken.length).toBeGreaterThan(0);
        expect(report.contextDigest).toBe(expectedContext.digest);
        expect(persistedContext).toBe(expectedContext.canonicalJson);
        expect(report.resolvedScope).toEqual(pathsFromNameStatus(scenario.nameStatusStdout));
        expect(report.input.source).toBe(VERIFY_INPUT_SOURCE.STDIN);
        expect(report.input.digest).toBe(expectedInputDigest);
        expect(report.locator.runToken).toBe(report.runToken);
        expect(report.locator.verificationType).toBe(scenario.verificationType);
        expect(report.locator.scopeType).toBe(VERIFY_SCOPE_TYPE.CHANGESET);
        expect(report.locator.scopeIdentity).toBe(scenario.scope);
        expect(report.locator.runTarget.length).toBeGreaterThan(0);
      },
    );
  });

  it("persists the run journal at the reported run target", async () => {
    await observePersistedRunJournal().then(({ command, report, persistedJournal }) => {
      expect(command.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(report.locator.runTarget).toContain(report.runToken);
      expect(persistedJournal.length).toBeGreaterThan(0);
    });
  });

  it("reports product-relative changed scope when started from a nested directory", async () => {
    await observeNestedDirectoryStart().then((observation) => {
      expect(observation.command.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(observation.report.resolvedScope).toEqual(observation.expectedScope);
      expect(observation.changedScopeCwd).toBe(observation.expectedChangedScopeCwd);
    });
  });

  it("uses the linked worktree for diffs and the common root for state", async () => {
    await observeLinkedWorktreeStart().then((observation) => {
      expect(observation.command.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(observation.changedScopeCwd).toBe(observation.expectedChangedScopeCwd);
      expect(observation.report.locator.runTarget).toContain(observation.stateRoot);
    });
  });
});
