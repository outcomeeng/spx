import { describe, expect, it } from "vitest";

import { renderReportJson } from "@/domains/diagnose/report";
import { type DiagnoseReport } from "@/domains/diagnose/types";
import { SENTINEL_UNDEFINED } from "@/lib/sanitize-cli-argument";
import { renderTerminalText } from "@/lib/terminal-text/terminal-text";
import { arbitraryAbsentReadingReport, arbitraryUnsafeReadingReport } from "@testing/generators/diagnose/report";
import { TERMINAL_ORACLE } from "@testing/generators/terminal-text/terminal-text";
import { renderPlainReport } from "@testing/harnesses/diagnose/report";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("check readings the text report renders are escaped for the terminal", () => {
  it("emits no control byte and no DEL for a reading that carries one", () => {
    assertProperty(arbitraryUnsafeReadingReport(), (report) => {
      for (const char of renderPlainReport(report).replaceAll("\n", "")) {
        expect(char.codePointAt(0)).toBeGreaterThanOrEqual(TERMINAL_ORACLE.FIRST_PRINTABLE_CODE_POINT);
        expect(char.codePointAt(0)).not.toBe(TERMINAL_ORACLE.DEL_CODE_POINT);
      }
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("writes the JSON report with no control byte or DEL outside its own line structure", () => {
    assertProperty(arbitraryUnsafeReadingReport(), (report) => {
      // The serializer's indentation is the product's own line structure; every other byte
      // below the printable range, and DEL, must have left as a JSON escape.
      for (const char of renderTerminalText(renderReportJson(report)).replaceAll("\n", "")) {
        expect(char.codePointAt(0)).toBeGreaterThanOrEqual(TERMINAL_ORACLE.FIRST_PRINTABLE_CODE_POINT);
        expect(char.codePointAt(0)).not.toBe(TERMINAL_ORACLE.DEL_CODE_POINT);
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
