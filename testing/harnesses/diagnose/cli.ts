/** Assertion harness for the `spx diagnose` command boundary. */

import fc from "fast-check";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { execa } from "execa";
import { expect, vi } from "vitest";

import { DEFAULT_CONFIG_FILENAME } from "@/config/index";
import {
  DEFAULT_METHODOLOGY_SOURCE,
  DEFAULT_METHODOLOGY_VERSION,
} from "@/config/methodology";
import { MARKETPLACE_INSTALL_VERDICT } from "@/domains/diagnose/checks/marketplace-install";
import { METHODOLOGY_CONTEXT_VERDICT } from "@/domains/diagnose/checks/methodology-context";
import { SESSION_ENVIRONMENT_VERDICT } from "@/domains/diagnose/checks/session-environment";
import { SESSION_STORE_VERDICT } from "@/domains/diagnose/checks/session-store";
import {
  SPX_REACHABILITY_READING_VALUE,
  SPX_REACHABILITY_VERDICT,
} from "@/domains/diagnose/checks/spx-reachability";
import { WORKTREE_POOL_VERDICT } from "@/domains/diagnose/checks/worktree-pool";
import { DIAGNOSE_CONFIG_FIELDS, DIAGNOSE_SECTION } from "@/domains/diagnose/config";
import { foldOverallVerdict, overallExitCode, VERDICT_EXIT_CODE } from "@/domains/diagnose/fold";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import {
  DIAGNOSE_TEXT_HEADER,
  DIAGNOSE_TEXT_HINT,
  DIAGNOSE_TEXT_LABEL,
  DIAGNOSE_TEXT_OVERALL_LABEL,
} from "@/domains/diagnose/report";
import {
  CHECK_RECORD_FIELDS,
  OVERALL_VERDICT,
  type OverallVerdict,
  VERDICT_BUCKET,
  type VerdictBucket,
} from "@/domains/diagnose/types";
import { DIAGNOSE_CLI } from "@/interfaces/cli/diagnose";
import {
  arbitraryManifestFacts,
  arbitraryNameToken,
  arbitrarySpxFloor,
  manifestJson,
  sampleDiagnoseTestValue,
} from "@testing/generators/diagnose/manifest";
import { CLI_PATH, CLI_TIMEOUTS_MS, NODE_EXECUTABLE } from "@testing/harnesses/constants";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

vi.setConfig({ testTimeout: CLI_TIMEOUTS_MS.E2E_BATCH });

export interface DiagnoseCliRun {
  readonly stdout: string;
  readonly exitCode: number;
}

export async function runDiagnoseCli(
  args: readonly string[],
  options?: { readonly env?: NodeJS.ProcessEnv; readonly cwd?: string },
): Promise<DiagnoseCliRun> {
  const result = await execa(NODE_EXECUTABLE, [CLI_PATH, DIAGNOSE_CLI.COMMAND, ...args], {
    reject: false,
    extendEnv: options?.env === undefined,
    env: options?.env,
    cwd: options?.cwd,
  });
  return { stdout: result.stdout, exitCode: result.exitCode ?? 1 };
}

export function isolatedDiagnoseEnvironment(home: string): NodeJS.ProcessEnv {
  return {
    HOME: home,
    PATH: process.env.PATH,
  };
}

export interface SpxReachabilityManifestFixture {
  readonly manifestPath: string;
  readonly spxFloor: string;
}

async function diagnoseTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "diagnose-cli-"));
}

export async function writeSpxReachabilityManifestFixture(): Promise<SpxReachabilityManifestFixture> {
  const [floor] = fc.sample(arbitrarySpxFloor(), { numRuns: 1, seed: 7 });
  const dir = await diagnoseTempDir();
  const manifestPath = join(dir, "diagnose.json");
  await writeFile(manifestPath, JSON.stringify({
    checks: [CHECK_NAME.SPX_REACHABILITY],
    spx_floor: floor,
  }));
  return { manifestPath, spxFloor: floor };
}

export async function writeSpxReachabilityManifest(): Promise<string> {
  const { manifestPath } = await writeSpxReachabilityManifestFixture();
  return manifestPath;
}

export async function writeAllChecksManifest(): Promise<string> {
  const [facts] = fc.sample(arbitraryManifestFacts(), { numRuns: 1, seed: 7 });
  const dir = await diagnoseTempDir();
  const manifestPath = join(dir, "diagnose.json");
  await writeFile(manifestPath, manifestJson({
    ...facts,
    checks: Object.values(CHECK_NAME),
    methodologySource: DEFAULT_METHODOLOGY_SOURCE,
    methodologyVersion: DEFAULT_METHODOLOGY_VERSION,
  }));
  return manifestPath;
}

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

interface DiagnoseRun {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

async function runDiagnose(
  args: readonly string[],
  options?: { readonly env?: NodeJS.ProcessEnv; readonly cwd?: string },
): Promise<DiagnoseRun> {
  const result = await execa(NODE_EXECUTABLE, [CLI_PATH, DIAGNOSE_CLI.COMMAND, ...args], {
    reject: false,
    env: options?.env,
    cwd: options?.cwd,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode ?? 1,
  };
}

async function withSpxReachabilityManifest<T>(
  callback: (manifestPath: string, spxFloor: string) => Promise<T>,
): Promise<T> {
  return withTempDir("diagnose-cli-", async (productDir) => {
    const spxFloor = sampleDiagnoseTestValue(arbitrarySpxFloor());
    const manifestPath = join(productDir, "diagnose.json");
    await writeFile(manifestPath, JSON.stringify({
      checks: [CHECK_NAME.SPX_REACHABILITY],
      spx_floor: spxFloor,
    }));
    return callback(manifestPath, spxFloor);
  });
}

async function withAllChecksManifest<T>(callback: (manifestPath: string) => Promise<T>): Promise<T> {
  return withTempDir("diagnose-cli-", async (productDir) => {
    const manifestPath = join(productDir, "diagnose.json");
    await writeFile(manifestPath, manifestJson({
      ...sampleDiagnoseTestValue(arbitraryManifestFacts()),
      checks: Object.values(CHECK_NAME),
      methodologySource: DEFAULT_METHODOLOGY_SOURCE,
      methodologyVersion: DEFAULT_METHODOLOGY_VERSION,
    }));
    return callback(manifestPath);
  });
}

function parseReport(run: DiagnoseRun): ReportShape {
  return JSON.parse(run.stdout) as ReportShape;
}

function expectSchemaValidReport(report: ReportShape): void {
  expect(Object.values(OVERALL_VERDICT)).toContain(report.overall);
  for (const check of report.checks) {
    expect(Object.keys(check).sort((left, right) => left.localeCompare(right))).toEqual(
      [...CHECK_RECORD_FIELDS].sort((left, right) => left.localeCompare(right)),
    );
    expect(Object.values(CHECK_NAME)).toContain(check.name);
    expect(Object.values(VERDICT_BUCKET)).toContain(check.bucket);
  }
}

function foldedOverall(report: ReportShape): OverallVerdict {
  return foldOverallVerdict(report.checks.map((check) => check.bucket as VerdictBucket));
}

function expectExitCodeKeyedToFold(run: DiagnoseRun, report: ReportShape): void {
  expect(run.exitCode).toBe(overallExitCode(foldedOverall(report)));
}

function checkByName(report: ReportShape, name: string): ReportCheckShape {
  const check = report.checks.find((candidate) => candidate.name === name);
  expect(check).toBeDefined();
  return check as ReportCheckShape;
}

export async function assertManifestDiagnoseJson(): Promise<void> {
  await withSpxReachabilityManifest(async (manifestPath, spxFloor) => {
    const run = await runDiagnose([
      DIAGNOSE_CLI.MANIFEST_FLAG,
      manifestPath,
      DIAGNOSE_CLI.JSON_FLAG,
    ]);
    const report = parseReport(run);
    expectSchemaValidReport(report);
    expect(report.checks).toHaveLength(1);
    expect(report.checks[0]?.name).toBe(CHECK_NAME.SPX_REACHABILITY);
    expect(report.checks[0]?.readings.floor).toBe(spxFloor);
    expect(report.overall).toBe(foldedOverall(report));
    expectExitCodeKeyedToFold(run, report);
  });
}

export async function assertDefaultDiagnoseIsConcise(): Promise<void> {
  await withSpxReachabilityManifest(async (manifestPath) => {
    const concise = await runDiagnose([DIAGNOSE_CLI.MANIFEST_FLAG, manifestPath]);
    const machine = await runDiagnose([
      DIAGNOSE_CLI.MANIFEST_FLAG,
      manifestPath,
      DIAGNOSE_CLI.JSON_FLAG,
    ]);
    const report = parseReport(machine);
    const spxCheck = checkByName(report, CHECK_NAME.SPX_REACHABILITY);
    expect(concise.stdout).toContain(`${DIAGNOSE_TEXT_OVERALL_LABEL}: ${report.overall}`);
    expect(concise.stdout).toContain(DIAGNOSE_TEXT_LABEL.VERSION);
    expect(concise.stdout).toContain(spxCheck.readings.version);
    expect(concise.stdout).toContain(DIAGNOSE_TEXT_HINT.VERBOSE);
    expect(concise.stdout).toContain(DIAGNOSE_TEXT_HINT.JSON);
    expect(concise.stdout).not.toContain(CHECK_NAME.SPX_REACHABILITY);
    expect(concise.stdout).not.toContain(CHECK_RECORD_FIELDS[3]);
    expect(concise.exitCode).toBe(machine.exitCode);
  });
}

export async function assertVerboseDiagnoseShowsAllFacts(): Promise<void> {
  await withSpxReachabilityManifest(async (manifestPath) => {
    const verbose = await runDiagnose([
      DIAGNOSE_CLI.MANIFEST_FLAG,
      manifestPath,
      DIAGNOSE_CLI.VERBOSE_FLAG,
    ]);
    const machine = await runDiagnose([
      DIAGNOSE_CLI.MANIFEST_FLAG,
      manifestPath,
      DIAGNOSE_CLI.JSON_FLAG,
    ]);
    const report = parseReport(machine);
    const spxCheck = checkByName(report, CHECK_NAME.SPX_REACHABILITY);
    expect(verbose.stdout).toContain(DIAGNOSE_TEXT_HEADER.SPX_INSTALLED);
    for (const reading of Object.values(spxCheck.readings)) {
      expect(verbose.stdout).toContain(reading);
    }
    expect(verbose.stdout).toContain(spxCheck.remediation);
    expect(verbose.stdout).toContain(`${DIAGNOSE_TEXT_OVERALL_LABEL}: ${report.overall}`);
    expect(verbose.exitCode).toBe(machine.exitCode);
  });
}

export async function assertOutputModeMapping(): Promise<void> {
  await withAllChecksManifest(async (manifestPath) => {
    const concise = await runDiagnose([DIAGNOSE_CLI.MANIFEST_FLAG, manifestPath]);
    const verbose = await runDiagnose([
      DIAGNOSE_CLI.MANIFEST_FLAG,
      manifestPath,
      DIAGNOSE_CLI.VERBOSE_FLAG,
    ]);
    const machine = await runDiagnose([
      DIAGNOSE_CLI.MANIFEST_FLAG,
      manifestPath,
      DIAGNOSE_CLI.JSON_FLAG,
    ]);
    const report = parseReport(machine);
    expectSchemaValidReport(report);
    expect(report.checks.map((check) => check.name)).toEqual(Object.values(CHECK_NAME));
    expect(concise.stdout).not.toBe(verbose.stdout);
    expect(concise.exitCode).toBe(machine.exitCode);
    expect(verbose.exitCode).toBe(machine.exitCode);
    expectExitCodeKeyedToFold(machine, report);
  });
}

export async function assertConfigDiagnoseJson(): Promise<void> {
  await withTempDir("diagnose-config-", async (productDir) => {
    const spxFloor = sampleDiagnoseTestValue(arbitrarySpxFloor());
    await writeFile(join(productDir, DEFAULT_CONFIG_FILENAME), [
      `${DIAGNOSE_SECTION}:`,
      `  ${DIAGNOSE_CONFIG_FIELDS.SPX_FLOOR}: "${spxFloor}"`,
      `  ${DIAGNOSE_CONFIG_FIELDS.CHECKS}: ["${CHECK_NAME.SPX_REACHABILITY}"]`,
    ].join("\n"));
    const run = await runDiagnose([DIAGNOSE_CLI.JSON_FLAG], { cwd: productDir });
    const report = parseReport(run);
    expectSchemaValidReport(report);
    expect(report.checks.map((check) => check.name)).toEqual([CHECK_NAME.SPX_REACHABILITY]);
    expect(report.checks[0]?.readings.floor).toBe(spxFloor);
    expect(report.checks[0]?.verdict).not.toBe(SPX_REACHABILITY_VERDICT.PRESENT);
    expectExitCodeKeyedToFold(run, report);
  });
}

export async function assertBareDiagnoseJson(): Promise<void> {
  await withTempDir("diagnose-bare-", async (productDir) => {
    const run = await runDiagnose([DIAGNOSE_CLI.JSON_FLAG], { cwd: productDir });
    const report = parseReport(run);
    const spxRecord = checkByName(report, CHECK_NAME.SPX_REACHABILITY);
    expectSchemaValidReport(report);
    expect(new Set(report.checks.map((check) => check.name))).toEqual(new Set(Object.values(CHECK_NAME)));
    expect([SPX_REACHABILITY_VERDICT.PRESENT, SPX_REACHABILITY_VERDICT.UNREACHABLE]).toContain(spxRecord.verdict);
    expect(spxRecord.readings.floor).toBe(SPX_REACHABILITY_READING_VALUE.ABSENT_FLOOR);
    expect(Object.values(SESSION_ENVIRONMENT_VERDICT)).toContain(
      checkByName(report, CHECK_NAME.SESSION_ENVIRONMENT).verdict,
    );
    expect(Object.values(WORKTREE_POOL_VERDICT)).toContain(checkByName(report, CHECK_NAME.WORKTREE_POOL).verdict);
    expect(Object.values(SESSION_STORE_VERDICT)).toContain(checkByName(report, CHECK_NAME.SESSION_STORE).verdict);
    expect(checkByName(report, CHECK_NAME.MARKETPLACE_INSTALL).verdict).toBe(
      MARKETPLACE_INSTALL_VERDICT.NOT_APPLICABLE,
    );
    expect(Object.values(METHODOLOGY_CONTEXT_VERDICT)).toContain(
      checkByName(report, CHECK_NAME.METHODOLOGY_CONTEXT).verdict,
    );
    expectExitCodeKeyedToFold(run, report);
  });
}

export async function assertManifestPrecedesMalformedConfig(): Promise<void> {
  await withTempDir("diagnose-manifest-precedence-", async (productDir) => {
    await writeFile(join(productDir, DEFAULT_CONFIG_FILENAME), [
      `${DIAGNOSE_SECTION}:`,
      `  ${DIAGNOSE_CONFIG_FIELDS.CHECKS}: [42]`,
    ].join("\n"));
    const spxFloor = sampleDiagnoseTestValue(arbitrarySpxFloor());
    const manifestPath = join(productDir, "diagnose.json");
    await writeFile(manifestPath, JSON.stringify({
      checks: [CHECK_NAME.SPX_REACHABILITY],
      spx_floor: spxFloor,
    }));
    const run = await runDiagnose([
      DIAGNOSE_CLI.MANIFEST_FLAG,
      manifestPath,
      DIAGNOSE_CLI.JSON_FLAG,
    ], { cwd: productDir });
    const report = parseReport(run);
    expectSchemaValidReport(report);
    expect(report.checks.map((check) => check.name)).toEqual([CHECK_NAME.SPX_REACHABILITY]);
  });
}

export async function assertDiagnoseColorSelection(): Promise<void> {
  await withSpxReachabilityManifest(async (manifestPath) => {
    const colored = await runDiagnose([
      DIAGNOSE_CLI.MANIFEST_FLAG,
      manifestPath,
      DIAGNOSE_CLI.VERBOSE_FLAG,
      DIAGNOSE_CLI.COLOR_FLAG,
    ]);
    const uncolored = await runDiagnose([
      DIAGNOSE_CLI.MANIFEST_FLAG,
      manifestPath,
      DIAGNOSE_CLI.VERBOSE_FLAG,
      DIAGNOSE_CLI.NO_COLOR_FLAG,
    ]);
    const environmentUncolored = await runDiagnose([
      DIAGNOSE_CLI.MANIFEST_FLAG,
      manifestPath,
      DIAGNOSE_CLI.VERBOSE_FLAG,
    ], { env: { ...process.env, NO_COLOR: sampleDiagnoseTestValue(arbitraryNameToken()) } });
    expect(colored.stdout).toContain(String.fromCodePoint(27));
    expect(uncolored.stdout).not.toContain(String.fromCodePoint(27));
    expect(environmentUncolored.stdout).not.toContain(String.fromCodePoint(27));
  });
}

export async function assertInvalidOutputOptionsRejectBeforeDiagnosis(): Promise<void> {
  await withSpxReachabilityManifest(async (manifestPath) => {
    const removedFormat = await runDiagnose([
      DIAGNOSE_CLI.MANIFEST_FLAG,
      manifestPath,
      "--format",
      "json",
    ]);
    const conflictingSelectors = await runDiagnose([
      DIAGNOSE_CLI.MANIFEST_FLAG,
      manifestPath,
      DIAGNOSE_CLI.VERBOSE_FLAG,
      DIAGNOSE_CLI.JSON_FLAG,
    ]);
    expect(removedFormat.exitCode).not.toBe(0);
    expect(removedFormat.stderr).toContain("--format");
    expect(conflictingSelectors.exitCode).not.toBe(0);
    expect(conflictingSelectors.stderr).toContain(DIAGNOSE_CLI.VERBOSE_FLAG);
    expect(conflictingSelectors.stderr).toContain(DIAGNOSE_CLI.JSON_FLAG);
  });
}

export async function assertManifestPathErrorIsSanitized(): Promise<void> {
  await withTempDir("diagnose-error-", async (productDir) => {
    const controlByte = String.fromCodePoint(7);
    const run = await runDiagnose([
      DIAGNOSE_CLI.MANIFEST_FLAG,
      join(productDir, `manifest${controlByte}.json`),
    ]);
    expect(run.exitCode).toBe(1);
    expect(run.stderr).not.toContain(controlByte);
    expect(run.stderr.length).toBeGreaterThan(0);
  });
}

export async function assertManifestCheckErrorIsSanitized(): Promise<void> {
  await withTempDir("diagnose-error-", async (productDir) => {
    const controlByte = String.fromCodePoint(7);
    const manifestPath = join(productDir, "diagnose.json");
    await writeFile(manifestPath, JSON.stringify({
      checks: [`${CHECK_NAME.SPX_REACHABILITY}${controlByte}`],
    }));
    const run = await runDiagnose([DIAGNOSE_CLI.MANIFEST_FLAG, manifestPath]);
    expect(run.exitCode).toBe(1);
    expect(run.stderr).not.toContain(controlByte);
    expect(run.stderr.length).toBeGreaterThan(0);
  });
}

export function assertExitCodeMapping(): void {
  for (const overall of Object.values(OVERALL_VERDICT)) {
    expect(overallExitCode(overall)).toBe(VERDICT_EXIT_CODE[overall]);
  }
  expect(new Set(Object.values(VERDICT_EXIT_CODE)).size).toBe(Object.values(OVERALL_VERDICT).length);
  expect(Object.entries(VERDICT_EXIT_CODE).filter(([, code]) => code === 0).map(([overall]) => overall)).toEqual([
    OVERALL_VERDICT.HEALTHY,
  ]);
}
