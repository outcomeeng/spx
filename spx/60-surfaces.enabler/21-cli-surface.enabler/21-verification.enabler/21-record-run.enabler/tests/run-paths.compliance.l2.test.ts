import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_CLI } from "@/interfaces/cli/verify";
import { CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import { flagOf, observeBuiltRunPaths } from "@testing/harnesses/verify/built-cli";

describe("record-run paths compliance through the built executable", () => {
  it.each([VERIFY_CLI.verificationTypeOption, VERIFY_CLI.scopeTypeOption, VERIFY_CLI.scopeOption])(
    "rejects an invocation missing %s, naming the option and reporting nothing",
    async (omitted) => {
      await observeBuiltRunPaths({ omit: omitted }).then((observation) => {
        expect(observation.run.exitCode).not.toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(observation.run.stdout).toHaveLength(0);
        expect(observation.run.stderr).toContain(flagOf(omitted));
        expect(observation.stateAfter).toEqual(observation.stateBefore);
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );

  it.each([VERIFY_CLI.runOption, VERIFY_CLI.inputOption])(
    "rejects an invocation carrying %s, naming the option and reporting nothing",
    async (forbidden) => {
      await observeBuiltRunPaths({ extra: forbidden }).then((observation) => {
        expect(observation.run.exitCode).not.toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(observation.run.stdout).toHaveLength(0);
        expect(observation.run.stderr).toContain(flagOf(forbidden));
        expect(observation.stateAfter).toEqual(observation.stateBefore);
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );
});
