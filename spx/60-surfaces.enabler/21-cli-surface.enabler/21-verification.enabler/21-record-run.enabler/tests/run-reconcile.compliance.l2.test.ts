import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_RECONCILIATION_RESULT_FIELD } from "@/domains/verify/reconciliation";
import { CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import { observeBuiltReconcileInvocations } from "@testing/harnesses/verify/built-cli";

describe("record-run reconcile invocation grammar through the built executable", () => {
  it(
    "exits zero for a reconciled run and rejects an invocation without --run or with --input",
    async () => {
      await observeBuiltReconcileInvocations().then((observation) => {
        expect(observation.reconciled.exitCode, observation.reconciled.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(JSON.parse(observation.reconciled.stdout)[VERIFY_RECONCILIATION_RESULT_FIELD.RECONCILED]).toBe(true);
        expect(observation.withoutRun.exitCode).not.toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(observation.withoutRun.stderr).toContain(observation.runFlag);
        expect(observation.withInput.exitCode).not.toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(observation.withInput.stderr).toContain(observation.inputFlag);
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );
});
