/** Assertion harness for diagnose JSON conformance and styled runtime projections. */

import { Chalk } from "chalk";
import { expect } from "vitest";

import {
  DIAGNOSE_TEXT_OVERALL_LABEL,
  parseDiagnoseReportJson,
  renderReportJson,
  renderReportVerbose,
} from "@/domains/diagnose/report";
import { SEVERITY_STYLE } from "@/lib/styled-output/styled-output";
import { arbitraryReport } from "@testing/generators/diagnose/report";
import {
  type InvalidDiagnoseReportCase,
  type StyledBucketCase,
  type StyledOverallCase,
} from "@testing/generators/diagnose/report-scenarios";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

export function assertJsonReportPreservesSchema(): void {
  assertProperty(
    arbitraryReport(),
    (report) => {
      const parsed = parseDiagnoseReportJson(renderReportJson(report));
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) throw new Error(parsed.error);
      expect(parsed.value).toStrictEqual(report);
    },
    { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
  );
}

export function assertInvalidDiagnoseReportRejected(testCase: InvalidDiagnoseReportCase): void {
  expect(parseDiagnoseReportJson(testCase.input).ok).toBe(false);
}

export function assertHeadingGlyphCase(testCase: StyledBucketCase): void {
  const heading = renderReportVerbose(testCase.report, { color: false }).split("\n")[0];
  expect(heading.startsWith(`${SEVERITY_STYLE[testCase.expectedSeverity].glyph} `)).toBe(true);
}

export function assertOverallColorCase(testCase: StyledOverallCase): void {
  const chalk = new Chalk({ level: 1 });
  const style = SEVERITY_STYLE[testCase.expectedSeverity].style;
  expect(renderReportVerbose(testCase.report, { color: true })).toContain(
    chalk[style](`${DIAGNOSE_TEXT_OVERALL_LABEL}: ${testCase.overall}`),
  );
}
