import { describe, expect, it } from "vitest";

import {
  VERIFY_ACCOUNTING_ENTRY_FIELD,
  VERIFY_CLI_EXIT_CODE,
  VERIFY_RECONCILE_REPORT_FIELD,
} from "@/commands/verify/cli";
import { VERIFY_RECONCILIATION_RESULT_FIELD } from "@/domains/verify/reconciliation";
import { VERIFY_SCOPE_PAYLOAD_FIELD } from "@/domains/verify/verify";
import { CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import { observeBuiltHeldAndDeletedUnaccountedRun } from "@testing/harnesses/verify/built-cli";

describe("record-run finish naming the field that would account for each unaccounted path", () => {
  it(
    "names the unjudged held path with judgedPaths and the unjudged deleted path with judgedDeletions in one JSON result, exits non-zero, and leaves the run unsealed",
    async () => {
      await observeBuiltHeldAndDeletedUnaccountedRun().then((observation) => {
        expect(observation.finish.exitCode, observation.finish.stderr).not.toBe(VERIFY_CLI_EXIT_CODE.OK);
        const result = JSON.parse(observation.finish.stdout);
        expect(new Set(result[VERIFY_RECONCILIATION_RESULT_FIELD.UNACCOUNTED])).toStrictEqual(
          new Set([observation.heldPath, observation.deletedPath]),
        );
        expect(new Set(result[VERIFY_RECONCILE_REPORT_FIELD.ACCOUNTING_FIELDS])).toStrictEqual(
          new Set([
            {
              [VERIFY_ACCOUNTING_ENTRY_FIELD.PATH]: observation.heldPath,
              [VERIFY_ACCOUNTING_ENTRY_FIELD.FIELD]: VERIFY_SCOPE_PAYLOAD_FIELD.JUDGED_PATHS,
            },
            {
              [VERIFY_ACCOUNTING_ENTRY_FIELD.PATH]: observation.deletedPath,
              [VERIFY_ACCOUNTING_ENTRY_FIELD.FIELD]: VERIFY_SCOPE_PAYLOAD_FIELD.JUDGED_DELETIONS,
            },
          ]),
        );
        expect(observation.status.exitCode, observation.status.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(observation.statusReport.sealed).toBe(false);
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );
});
