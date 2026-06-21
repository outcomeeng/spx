import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { DIAGNOSE_TEXT_OVERALL_LABEL, renderReportJson, renderReportText } from "@/domains/diagnose/report";
import { arbitraryReport } from "@testing/generators/diagnose/report";

describe("the text report carries the same per-check verdicts, readings, remediation hints, and overall verdict as the JSON report", () => {
  it("includes every per-check name, verdict, bucket, reading, and remediation, plus the overall verdict, in the text form", () => {
    fc.assert(
      fc.property(arbitraryReport(), (report) => {
        const text = renderReportText(report);
        const json = JSON.parse(renderReportJson(report)) as {
          checks: {
            name: string;
            verdict: string;
            bucket: string;
            readings: Record<string, string>;
            remediation: string;
          }[];
          overall: string;
        };

        expect(text).toContain(`${DIAGNOSE_TEXT_OVERALL_LABEL}: ${json.overall}`);
        for (const check of json.checks) {
          expect(text).toContain(check.name);
          expect(text).toContain(check.verdict);
          expect(text).toContain(check.bucket);
          expect(text).toContain(check.remediation);
          for (const [reading, value] of Object.entries(check.readings)) {
            expect(text).toContain(`${reading}: ${value}`);
          }
        }
      }),
    );
  });
});
