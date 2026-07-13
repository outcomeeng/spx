import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { execa } from "execa";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_CONFIG_FILENAME } from "@/config/index";
import {
  DEFAULT_METHODOLOGY_SOURCE,
  DEFAULT_METHODOLOGY_VERSION,
  METHODOLOGY_CONFIG_FIELDS,
  METHODOLOGY_SECTION,
} from "@/config/methodology";
import { MARKETPLACE_INSTALL_VERDICT } from "@/domains/diagnose/checks/marketplace-install";
import { METHODOLOGY_CONTEXT_VERDICT } from "@/domains/diagnose/checks/methodology-context";
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
  OVERALL_VERDICT,
  type OverallVerdict,
  VERDICT_BUCKET,
  type VerdictBucket,
} from "@/domains/diagnose/types";
import { DIAGNOSE_CLI } from "@/interfaces/cli/diagnose";
import { CLI_PATH, CLI_TIMEOUTS_MS, NODE_EXECUTABLE } from "@testing/harnesses/constants";
import {
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

interface ReportCheckShape {
  readonly name: string;
  readonly verdict: string;
  readonly bucket: string;
  readonly readings: Record<string, string>;
  readonly remediation: string;
}

interface ReportShape {
  readonly checks: ReportCheckShape[];
  readonly overall: string;
}

async function runDiagnose(
  args: readonly string[],
  options?: { readonly env?: NodeJS.ProcessEnv; readonly cwd?: string },
): Promise<{ readonly stdout: string; readonly exitCode: number }> {
  const result = await execa(NODE_EXECUTABLE, [CLI_PATH, DIAGNOSE_CLI.COMMAND, ...args], {
    reject: false,
    env: options?.env,
    cwd: options?.cwd,
  });
  return { stdout: result.stdout, exitCode: result.exitCode ?? 1 };
}

function expectSchemaValidReport(report: ReportShape): void {
  expect(Object.values(OVERALL_VERDICT)).toContain(report.overall);
  for (const check of report.checks) {
    expect(Object.keys(check).sort((a, b) => a.localeCompare(b))).toEqual(
      [...CHECK_RECORD_FIELDS].sort((a, b) => a.localeCompare(b)),
    );
    expect(Object.values(CHECK_NAME)).toContain(check.name);
    expect(Object.values(VERDICT_BUCKET)).toContain(check.bucket);
  }
}

function foldedOverall(report: ReportShape): OverallVerdict {
  return foldOverallVerdict(report.checks.map((check) => check.bucket as VerdictBucket));
}

function expectExitCodeKeyedToFold(result: { readonly exitCode: number }, report: ReportShape): void {
  expect(result.exitCode).toBe(overallExitCode(foldedOverall(report)));
}

function checkByName(report: ReportShape, name: string): ReportCheckShape {
  const check = report.checks.find((candidate) => candidate.name === name);
  expect(check).toBeDefined();
  return check as ReportCheckShape;
}

describe("spx diagnose emits a schema-valid report and exits with the code keyed to the overall verdict", () => {
  it("runs the manifest's check, prints a conforming JSON report, and exits with the verdict's exit code", async () => {
    const { manifestPath, spxFloor } = await writeSpxReachabilityManifestFixture();

    const result = await runDiagnose([
      DIAGNOSE_CLI.MANIFEST_FLAG,
      manifestPath,
      DIAGNOSE_CLI.FORMAT_FLAG,
      DIAGNOSE_FORMAT.JSON,
    ]);

    const report = JSON.parse(result.stdout) as ReportShape;
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
      runDiagnose([DIAGNOSE_CLI.MANIFEST_FLAG, manifestPath]),
      runDiagnose([
        DIAGNOSE_CLI.MANIFEST_FLAG,
        manifestPath,
        DIAGNOSE_CLI.FORMAT_FLAG,
        DIAGNOSE_FORMAT.JSON,
      ]),
    ]);

    const report = JSON.parse(jsonRun.stdout) as ReportShape;
    const expectedOverall = foldedOverall(report);
    expectSchemaValidReport(report);
    expect(textRun.stdout).not.toContain(CHECK_NAME.SPX_REACHABILITY);
    expect(textRun.stdout).toContain(`${DIAGNOSE_TEXT_OVERALL_LABEL}: ${expectedOverall}`);
    expect(textRun.exitCode).toBe(overallExitCode(expectedOverall));
    expectExitCodeKeyedToFold(jsonRun, report);
  });

  it("runs every registered check and exits with the code keyed to the folded overall verdict", async () => {
    const manifestPath = await writeAllChecksManifest();

    const result = await runDiagnose([
      DIAGNOSE_CLI.MANIFEST_FLAG,
      manifestPath,
      DIAGNOSE_CLI.FORMAT_FLAG,
      DIAGNOSE_FORMAT.JSON,
    ]);

    const report = JSON.parse(result.stdout) as ReportShape;
    expectSchemaValidReport(report);
    expect(report.checks.map((check) => check.name)).toEqual(Object.values(CHECK_NAME));
    const methodologyCheck = report.checks.find((check) => check.name === CHECK_NAME.METHODOLOGY_CONTEXT);
    expect(Object.values(METHODOLOGY_CONTEXT_VERDICT)).toContain(methodologyCheck?.verdict);
    expect(methodologyCheck?.readings.configuredSource).toBe(DEFAULT_METHODOLOGY_SOURCE);
    expect(methodologyCheck?.readings.configuredVersion).toBe(DEFAULT_METHODOLOGY_VERSION);
    expect(report.overall).toBe(foldedOverall(report));
    expectExitCodeKeyedToFold(result, report);
  });

  it("rejects an unsupported --format value with a non-zero exit", async () => {
    const manifestPath = await writeSpxReachabilityManifest();
    const unsupportedFormat = `${DIAGNOSE_FORMAT.JSON}${DIAGNOSE_FORMAT.TEXT}`;

    const result = await runDiagnose([
      DIAGNOSE_CLI.MANIFEST_FLAG,
      manifestPath,
      DIAGNOSE_CLI.FORMAT_FLAG,
      unsupportedFormat,
    ]);

    expect(result.exitCode).not.toBe(0);
  });

  it("emits ANSI escapes in the text report when --color forces color at the descriptor boundary", async () => {
    const manifestPath = await writeSpxReachabilityManifest();

    const result = await runDiagnose([DIAGNOSE_CLI.MANIFEST_FLAG, manifestPath, DIAGNOSE_CLI.COLOR_FLAG]);

    expect(result.stdout).toContain(ansiEscape);
  });

  it("emits no ANSI escape in the default piped, non-TTY text report", async () => {
    const manifestPath = await writeSpxReachabilityManifest();

    const result = await runDiagnose([DIAGNOSE_CLI.MANIFEST_FLAG, manifestPath]);

    expect(result.stdout).not.toContain(ansiEscape);
  });

  it("emits no ANSI escape when --no-color disables color at the descriptor boundary", async () => {
    const manifestPath = await writeSpxReachabilityManifest();

    const result = await runDiagnose([DIAGNOSE_CLI.MANIFEST_FLAG, manifestPath, DIAGNOSE_CLI.NO_COLOR_FLAG]);

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

      const result = await runDiagnose([DIAGNOSE_CLI.FORMAT_FLAG, DIAGNOSE_FORMAT.JSON], { cwd });

      const report = JSON.parse(result.stdout) as ReportShape;
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

      const result = await runDiagnose([DIAGNOSE_CLI.FORMAT_FLAG, DIAGNOSE_FORMAT.JSON], { cwd });

      const report = JSON.parse(result.stdout) as ReportShape;
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

      const result = await runDiagnose([DIAGNOSE_CLI.FORMAT_FLAG, DIAGNOSE_FORMAT.JSON], { cwd });

      const report = JSON.parse(result.stdout) as ReportShape;
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

      const result = await runDiagnose([
        DIAGNOSE_CLI.MANIFEST_FLAG,
        manifestPath,
        DIAGNOSE_CLI.FORMAT_FLAG,
        DIAGNOSE_FORMAT.JSON,
      ], { cwd });

      const report = JSON.parse(result.stdout) as ReportShape;
      expectSchemaValidReport(report);
      expect(report.checks.map((check) => check.name)).toEqual([CHECK_NAME.SPX_REACHABILITY]);
      expect(report.overall).toBe(foldedOverall(report));
      expectExitCodeKeyedToFold(result, report);
    });
  });

  it("runs bare with no manifest and no diagnose config, rendering every registered check with a verdict-keyed exit", async () => {
    await withTempDir("diagnose-bare", async (cwd) => {
      const result = await runDiagnose([DIAGNOSE_CLI.FORMAT_FLAG, DIAGNOSE_FORMAT.JSON], { cwd });

      const report = JSON.parse(result.stdout) as ReportShape;
      const textRun = await runDiagnose([], { cwd });
      const spxRecord = checkByName(report, CHECK_NAME.SPX_REACHABILITY);
      const sessionEnvironmentRecord = checkByName(report, CHECK_NAME.SESSION_ENVIRONMENT);
      const worktreePoolRecord = checkByName(report, CHECK_NAME.WORKTREE_POOL);
      const sessionStoreRecord = checkByName(report, CHECK_NAME.SESSION_STORE);
      const marketplaceRecord = checkByName(report, CHECK_NAME.MARKETPLACE_INSTALL);
      expectSchemaValidReport(report);
      expect(new Set(report.checks.map((check) => check.name))).toEqual(new Set(Object.values(CHECK_NAME)));
      expect([SPX_REACHABILITY_VERDICT.PRESENT, SPX_REACHABILITY_VERDICT.UNREACHABLE]).toContain(spxRecord.verdict);
      expect(spxRecord.readings.floor).toBe(SPX_REACHABILITY_READING_VALUE.ABSENT_FLOOR);
      expect(Object.values(SESSION_ENVIRONMENT_VERDICT)).toContain(sessionEnvironmentRecord.verdict);
      expect(Object.values(WORKTREE_POOL_VERDICT)).toContain(worktreePoolRecord.verdict);
      expect(Object.values(SESSION_STORE_VERDICT)).toContain(sessionStoreRecord.verdict);
      expect(marketplaceRecord.verdict).toBe(MARKETPLACE_INSTALL_VERDICT.NOT_APPLICABLE);
      expect(report.overall).toBe(foldedOverall(report));
      expect(textRun.stdout).toContain(`${DIAGNOSE_TEXT_OVERALL_LABEL}: ${foldedOverall(report)}`);
      expectExitCodeKeyedToFold(result, report);
      expect(textRun.exitCode).toBe(result.exitCode);
    });
  });

  it("emits no ANSI escape when a non-empty NO_COLOR environment variable disables color", async () => {
    const manifestPath = await writeSpxReachabilityManifest();

    const result = await runDiagnose([DIAGNOSE_CLI.MANIFEST_FLAG, manifestPath], {
      env: { ...process.env, NO_COLOR: "1" },
    });

    expect(result.stdout).not.toContain(ansiEscape);
  });
});
