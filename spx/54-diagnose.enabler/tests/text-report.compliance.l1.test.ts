import { Chalk } from "chalk";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { classifyMarketplaceInstall } from "@/domains/diagnose/checks/marketplace-install";
import { classifySessionEnvironment } from "@/domains/diagnose/checks/session-environment";
import { classifySessionStore } from "@/domains/diagnose/checks/session-store";
import { classifySpxReachability } from "@/domains/diagnose/checks/spx-reachability";
import { classifyWorktreePool } from "@/domains/diagnose/checks/worktree-pool";
import {
  BUCKET_SEVERITY,
  DIAGNOSE_TEXT_DETAIL,
  DIAGNOSE_TEXT_HEADER,
  DIAGNOSE_TEXT_LABEL,
  DIAGNOSE_TEXT_OVERALL_LABEL,
  OVERALL_SEVERITY,
  renderReportJson,
  renderReportText,
} from "@/domains/diagnose/report";
import { CHECK_RECORD_FIELDS, type DiagnoseReport, OVERALL_VERDICT } from "@/domains/diagnose/types";
import { SEVERITY_STYLE } from "@/lib/styled-output/styled-output";
import { arbitraryReport } from "@testing/generators/diagnose/report";

const sampleReport: DiagnoseReport = {
  checks: [
    classifySpxReachability({ errored: false, resolvedPath: "/bin/spx", version: "0.6.8" }, undefined),
    classifySessionEnvironment({ errored: false, hookPresent: false, sessionIdentity: false, worktreeClaimed: false }),
    classifyWorktreePool({ errored: false, bareRepository: true, linkedWorktrees: false, running: 1, free: 8 }),
    classifySessionStore({ errored: false, orphanedClaims: 11 }),
    classifyMarketplaceInstall({ errored: false, surfacePresent: false, unregistered: false, drifted: false }),
  ],
  overall: OVERALL_VERDICT.DEGRADED,
};

const fieldDelimiter = String.fromCodePoint(58);
const spxRecord = sampleReport.checks[0];
const sessionEnvironmentRecord = sampleReport.checks[1];
const worktreePoolRecord = sampleReport.checks[2];
const sessionStoreRecord = sampleReport.checks[3];
const marketplaceRecord = sampleReport.checks[4];
const hiddenMarketplaceReadingKey = Object.keys(marketplaceRecord.readings)[0];
const rawSessionEnvironmentReadingLines = Object.entries(sessionEnvironmentRecord.readings).map(
  ([key, value]) => `${key}${fieldDelimiter} ${value}`,
);
const machineRemediationFieldName = CHECK_RECORD_FIELDS.find((field) => spxRecord[field] === spxRecord.remediation);

describe("the text report translates check records into a human diagnosis", () => {
  it("states the conclusion, active problem, useful healthy facts, and concrete next action", () => {
    const text = renderReportText(sampleReport, { color: false });

    expect(text).toContain(`${DIAGNOSE_TEXT_OVERALL_LABEL}: ${OVERALL_VERDICT.DEGRADED}`);
    expect(text).toContain(DIAGNOSE_TEXT_HEADER.SPX_INSTALLED);
    expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.VERSION}${fieldDelimiter} ${spxRecord.readings.version}`);
    expect(text).toContain(DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_VALID);
    expect(text).toContain(worktreePoolRecord.readings.running);
    expect(text).toContain(worktreePoolRecord.readings.free);
    expect(text).toContain(DIAGNOSE_TEXT_HEADER.STALE_DOING_SESSIONS);
    expect(text).toContain(sessionStoreRecord.readings.orphaned);
    expect(text).toContain(
      `${DIAGNOSE_TEXT_LABEL.FIX}${fieldDelimiter} ${DIAGNOSE_TEXT_DETAIL.SESSION_STORE_ORPHANED_FIX}`,
    );
    expect(text).toContain(DIAGNOSE_TEXT_HEADER.AGENT_SESSION_HOOK_SKIPPED);
    expect(text).toContain(DIAGNOSE_TEXT_DETAIL.AGENT_SESSION_SKIPPED);
    expect(text).toContain(DIAGNOSE_TEXT_HEADER.MARKETPLACE_CHECKS_SKIPPED);
    expect(text).toContain(DIAGNOSE_TEXT_DETAIL.MARKETPLACE_SKIPPED);
  });

  it("does not expose raw boolean fields, duplicated verdict labels, or remediation prose in text mode", () => {
    const text = renderReportText(sampleReport, { color: false });

    expect(text).not.toContain(`${sessionEnvironmentRecord.verdict} [${sessionEnvironmentRecord.bucket}]`);
    expect(text).not.toContain(`${worktreePoolRecord.verdict} [${worktreePoolRecord.bucket}]`);
    expect(text).not.toContain(hiddenMarketplaceReadingKey);
    for (const rawReadingLine of rawSessionEnvironmentReadingLines) {
      expect(text).not.toContain(rawReadingLine);
    }
    expect(machineRemediationFieldName).toBeDefined();
    expect(text).not.toContain(`${machineRemediationFieldName}${fieldDelimiter}`);
    expect(text).not.toContain(spxRecord.remediation);
  });

  it("does not echo machine fields when a check record has no text translation", () => {
    const fallbackRecord = {
      ...spxRecord,
      verdict: spxRecord.verdict.toUpperCase(),
    };
    const text = renderReportText({ checks: [fallbackRecord], overall: sampleReport.overall }, { color: false });

    expect(text).toContain(DIAGNOSE_TEXT_HEADER.RENDERING_UNAVAILABLE);
    expect(text).toContain(DIAGNOSE_TEXT_DETAIL.RENDERING_UNAVAILABLE);
    expect(text).not.toContain(fallbackRecord.name);
    expect(text).not.toContain(fallbackRecord.verdict);
    expect(text).not.toContain(fallbackRecord.remediation);
  });
});

describe("the JSON report remains the complete machine schema", () => {
  it("includes every per-check name, verdict, bucket, reading, and remediation", () => {
    const json = JSON.parse(renderReportJson(sampleReport)) as DiagnoseReport;

    expect(json).toStrictEqual(sampleReport);
  });
});

describe("the text report renders through the styled-output primitive", () => {
  it("prefixes each per-check line with the status glyph keyed by the check's bucket", () => {
    fc.assert(
      fc.property(arbitraryReport(), (report) => {
        const text = renderReportText(report, { color: false });

        for (const check of report.checks) {
          const { glyph } = SEVERITY_STYLE[BUCKET_SEVERITY[check.bucket]];
          expect(text).toContain(`${glyph} `);
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
