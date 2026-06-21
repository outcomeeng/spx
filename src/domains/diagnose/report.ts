/**
 * Diagnose report rendering — emits the folded report as machine-readable JSON
 * or as a human-readable text form. Both forms carry the same per-check verdicts,
 * buckets, readings, and remediation hints plus the overall verdict. Pure over
 * the report; no I/O.
 *
 * @module domains/diagnose/report
 */

import type { DiagnoseReport } from "@/domains/diagnose/types";

/** The output formats `spx diagnose` emits. */
export const DIAGNOSE_FORMAT = {
  JSON: "json",
  TEXT: "text",
} as const;

export type DiagnoseFormat = (typeof DIAGNOSE_FORMAT)[keyof typeof DIAGNOSE_FORMAT];

/** The label the text report prefixes the overall verdict line with. */
export const DIAGNOSE_TEXT_OVERALL_LABEL = "overall";

/** Renders the report as indented JSON: a per-check record array plus the overall verdict. */
export function renderReportJson(report: DiagnoseReport): string {
  return JSON.stringify(
    {
      checks: report.checks.map((check) => ({
        name: check.name,
        verdict: check.verdict,
        bucket: check.bucket,
        readings: check.readings,
        remediation: check.remediation,
      })),
      overall: report.overall,
    },
    null,
    2,
  );
}

/** Renders the report as human-readable text carrying the same fields as the JSON form. */
export function renderReportText(report: DiagnoseReport): string {
  const lines: string[] = [];
  for (const check of report.checks) {
    lines.push(`${check.name}: ${check.verdict} [${check.bucket}]`);
    for (const [reading, value] of Object.entries(check.readings)) {
      lines.push(`  ${reading}: ${value}`);
    }
    lines.push(`  remediation: ${check.remediation}`);
  }
  lines.push(`${DIAGNOSE_TEXT_OVERALL_LABEL}: ${report.overall}`);
  return lines.join("\n");
}

/** Renders the report in the requested format. */
export function renderReport(report: DiagnoseReport, format: DiagnoseFormat): string {
  return format === DIAGNOSE_FORMAT.JSON ? renderReportJson(report) : renderReportText(report);
}
