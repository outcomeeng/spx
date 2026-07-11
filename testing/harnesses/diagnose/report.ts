/** Assertion harness for diagnose text and JSON report rendering. */

import { Chalk } from "chalk";
import { expect } from "vitest";

import {
  classifyMarketplaceInstall,
  type MarketplaceInstallReading,
} from "@/domains/diagnose/checks/marketplace-install";
import {
  classifySessionEnvironment,
  type SessionEnvironmentReading,
} from "@/domains/diagnose/checks/session-environment";
import { classifySessionStore } from "@/domains/diagnose/checks/session-store";
import { classifySpxReachability, type SpxReachabilityReading } from "@/domains/diagnose/checks/spx-reachability";
import { classifyWorktreePool, type WorktreePoolReading } from "@/domains/diagnose/checks/worktree-pool";
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
import {
  CHECK_RECORD_FIELDS,
  type CheckRecord,
  type DiagnoseReport,
  OVERALL_VERDICT,
  type OverallVerdict,
  VERDICT_BUCKET,
  type VerdictBucket,
} from "@/domains/diagnose/types";
import { SEVERITY_STYLE } from "@/lib/styled-output/styled-output";
import { arbitraryInvalidSpxFloor, sampleDiagnoseTestValue } from "@testing/generators/diagnose/manifest";
import { arbitraryReport } from "@testing/generators/diagnose/report";
import { arbitraryBranchName } from "@testing/generators/git-name/git-name";
import { sampleMainCheckoutTestValue } from "@testing/generators/main-checkout/main-checkout";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

interface TranslationBranchCase {
  readonly check: CheckRecord;
  readonly header: string;
}

function compliantWorktreePoolReading(): WorktreePoolReading {
  const branch = sampleMainCheckoutTestValue(arbitraryBranchName());
  return {
    errored: false,
    bareRepository: true,
    linkedWorktrees: false,
    mainCheckoutPath: branch,
    defaultBranch: branch,
    mainCheckoutBranch: branch,
    mainCheckoutBranchRead: true,
    running: 1,
    free: 8,
  };
}

function sampleReport(): DiagnoseReport {
  return {
    checks: [
      classifySpxReachability({ errored: false, resolvedPath: "/bin/spx", version: "0.6.8" }, undefined),
      classifySessionEnvironment({
        errored: false,
        hookPresent: false,
        sessionIdentity: false,
        worktreeClaimed: false,
      }),
      classifyWorktreePool(compliantWorktreePoolReading()),
      classifySessionStore({ errored: false, orphanedClaims: 11 }),
      classifyMarketplaceInstall({
        configured: false,
        errored: false,
        surfacePresent: false,
        unregistered: false,
        drifted: false,
      }),
    ],
    overall: OVERALL_VERDICT.DEGRADED,
  };
}

function reusableSpxReading(): SpxReachabilityReading {
  return { errored: false, resolvedPath: "/bin/spx", version: "0.6.8" };
}

function workingSessionReading(): SessionEnvironmentReading {
  return { errored: false, hookPresent: true, sessionIdentity: true, worktreeClaimed: true };
}

function configuredMarketplaceReading(): MarketplaceInstallReading {
  return { configured: true, errored: false, surfacePresent: true, unregistered: false, drifted: false };
}

function overallForBucket(bucket: VerdictBucket): OverallVerdict {
  switch (bucket) {
    case VERDICT_BUCKET.BROKEN:
      return OVERALL_VERDICT.BROKEN;
    case VERDICT_BUCKET.UNKNOWN:
      return OVERALL_VERDICT.UNKNOWN;
    case VERDICT_BUCKET.DEGRADED:
      return OVERALL_VERDICT.DEGRADED;
    case VERDICT_BUCKET.HEALTHY:
    case VERDICT_BUCKET.NOT_APPLICABLE:
      return OVERALL_VERDICT.HEALTHY;
  }
}

function sectionHeaderLine(check: CheckRecord, header: string): string {
  return `${SEVERITY_STYLE[BUCKET_SEVERITY[check.bucket]].glyph} ${header}`;
}

function renderSingleCheckText(check: CheckRecord): string {
  return renderReportText({ checks: [check], overall: overallForBucket(check.bucket) }, { color: false });
}

function supportedTranslationBranches(): readonly TranslationBranchCase[] {
  const spxReading = reusableSpxReading();
  const sessionReading = workingSessionReading();
  const marketplaceReading = configuredMarketplaceReading();
  return [
    { check: classifySpxReachability(spxReading, "0.6.0"), header: DIAGNOSE_TEXT_HEADER.SPX_INSTALLED },
    { check: classifySpxReachability(spxReading, undefined), header: DIAGNOSE_TEXT_HEADER.SPX_INSTALLED },
    { check: classifySpxReachability(spxReading, "0.7.0"), header: DIAGNOSE_TEXT_HEADER.SPX_BELOW_FLOOR },
    {
      check: classifySpxReachability({ ...spxReading, resolvedPath: null }, "0.6.0"),
      header: DIAGNOSE_TEXT_HEADER.SPX_UNREACHABLE,
    },
    {
      check: classifySpxReachability({ ...spxReading, errored: true }, "0.6.0"),
      header: DIAGNOSE_TEXT_HEADER.SPX_UNKNOWN,
    },
    { check: classifySessionEnvironment(sessionReading), header: DIAGNOSE_TEXT_HEADER.AGENT_SESSION_ACTIVE },
    {
      check: classifySessionEnvironment({ ...sessionReading, worktreeClaimed: false }),
      header: DIAGNOSE_TEXT_HEADER.AGENT_SESSION_UNLINKED,
    },
    {
      check: classifySessionEnvironment({ ...sessionReading, sessionIdentity: false, worktreeClaimed: false }),
      header: DIAGNOSE_TEXT_HEADER.SESSION_START_NO_OP,
    },
    {
      check: classifySessionEnvironment({
        ...sessionReading,
        hookPresent: false,
        sessionIdentity: false,
        worktreeClaimed: false,
      }),
      header: DIAGNOSE_TEXT_HEADER.AGENT_SESSION_HOOK_SKIPPED,
    },
    {
      check: classifySessionEnvironment({ ...sessionReading, hookPresent: false, sessionIdentity: false }),
      header: DIAGNOSE_TEXT_HEADER.AGENT_SESSION_UNKNOWN,
    },
    { check: classifyWorktreePool(compliantWorktreePoolReading()), header: DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_VALID },
    {
      check: classifyWorktreePool({
        errored: false,
        bareRepository: false,
        linkedWorktrees: true,
        mainCheckoutPath: null,
        defaultBranch: null,
        mainCheckoutBranch: null,
        mainCheckoutBranchRead: true,
        running: 1,
        free: 8,
      }),
      header: DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_INVALID,
    },
    {
      check: classifyWorktreePool({
        errored: true,
        bareRepository: true,
        linkedWorktrees: false,
        mainCheckoutPath: null,
        defaultBranch: null,
        mainCheckoutBranch: null,
        mainCheckoutBranchRead: false,
        running: 1,
        free: 8,
      }),
      header: DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_UNKNOWN,
    },
    {
      check: classifySessionStore({ errored: false, orphanedClaims: 0 }),
      header: DIAGNOSE_TEXT_HEADER.SESSION_STORE_CLEAN,
    },
    {
      check: classifySessionStore({ errored: false, orphanedClaims: 11 }),
      header: DIAGNOSE_TEXT_HEADER.STALE_DOING_SESSIONS,
    },
    {
      check: classifySessionStore({ errored: true, orphanedClaims: 0 }),
      header: DIAGNOSE_TEXT_HEADER.SESSION_STORE_UNKNOWN,
    },
    { check: classifyMarketplaceInstall(marketplaceReading), header: DIAGNOSE_TEXT_HEADER.MARKETPLACE_CONFIGURED },
    {
      check: classifyMarketplaceInstall({ ...marketplaceReading, drifted: true }),
      header: DIAGNOSE_TEXT_HEADER.MARKETPLACE_DRIFT,
    },
    {
      check: classifyMarketplaceInstall({ ...marketplaceReading, unregistered: true }),
      header: DIAGNOSE_TEXT_HEADER.MARKETPLACE_UNREGISTERED,
    },
    {
      check: classifyMarketplaceInstall({ ...marketplaceReading, surfacePresent: false }),
      header: DIAGNOSE_TEXT_HEADER.MARKETPLACE_CLI_UNAVAILABLE,
    },
    {
      check: classifyMarketplaceInstall({ ...marketplaceReading, configured: false, surfacePresent: false }),
      header: DIAGNOSE_TEXT_HEADER.MARKETPLACE_CHECKS_SKIPPED,
    },
    {
      check: classifyMarketplaceInstall({ ...marketplaceReading, errored: true }),
      header: DIAGNOSE_TEXT_HEADER.MARKETPLACE_UNKNOWN,
    },
  ];
}

export function assertTextReportSummary(): void {
  const report = sampleReport();
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
  const text = renderSingleCheckText(classifyMarketplaceInstall({
    ...configuredMarketplaceReading(),
    surfacePresent: false,
  }));
  expect(text).toContain(DIAGNOSE_TEXT_HEADER.MARKETPLACE_CLI_UNAVAILABLE);
  expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.PROBLEM}: ${DIAGNOSE_TEXT_DETAIL.MARKETPLACE_CLI_UNAVAILABLE_PROBLEM}`);
  expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.FIX}: ${DIAGNOSE_TEXT_DETAIL.MARKETPLACE_CLI_UNAVAILABLE_FIX}`);
  expect(text).not.toContain(DIAGNOSE_TEXT_HEADER.MARKETPLACE_CHECKS_SKIPPED);
  expect(text).not.toContain(DIAGNOSE_TEXT_DETAIL.MARKETPLACE_SKIPPED);
}

export function assertSessionStartNoOpTranslation(): void {
  const text = renderSingleCheckText(classifySessionEnvironment({
    errored: false,
    hookPresent: true,
    sessionIdentity: false,
    worktreeClaimed: false,
  }));
  expect(text).toContain(DIAGNOSE_TEXT_HEADER.SESSION_START_NO_OP);
  expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.PROBLEM}: ${DIAGNOSE_TEXT_DETAIL.SESSION_START_NO_OP_PROBLEM}`);
  expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.FIX}: ${DIAGNOSE_TEXT_DETAIL.SESSION_START_NO_OP_FIX}`);
}

export function assertInvalidSpxVersionTranslation(): void {
  const reading = reusableSpxReading();
  const floor = sampleDiagnoseTestValue(arbitraryInvalidSpxFloor());
  const text = renderSingleCheckText(classifySpxReachability(reading, floor));
  expect(text).toContain(DIAGNOSE_TEXT_HEADER.SPX_UNKNOWN);
  expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.PROBLEM}: ${DIAGNOSE_TEXT_DETAIL.SPX_UNKNOWN_PROBLEM}`);
  expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.INSTALLED}: ${reading.version ?? ""}`);
  expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.REQUIRED_VERSION}: ${floor}`);
  expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.FIX}: ${DIAGNOSE_TEXT_DETAIL.SPX_UNKNOWN_FIX}`);
}

export function assertTextReportHidesMachineFields(): void {
  const report = sampleReport();
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
  const remediationField = CHECK_RECORD_FIELDS.find((field) => spxRecord[field] === spxRecord.remediation);
  expect(remediationField).toBeDefined();
  expect(text).not.toContain(`${remediationField}:`);
  expect(text).not.toContain(spxRecord.remediation);
}

export function assertUnknownTranslationHidesMachineFields(): void {
  const report = sampleReport();
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

export function assertJsonReportPreservesSchema(): void {
  const report = sampleReport();
  expect(JSON.parse(renderReportJson(report)) as DiagnoseReport).toStrictEqual(report);
}

export function assertHeadingGlyphsFollowBuckets(): void {
  assertProperty(
    arbitraryReport(),
    (report) => {
      const headingLines = renderReportText(report, { color: false }).split("\n").filter((line) =>
        !line.startsWith("  ") && !line.startsWith(DIAGNOSE_TEXT_OVERALL_LABEL)
      );
      expect(headingLines).toHaveLength(report.checks.length);
      report.checks.forEach((check, index) => {
        expect(headingLines[index]?.startsWith(`${SEVERITY_STYLE[BUCKET_SEVERITY[check.bucket]].glyph} `)).toBe(true);
      });
    },
    { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
  );
}

export function assertOverallColorFollowsVerdict(): void {
  const chalk = new Chalk({ level: 1 });
  assertProperty(
    arbitraryReport(),
    (report) => {
      const text = renderReportText(report, { color: true });
      const style = SEVERITY_STYLE[OVERALL_SEVERITY[report.overall]].style;
      expect(text).toContain(chalk[style](`${DIAGNOSE_TEXT_OVERALL_LABEL}: ${report.overall}`));
    },
    { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
  );
}
