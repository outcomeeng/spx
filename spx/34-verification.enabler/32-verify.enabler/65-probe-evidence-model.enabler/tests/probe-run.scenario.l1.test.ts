import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { PROBE_TEST_GENERATOR } from "@testing/generators/verify/probe";
import { sampleVerifyTestValue } from "@testing/generators/verify/verify";
import { addProbeScope, finishProbeRun, probeRunStatus, startProbeRun } from "@testing/harnesses/verify/probe";

describe("attested probe run", () => {
  it("seals a probe run that recorded its protocol, an assertion and an artifact as passed, and status reports it", async () => {
    const units = sampleVerifyTestValue(PROBE_TEST_GENERATOR.runUnits());
    const run = await startProbeRun(units.protocol);

    for (const unit of [units.protocolUnit, units.assertionUnit, units.artifactUnit]) {
      const added = await addProbeScope(run, unit);
      expect(added.exitCode, added.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    }
    const finished = await finishProbeRun(run, JOURNAL_RUN_STATE_STATUS.PASSED);

    expect(finished.exitCode, finished.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    expect(await probeRunStatus(run)).toMatchObject({
      verificationType: VERIFY_VERIFICATION_TYPE.PROBE,
      sealed: true,
      terminalStatus: JOURNAL_RUN_STATE_STATUS.PASSED,
    });
  });
});
