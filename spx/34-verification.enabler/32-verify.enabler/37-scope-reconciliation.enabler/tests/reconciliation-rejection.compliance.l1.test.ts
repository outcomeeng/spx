import { describe, expect, it } from "vitest";

import { VERIFY_CLI_ERROR, VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { checkReconcilableRun, VERIFY_RECONCILIATION_REJECTION } from "@/domains/verify/reconciliation";
import { VERIFY_SCOPE_TYPE, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { VERIFY_CHANGE_OPERATION } from "@testing/generators/verify/verify";
import {
  withVerifyChangeInventoryRepository,
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
});
