import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { reconcileScope } from "@/domains/verify/reconciliation";
import {
  changeInventoryOfRun,
  expectationsOfRun,
  runJudgedDeletionsOf,
  runJudgedPathsOf,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import { RECONCILIATION_TEST_GENERATOR } from "@testing/generators/verify/reconciliation";
import {
  sampleVerifyTestValue,
  VERIFY_CHANGE_OPERATION,
  VERIFY_TEST_GENERATOR,
} from "@testing/generators/verify/verify";
import {
  assertProperty,
  PROPERTY_CLASSIFICATION,
  PROPERTY_LEVEL,
  propertyTestEnvelopeTimeoutMs,
} from "@testing/harnesses/property/property";
import { withVerifyChangeInventoryRepository } from "@testing/harnesses/verify/repository";

describe("verify scope reconciliation determinism", () => {
  it("derives the same result from the four inputs whatever their order and however often a path repeats", () => {
    assertProperty(
      RECONCILIATION_TEST_GENERATOR.determinismScenario(),
      (scenario) => {
        expect(reconcileScope(scenario.variant)).toEqual(reconcileScope(scenario.input));
        expect(reconcileScope(scenario.variant)).toEqual(scenario.expected);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "derives the same result from a %s run however the working tree and index are dirtied",
    async (verificationType) => {
      await withVerifyChangeInventoryRepository(VERIFY_CHANGE_OPERATION.DELETE, async (repository) => {
        const run = await repository.startChangesetRun(verificationType);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const payload = sampleVerifyTestValue(
          VERIFY_TEST_GENERATOR.judgedDeletionsScopeUnit(verificationType, run.scope, [repository.sourcePath]),
        );
        const appended = await repository.appendScope(run, payload);
        expect(appended.appended.exitCode, appended.appended.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const clean = await repository.reconcile(run);
        expect(clean.exitCode, clean.output).toBe(VERIFY_CLI_EXIT_CODE.OK);

        await assertProperty(
          RECONCILIATION_TEST_GENERATOR.workingTreeDirtying(),
          async (dirtying) => {
            await repository.dirtyWorkingTree(dirtying);
            try {
              expect(await repository.reconcile(run)).toEqual(clean);
            } finally {
              await repository.restoreWorkingTree();
            }
          },
          PROPERTY_CLASSIFICATION.SMALL_L1,
        );
      });
    },
    propertyTestEnvelopeTimeoutMs(PROPERTY_CLASSIFICATION.SMALL_L1),
  );

  it("derives the same result from a run history however its scope events, coverage states, and findings are arranged", () => {
    assertProperty(
      RECONCILIATION_TEST_GENERATOR.historiesScenario(),
      (scenario) => {
        const reconciled = (events: typeof scenario.single) => {
          const recordedInventory = changeInventoryOfRun(events);
          const expectations = expectationsOfRun(events);
          if (!recordedInventory.ok || !expectations.ok) throw new Error("generated run history is malformed");
          return reconcileScope({
            recordedInventory: recordedInventory.value ?? [],
            expectations: expectations.value,
            judgedPaths: runJudgedPathsOf(events),
            judgedDeletions: runJudgedDeletionsOf(events),
            resolvedInventory: scenario.input.resolvedInventory,
          });
        };

        expect(reconciled(scenario.split)).toEqual(reconciled(scenario.single));
        expect(reconciled(scenario.split)).toEqual(scenario.expected);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
