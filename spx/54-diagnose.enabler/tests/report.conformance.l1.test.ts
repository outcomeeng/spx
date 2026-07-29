import { describe, expect, it } from "vitest";

import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { renderReportJson } from "@/domains/diagnose/report";
import { CHECK_RECORD_FIELDS, OVERALL_VERDICT, VERDICT_BUCKET } from "@/domains/diagnose/types";
import { renderTerminalText } from "@/lib/terminal-text/terminal-text";
import { arbitraryReport } from "@testing/generators/diagnose/report";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("the JSON report conforms to the report schema", () => {
  it("emits a per-check record array and an overall verdict, each record carrying name, verdict, bucket, readings, and remediation", () => {
    assertProperty(
      arbitraryReport(),
      (report) => {
        const parsed = JSON.parse(renderTerminalText(renderReportJson(report))) as {
          checks: {
            name: string;
            verdict: string;
            bucket: string;
            readings: Record<string, string>;
            remediation: string;
          }[];
          overall: string;
        };

        expect(Object.values(OVERALL_VERDICT)).toContain(parsed.overall);
        expect(parsed.overall).toBe(report.overall);
        expect(parsed.checks).toHaveLength(report.checks.length);

        parsed.checks.forEach((check, index) => {
          expect(Object.keys(check).sort((a, b) => a.localeCompare(b))).toEqual(
            [...CHECK_RECORD_FIELDS].sort((a, b) => a.localeCompare(b)),
          );
          expect(Object.values(CHECK_NAME)).toContain(check.name);
          expect(Object.values(VERDICT_BUCKET)).toContain(check.bucket);
          expect(check.verdict).toBe(report.checks[index].verdict);
          expect(check.remediation).toBe(report.checks[index].remediation);
          expect(check.readings).toEqual(report.checks[index].readings);
        });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
