import { basename } from "node:path";

import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_CLI } from "@/interfaces/cli/verify";
import { runFileName } from "@/lib/state-store";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import { observeBuiltRunListForChange, observeBuiltRunListWithoutChange } from "@testing/harnesses/verify/built-cli";

describe("verification run list compliance through the built executable", () => {
  it(
    "rejects an invocation without --change, naming the option and listing nothing, while the store holds a run",
    async () => {
      await observeBuiltRunListWithoutChange(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.changeIdentity())).then(
        (observation) => {
          expect(observation.start.exitCode, observation.start.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
          expect(Object.keys(observation.storeBeforeList ?? {}).map((path) => basename(path))).toContain(
            runFileName(observation.startReport?.runToken ?? ""),
          );
          expect(observation.list?.exitCode).not.toBe(VERIFY_CLI_EXIT_CODE.OK);
          expect(observation.list?.stdout).toHaveLength(0);
          expect(observation.list?.stderr).toContain(VERIFY_CLI.changeOption);
        },
      );
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );

  it(
    "appends no journal event and seals no run: the store's branch scopes are unchanged by a listing",
    async () => {
      await observeBuiltRunListForChange(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.changeIdentity())).then(
        (observation) => {
          expect(observation.start.exitCode, observation.start.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
          expect(observation.list?.exitCode, observation.list?.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
          expect(Object.keys(observation.storeBeforeList ?? {}).map((path) => basename(path))).toContain(
            runFileName(observation.startReport?.runToken ?? ""),
          );
          expect(observation.storeAfterList).toEqual(observation.storeBeforeList);
        },
      );
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );
});
