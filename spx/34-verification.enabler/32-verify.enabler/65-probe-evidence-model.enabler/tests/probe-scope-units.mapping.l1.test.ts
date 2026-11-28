import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { PROBE_UNIT_KIND } from "@/domains/verify/verify";
import { PROBE_TEST_GENERATOR, type ProbeRunUnits } from "@testing/generators/verify/probe";
import { sampleVerifyTestValue } from "@testing/generators/verify/verify";
import { addProbeScope, probeRunEvents, startProbeRun } from "@testing/harnesses/verify/probe";

/** A started probe run; every unit kind but the protocol follows the run's protocol unit. */
async function runReadyFor(unitKind: string, units: ProbeRunUnits) {
  const run = await startProbeRun(units.protocol);
  if (unitKind !== PROBE_UNIT_KIND.PROTOCOL) {
    const rooted = await addProbeScope(run, units.protocolUnit);
    expect(rooted.exitCode, rooted.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
  }
  return run;
}

describe("probe scope units mapping", () => {
  it.each(PROBE_TEST_GENERATOR.scopeUnitCases())(
    "accepts a $unitKind unit carrying unitKind, subject and the further field its kind requires",
    async ({ unitKind, unitOf }) => {
      const units = sampleVerifyTestValue(PROBE_TEST_GENERATOR.runUnits());
      const run = await runReadyFor(unitKind, units);

      const added = await addProbeScope(run, unitOf(units));

      expect(added.exitCode, added.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    },
  );

  it.each(PROBE_TEST_GENERATOR.scopeUnitCases().filter((testCase) => testCase.furtherField !== undefined))(
    "refuses a $unitKind unit without its further field $furtherField, naming the field, and appends nothing",
    async ({ unitKind, unitOf, furtherField }) => {
      const units = sampleVerifyTestValue(PROBE_TEST_GENERATOR.runUnits());
      const run = await runReadyFor(unitKind, units);
      const { [furtherField ?? ""]: _dropped, ...withoutField } = unitOf(units);
      const before = await probeRunEvents(run);

      const added = await addProbeScope(run, withoutField);

      expect(added.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(added.output).toContain(`"${furtherField}"`);
      expect(await probeRunEvents(run)).toEqual(before);
    },
  );
});
