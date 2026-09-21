import { describe, expect, it } from "vitest";

import {
  DIAGNOSE_FORMAT,
  renderReport,
  renderReportConcise,
  renderReportJson,
  renderReportText,
} from "@/domains/diagnose/report";
import { resolveDiagnoseFormat } from "@/interfaces/cli/diagnose";
import { arbitraryOutputModeScenario } from "@testing/generators/diagnose/output-modes";
import { sampleGeneratedValue } from "@testing/generators/sample";

describe("each diagnose selector chooses its declared renderer", () => {
  it.each(Object.values(DIAGNOSE_FORMAT))("maps %s to its presentation", (format) => {
    const scenario = sampleGeneratedValue(arbitraryOutputModeScenario());
    expect(resolveDiagnoseFormat({ verbose: format === DIAGNOSE_FORMAT.TEXT, json: format === DIAGNOSE_FORMAT.JSON }))
      .toBe(format);
    const output = renderReport(scenario.report, format, { color: scenario.color, version: scenario.version });
    switch (format) {
      case DIAGNOSE_FORMAT.CONCISE:
        expect(output).toBe(renderReportConcise(scenario.report, { color: scenario.color, version: scenario.version }));
        break;
      case DIAGNOSE_FORMAT.TEXT:
        expect(output).toBe(renderReportText(scenario.report, { color: scenario.color }));
        break;
      case DIAGNOSE_FORMAT.JSON:
        expect(output).toBe(renderReportJson(scenario.report));
        break;
    }
  });
});
