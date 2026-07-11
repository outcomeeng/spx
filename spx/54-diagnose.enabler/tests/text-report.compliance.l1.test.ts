import { Chalk } from "chalk";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

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

const sampleReport: DiagnoseReport = {
  checks: [
    classifySpxReachability({ errored: false, resolvedPath: "/bin/spx", version: "0.6.8" }, undefined),
    classifySessionEnvironment({ errored: false, hookPresent: false, sessionIdentity: false, worktreeClaimed: false }),
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

const fieldDelimiter = ":";
const reusableSpxReading: SpxReachabilityReading = { errored: false, resolvedPath: "/bin/spx", version: "0.6.8" };
const newerSpxFloor = "0.6.0";
const futureSpxFloor = "0.7.0";
const invalidSpxFloor = sampleDiagnoseTestValue(arbitraryInvalidSpxFloor());
const workingSessionReading: SessionEnvironmentReading = {
  errored: false,
  hookPresent: true,
  sessionIdentity: true,
  worktreeClaimed: true,
};
const configuredMarketplaceReading: MarketplaceInstallReading = {
  configured: true,
  errored: false,
  surfacePresent: true,
  unregistered: false,
  drifted: false,
};
const spxRecord = sampleReport.checks[0];
const sessionEnvironmentRecord = sampleReport.checks[1];
const worktreePoolRecord = sampleReport.checks[2];
const sessionStoreRecord = sampleReport.checks[3];
const marketplaceRecord = sampleReport.checks[4];
const rawMarketplaceReadingLines = Object.keys(marketplaceRecord.readings).map((key) =>
  `${key}${fieldDelimiter} ${marketplaceRecord.readings[key] ?? ""}`
);
const sessionEnvironmentReadings: Readonly<Record<string, string>> = sessionEnvironmentRecord.readings;
const rawSessionEnvironmentReadingLines = Object.keys(sessionEnvironmentReadings).map((key) =>
  `${key}${fieldDelimiter} ${sessionEnvironmentReadings[key] ?? ""}`
);
const machineRemediationFieldName = CHECK_RECORD_FIELDS.find((field) => spxRecord[field] === spxRecord.remediation);

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
  const { glyph } = SEVERITY_STYLE[BUCKET_SEVERITY[check.bucket]];
  return `${glyph} ${header}`;
}

function renderSingleCheckText(check: CheckRecord): string {
  return renderReportText({ checks: [check], overall: overallForBucket(check.bucket) }, { color: false });
}

const supportedTranslationBranches: readonly TranslationBranchCase[] = [
  {
    check: classifySpxReachability(reusableSpxReading, newerSpxFloor),
    header: DIAGNOSE_TEXT_HEADER.SPX_INSTALLED,
  },
  {
    check: classifySpxReachability(reusableSpxReading, undefined),
    header: DIAGNOSE_TEXT_HEADER.SPX_INSTALLED,
  },
  {
    check: classifySpxReachability(reusableSpxReading, futureSpxFloor),
    header: DIAGNOSE_TEXT_HEADER.SPX_BELOW_FLOOR,
  },
  {
    check: classifySpxReachability({ ...reusableSpxReading, resolvedPath: null }, newerSpxFloor),
    header: DIAGNOSE_TEXT_HEADER.SPX_UNREACHABLE,
  },
  {
    check: classifySpxReachability({ ...reusableSpxReading, errored: true }, newerSpxFloor),
    header: DIAGNOSE_TEXT_HEADER.SPX_UNKNOWN,
  },
  {
    check: classifySessionEnvironment(workingSessionReading),
    header: DIAGNOSE_TEXT_HEADER.AGENT_SESSION_ACTIVE,
  },
  {
    check: classifySessionEnvironment({ ...workingSessionReading, worktreeClaimed: false }),
    header: DIAGNOSE_TEXT_HEADER.AGENT_SESSION_UNLINKED,
  },
  {
    check: classifySessionEnvironment({
      ...workingSessionReading,
      sessionIdentity: false,
      worktreeClaimed: false,
    }),
    header: DIAGNOSE_TEXT_HEADER.SESSION_START_NO_OP,
  },
  {
    check: classifySessionEnvironment({
      ...workingSessionReading,
      hookPresent: false,
      sessionIdentity: false,
      worktreeClaimed: false,
    }),
    header: DIAGNOSE_TEXT_HEADER.AGENT_SESSION_HOOK_SKIPPED,
  },
  {
    check: classifySessionEnvironment({ ...workingSessionReading, hookPresent: false, sessionIdentity: false }),
    header: DIAGNOSE_TEXT_HEADER.AGENT_SESSION_UNKNOWN,
  },
  {
    check: classifyWorktreePool(compliantWorktreePoolReading()),
    header: DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_VALID,
  },
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
  {
    check: classifyMarketplaceInstall(configuredMarketplaceReading),
    header: DIAGNOSE_TEXT_HEADER.MARKETPLACE_CONFIGURED,
  },
  {
    check: classifyMarketplaceInstall({ ...configuredMarketplaceReading, drifted: true }),
    header: DIAGNOSE_TEXT_HEADER.MARKETPLACE_DRIFT,
  },
  {
    check: classifyMarketplaceInstall({ ...configuredMarketplaceReading, unregistered: true }),
    header: DIAGNOSE_TEXT_HEADER.MARKETPLACE_UNREGISTERED,
  },
  {
    check: classifyMarketplaceInstall({ ...configuredMarketplaceReading, surfacePresent: false }),
    header: DIAGNOSE_TEXT_HEADER.MARKETPLACE_CLI_UNAVAILABLE,
  },
  {
    check: classifyMarketplaceInstall({ ...configuredMarketplaceReading, configured: false, surfacePresent: false }),
    header: DIAGNOSE_TEXT_HEADER.MARKETPLACE_CHECKS_SKIPPED,
  },
  {
    check: classifyMarketplaceInstall({ ...configuredMarketplaceReading, errored: true }),
    header: DIAGNOSE_TEXT_HEADER.MARKETPLACE_UNKNOWN,
  },
];

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

  it("reports a configured marketplace check with no plugin CLI as an actionable problem", () => {
    const text = renderSingleCheckText(
      classifyMarketplaceInstall({ ...configuredMarketplaceReading, surfacePresent: false }),
    );

    expect(text).toContain(DIAGNOSE_TEXT_HEADER.MARKETPLACE_CLI_UNAVAILABLE);
    expect(text).toContain(
      `${DIAGNOSE_TEXT_LABEL.PROBLEM}${fieldDelimiter} ${DIAGNOSE_TEXT_DETAIL.MARKETPLACE_CLI_UNAVAILABLE_PROBLEM}`,
    );
    expect(text).toContain(
      `${DIAGNOSE_TEXT_LABEL.FIX}${fieldDelimiter} ${DIAGNOSE_TEXT_DETAIL.MARKETPLACE_CLI_UNAVAILABLE_FIX}`,
    );
    expect(text).not.toContain(DIAGNOSE_TEXT_HEADER.MARKETPLACE_CHECKS_SKIPPED);
    expect(text).not.toContain(DIAGNOSE_TEXT_DETAIL.MARKETPLACE_SKIPPED);
  });

  it("reports silent session-start no-op as a stale claim-path signal", () => {
    const text = renderSingleCheckText(
      classifySessionEnvironment({
        errored: false,
        hookPresent: true,
        sessionIdentity: false,
        worktreeClaimed: false,
      }),
    );

    expect(text).toContain(DIAGNOSE_TEXT_HEADER.SESSION_START_NO_OP);
    expect(text).toContain(
      `${DIAGNOSE_TEXT_LABEL.PROBLEM}${fieldDelimiter} ${DIAGNOSE_TEXT_DETAIL.SESSION_START_NO_OP_PROBLEM}`,
    );
    expect(text).toContain(
      `${DIAGNOSE_TEXT_LABEL.FIX}${fieldDelimiter} ${DIAGNOSE_TEXT_DETAIL.SESSION_START_NO_OP_FIX}`,
    );
  });

  it("reports invalid spx version comparison details in text mode", () => {
    const text = renderSingleCheckText(classifySpxReachability(reusableSpxReading, invalidSpxFloor));

    expect(text).toContain(DIAGNOSE_TEXT_HEADER.SPX_UNKNOWN);
    expect(text).toContain(
      `${DIAGNOSE_TEXT_LABEL.PROBLEM}${fieldDelimiter} ${DIAGNOSE_TEXT_DETAIL.SPX_UNKNOWN_PROBLEM}`,
    );
    expect(text).toContain(
      `${DIAGNOSE_TEXT_LABEL.INSTALLED}${fieldDelimiter} ${reusableSpxReading.version ?? ""}`,
    );
    expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.REQUIRED_VERSION}${fieldDelimiter} ${invalidSpxFloor}`);
    expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.FIX}${fieldDelimiter} ${DIAGNOSE_TEXT_DETAIL.SPX_UNKNOWN_FIX}`);
  });

  it("does not expose raw boolean fields, duplicated verdict labels, or remediation prose in text mode", () => {
    const text = renderReportText(sampleReport, { color: false });

    expect(text).not.toContain(`${sessionEnvironmentRecord.verdict} [${sessionEnvironmentRecord.bucket}]`);
    expect(text).not.toContain(`${worktreePoolRecord.verdict} [${worktreePoolRecord.bucket}]`);
    expect(text).not.toMatch(/\bsurface\b/i);
    for (const rawReadingLine of rawMarketplaceReadingLines) {
      expect(text).not.toContain(rawReadingLine);
    }
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

  it("translates every supported check verdict branch into its diagnosis heading", () => {
    for (const branch of supportedTranslationBranches) {
      const text = renderSingleCheckText(branch.check);

      expect(text.split("\n")).toContain(sectionHeaderLine(branch.check, branch.header));
    }
  });
});

describe("the JSON report remains the complete machine schema", () => {
  it("includes every per-check name, verdict, bucket, reading, and remediation", () => {
    const json = JSON.parse(renderReportJson(sampleReport)) as DiagnoseReport;

    expect(json).toStrictEqual(sampleReport);
  });
});

describe("the text report renders through the styled-output primitive", () => {
  it("prefixes each per-check heading line with the status glyph keyed by the check's bucket", () => {
    fc.assert(
      fc.property(arbitraryReport(), (report) => {
        const text = renderReportText(report, { color: false });
        const headingLines = text.split("\n").filter((line) => {
          return !line.startsWith("  ") && !line.startsWith(DIAGNOSE_TEXT_OVERALL_LABEL);
        });

        expect(headingLines).toHaveLength(report.checks.length);
        report.checks.forEach((check, index) => {
          const { glyph } = SEVERITY_STYLE[BUCKET_SEVERITY[check.bucket]];
          expect(headingLines[index]?.startsWith(`${glyph} `)).toBe(true);
        });
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
