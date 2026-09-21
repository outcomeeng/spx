import { foldOverallVerdict } from "@/domains/diagnose/fold";
import { renderReportText } from "@/domains/diagnose/report";
import type { CheckRecord, DiagnoseReport } from "@/domains/diagnose/types";
import { renderTerminalText } from "@/lib/terminal-text/terminal-text";

/** Returns rendered observations; predicates belong to the linked tests. */
export function renderSingleCheckText(check: CheckRecord): string {
  return renderPlainReport({ checks: [check], overall: foldOverallVerdict([check.bucket]) });
}

export function renderPlainReport(report: DiagnoseReport): string {
  return renderTerminalText(renderReportText(report, { color: false }));
}
