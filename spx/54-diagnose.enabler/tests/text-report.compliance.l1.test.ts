import { Chalk } from "chalk";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  BUCKET_SEVERITY,
  DIAGNOSE_TEXT_OVERALL_LABEL,
  OVERALL_SEVERITY,
  renderReportJson,
  renderReportText,
} from "@/domains/diagnose/report";
import { SEVERITY_STYLE } from "@/lib/styled-output/styled-output";
import { arbitraryReport } from "@testing/generators/diagnose/report";

describe("the text report carries the same per-check verdicts, readings, remediation hints, and overall verdict as the JSON report", () => {
  it("includes every per-check name, verdict, bucket, reading, and remediation, plus the overall verdict, in the text form", () => {
    fc.assert(
      fc.property(arbitraryReport(), (report) => {
        const text = renderReportText(report, { color: false });
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

describe("the text report renders through the styled-output primitive", () => {
  it("prefixes each per-check line with the status glyph keyed by the check's bucket", () => {
    fc.assert(
      fc.property(arbitraryReport(), (report) => {
        const text = renderReportText(report, { color: false });

        for (const check of report.checks) {
          const { glyph } = SEVERITY_STYLE[BUCKET_SEVERITY[check.bucket]];
          expect(text).toContain(`${glyph} ${check.name}`);
        }
      }),
    );
  });

  it("colors the overall summary line by the overall verdict's severity", () => {
    const chalk = new Chalk({ level: 1 });

    fc.assert(
      fc.property(arbitraryReport(), (report) => {
        const text = renderReportText(report, { color: true });
        const { style } = SEVERITY_STYLE[OVERALL_SEVERITY[report.overall]];

        expect(text).toContain(chalk[style](`${DIAGNOSE_TEXT_OVERALL_LABEL}: ${report.overall}`));
      }),
    );
  });
});
