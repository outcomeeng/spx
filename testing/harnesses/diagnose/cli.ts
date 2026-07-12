/** Assertion harness for the `spx diagnose` command boundary. */

import fc from "fast-check";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { execa } from "execa";
import { expect, vi } from "vitest";

import { diagnoseCommand } from "@/commands/diagnose";
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
  type SpxReachabilityProbe,
  spxReachabilityRunner,
} from "@/domains/diagnose/checks/spx-reachability";
import { WORKTREE_POOL_VERDICT } from "@/domains/diagnose/checks/worktree-pool";
import { DIAGNOSE_CONFIG_FIELDS, DIAGNOSE_SECTION } from "@/domains/diagnose/config";
import { foldOverallVerdict, overallExitCode, VERDICT_EXIT_CODE } from "@/domains/diagnose/fold";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import {
  DIAGNOSE_OUTPUT_MODE,
  type DiagnoseOutputMode,
  DIAGNOSE_TEXT_HEADER,
  DIAGNOSE_TEXT_HINT,
  DIAGNOSE_TEXT_LABEL,
  DIAGNOSE_TEXT_OVERALL_LABEL,
  parseDiagnoseReportJson,
} from "@/domains/diagnose/report";
import {
  CHECK_RECORD_FIELDS,
  type CheckRecord,
  type DiagnoseReport,
  OVERALL_VERDICT,
  type OverallVerdict,
  VERDICT_BUCKET,
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

interface DiagnoseRun {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export interface DiagnoseOutputSelectorCase {
  readonly name: string;
  readonly args: readonly string[];
  readonly outputMode: DiagnoseOutputMode;
}

export interface DiagnoseExitCodeCase {
  readonly overall: OverallVerdict;
  readonly expectedCode: number;
}

export const DIAGNOSE_OUTPUT_SELECTOR_CASES: readonly DiagnoseOutputSelectorCase[] = [
  { name: "concise", args: [], outputMode: DIAGNOSE_OUTPUT_MODE.CONCISE },
  { name: "verbose", args: [DIAGNOSE_CLI.VERBOSE_FLAG], outputMode: DIAGNOSE_OUTPUT_MODE.VERBOSE },
  { name: "json", args: [DIAGNOSE_CLI.JSON_FLAG], outputMode: DIAGNOSE_OUTPUT_MODE.JSON },
];

export const DIAGNOSE_EXIT_CODE_CASES: readonly DiagnoseExitCodeCase[] = [
  { overall: OVERALL_VERDICT.HEALTHY, expectedCode: 0 },
  { overall: OVERALL_VERDICT.DEGRADED, expectedCode: 1 },
  { overall: OVERALL_VERDICT.UNKNOWN, expectedCode: 2 },
  { overall: OVERALL_VERDICT.BROKEN, expectedCode: 3 },
];

class RecordingSpxReachabilityProbe implements SpxReachabilityProbe {
  calls = 0;

  constructor(
    private readonly resolvedPath: string,
    private readonly version: string,
  ) {}

  probe(): Promise<{ readonly resolvedPath: string; readonly version: string; readonly errored: false }> {
    this.calls += 1;
    return Promise.resolve({
      resolvedPath: this.resolvedPath,
      version: this.version,
      errored: false,
    });
  }
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

function parseReportText(output: string): DiagnoseReport {
  const parsed = parseDiagnoseReportJson(output);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}

function parseReport(run: DiagnoseRun): DiagnoseReport {
  return parseReportText(run.stdout);
}

function expectSchemaValidReport(report: DiagnoseReport): void {
  expect(Object.values(OVERALL_VERDICT)).toContain(report.overall);
  for (const check of report.checks) {
    expect(Object.keys(check).sort((left, right) => left.localeCompare(right))).toEqual(
      [...CHECK_RECORD_FIELDS].sort((left, right) => left.localeCompare(right)),
    );
    expect(Object.values(CHECK_NAME)).toContain(check.name);
    expect(Object.values(VERDICT_BUCKET)).toContain(check.bucket);
  }
}

function foldedOverall(report: DiagnoseReport): OverallVerdict {
  return foldOverallVerdict(report.checks.map((check) => check.bucket));
}

function expectExitCodeKeyedToFold(run: DiagnoseRun, report: DiagnoseReport): void {
  expect(run.exitCode).toBe(overallExitCode(foldedOverall(report)));
}

function checkByName(report: DiagnoseReport, name: string): CheckRecord {
  const check = report.checks.find((candidate) => candidate.name === name);
  expect(check).toBeDefined();
  if (check === undefined) throw new Error(`diagnose report has no ${name} check`);
  return check;
}

const HUMAN_HEADER_BY_VERDICT: Readonly<Partial<Record<string, Readonly<Partial<Record<string, string>>>>>> = {
  [CHECK_NAME.SPX_REACHABILITY]: {
    [SPX_REACHABILITY_VERDICT.REACHABLE]: DIAGNOSE_TEXT_HEADER.SPX_INSTALLED,
    [SPX_REACHABILITY_VERDICT.PRESENT]: DIAGNOSE_TEXT_HEADER.SPX_INSTALLED,
    [SPX_REACHABILITY_VERDICT.BELOW_FLOOR]: DIAGNOSE_TEXT_HEADER.SPX_BELOW_FLOOR,
    [SPX_REACHABILITY_VERDICT.UNREACHABLE]: DIAGNOSE_TEXT_HEADER.SPX_UNREACHABLE,
    [SPX_REACHABILITY_VERDICT.UNKNOWN]: DIAGNOSE_TEXT_HEADER.SPX_UNKNOWN,
  },
  [CHECK_NAME.SESSION_ENVIRONMENT]: {
    [SESSION_ENVIRONMENT_VERDICT.WORKING]: DIAGNOSE_TEXT_HEADER.AGENT_SESSION_ACTIVE,
    [SESSION_ENVIRONMENT_VERDICT.IDENTITY_ONLY]: DIAGNOSE_TEXT_HEADER.AGENT_SESSION_UNLINKED,
    [SESSION_ENVIRONMENT_VERDICT.SILENT_NO_OP]: DIAGNOSE_TEXT_HEADER.SESSION_START_NO_OP,
    [SESSION_ENVIRONMENT_VERDICT.NOT_APPLICABLE]: DIAGNOSE_TEXT_HEADER.AGENT_SESSION_HOOK_SKIPPED,
    [SESSION_ENVIRONMENT_VERDICT.UNKNOWN]: DIAGNOSE_TEXT_HEADER.AGENT_SESSION_UNKNOWN,
  },
  [CHECK_NAME.WORKTREE_POOL]: {
    [WORKTREE_POOL_VERDICT.COMPLIANT]: DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_VALID,
    [WORKTREE_POOL_VERDICT.NON_COMPLIANT]: DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_INVALID,
    [WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_MISSING]: DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_INVALID,
    [WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_DETACHED]: DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_INVALID,
    [WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_WRONG_BRANCH]: DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_INVALID,
    [WORKTREE_POOL_VERDICT.UNKNOWN]: DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_UNKNOWN,
  },
  [CHECK_NAME.SESSION_STORE]: {
    [SESSION_STORE_VERDICT.CONSISTENT]: DIAGNOSE_TEXT_HEADER.SESSION_STORE_CLEAN,
    [SESSION_STORE_VERDICT.ORPHANED_CLAIMS]: DIAGNOSE_TEXT_HEADER.STALE_DOING_SESSIONS,
    [SESSION_STORE_VERDICT.UNKNOWN]: DIAGNOSE_TEXT_HEADER.SESSION_STORE_UNKNOWN,
  },
  [CHECK_NAME.MARKETPLACE_INSTALL]: {
    [MARKETPLACE_INSTALL_VERDICT.INSTALLED]: DIAGNOSE_TEXT_HEADER.MARKETPLACE_CONFIGURED,
    [MARKETPLACE_INSTALL_VERDICT.DRIFTED]: DIAGNOSE_TEXT_HEADER.MARKETPLACE_DRIFT,
    [MARKETPLACE_INSTALL_VERDICT.UNREGISTERED]: DIAGNOSE_TEXT_HEADER.MARKETPLACE_UNREGISTERED,
    [MARKETPLACE_INSTALL_VERDICT.CLI_UNAVAILABLE]: DIAGNOSE_TEXT_HEADER.MARKETPLACE_CLI_UNAVAILABLE,
    [MARKETPLACE_INSTALL_VERDICT.NOT_APPLICABLE]: DIAGNOSE_TEXT_HEADER.MARKETPLACE_CHECKS_SKIPPED,
    [MARKETPLACE_INSTALL_VERDICT.UNKNOWN]: DIAGNOSE_TEXT_HEADER.MARKETPLACE_UNKNOWN,
  },
  [CHECK_NAME.METHODOLOGY_CONTEXT]: {
    [METHODOLOGY_CONTEXT_VERDICT.RESOLVED]: DIAGNOSE_TEXT_HEADER.METHODOLOGY_RESOLVED,
    [METHODOLOGY_CONTEXT_VERDICT.VERSION_MISMATCH]: DIAGNOSE_TEXT_HEADER.METHODOLOGY_VERSION_MISMATCH,
    [METHODOLOGY_CONTEXT_VERDICT.UNAVAILABLE]: DIAGNOSE_TEXT_HEADER.METHODOLOGY_UNAVAILABLE,
    [METHODOLOGY_CONTEXT_VERDICT.UNKNOWN]: DIAGNOSE_TEXT_HEADER.METHODOLOGY_UNKNOWN,
  },
};

function expectedHumanHeader(check: CheckRecord): string {
  return HUMAN_HEADER_BY_VERDICT[check.name]?.[check.verdict] ?? DIAGNOSE_TEXT_HEADER.RENDERING_UNAVAILABLE;
}

function providerSection(output: string, header: string): string {
  const lines = output.split("\n");
  const start = lines.findIndex((line) => line.includes(header));
  expect(start).toBeGreaterThanOrEqual(0);
  const end = lines.findIndex((line, index) => index > start && line.length > 0 && !line.startsWith("  "));
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

async function packagedCliVersion(): Promise<string> {
  const result = await execa(NODE_EXECUTABLE, [CLI_PATH, "--version"]);
  return result.stdout;
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
  await withSpxReachabilityManifest(async (manifestPath, spxFloor) => {
    const environment = { ...process.env, PATH: dirname(manifestPath) };
    const executingVersion = await packagedCliVersion();
    const concise = await runDiagnose([DIAGNOSE_CLI.MANIFEST_FLAG, manifestPath], { env: environment });
    const machine = await runDiagnose([
      DIAGNOSE_CLI.MANIFEST_FLAG,
      manifestPath,
      DIAGNOSE_CLI.JSON_FLAG,
    ], { env: environment });
    const report = parseReport(machine);
    const spxCheck = checkByName(report, CHECK_NAME.SPX_REACHABILITY);
    expect(concise.stdout).toContain(`${DIAGNOSE_TEXT_OVERALL_LABEL}: ${report.overall}`);
    expect(concise.stdout).toContain(DIAGNOSE_TEXT_LABEL.VERSION);
    expect(concise.stdout).toContain(executingVersion);
    expect(concise.stdout).toContain(DIAGNOSE_TEXT_HINT.VERBOSE);
    expect(concise.stdout).toContain(DIAGNOSE_TEXT_HINT.JSON);
    expect(concise.stdout).toContain(DIAGNOSE_TEXT_HEADER.SPX_UNREACHABLE);
    expect(concise.stdout).toContain(spxCheck.remediation);
    expect(concise.stdout).not.toContain(CHECK_NAME.SPX_REACHABILITY);
    expect(concise.stdout).not.toContain(CHECK_RECORD_FIELDS[3]);
    expect(concise.stdout).not.toContain(spxFloor);
    expect(concise.stdout).not.toContain(SPX_REACHABILITY_READING_VALUE.UNRESOLVED_PATH);
    expect(concise.exitCode).toBe(machine.exitCode);
  });
}

export async function assertVerboseDiagnoseShowsAllFacts(): Promise<void> {
  await withAllChecksManifest(async (manifestPath) => {
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
    expect(report.checks.map((check) => check.name)).toEqual(Object.values(CHECK_NAME));
    for (const check of report.checks) {
      const section = providerSection(verbose.stdout, expectedHumanHeader(check));
      for (const [name, reading] of Object.entries(check.readings)) {
        expect(section).toContain(`${name}: ${reading}`);
      }
      expect(section).toContain(check.remediation);
    }
    expect(verbose.stdout).toContain(`${DIAGNOSE_TEXT_OVERALL_LABEL}: ${report.overall}`);
    expect(verbose.exitCode).toBe(machine.exitCode);
  });
}

export async function assertOutputSelectorCase(testCase: DiagnoseOutputSelectorCase): Promise<void> {
  await withAllChecksManifest(async (manifestPath) => {
    const selected = await runDiagnose([DIAGNOSE_CLI.MANIFEST_FLAG, manifestPath, ...testCase.args]);
    const machine = await runDiagnose([DIAGNOSE_CLI.MANIFEST_FLAG, manifestPath, DIAGNOSE_CLI.JSON_FLAG]);
    const report = parseReport(machine);
    expectSchemaValidReport(report);
    expect(report.checks.map((check) => check.name)).toEqual(Object.values(CHECK_NAME));
    expect(selected.exitCode).toBe(machine.exitCode);
    if (testCase.outputMode === DIAGNOSE_OUTPUT_MODE.JSON) {
      expect(parseReport(selected)).toStrictEqual(report);
    } else if (testCase.outputMode === DIAGNOSE_OUTPUT_MODE.VERBOSE) {
      for (const check of report.checks) {
        expect(selected.stdout).toContain(expectedHumanHeader(check));
      }
    } else {
      expect(selected.stdout).toContain(DIAGNOSE_TEXT_HINT.VERBOSE);
      expect(selected.stdout).toContain(DIAGNOSE_TEXT_HINT.JSON);
    }
  });
}

export async function assertPresentationModesPreserveDiagnosis(): Promise<void> {
  await withTempDir("diagnose-mode-projection-", async (productDir) => {
    const spxFloor = sampleDiagnoseTestValue(arbitrarySpxFloor());
    const resolvedPath = join(productDir, sampleDiagnoseTestValue(arbitraryNameToken()));
    const manifestPath = join(productDir, "diagnose.json");
    await writeFile(manifestPath, JSON.stringify({
      checks: [CHECK_NAME.SPX_REACHABILITY],
      spx_floor: spxFloor,
    }));
    const probe = new RecordingSpxReachabilityProbe(resolvedPath, spxFloor);
    const results = [];
    for (const testCase of DIAGNOSE_OUTPUT_SELECTOR_CASES) {
      const result = await diagnoseCommand({
        productDir,
        manifestPath,
        outputMode: testCase.outputMode,
        color: false,
        registry: { [CHECK_NAME.SPX_REACHABILITY]: spxReachabilityRunner(probe) },
        fs: { readFile: (path) => readFile(path, "utf8") },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      results.push(result.value);
    }
    expect(probe.calls).toBe(DIAGNOSE_OUTPUT_SELECTOR_CASES.length);
    expect(new Set(results.map((result) => result.exitCode))).toEqual(new Set([0]));
    const machine = parseReportText(results.at(-1)?.output ?? "");
    expect(machine.checks[0]?.verdict).toBe(SPX_REACHABILITY_VERDICT.REACHABLE);
    expect(machine.checks[0]?.readings).toEqual({
      path: resolvedPath,
      version: spxFloor,
      floor: spxFloor,
    });
    expect(results[0]?.output).toContain(spxFloor);
    expect(results[1]?.output).toContain(resolvedPath);
    expect(results[1]?.output).toContain(machine.checks[0]?.remediation);
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
  await withTempDir("diagnose-option-error-", async (productDir) => {
    const controlByte = String.fromCodePoint(7);
    const absentManifestPath = join(productDir, `absent${controlByte}.json`);
    const removedFormat = await runDiagnose([
      DIAGNOSE_CLI.MANIFEST_FLAG,
      absentManifestPath,
      "--format",
      "json",
    ]);
    const conflictingSelectors = await runDiagnose([
      DIAGNOSE_CLI.MANIFEST_FLAG,
      absentManifestPath,
      DIAGNOSE_CLI.VERBOSE_FLAG,
      DIAGNOSE_CLI.JSON_FLAG,
    ]);
    const unsafeUnknownSelector = await runDiagnose([`--format${controlByte}`]);
    expect(removedFormat.exitCode).not.toBe(0);
    expect(removedFormat.stderr).toContain("--format");
    expect(removedFormat.stderr).not.toContain("cannot read diagnose manifest");
    expect(conflictingSelectors.exitCode).not.toBe(0);
    expect(conflictingSelectors.stderr).toContain(DIAGNOSE_CLI.VERBOSE_FLAG);
    expect(conflictingSelectors.stderr).toContain(DIAGNOSE_CLI.JSON_FLAG);
    expect(conflictingSelectors.stderr).not.toContain("cannot read diagnose manifest");
    expect(unsafeUnknownSelector.exitCode).not.toBe(0);
    expect(unsafeUnknownSelector.stderr).not.toContain(controlByte);
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

export function assertExitCodeCase(testCase: DiagnoseExitCodeCase): void {
  expect(overallExitCode(testCase.overall)).toBe(testCase.expectedCode);
  expect(VERDICT_EXIT_CODE[testCase.overall]).toBe(testCase.expectedCode);
}
