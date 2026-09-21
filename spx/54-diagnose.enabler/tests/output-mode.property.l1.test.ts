import { describe, expect, it } from "vitest";

import { overallExitCode } from "@/domains/diagnose/fold";
import { DIAGNOSE_FORMAT, renderReportConcise, renderReportText } from "@/domains/diagnose/report";
import { arbitraryOutputModeScenario } from "@testing/generators/diagnose/output-modes";
import { withDiagnoseOutputScenario } from "@testing/harnesses/diagnose/output-modes";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("output selection changes presentation alone", () => {
  it("preserves provider execution, records, folding, remediation, and exit code across generated reports", async () => {
    await assertProperty(arbitraryOutputModeScenario(), async (scenario) => {
      await withDiagnoseOutputScenario(scenario, async (run) => {
        const baseline = await run(DIAGNOSE_FORMAT.JSON);
        expect(baseline.result.ok, baseline.result.ok ? undefined : baseline.result.error).toBe(true);
        if (!baseline.result.ok) throw new Error(baseline.result.error);
        expect(JSON.parse(baseline.result.value.output)).toEqual(scenario.report);
        for (const format of Object.values(DIAGNOSE_FORMAT)) {
          const observation = await run(format);
          expect(observation.calls).toEqual(scenario.facts.checks);
          expect(observation.manifests).toEqual(baseline.manifests);
          expect(observation.result.ok, observation.result.ok ? undefined : observation.result.error).toBe(true);
          if (!observation.result.ok) throw new Error(observation.result.error);
          expect(observation.result.value.exitCode).toBe(overallExitCode(scenario.report.overall));
          switch (format) {
            case DIAGNOSE_FORMAT.CONCISE:
              expect(observation.result.value.output).toBe(
                renderReportConcise(scenario.report, { color: scenario.color, version: scenario.version }),
              );
              break;
            case DIAGNOSE_FORMAT.TEXT:
              expect(observation.result.value.output).toBe(
                renderReportText(scenario.report, { color: scenario.color }),
              );
              break;
            case DIAGNOSE_FORMAT.JSON:
              expect(JSON.parse(observation.result.value.output)).toEqual(scenario.report);
              break;
          }
        }
      });
    }, { level: PROPERTY_LEVEL.L1 });
  });
});
