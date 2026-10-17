import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_RECONCILIATION_RESULT_FIELD } from "@/domains/verify/reconciliation";
import { VERIFY_CLI } from "@/interfaces/cli/verify";
import { CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import { observeBuiltReconcileInvocations, observeBuiltUnaccountedRun } from "@testing/harnesses/verify/built-cli";

describe("record-run reconcile invocation grammar through the built executable", () => {
  it(
    "exits zero for a reconciled run and rejects an invocation without --run or with --input",
    async () => {
      await observeBuiltReconcileInvocations().then((observation) => {
        expect(observation.reconciled.exitCode, observation.reconciled.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(JSON.parse(observation.reconciled.stdout)[VERIFY_RECONCILIATION_RESULT_FIELD.RECONCILED]).toBe(true);
        expect(observation.withoutRun.exitCode).not.toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(observation.withoutRun.stderr).toContain(VERIFY_CLI.runOption.split(" ")[0]);
        expect(observation.withInput.exitCode).not.toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(observation.withInput.stderr).toContain(VERIFY_CLI.inputOption.split(" ")[0]);
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );

  it(
    "exits non-zero for a run that does not reconcile",
    async () => {
      await observeBuiltUnaccountedRun().then((observation) => {
        expect(observation.reconcile.exitCode).not.toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(JSON.parse(observation.reconcile.stdout)[VERIFY_RECONCILIATION_RESULT_FIELD.RECONCILED]).toBe(false);
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );
});
