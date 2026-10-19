import { describe, expect, it } from "vitest";

import { VERIFY_CLI_ERROR, VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { checkReconcilableRun, VERIFY_RECONCILIATION_REJECTION } from "@/domains/verify/reconciliation";
import {
  VERIFY_CHANGE_INVENTORY_ERROR,
  VERIFY_RUN_CONTEXT_EVENT_FIELD,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import { RECONCILIATION_TEST_GENERATOR } from "@testing/generators/verify/reconciliation";
import {
  sampleVerifyTestValue,
  VERIFY_CHANGE_OPERATION,
  VERIFY_INVENTORY_ENTRY_MALFORMATION,
  VERIFY_TEST_GENERATOR,
} from "@testing/generators/verify/verify";
import {
  RECONCILE_GIT_FAILURE,
  RECONCILE_NON_SELECTOR_GIT_FAILURES,
  reconcileUnderGitFailure,
} from "@testing/harnesses/verify/reconciliation-git-failure";
import {
  withVerifyChangeInventoryRepository,
  withVerifyFinishRepository,
  withVerifyHeadCommitRepository,
} from "@testing/harnesses/verify/repository";

describe("verify scope reconciliation rejection", () => {
  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "rejects a %s run that is not changeset-scoped, naming its scope type",
    async (verificationType) => {
      await withVerifyHeadCommitRepository(async (repository) => {
        const run = await repository.startRun(VERIFY_SCOPE_TYPE.FILE, verificationType);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);

        const reconciled = await repository.reconcile(run);

        expect(reconciled.exitCode, reconciled.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(reconciled.output).toContain(VERIFY_CLI_ERROR.RECONCILE_REJECTED);
        expect(reconciled.output).toContain(VERIFY_RECONCILIATION_REJECTION.NOT_CHANGESET_SCOPED);
        expect(reconciled.output).toContain(VERIFY_SCOPE_TYPE.FILE);
      });
    },
  );

  it("rejects a changeset-scoped run that recorded no change inventory, naming the missing inventory", () => {
    const checked = checkReconcilableRun(VERIFY_SCOPE_TYPE.CHANGESET, undefined);

    expect(checked).toEqual({ ok: false, error: VERIFY_RECONCILIATION_REJECTION.NO_CHANGE_INVENTORY });
  });

  it.each(Object.values(VERIFY_INVENTORY_ENTRY_MALFORMATION))(
    "rejects a run whose recorded change inventory carries a %s entry, naming the offending entry and its position",
    async (malformation) => {
      await withVerifyFinishRepository(async (repository) => {
        const entry = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.malformedChangeInventoryEntry(malformation));
        const verificationType = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.verificationType());
        const run = await repository.startChangesetRunRecordingInventoryEntry(verificationType, entry);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const recorded = run.runContextData[0][VERIFY_RUN_CONTEXT_EVENT_FIELD.CHANGE_INVENTORY] as readonly unknown[];

        const reconciled = await repository.reconcile(run);

        expect(reconciled.exitCode, reconciled.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(reconciled.output).toContain(VERIFY_CLI_ERROR.RECONCILE_REJECTED);
        expect(reconciled.output).toContain(VERIFY_CHANGE_INVENTORY_ERROR.ENTRY_MALFORMED);
        expect(reconciled.output).toContain(JSON.stringify(entry));
        expect(reconciled.output).toContain(
          `${VERIFY_RUN_CONTEXT_EVENT_FIELD.CHANGE_INVENTORY}[${recorded.length - 1}]`,
        );
      });
    },
  );

  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "does not reject a %s run whose recorded change inventory carries only well-formed entries",
    async (verificationType) => {
      await withVerifyFinishRepository(async (repository) => {
        const run = await repository.startChangesetRun(verificationType, false);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);

        const reconciled = await repository.reconcile(run);

        expect(reconciled.output).not.toContain(VERIFY_CLI_ERROR.RECONCILE_REJECTED);
        expect(reconciled.output).not.toContain(VERIFY_CHANGE_INVENTORY_ERROR.ENTRY_MALFORMED);
      });
    },
  );

  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "rejects a %s run whose changeset selector no longer resolves, naming the selector",
    async (verificationType) => {
      await withVerifyChangeInventoryRepository(VERIFY_CHANGE_OPERATION.DELETE, async (repository) => {
        const run = await repository.startChangesetRun(verificationType);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        await repository.removeHeadBranch();

        const reconciled = await repository.reconcile(run);

        expect(reconciled.exitCode, reconciled.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(reconciled.output).toContain(VERIFY_CLI_ERROR.RECONCILE_REJECTED);
        expect(reconciled.output).toContain(VERIFY_RECONCILIATION_REJECTION.SELECTOR_UNRESOLVED);
        expect(reconciled.output).toContain(run.scope);
      });
    },
  );

  it.each(RECONCILE_NON_SELECTOR_GIT_FAILURES)(
    "reports a %s git failure as a reconcile failure carrying the git error, never as an unresolved selector",
    async (failure) => {
      await withVerifyFinishRepository(async (repository) => {
        const verificationType = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.verificationType());
        const gitError = sampleVerifyTestValue(RECONCILIATION_TEST_GENERATOR.gitFailureMessage());
        const run = await repository.startChangesetRun(verificationType, false);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);

        const reconciled = await reconcileUnderGitFailure(repository, run, failure, gitError);

        expect(reconciled.exitCode, reconciled.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(reconciled.output).toContain(VERIFY_CLI_ERROR.RECONCILE_FAILED);
        expect(reconciled.output).toContain(VERIFY_CLI_ERROR.CHANGE_INVENTORY_FAILED);
        expect(reconciled.output).toContain(gitError);
        expect(reconciled.output).not.toContain(VERIFY_CLI_ERROR.RECONCILE_REJECTED);
        expect(reconciled.output).not.toContain(VERIFY_RECONCILIATION_REJECTION.SELECTOR_UNRESOLVED);
        expect(reconciled.output).not.toContain(VERIFY_CLI_ERROR.CHANGED_SCOPE_FAILED);
      });
    },
  );

  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "rejects a %s run whose changeset base names no commit as an unresolved selector, naming the selector",
    async (verificationType) => {
      await withVerifyFinishRepository(async (repository) => {
        const gitError = sampleVerifyTestValue(RECONCILIATION_TEST_GENERATOR.gitFailureMessage());
        const run = await repository.startChangesetRun(verificationType, false);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);

        const reconciled = await reconcileUnderGitFailure(
          repository,
          run,
          RECONCILE_GIT_FAILURE.BASE_NAMES_NO_COMMIT,
          gitError,
        );

        expect(reconciled.exitCode, reconciled.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(reconciled.output).toContain(VERIFY_CLI_ERROR.RECONCILE_REJECTED);
        expect(reconciled.output).toContain(VERIFY_RECONCILIATION_REJECTION.SELECTOR_UNRESOLVED);
        expect(reconciled.output).toContain(run.scope);
        expect(reconciled.output).not.toContain(VERIFY_CLI_ERROR.RECONCILE_FAILED);
      });
    },
  );
});
