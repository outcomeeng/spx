import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import {
  sampleVerifyTestValue,
  VERIFY_CHANGE_OPERATION,
  VERIFY_TEST_GENERATOR,
} from "@testing/generators/verify/verify";
import { withVerifyChangeInventoryRepository } from "@testing/harnesses/verify/repository";

describe("verify scope reconciliation read-only", () => {
  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "appends no journal event and changes no HEAD, ref, index, or working tree while reconciling a %s run",
    async (verificationType) => {
      await withVerifyChangeInventoryRepository(VERIFY_CHANGE_OPERATION.DELETE, async (repository) => {
        const run = await repository.startChangesetRun(verificationType);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const payload = sampleVerifyTestValue(
          VERIFY_TEST_GENERATOR.judgedDeletionsScopeUnit(verificationType, run.scope, [repository.sourcePath]),
        );
        const appended = await repository.appendScope(run, payload);
        expect(appended.appended.exitCode, appended.appended.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const before = await repository.observe(run);

        const reconciled = await repository.reconcile(run);

        expect(reconciled.exitCode, reconciled.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(await repository.observe(run)).toEqual(before);
      });
    },
  );
});
