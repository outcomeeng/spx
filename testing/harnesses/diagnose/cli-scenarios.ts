import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { DEFAULT_CONFIG_FILENAME } from "@/config/index";
import {
  DEFAULT_METHODOLOGY_SOURCE,
  DEFAULT_METHODOLOGY_VERSION,
  METHODOLOGY_CONFIG_FIELDS,
  METHODOLOGY_SECTION,
  methodologyVersionIntent,
} from "@/config/methodology";
import { MARKETPLACE_INSTALL_VERDICT } from "@/domains/diagnose/checks/marketplace-install";
import {
  METHODOLOGY_CONTEXT_READING_VALUE,
  METHODOLOGY_CONTEXT_VERDICT,
} from "@/domains/diagnose/checks/methodology-context";
import { SESSION_ENVIRONMENT_VERDICT } from "@/domains/diagnose/checks/session-environment";
import { SESSION_STORE_VERDICT } from "@/domains/diagnose/checks/session-store";
import { SPX_REACHABILITY_READING_VALUE, SPX_REACHABILITY_VERDICT } from "@/domains/diagnose/checks/spx-reachability";
import { WORKTREE_POOL_VERDICT } from "@/domains/diagnose/checks/worktree-pool";
import { DIAGNOSE_CONFIG_FIELDS, DIAGNOSE_SECTION } from "@/domains/diagnose/config";
import { foldOverallVerdict, overallExitCode } from "@/domains/diagnose/fold";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { DIAGNOSE_FORMAT, DIAGNOSE_TEXT_OVERALL_LABEL } from "@/domains/diagnose/report";
import {
  CHECK_RECORD_FIELDS,
  type CheckRecord,
  type DiagnoseReport,
  OVERALL_VERDICT,
  type OverallVerdict,
  VERDICT_BUCKET,
} from "@/domains/diagnose/types";
import { DIAGNOSE_CLI } from "@/interfaces/cli/diagnose";
import { CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import {
  isolatedDiagnoseEnvironment,
  runDiagnoseCli,
  writeAllChecksManifest,
  writeSpxReachabilityManifest,
  writeSpxReachabilityManifestFixture,
} from "@testing/harnesses/diagnose/cli";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

// Every test here spawns the CLI as a cold `node bin/spx.js` subprocess running real probes;
// under test-suite subprocess contention that exceeds the 30s default, so the whole file runs
// under the batched-E2E guardrail.
vi.setConfig({ testTimeout: CLI_TIMEOUTS_MS.E2E_BATCH });

// The ANSI escape (ESC) code point; built here to avoid an invisible control byte in source.
const escCharCode = 27;
const ansiEscape = String.fromCodePoint(escCharCode);

function expectSchemaValidReport(report: DiagnoseReport): void {
  expect(Object.values(OVERALL_VERDICT)).toContain(report.overall);
  for (const check of report.checks) {
    expect(Object.keys(check).sort((a, b) => a.localeCompare(b))).toEqual(
      [...CHECK_RECORD_FIELDS].sort((a, b) => a.localeCompare(b)),
    );
    expect(Object.values(CHECK_NAME)).toContain(check.name);
    expect(Object.values(VERDICT_BUCKET)).toContain(check.bucket);
  }
}

function foldedOverall(report: DiagnoseReport): OverallVerdict {
  return foldOverallVerdict(report.checks.map((check) => check.bucket));
}

function expectExitCodeKeyedToFold(result: { readonly exitCode: number }, report: DiagnoseReport): void {
  expect(result.exitCode).toBe(overallExitCode(foldedOverall(report)));
}

function checkByName(report: DiagnoseReport, name: string): CheckRecord {
  const check = report.checks.find((candidate) => candidate.name === name);
  if (check === undefined) throw new Error(name);
  return check;
}

export function registerDiagnoseCliScenarios(): void {
  describe("spx diagnose emits a schema-valid report and exits with the code keyed to the overall verdict", () => {
    it("runs the manifest's check, prints a conforming JSON report, and exits with the verdict's exit code", async () => {
      const { manifestPath, spxFloor } = await writeSpxReachabilityManifestFixture();

      const result = await runDiagnoseCli([
        DIAGNOSE_CLI.MANIFEST_FLAG,
        manifestPath,
        DIAGNOSE_CLI.FORMAT_FLAG,
        DIAGNOSE_FORMAT.JSON,
      ]);

      const report = JSON.parse(result.stdout) as DiagnoseReport;
      expectSchemaValidReport(report);
      expect(report.checks).toHaveLength(1);
      expect(report.checks[0].name).toBe(CHECK_NAME.SPX_REACHABILITY);
      expect(report.checks[0].readings.floor).toBe(spxFloor);
      expect(report.overall).toBe(foldedOverall(report));
      expectExitCodeKeyedToFold(result, report);
    });

    it("defaults to the text format and carries the same overall verdict and exit code as the JSON report", async () => {
      const manifestPath = await writeSpxReachabilityManifest();

      const [textRun, jsonRun] = await Promise.all([
        runDiagnoseCli([DIAGNOSE_CLI.MANIFEST_FLAG, manifestPath]),
        runDiagnoseCli([
          DIAGNOSE_CLI.MANIFEST_FLAG,
          manifestPath,
          DIAGNOSE_CLI.FORMAT_FLAG,
          DIAGNOSE_FORMAT.JSON,
        ]),
      ]);

      const report = JSON.parse(jsonRun.stdout) as DiagnoseReport;
      const expectedOverall = foldedOverall(report);
      expectSchemaValidReport(report);
      expect(textRun.stdout).not.toContain(CHECK_NAME.SPX_REACHABILITY);
      expect(textRun.stdout).toContain(`${DIAGNOSE_TEXT_OVERALL_LABEL}: ${expectedOverall}`);
      expect(textRun.exitCode).toBe(overallExitCode(expectedOverall));
      expectExitCodeKeyedToFold(jsonRun, report);
    });

    it("runs every registered check and exits with the code keyed to the folded overall verdict", async () => {
      const manifestPath = await writeAllChecksManifest();

      const result = await runDiagnoseCli([
        DIAGNOSE_CLI.MANIFEST_FLAG,
        manifestPath,
        DIAGNOSE_CLI.FORMAT_FLAG,
        DIAGNOSE_FORMAT.JSON,
      ]);

      const report = JSON.parse(result.stdout) as DiagnoseReport;
      expectSchemaValidReport(report);
      expect(report.checks.map((check) => check.name)).toEqual(Object.values(CHECK_NAME));
      const methodologyCheck = report.checks.find((check) => check.name === CHECK_NAME.METHODOLOGY_CONTEXT);
      const marketplaceCheck = report.checks.find((check) => check.name === CHECK_NAME.MARKETPLACE_INSTALL);
      expect(Object.values(METHODOLOGY_CONTEXT_VERDICT)).toContain(methodologyCheck?.verdict);
      expect(methodologyCheck?.readings.configuredSource).toBe(DEFAULT_METHODOLOGY_SOURCE);
      expect(methodologyCheck?.readings.configuredVersion).toBe(DEFAULT_METHODOLOGY_VERSION);
      expect(marketplaceCheck?.readings.configured).toBe(String(true));
      expect(marketplaceCheck?.verdict).not.toBe(MARKETPLACE_INSTALL_VERDICT.NOT_APPLICABLE);
      expect(report.overall).toBe(foldedOverall(report));
      expectExitCodeKeyedToFold(result, report);
    });

    it("rejects an unsupported --format value with a non-zero exit", async () => {
      const manifestPath = await writeSpxReachabilityManifest();
      const unsupportedFormat = `${DIAGNOSE_FORMAT.JSON}${DIAGNOSE_FORMAT.TEXT}`;

      const result = await runDiagnoseCli([
        DIAGNOSE_CLI.MANIFEST_FLAG,
        manifestPath,
        DIAGNOSE_CLI.FORMAT_FLAG,
        unsupportedFormat,
      ]);

      expect(result.exitCode).not.toBe(0);
    });

    it("emits ANSI escapes in the text report when --color forces color at the descriptor boundary", async () => {
      const manifestPath = await writeSpxReachabilityManifest();

      const result = await runDiagnoseCli([DIAGNOSE_CLI.MANIFEST_FLAG, manifestPath, DIAGNOSE_CLI.COLOR_FLAG]);

      expect(result.stdout).toContain(ansiEscape);
    });

    it("emits no ANSI escape in the default piped, non-TTY text report", async () => {
      const manifestPath = await writeSpxReachabilityManifest();

      const result = await runDiagnoseCli([DIAGNOSE_CLI.MANIFEST_FLAG, manifestPath]);

      expect(result.stdout).not.toContain(ansiEscape);
    });

    it("emits no ANSI escape when --no-color disables color at the descriptor boundary", async () => {
      const manifestPath = await writeSpxReachabilityManifest();

      const result = await runDiagnoseCli([DIAGNOSE_CLI.MANIFEST_FLAG, manifestPath, DIAGNOSE_CLI.NO_COLOR_FLAG]);

      expect(result.stdout).not.toContain(ansiEscape);
    });

    it("resolves the check set and floor from the spx.config diagnose section when no --manifest is supplied", async () => {
      await withTempDir("diagnose-config", async (cwd) => {
        // The configured check set restricts the run to one check, and a configured floor makes
        // spx-reachability perform a floor comparison — so its verdict is never the no-floor `present`
        // that bare mode yields. Both signals prove the config diagnose section was resolved, without
        // assuming whether spx happens to be on PATH in the test environment.
        const expectedFloor = "0.0.0";
        const config = [
          `${DIAGNOSE_SECTION}:`,
          `  ${DIAGNOSE_CONFIG_FIELDS.SPX_FLOOR}: "${expectedFloor}"`,
          `  ${DIAGNOSE_CONFIG_FIELDS.CHECKS}: ["${CHECK_NAME.SPX_REACHABILITY}"]`,
        ].join("\n");
        await writeFile(join(cwd, DEFAULT_CONFIG_FILENAME), `${config}\n`);

        const result = await runDiagnoseCli([DIAGNOSE_CLI.FORMAT_FLAG, DIAGNOSE_FORMAT.JSON], { cwd });

        const report = JSON.parse(result.stdout) as DiagnoseReport;
        expectSchemaValidReport(report);
        expect(report.checks.map((check) => check.name)).toEqual([CHECK_NAME.SPX_REACHABILITY]);
        expect(report.checks[0].readings.floor).toBe(expectedFloor);
        expect(report.overall).toBe(foldedOverall(report));
        expectExitCodeKeyedToFold(result, report);
        expect(report.checks[0].verdict).not.toBe(SPX_REACHABILITY_VERDICT.PRESENT);
      });
    });

    it("does not validate methodology config when selected diagnose checks do not consume it", async () => {
      await withTempDir("diagnose-config-methodology-unused", async (cwd) => {
        const expectedFloor = "0.0.0";
        const invalidMethodologySource = "../not-a-methodology-source";
        const config = [
          `${DIAGNOSE_SECTION}:`,
          `  ${DIAGNOSE_CONFIG_FIELDS.SPX_FLOOR}: "${expectedFloor}"`,
          `  ${DIAGNOSE_CONFIG_FIELDS.CHECKS}: ["${CHECK_NAME.SPX_REACHABILITY}"]`,
          `${METHODOLOGY_SECTION}:`,
          `  ${METHODOLOGY_CONFIG_FIELDS.SOURCE}: "${invalidMethodologySource}"`,
          `  ${METHODOLOGY_CONFIG_FIELDS.VERSION}: "${DEFAULT_METHODOLOGY_VERSION}"`,
        ].join("\n");
        await writeFile(join(cwd, DEFAULT_CONFIG_FILENAME), `${config}\n`);

        const result = await runDiagnoseCli([DIAGNOSE_CLI.FORMAT_FLAG, DIAGNOSE_FORMAT.JSON], { cwd });

        const report = JSON.parse(result.stdout) as DiagnoseReport;
        expectSchemaValidReport(report);
        expect(report.checks.map((check) => check.name)).toEqual([CHECK_NAME.SPX_REACHABILITY]);
        expect(report.checks[0].readings.floor).toBe(expectedFloor);
        expectExitCodeKeyedToFold(result, report);
      });
    });

    it("reports invalid methodology config through methodology-context while default diagnose checks still run", async () => {
      await withTempDir("diagnose-config-methodology-invalid-default", async (cwd) => {
        const invalidMethodologySource = "../not-a-methodology-source";
        const config = [
          `${METHODOLOGY_SECTION}:`,
          `  ${METHODOLOGY_CONFIG_FIELDS.SOURCE}: "${invalidMethodologySource}"`,
          `  ${METHODOLOGY_CONFIG_FIELDS.VERSION}: "${DEFAULT_METHODOLOGY_VERSION}"`,
        ].join("\n");
        await writeFile(join(cwd, DEFAULT_CONFIG_FILENAME), `${config}\n`);

        const result = await runDiagnoseCli([DIAGNOSE_CLI.FORMAT_FLAG, DIAGNOSE_FORMAT.JSON], { cwd });

        const report = JSON.parse(result.stdout) as DiagnoseReport;
        const methodologyCheck = checkByName(report, CHECK_NAME.METHODOLOGY_CONTEXT);
        expectSchemaValidReport(report);
        expect(new Set(report.checks.map((check) => check.name))).toEqual(new Set(Object.values(CHECK_NAME)));
        expect(methodologyCheck.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.UNKNOWN);
        expect(methodologyCheck.bucket).toBe(VERDICT_BUCKET.UNKNOWN);
        expect(methodologyCheck.readings.configured).toBe(String(true));
        expectExitCodeKeyedToFold(result, report);
      });
    });

    it("runs from a supplied --manifest even when the diagnose config section is malformed — manifest takes precedence", async () => {
      await withTempDir("diagnose-manifest-precedence", async (cwd) => {
        // A diagnose section the config descriptor rejects. A manifest run must
        // bypass config resolution entirely, so this malformed section never derails the diagnosis.
        const malformed = [`${DIAGNOSE_SECTION}:`, `  ${DIAGNOSE_CONFIG_FIELDS.CHECKS}: [42]`].join("\n");
        await writeFile(join(cwd, DEFAULT_CONFIG_FILENAME), `${malformed}\n`);
        const manifestPath = await writeSpxReachabilityManifest();

        const result = await runDiagnoseCli([
          DIAGNOSE_CLI.MANIFEST_FLAG,
          manifestPath,
          DIAGNOSE_CLI.FORMAT_FLAG,
          DIAGNOSE_FORMAT.JSON,
        ], { cwd });

        const report = JSON.parse(result.stdout) as DiagnoseReport;
        expectSchemaValidReport(report);
        expect(report.checks.map((check) => check.name)).toEqual([CHECK_NAME.SPX_REACHABILITY]);
        expect(report.overall).toBe(foldedOverall(report));
        expectExitCodeKeyedToFold(result, report);
      });
    });

    it("runs bare with no manifest and no diagnose config, rendering every registered check with a verdict-keyed exit", async () => {
      await withTempDir("diagnose-bare", async (cwd) => {
        const environment = isolatedDiagnoseEnvironment(cwd);
        const result = await runDiagnoseCli(
          [DIAGNOSE_CLI.FORMAT_FLAG, DIAGNOSE_FORMAT.JSON],
          { cwd, env: environment },
        );

        const report = JSON.parse(result.stdout) as DiagnoseReport;
        const textRun = await runDiagnoseCli([], { cwd, env: environment });
        const spxRecord = checkByName(report, CHECK_NAME.SPX_REACHABILITY);
        const sessionEnvironmentRecord = checkByName(report, CHECK_NAME.SESSION_ENVIRONMENT);
        const worktreePoolRecord = checkByName(report, CHECK_NAME.WORKTREE_POOL);
        const sessionStoreRecord = checkByName(report, CHECK_NAME.SESSION_STORE);
        const marketplaceRecord = checkByName(report, CHECK_NAME.MARKETPLACE_INSTALL);
        const methodologyRecord = checkByName(report, CHECK_NAME.METHODOLOGY_CONTEXT);
        expectSchemaValidReport(report);
        expect(new Set(report.checks.map((check) => check.name))).toEqual(new Set(Object.values(CHECK_NAME)));
        expect([SPX_REACHABILITY_VERDICT.PRESENT, SPX_REACHABILITY_VERDICT.UNREACHABLE]).toContain(spxRecord.verdict);
        expect(spxRecord.readings.floor).toBe(SPX_REACHABILITY_READING_VALUE.ABSENT_FLOOR);
        expect(sessionEnvironmentRecord.verdict).toBe(SESSION_ENVIRONMENT_VERDICT.UNKNOWN);
        expect(sessionEnvironmentRecord.readings).toEqual({
          hook: String(false),
          identity: String(false),
          claimed: String(false),
        });
        expect(worktreePoolRecord.verdict).toBe(WORKTREE_POOL_VERDICT.UNKNOWN);
        expect(worktreePoolRecord.readings).toEqual({
          bare: String(false),
          linked: String(false),
          mainCheckoutPath: "",
          defaultBranch: "",
          mainCheckoutBranch: "",
          mainCheckoutBranchRead: String(false),
          running: String(0),
          free: String(0),
        });
        expect(sessionStoreRecord.verdict).toBe(SESSION_STORE_VERDICT.UNKNOWN);
        expect(sessionStoreRecord.readings.orphaned).toBe(String(0));
        expect(marketplaceRecord.verdict).toBe(MARKETPLACE_INSTALL_VERDICT.NOT_APPLICABLE);
        expect(marketplaceRecord.readings).toEqual({
          configured: String(false),
          surface: String(false),
          unregistered: String(false),
          drifted: String(false),
        });
        expect(methodologyRecord.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.UNAVAILABLE);
        expect(methodologyRecord.readings).toEqual({
          configured: String(true),
          configuredSource: DEFAULT_METHODOLOGY_SOURCE,
          configuredVersion: DEFAULT_METHODOLOGY_VERSION,
          observedSource: METHODOLOGY_CONTEXT_READING_VALUE.ABSENT,
          observedVersion: METHODOLOGY_CONTEXT_READING_VALUE.ABSENT,
          versionIntent: methodologyVersionIntent(DEFAULT_METHODOLOGY_VERSION),
          trackedSpecTree: String(false),
        });
        expect(report.overall).toBe(foldedOverall(report));
        expect(textRun.stdout).toContain(`${DIAGNOSE_TEXT_OVERALL_LABEL}: ${foldedOverall(report)}`);
        expectExitCodeKeyedToFold(result, report);
        expect(textRun.exitCode).toBe(result.exitCode);
      });
    });

    it("emits no ANSI escape when a non-empty NO_COLOR environment variable disables color", async () => {
      const manifestPath = await writeSpxReachabilityManifest();

      const result = await runDiagnoseCli([DIAGNOSE_CLI.MANIFEST_FLAG, manifestPath], {
        env: { ...process.env, NO_COLOR: "1" },
      });

      expect(result.stdout).not.toContain(ansiEscape);
    });
  });
}
