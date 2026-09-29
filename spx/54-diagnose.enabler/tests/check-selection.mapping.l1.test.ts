import { describe, expect, it } from "vitest";

import { runDiagnose } from "@/domains/diagnose/engine";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { arbitraryCheckSelectionScenario } from "@testing/generators/diagnose/output-modes";
import { recordingCheckRegistry } from "@testing/harnesses/diagnose/output-modes";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("the pipeline runs exactly the resolved check set, in the order the resolved facts supply it", () => {
  it("invokes each named check once, in order, and only the named checks", async () => {
    await assertProperty(arbitraryCheckSelectionScenario(), async (scenario) => {
      const recording = recordingCheckRegistry(scenario.records);
      const result = await runDiagnose({ checks: scenario.selected }, recording.registry);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(recording.calls).toEqual(scenario.selected);
      expect(result.value.checks.map((check) => check.name)).toEqual(scenario.selected);
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("reports an error when a named check has no registered runner", async () => {
    const result = await runDiagnose({ checks: [CHECK_NAME.SPX_REACHABILITY] }, {});
    expect(result.ok).toBe(false);
  });
});
