import { classifyMarketplaceInstall } from "@/domains/diagnose/checks/marketplace-install";
import { classifySessionEnvironment } from "@/domains/diagnose/checks/session-environment";
import { classifySpxReachability } from "@/domains/diagnose/checks/spx-reachability";
import {
  DIAGNOSE_TEXT_DETAIL,
  DIAGNOSE_TEXT_HEADER,
  DIAGNOSE_TEXT_LABEL,
  DIAGNOSE_TEXT_OVERALL_LABEL,
  renderReportConcise,
  renderReportJson,
  renderReportText,
} from "@/domains/diagnose/report";
import { BUCKET_SEVERITY, CANONICAL_CHECKOUT_PROBLEM, OVERALL_SEVERITY } from "@/domains/diagnose/report-contract";
import { CHECK_RECORD_FIELDS, type DiagnoseReport, OVERALL_VERDICT, VERDICT_BUCKET } from "@/domains/diagnose/types";
import { sessionCliDefinition } from "@/interfaces/cli/session/definition";
import { SEVERITY_STYLE } from "@/lib/styled-output/styled-output";
import { renderTerminalText } from "@/lib/terminal-text/terminal-text";
import { arbitraryInvalidSpxFloor, sampleDiagnoseTestValue } from "@testing/generators/diagnose/manifest";
import { arbitraryReport } from "@testing/generators/diagnose/report";
import {
  canonicalCheckoutFailureCases,
  configuredMarketplaceReading,
  reusableSpxReading,
  sampleReport,
  supportedTranslationBranches,
} from "@testing/generators/diagnose/report-cases";
import { renderSingleCheckText } from "@testing/harnesses/diagnose/report";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { Chalk } from "chalk";
import { describe, expect, it } from "vitest";

describe("the text report translates check records into a human diagnosis", () => {
  it("states the conclusion, active problems, healthy facts, and actions", () => {
    const report = sampleReport();
    const text = renderTerminalText(renderReportText(report, { color: false }));
    expect(text).toContain(`${DIAGNOSE_TEXT_OVERALL_LABEL}: ${OVERALL_VERDICT.HEALTHY}`);
    expect(text).toContain(DIAGNOSE_TEXT_HEADER.SPX_INSTALLED);
    expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.VERSION}: ${report.checks[0]?.readings.version}`);
    expect(text).toContain(DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_VALID);
    expect(text).toContain(report.checks[2]?.readings.running);
    expect(text).toContain(report.checks[2]?.readings.free);
    expect(text).toContain(DIAGNOSE_TEXT_HEADER.SESSION_STORE_CLEAN);
    expect(text).toContain(
      `${DIAGNOSE_TEXT_LABEL.ORPHANED_DOING_SESSIONS}: ${report.checks[3]?.readings.orphaned}`,
    );
    expect(text).toContain(DIAGNOSE_TEXT_DETAIL.SESSION_STORE_INFORMATIONAL);
    expect(text).not.toContain(
      `${sessionCliDefinition.domain.commandName} ${sessionCliDefinition.subcommands.release.commandName}`,
    );
    expect(text).toContain(DIAGNOSE_TEXT_HEADER.AGENT_SESSION_HOOK_SKIPPED);
    expect(text).toContain(DIAGNOSE_TEXT_DETAIL.AGENT_SESSION_SKIPPED);
    expect(text).toContain(DIAGNOSE_TEXT_HEADER.MARKETPLACE_CHECKS_SKIPPED);
    expect(text).toContain(DIAGNOSE_TEXT_DETAIL.MARKETPLACE_SKIPPED);
  });
  it("reports an unavailable configured marketplace CLI as actionable", () => {
    const text = renderSingleCheckText(classifyMarketplaceInstall({
      ...configuredMarketplaceReading(),
      surfacePresent: false,
    }));
    expect(text).toContain(DIAGNOSE_TEXT_HEADER.MARKETPLACE_CLI_UNAVAILABLE);
    expect(text).toContain(
      `${DIAGNOSE_TEXT_LABEL.PROBLEM}: ${DIAGNOSE_TEXT_DETAIL.MARKETPLACE_CLI_UNAVAILABLE_PROBLEM}`,
    );
    expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.FIX}: ${DIAGNOSE_TEXT_DETAIL.MARKETPLACE_CLI_UNAVAILABLE_FIX}`);
    expect(text).not.toContain(DIAGNOSE_TEXT_HEADER.MARKETPLACE_CHECKS_SKIPPED);
    expect(text).not.toContain(DIAGNOSE_TEXT_DETAIL.MARKETPLACE_SKIPPED);
  });
  it("reports silent session-start no-op as a stale claim-path signal", () => {
    const text = renderSingleCheckText(classifySessionEnvironment({
      errored: false,
      hookPresent: true,
      sessionIdentity: false,
      worktreeClaimed: false,
    }));
    expect(text).toContain(DIAGNOSE_TEXT_HEADER.SESSION_START_NO_OP);
    expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.PROBLEM}: ${DIAGNOSE_TEXT_DETAIL.SESSION_START_NO_OP_PROBLEM}`);
    expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.FIX}: ${DIAGNOSE_TEXT_DETAIL.SESSION_START_NO_OP_FIX}`);
  });
  it("reports invalid spx version comparison details", () => {
    const reading = reusableSpxReading();
    const floor = sampleDiagnoseTestValue(arbitraryInvalidSpxFloor());
    const text = renderSingleCheckText(classifySpxReachability(reading, floor));
    expect(text).toContain(DIAGNOSE_TEXT_HEADER.SPX_UNKNOWN);
    expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.PROBLEM}: ${DIAGNOSE_TEXT_DETAIL.SPX_UNKNOWN_PROBLEM}`);
    expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.INSTALLED}: ${reading.version ?? ""}`);
    expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.REQUIRED_VERSION}: ${floor}`);
    expect(text).toContain(`${DIAGNOSE_TEXT_LABEL.FIX}: ${DIAGNOSE_TEXT_DETAIL.SPX_UNKNOWN_FIX}`);
  });
  it("hides raw booleans, machine labels, and remediation prose", () => {
    const report = sampleReport();
    const text = renderTerminalText(renderReportText(report, { color: false }));
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
  });
  it("hides machine fields for an unsupported translation", () => {
    const report = sampleReport();
    const fallbackRecord = { ...report.checks[0], verdict: report.checks[0].verdict.toUpperCase() };
    const text = renderTerminalText(
      renderReportText({ checks: [fallbackRecord], overall: report.overall }, { color: false }),
    );
    expect(text).toContain(DIAGNOSE_TEXT_HEADER.RENDERING_UNAVAILABLE);
    expect(text).toContain(DIAGNOSE_TEXT_DETAIL.RENDERING_UNAVAILABLE);
    expect(text).not.toContain(fallbackRecord.name);
    expect(text).not.toContain(fallbackRecord.verdict);
    expect(text).not.toContain(fallbackRecord.remediation);
  });
  it("renders a diagnosis heading for every supported verdict", () => {
    for (const branch of supportedTranslationBranches()) {
      expect(renderSingleCheckText(branch.check).split("\n")).toContain(
        `${SEVERITY_STYLE[BUCKET_SEVERITY[branch.check.bucket]].glyph} ${branch.header}`,
      );
    }
  });
  it("renders each canonical-checkout problem and remediation", () => {
    for (const { check, verdict } of canonicalCheckoutFailureCases()) {
      const lines = renderSingleCheckText(check).split("\n");
      expect(lines).toContain(
        `${SEVERITY_STYLE[BUCKET_SEVERITY[check.bucket]].glyph} ${DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_INVALID}`,
      );
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
  });
});

describe("the JSON report remains the complete machine schema", () => {
  it("preserves every check record field", () => {
    const report = sampleReport();
    expect(JSON.parse(renderTerminalText(renderReportJson(report))) as DiagnoseReport).toStrictEqual(report);
  });
});

describe("the text report renders through the styled-output primitive", () => {
  it("keys each heading glyph to its check bucket", () => {
    assertProperty(
      arbitraryReport(),
      (report) => {
        const headingLines = renderTerminalText(renderReportText(report, { color: false })).split("\n").filter((
          line: string,
        ) => !line.startsWith("  ") && !line.startsWith(DIAGNOSE_TEXT_OVERALL_LABEL));
        expect(headingLines).toHaveLength(report.checks.length);
        report.checks.forEach((check, index) => {
          expect(headingLines[index]?.startsWith(`${SEVERITY_STYLE[BUCKET_SEVERITY[check.bucket]].glyph} `)).toBe(
            true,
          );
        });
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
  it("keys the overall summary color to the overall verdict", () => {
    const chalk = new Chalk({ level: 1 });
    assertProperty(
      arbitraryReport(),
      (report) => {
        const text = renderTerminalText(renderReportText(report, { color: true }));
        const style = SEVERITY_STYLE[OVERALL_SEVERITY[report.overall]].style;
        expect(text).toContain(chalk[style](`${DIAGNOSE_TEXT_OVERALL_LABEL}: ${report.overall}`));
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});

describe("the concise diagnosis uses the shared styling primitive", () => {
  it("omits healthy and inapplicable check details while retaining the verdict", () => {
    const report = sampleReport();
    const output = renderTerminalText(renderReportConcise(report, { color: false }));
    expect(output).toContain(`${DIAGNOSE_TEXT_OVERALL_LABEL}: ${OVERALL_VERDICT.HEALTHY}`);
    expect(output).not.toContain(DIAGNOSE_TEXT_HEADER.SPX_INSTALLED);
    expect(output).not.toContain(DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_VALID);
    expect(output).not.toContain(DIAGNOSE_TEXT_HEADER.SESSION_STORE_CLEAN);
    expect(output).not.toContain(DIAGNOSE_TEXT_HEADER.AGENT_SESSION_HOOK_SKIPPED);
    expect(output).not.toContain(DIAGNOSE_TEXT_HEADER.MARKETPLACE_CHECKS_SKIPPED);
    expect(output).not.toContain(`${DIAGNOSE_TEXT_LABEL.PATH}:`);
  });

  it("renders only actionable headings with their bucket glyphs", () => {
    assertProperty(arbitraryReport(), (report) => {
      const output = renderTerminalText(renderReportConcise(report, { color: false }));
      for (const check of report.checks) {
        if (check.bucket === VERDICT_BUCKET.HEALTHY || check.bucket === VERDICT_BUCKET.NOT_APPLICABLE) continue;
        expect(output).toContain(SEVERITY_STYLE[BUCKET_SEVERITY[check.bucket]].glyph);
      }
      expect(output).toContain(`${DIAGNOSE_TEXT_OVERALL_LABEL}: ${report.overall}`);
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });
});
