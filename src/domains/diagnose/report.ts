/**
 * Diagnose report rendering — emits the folded report as machine-readable JSON
 * or as a human-readable text form rendered through the shared styled-output
 * primitive. Both forms carry the same per-check verdicts, buckets, readings,
 * and remediation hints plus the overall verdict. Pure over the report and the
 * color choice; no I/O.
 *
 * @module domains/diagnose/report
 */

import {
  type DiagnoseReport,
  OVERALL_VERDICT,
  type OverallVerdict,
  VERDICT_BUCKET,
  type VerdictBucket,
} from "@/domains/diagnose/types";
import {
  renderStyledReport,
  SEVERITY,
  type Severity,
  type StyledReportModel,
  type StyledReportOptions,
} from "@/lib/styled-output/styled-output";

/** The output formats `spx diagnose` emits. */
export const DIAGNOSE_FORMAT = {
  JSON: "json",
  TEXT: "text",
} as const;

export type DiagnoseFormat = (typeof DIAGNOSE_FORMAT)[keyof typeof DIAGNOSE_FORMAT];

/** The label the text report prefixes the overall verdict line with. */
export const DIAGNOSE_TEXT_OVERALL_LABEL = "overall";

/** Maps each per-check verdict bucket to the styled-output severity its glyph and color key on. */
export const BUCKET_SEVERITY: Readonly<Record<VerdictBucket, Severity>> = {
  [VERDICT_BUCKET.HEALTHY]: SEVERITY.OK,
  [VERDICT_BUCKET.DEGRADED]: SEVERITY.WARN,
  [VERDICT_BUCKET.UNKNOWN]: SEVERITY.UNKNOWN,
  [VERDICT_BUCKET.BROKEN]: SEVERITY.ERROR,
  [VERDICT_BUCKET.NOT_APPLICABLE]: SEVERITY.MUTED,
} as const;

/** Maps the overall verdict to the styled-output severity its summary line is colored by. */
export const OVERALL_SEVERITY: Readonly<Record<OverallVerdict, Severity>> = {
  [OVERALL_VERDICT.HEALTHY]: SEVERITY.OK,
  [OVERALL_VERDICT.DEGRADED]: SEVERITY.WARN,
  [OVERALL_VERDICT.UNKNOWN]: SEVERITY.UNKNOWN,
  [OVERALL_VERDICT.BROKEN]: SEVERITY.ERROR,
} as const;

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

/** Projects the report onto the styled-output model: one section per check, the overall as the summary. */
function toStyledModel(report: DiagnoseReport): StyledReportModel {
  return {
    sections: report.checks.map((check) => ({
      severity: BUCKET_SEVERITY[check.bucket],
      header: `${check.name}: ${check.verdict} [${check.bucket}]`,
      details: [
        ...Object.keys(check.readings).map((reading) => `${reading}: ${check.readings[reading]}`),
        `remediation: ${check.remediation}`,
      ],
    })),
    summary: {
      severity: OVERALL_SEVERITY[report.overall],
      text: `${DIAGNOSE_TEXT_OVERALL_LABEL}: ${report.overall}`,
    },
  };
}

/** Renders the report as human-readable text through the styled-output primitive, carrying the same fields as the JSON form. */
export function renderReportText(report: DiagnoseReport, options: StyledReportOptions): string {
  return renderStyledReport(toStyledModel(report), options);
}

/** Renders the report in the requested format; the color choice applies to the text form only. */
export function renderReport(
  report: DiagnoseReport,
  format: DiagnoseFormat,
  options: StyledReportOptions,
): string {
  return format === DIAGNOSE_FORMAT.JSON ? renderReportJson(report) : renderReportText(report, options);
}
