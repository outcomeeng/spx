import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_RECONCILIATION_RESULT_FIELD } from "@/domains/verify/reconciliation";
import { CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import { observeBuiltUnaccountedRun } from "@testing/harnesses/verify/built-cli";

describe("record-run reconcile of an expectations-bound run through the built executable", () => {
  it(
    "reports the one unjudged changed path as unaccounted in one JSON result on standard output and exits non-zero",
    async () => {
      await observeBuiltUnaccountedRun().then((observation) => {
        expect(observation.reconcile.exitCode, observation.reconcile.stderr).not.toBe(VERIFY_CLI_EXIT_CODE.OK);
        const result = JSON.parse(observation.reconcile.stdout);
        expect(result[VERIFY_RECONCILIATION_RESULT_FIELD.UNACCOUNTED]).toStrictEqual([observation.unaccountedPath]);
        expect(result[VERIFY_RECONCILIATION_RESULT_FIELD.RECONCILED]).toBe(false);
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );
});
