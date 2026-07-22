import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { renderReportJson } from "@/domains/diagnose/report";
import { type DiagnoseReport } from "@/domains/diagnose/types";
import { DEL_CHAR_CODE, FIRST_PRINTABLE_CHAR_CODE } from "@/lib/sanitize-cli-argument";
import { arbitraryUnsafeReadingReport } from "@testing/generators/diagnose/report";
import { renderPlainReport } from "@testing/harnesses/diagnose/report";

describe("check readings the text report renders are escaped for the terminal", () => {
  it("emits no control byte and no DEL for a reading that carries one", () => {
    fc.assert(
      fc.property(arbitraryUnsafeReadingReport(), (report) => {
        for (const char of renderPlainReport(report).replaceAll("\n", "")) {
          expect(char.codePointAt(0)).toBeGreaterThanOrEqual(FIRST_PRINTABLE_CHAR_CODE);
          expect(char.codePointAt(0)).not.toBe(DEL_CHAR_CODE);
        }
      }),
    );
  });

  it("keeps the same readings verbatim in the JSON report for machine consumers", () => {
    fc.assert(
      fc.property(arbitraryUnsafeReadingReport(), (report) => {
        expect((JSON.parse(renderReportJson(report)) as DiagnoseReport).checks[0]?.readings).toStrictEqual(
          report.checks[0]?.readings,
        );
      }),
    );
  });
});
