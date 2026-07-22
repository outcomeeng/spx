import { describe, expect, it } from "vitest";

import { renderReportJson } from "@/domains/diagnose/report";
import { type DiagnoseReport } from "@/domains/diagnose/types";
import { DEL_CHAR_CODE, FIRST_PRINTABLE_CHAR_CODE, SENTINEL_UNDEFINED } from "@/lib/sanitize-cli-argument";
import { arbitraryAbsentReadingReport, arbitraryUnsafeReadingReport } from "@testing/generators/diagnose/report";
import { renderPlainReport } from "@testing/harnesses/diagnose/report";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("check readings the text report renders are escaped for the terminal", () => {
  it("emits no control byte and no DEL for a reading that carries one", () => {
    assertProperty(arbitraryUnsafeReadingReport(), (report) => {
      for (const char of renderPlainReport(report).replaceAll("\n", "")) {
        expect(char.codePointAt(0)).toBeGreaterThanOrEqual(FIRST_PRINTABLE_CHAR_CODE);
        expect(char.codePointAt(0)).not.toBe(DEL_CHAR_CODE);
      }
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("keeps the same readings verbatim in the JSON report for machine consumers", () => {
    assertProperty(arbitraryUnsafeReadingReport(), (report) => {
      expect((JSON.parse(renderReportJson(report)) as DiagnoseReport).checks[0]?.readings).toStrictEqual(
        report.checks[0]?.readings,
      );
    }, { level: PROPERTY_LEVEL.L1 });
  });
});

describe("a reading a check did not gather renders as the absent-value sentinel", () => {
  it("resolves an absent reading to the source-owned sentinel rather than an interpolated undefined", () => {
    assertProperty(arbitraryAbsentReadingReport(), (report) => {
      expect(renderPlainReport(report)).toContain(SENTINEL_UNDEFINED);
    }, { level: PROPERTY_LEVEL.L1 });
  });
});
