/** Assertion harness for diagnose text and JSON report rendering. */

import { Chalk } from "chalk";
import { expect } from "vitest";

import { foldOverallVerdict } from "@/domains/diagnose/fold";
import {
  DIAGNOSE_TEXT_DETAIL,
  DIAGNOSE_TEXT_HEADER,
  DIAGNOSE_TEXT_LABEL,
  DIAGNOSE_TEXT_OVERALL_LABEL,
  parseDiagnoseReportJson,
  renderReportJson,
  renderReportText,
} from "@/domains/diagnose/report";
import {
  BUCKET_SEVERITY,
  CANONICAL_CHECKOUT_PROBLEM,
  OVERALL_SEVERITY,
} from "@/domains/diagnose/report-contract";
import { CHECK_RECORD_FIELDS, type CheckRecord, OVERALL_VERDICT } from "@/domains/diagnose/types";
import { SEVERITY_STYLE } from "@/lib/styled-output/styled-output";
import { arbitraryReport } from "@testing/generators/diagnose/report";
import {
  canonicalCheckoutFailureCases,
  type InvalidDiagnoseReportCase,
  invalidSpxVersionCase,
  marketplaceCliProblemCheck,
  sampleDiagnoseReport,
  sessionStartNoOpCheck,
  type StyledBucketCase,
  type StyledOverallCase,
  supportedTranslationBranches,
} from "@testing/generators/diagnose/report-scenarios";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

function sectionHeaderLine(check: CheckRecord, header: string): string {
  return `${SEVERITY_STYLE[BUCKET_SEVERITY[check.bucket]].glyph} ${header}`;
}

function renderSingleCheckText(check: CheckRecord): string {
  return renderReportText({ checks: [check], overall: foldOverallVerdict([check.bucket]) }, { color: false });
}

export function assertTextReportSummary(): void {
  const report = sampleDiagnoseReport();
  const text = renderReportText(report, { color: false });
  expect(text).toContain(`${DIAGNOSE_TEXT_OVERALL_LABEL}: ${OVERALL_VERDICT.DEGRADED}`);
  expect(text).toContain(DIAGNOSE_TEXT_HEADER.SPX_INSTALLED);
  expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.VERSION}: ${report.checks[0]?.readings.version}`);
  expect(text).toContain(DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_VALID);
  expect(text).toContain(report.checks[2]?.readings.running);
  expect(text).toContain(report.checks[2]?.readings.free);
  expect(text).toContain(DIAGNOSE_TEXT_HEADER.STALE_DOING_SESSIONS);
  expect(text).toContain(report.checks[3]?.readings.orphaned);
  expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.FIX}: ${DIAGNOSE_TEXT_DETAIL.SESSION_STORE_ORPHANED_FIX}`);
  expect(text).toContain(DIAGNOSE_TEXT_HEADER.AGENT_SESSION_HOOK_SKIPPED);
  expect(text).toContain(DIAGNOSE_TEXT_DETAIL.AGENT_SESSION_SKIPPED);
  expect(text).toContain(DIAGNOSE_TEXT_HEADER.MARKETPLACE_CHECKS_SKIPPED);
  expect(text).toContain(DIAGNOSE_TEXT_DETAIL.MARKETPLACE_SKIPPED);
}

export function assertMarketplaceCliProblemTranslation(): void {
  const text = renderSingleCheckText(marketplaceCliProblemCheck());
  expect(text).toContain(DIAGNOSE_TEXT_HEADER.MARKETPLACE_CLI_UNAVAILABLE);
  expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.PROBLEM}: ${DIAGNOSE_TEXT_DETAIL.MARKETPLACE_CLI_UNAVAILABLE_PROBLEM}`);
  expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.FIX}: ${DIAGNOSE_TEXT_DETAIL.MARKETPLACE_CLI_UNAVAILABLE_FIX}`);
  expect(text).not.toContain(DIAGNOSE_TEXT_HEADER.MARKETPLACE_CHECKS_SKIPPED);
  expect(text).not.toContain(DIAGNOSE_TEXT_DETAIL.MARKETPLACE_SKIPPED);
}

export function assertSessionStartNoOpTranslation(): void {
  const text = renderSingleCheckText(sessionStartNoOpCheck());
  expect(text).toContain(DIAGNOSE_TEXT_HEADER.SESSION_START_NO_OP);
  expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.PROBLEM}: ${DIAGNOSE_TEXT_DETAIL.SESSION_START_NO_OP_PROBLEM}`);
  expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.FIX}: ${DIAGNOSE_TEXT_DETAIL.SESSION_START_NO_OP_FIX}`);
}

export function assertInvalidSpxVersionTranslation(): void {
  const { check, floor } = invalidSpxVersionCase();
  const text = renderSingleCheckText(check);
  expect(text).toContain(DIAGNOSE_TEXT_HEADER.SPX_UNKNOWN);
  expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.PROBLEM}: ${DIAGNOSE_TEXT_DETAIL.SPX_UNKNOWN_PROBLEM}`);
  expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.INSTALLED}: ${check.readings.version}`);
  expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.REQUIRED_VERSION}: ${floor}`);
  expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.FIX}: ${DIAGNOSE_TEXT_DETAIL.SPX_UNKNOWN_FIX}`);
}

export function assertTextReportHidesMachineFields(): void {
  const report = sampleDiagnoseReport();
  const text = renderReportText(report, { color: false });
  const sessionRecord = report.checks[1];
  const worktreeRecord = report.checks[2];
  const marketplaceRecord = report.checks[4];
  const spxRecord = report.checks[0];
  expect(text).not.toContain(`${sessionRecord.verdict} [${sessionRecord.bucket}]`);
  expect(text).not.toContain(`${worktreeRecord.verdict} [${worktreeRecord.bucket}]`);
  expect(text).not.toMatch(/\bsurface\b/i);
  for (const [key, value] of Object.entries(marketplaceRecord.readings)) {
    expect(text).not.toContain(`${key}: ${value}`);
  }
  for (const [key, value] of Object.entries(sessionRecord.readings)) {
    expect(text).not.toContain(`${key}: ${value}`);
  }
  for (const [key, value] of Object.entries(worktreeRecord.readings)) {
    expect(text).not.toContain(`${key}: ${value}`);
  }
  const remediationField = CHECK_RECORD_FIELDS.find((field) => spxRecord[field] === spxRecord.remediation);
  expect(remediationField).toBeDefined();
  expect(text).not.toContain(`${remediationField}:`);
  expect(text).not.toContain(spxRecord.remediation);
}

export function assertUnknownTranslationHidesMachineFields(): void {
  const report = sampleDiagnoseReport();
  const fallbackRecord = { ...report.checks[0], verdict: report.checks[0].verdict.toUpperCase() };
  const text = renderReportText({ checks: [fallbackRecord], overall: report.overall }, { color: false });
  expect(text).toContain(DIAGNOSE_TEXT_HEADER.RENDERING_UNAVAILABLE);
  expect(text).toContain(DIAGNOSE_TEXT_DETAIL.RENDERING_UNAVAILABLE);
  expect(text).not.toContain(fallbackRecord.name);
  expect(text).not.toContain(fallbackRecord.verdict);
  expect(text).not.toContain(fallbackRecord.remediation);
}

export function assertEveryTranslationBranchHasHeading(): void {
  for (const branch of supportedTranslationBranches()) {
    expect(renderSingleCheckText(branch.check).split("\n")).toContain(sectionHeaderLine(branch.check, branch.header));
  }
}

export function assertCanonicalCheckoutFailureTranslations(): void {
  for (const { check, verdict } of canonicalCheckoutFailureCases()) {
    const lines = renderSingleCheckText(check).split("\n");
    expect(lines).toContain(sectionHeaderLine(check, DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_INVALID));
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`${DIAGNOSE_TEXT_LABEL.PROBLEM}: ${CANONICAL_CHECKOUT_PROBLEM[verdict]}`),
      ]),
    );
    expect(lines).not.toEqual(expect.arrayContaining([expect.stringContaining(check.verdict)]));
    expect(lines).toEqual(
      expect.arrayContaining([expect.stringContaining(`${DIAGNOSE_TEXT_LABEL.FIX}: ${check.remediation}`)]),
    );
  }
}

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
  const heading = renderReportText(testCase.report, { color: false }).split("\n")[0];
  expect(heading.startsWith(`${SEVERITY_STYLE[BUCKET_SEVERITY[testCase.bucket]].glyph} `)).toBe(true);
}

export function assertOverallColorCase(testCase: StyledOverallCase): void {
  const chalk = new Chalk({ level: 1 });
  const style = SEVERITY_STYLE[OVERALL_SEVERITY[testCase.overall]].style;
  expect(renderReportText(testCase.report, { color: true })).toContain(
    chalk[style](`${DIAGNOSE_TEXT_OVERALL_LABEL}: ${testCase.overall}`),
  );
}
