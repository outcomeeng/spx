import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_RECONCILIATION_RESULT_FIELD } from "@/domains/verify/reconciliation";
import { CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import { observeBuiltUnaccountedRun } from "@testing/harnesses/verify/built-cli";

describe("record-run finish of an expectations-bound run through the built executable", () => {
  it(
    "reports the one unjudged changed path as unaccounted in one JSON result on standard output, exits non-zero, and leaves the run unsealed",
    async () => {
      await observeBuiltUnaccountedRun().then((observation) => {
        expect(observation.finish.exitCode, observation.finish.stderr).not.toBe(VERIFY_CLI_EXIT_CODE.OK);
        const result = JSON.parse(observation.finish.stdout);
        expect(result[VERIFY_RECONCILIATION_RESULT_FIELD.UNACCOUNTED]).toStrictEqual([observation.unaccountedPath]);
        expect(observation.status.exitCode, observation.status.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(observation.statusReport.sealed).toBe(false);
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );
});
