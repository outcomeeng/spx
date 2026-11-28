import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { PROBE_TEST_GENERATOR } from "@testing/generators/verify/probe";
import { sampleVerifyTestValue } from "@testing/generators/verify/verify";
import {
  addProbeFinding,
  addProbeScope,
  finishProbeRun,
  probeRunEvents,
  probeRunStatus,
  startProbeRun,
} from "@testing/harnesses/verify/probe";

/** A probe run carrying its protocol, an assertion and an artifact, and a finding when asked. */
async function runWithEvidence(withFinding: boolean) {
  const units = sampleVerifyTestValue(PROBE_TEST_GENERATOR.runUnits());
  const run = await startProbeRun(units.protocol);
  for (const unit of [units.protocolUnit, units.assertionUnit, units.artifactUnit]) {
    const added = await addProbeScope(run, unit);
    expect(added.exitCode, added.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
  }
  if (withFinding) {
    const finding = await addProbeFinding(run, sampleVerifyTestValue(PROBE_TEST_GENERATOR.findingFor(units)));
    expect(finding.exitCode, finding.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
  }
  return run;
}

describe("probe terminal mapping", () => {
  it.each(PROBE_TEST_GENERATOR.terminalCases().filter((row) => row.named === undefined))(
    "$case: finish seals $terminalStatus",
    async ({ terminalStatus, withFinding }) => {
      const run = await runWithEvidence(withFinding);

      const finished = await finishProbeRun(run, terminalStatus);

      expect(finished.exitCode, finished.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(await probeRunStatus(run)).toMatchObject({ sealed: true, terminalStatus });
    },
  );

  it.each(PROBE_TEST_GENERATOR.terminalCases().filter((row) => row.named !== undefined))(
    "$case: finish refuses $terminalStatus (finding recorded: $withFinding), naming $named, and records nothing",
    async ({ terminalStatus, withFinding, named }) => {
      const run = await runWithEvidence(withFinding);
      const before = await probeRunEvents(run);

      const finished = await finishProbeRun(run, terminalStatus);

      expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(finished.output).toContain(`: ${(named ?? []).join(", ")}`);
      expect(await probeRunEvents(run)).toEqual(before);
    },
  );
});
