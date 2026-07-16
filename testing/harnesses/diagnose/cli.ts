/** Assertion harness for the `spx diagnose` command boundary. */

import fc from "fast-check";
import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { execa } from "execa";
import { expect, vi } from "vitest";

import { diagnoseCommand, type ManifestFileSystem } from "@/commands/diagnose";
import { DEFAULT_CONFIG_FILENAME } from "@/config/index";
import { DEFAULT_METHODOLOGY_SOURCE, DEFAULT_METHODOLOGY_VERSION } from "@/config/methodology";
import { HARNESS_ENVIRONMENT_SECTION, type HarnessEnvironmentConfig } from "@/domains/agent-environment/config";
import {
  classifyMarketplaceInstall,
  MARKETPLACE_INSTALL_VERDICT,
  marketplaceInstallRunner,
} from "@/domains/diagnose/checks/marketplace-install";
import { METHODOLOGY_CONTEXT_VERDICT, methodologyContextRunner } from "@/domains/diagnose/checks/methodology-context";
import { classifyPluginBootstrap } from "@/domains/diagnose/checks/plugin-bootstrap";
import { SESSION_ENVIRONMENT_VERDICT, sessionEnvironmentRunner } from "@/domains/diagnose/checks/session-environment";
import { SESSION_STORE_VERDICT, sessionStoreRunner } from "@/domains/diagnose/checks/session-store";
import {
  SPX_REACHABILITY_READING_VALUE,
  SPX_REACHABILITY_VERDICT,
  spxReachabilityRunner,
} from "@/domains/diagnose/checks/spx-reachability";
import { WORKTREE_POOL_VERDICT, worktreePoolRunner } from "@/domains/diagnose/checks/worktree-pool";
import { DIAGNOSE_CONFIG_FIELDS, DIAGNOSE_SECTION } from "@/domains/diagnose/config";
import type { CheckRegistry } from "@/domains/diagnose/engine";
import { foldOverallVerdict, overallExitCode, VERDICT_EXIT_CODE } from "@/domains/diagnose/fold";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import {
  DIAGNOSE_OUTPUT_MODE,
  DIAGNOSE_TEXT_DETAIL,
  DIAGNOSE_TEXT_HEADER,
  DIAGNOSE_TEXT_HINT,
  DIAGNOSE_TEXT_LABEL,
  DIAGNOSE_TEXT_OVERALL_LABEL,
  parseDiagnoseReportJson,
  renderReportJson,
  renderReportVerbose,
} from "@/domains/diagnose/report";
import {
  CHECK_RECORD_FIELDS,
  type CheckRecord,
  type DiagnoseReport,
  OVERALL_VERDICT,
  type OverallVerdict,
  VERDICT_BUCKET,
} from "@/domains/diagnose/types";
import { createDiagnoseDomain, DIAGNOSE_CLI } from "@/interfaces/cli/diagnose";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import { escapeCliArgument } from "@/lib/sanitize-cli-argument";
import { pluginBootstrapMappingCases } from "@testing/generators/agent-environment/plugin-bootstrap";
import {
  allChecksManifestJson,
  DIAGNOSE_OUTPUT_SELECTOR_CASES,
  diagnoseConfigScenario,
  type DiagnoseOutputSelectorCase,
  invalidManifestCheckJson,
  invalidOutputOptionCases,
  malformedDiagnoseConfigYaml,
  spxReachabilityManifestScenario,
} from "@testing/generators/diagnose/cli";
import {
  arbitraryManifestFacts,
  arbitraryNameToken,
  arbitrarySpxFloor,
  manifestJson,
  sampleDiagnoseTestValue,
} from "@testing/generators/diagnose/manifest";
import {
  allProviderRecords,
  allProviderRecordScenario,
  type DefaultDiagnoseScenario,
  defaultDiagnoseScenario,
  type DiagnoseExitCodeCase,
  expectedHumanHeader,
  unsafeDiagnoseReadingScenario,
} from "@testing/generators/diagnose/report-scenarios";
import { CLI_PATH, CLI_TIMEOUTS_MS, NODE_EXECUTABLE, VERSION_FLAG } from "@testing/harnesses/constants";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
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
  await writeFile(
    manifestPath,
    JSON.stringify({
      checks: [CHECK_NAME.SPX_REACHABILITY],
      spx_floor: floor,
    }),
  );
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
  await writeFile(
    manifestPath,
    manifestJson({
      ...facts,
      checks: Object.values(CHECK_NAME),
      methodologySource: DEFAULT_METHODOLOGY_SOURCE,
      methodologyVersion: DEFAULT_METHODOLOGY_VERSION,
    }),
  );
  return manifestPath;
}

interface DiagnoseRun {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

class RecordingCheckRegistry {
  readonly calls: string[] = [];
  readonly registry: CheckRegistry;

  constructor(records: readonly CheckRecord[]) {
    this.registry = Object.fromEntries(
      Object.values(CHECK_NAME).map((name, index) => [
        name,
        () => {
          this.calls.push(name);
          return Promise.resolve(records[index]);
        },
      ]),
    );
  }
}

class RecordingManifestFileSystem implements ManifestFileSystem {
  reads = 0;

  readFile(): Promise<string> {
    this.reads += 1;
    return Promise.reject(new Error("manifest read must not run"));
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
    const scenario = spxReachabilityManifestScenario();
    const manifestPath = join(productDir, "diagnose.json");
    await writeFile(manifestPath, scenario.json);
    return callback(manifestPath, scenario.spxFloor);
  });
}

async function withAllChecksManifest<T>(callback: (manifestPath: string) => Promise<T>): Promise<T> {
  return withTempDir("diagnose-cli-", async (productDir) => {
    const manifestPath = join(productDir, "diagnose.json");
    await writeFile(manifestPath, allChecksManifestJson());
    return callback(manifestPath);
  });
}

function parseReportText(output: string, diagnostics = ""): DiagnoseReport {
  const parsed = parseDiagnoseReportJson(output);
  expect(
    parsed.ok,
    parsed.ok ? undefined : `${parsed.error}\nReceived output:\n${output}\n${diagnostics}`,
  ).toBe(true);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}

function parseReport(run: DiagnoseRun): DiagnoseReport {
  return parseReportText(run.stdout, `Received stderr:\n${run.stderr}\nReceived exit code: ${run.exitCode}`);
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

function providerSection(output: string, header: string): string {
  const lines = output.split("\n");
  const start = lines.findIndex((line) => line.includes(header));
  expect(start).toBeGreaterThanOrEqual(0);
  const end = lines.findIndex((line, index) => index > start && line.length > 0 && !line.startsWith("  "));
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

async function packagedCliVersion(): Promise<string> {
  const result = await execa(NODE_EXECUTABLE, [CLI_PATH, VERSION_FLAG]);
  return result.stdout;
}

function controlledDefaultRegistry(scenario: DefaultDiagnoseScenario): CheckRegistry {
  return {
    [CHECK_NAME.SPX_REACHABILITY]: spxReachabilityRunner({
      probe: () => Promise.resolve(scenario.spx),
    }),
    [CHECK_NAME.SESSION_ENVIRONMENT]: sessionEnvironmentRunner({
      probe: () => Promise.resolve(scenario.sessionEnvironment),
    }),
    [CHECK_NAME.WORKTREE_POOL]: worktreePoolRunner({
      probe: () => Promise.resolve(scenario.worktreePool),
    }),
    [CHECK_NAME.SESSION_STORE]: sessionStoreRunner({
      probe: () => Promise.resolve(scenario.sessionStore),
    }),
    [CHECK_NAME.PLUGIN_BOOTSTRAP]: async (facts) => classifyPluginBootstrap(facts.harnessEnvironment),
    [CHECK_NAME.MARKETPLACE_INSTALL]: marketplaceInstallRunner({
      probe: () => {
        throw new Error("default marketplace facts must not invoke the marketplace probe");
      },
    }),
    [CHECK_NAME.METHODOLOGY_CONTEXT]: methodologyContextRunner({
      probe: () => Promise.resolve(scenario.methodology),
    }),
  };
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
  await withAllChecksManifest(async (manifestPath) => {
    const isolatedPath = dirname(manifestPath);
    await symlink(process.execPath, join(isolatedPath, NODE_EXECUTABLE));
    const environment = { ...process.env, PATH: isolatedPath };
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
    expect(concise.stdout).not.toContain(spxCheck.readings.floor);
    expect(concise.stdout).not.toContain(SPX_REACHABILITY_READING_VALUE.UNRESOLVED_PATH);
    expect(concise.stdout).not.toContain(SPX_REACHABILITY_READING_VALUE.UNREAD_VERSION);
    for (const check of report.checks) {
      if (check.bucket !== VERDICT_BUCKET.HEALTHY && check.bucket !== VERDICT_BUCKET.NOT_APPLICABLE) {
        expect(concise.stdout).toContain(expectedHumanHeader(check));
        expect(concise.stdout).toContain(check.remediation);
      }
      for (const [name, reading] of Object.entries(check.readings)) {
        expect(concise.stdout).not.toContain(`${name}: ${reading}`);
      }
    }
    expect(concise.exitCode).toBe(machine.exitCode);
  });
  const controlled = allProviderRecordScenario();
  await withTestEnv({}, async ({ productDir }) => {
    const result = await diagnoseCommand({
      productDir,
      outputMode: DIAGNOSE_OUTPUT_MODE.CONCISE,
      color: false,
      registry: new RecordingCheckRegistry(controlled.records).registry,
      fs: { readFile: () => Promise.resolve("") },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    for (const reading of controlled.forbiddenConciseReadings) expect(result.value.output).not.toContain(reading);
    for (const check of controlled.records) {
      if (check.bucket !== VERDICT_BUCKET.HEALTHY && check.bucket !== VERDICT_BUCKET.NOT_APPLICABLE) {
        expect(result.value.output).toContain(expectedHumanHeader(check));
        expect(result.value.output).toContain(check.remediation);
      }
    }
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

export function assertVerboseDiagnoseSanitizesReadings(): void {
  const scenario = unsafeDiagnoseReadingScenario();
  const verbose = renderReportVerbose(scenario.report, { color: false });
  const machine = parseReportText(renderReportJson(scenario.report));
  expect(verbose).toContain(
    `${escapeCliArgument(scenario.readingName)}: ${escapeCliArgument(scenario.readingValue)}`,
  );
  expect(verbose).not.toContain(scenario.readingName);
  expect(verbose).not.toContain(scenario.readingValue);
  expect(machine.checks[0]?.readings[scenario.readingName]).toBe(scenario.readingValue);
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
  const records = allProviderRecords();
  await withTestEnv({}, async ({ productDir }) => {
    const results = [];
    for (const testCase of DIAGNOSE_OUTPUT_SELECTOR_CASES) {
      const recording = new RecordingCheckRegistry(records);
      const result = await diagnoseCommand({
        productDir,
        outputMode: testCase.outputMode,
        color: false,
        registry: recording.registry,
        fs: { readFile: () => Promise.resolve("") },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(recording.calls).toEqual(Object.values(CHECK_NAME));
      expect(result.value.report).toStrictEqual({
        checks: records,
        overall: foldOverallVerdict(records.map((record) => record.bucket)),
      });
      results.push(result.value);
    }
    expect(new Set(results.map((result) => result.exitCode))).toEqual(
      new Set([overallExitCode(foldOverallVerdict(records.map((record) => record.bucket)))]),
    );
    const machine = parseReportText(results.at(-1)?.output ?? "");
    expect(machine.checks).toStrictEqual(records);
    for (const check of machine.checks) {
      if (check.bucket !== VERDICT_BUCKET.HEALTHY && check.bucket !== VERDICT_BUCKET.NOT_APPLICABLE) {
        expect(results[0]?.output).toContain(expectedHumanHeader(check));
        expect(results[0]?.output).toContain(check.remediation);
      }
      expect(results[1]?.output).toContain(expectedHumanHeader(check));
      expect(results[1]?.output).toContain(check.remediation);
    }
    expect(results[1]?.output).toContain(DIAGNOSE_TEXT_DETAIL.SESSION_STORE_READABLE);
    expect(results[1]?.output).toContain(DIAGNOSE_TEXT_DETAIL.PLUGIN_BOOTSTRAP_CONFIGURED);
  });
}

export async function assertConfigDiagnoseJson(): Promise<void> {
  await withTempDir("diagnose-config-", async (productDir) => {
    const scenario = diagnoseConfigScenario();
    await writeFile(join(productDir, DEFAULT_CONFIG_FILENAME), scenario.yaml);
    const run = await runDiagnose([DIAGNOSE_CLI.JSON_FLAG], { cwd: productDir });
    const report = parseReport(run);
    expectSchemaValidReport(report);
    expect(report.checks.map((check) => check.name)).toEqual([CHECK_NAME.SPX_REACHABILITY]);
    expect(report.checks[0]?.readings.floor).toBe(scenario.spxFloor);
    expect(report.checks[0]?.verdict).not.toBe(SPX_REACHABILITY_VERDICT.PRESENT);
    expectExitCodeKeyedToFold(run, report);
  });
}

export async function assertBareDiagnoseJson(): Promise<void> {
  const scenario = defaultDiagnoseScenario();
  await withTestEnv({}, async ({ productDir }) => {
    const registry = controlledDefaultRegistry(scenario);
    const result = await diagnoseCommand({
      productDir,
      outputMode: DIAGNOSE_OUTPUT_MODE.JSON,
      color: false,
      registry,
      fs: { readFile: () => Promise.resolve("") },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    const report = parseReportText(result.value.output);
    expectSchemaValidReport(report);
    expect(report.checks.map((check) => check.name)).toEqual(Object.keys(registry));
    expect(checkByName(report, CHECK_NAME.SPX_REACHABILITY)).toMatchObject({
      verdict: SPX_REACHABILITY_VERDICT.PRESENT,
      bucket: VERDICT_BUCKET.HEALTHY,
      readings: {
        path: scenario.spx.resolvedPath,
        version: scenario.spx.version,
        floor: SPX_REACHABILITY_READING_VALUE.ABSENT_FLOOR,
      },
    });
    expect(checkByName(report, CHECK_NAME.SESSION_ENVIRONMENT)).toMatchObject({
      verdict: SESSION_ENVIRONMENT_VERDICT.NOT_APPLICABLE,
      bucket: VERDICT_BUCKET.NOT_APPLICABLE,
      readings: {
        hook: String(scenario.sessionEnvironment.hookPresent),
        identity: String(scenario.sessionEnvironment.sessionIdentity),
        claimed: String(scenario.sessionEnvironment.worktreeClaimed),
      },
    });
    expect(checkByName(report, CHECK_NAME.WORKTREE_POOL)).toMatchObject({
      verdict: WORKTREE_POOL_VERDICT.COMPLIANT,
      bucket: VERDICT_BUCKET.HEALTHY,
      readings: {
        bare: String(scenario.worktreePool.bareRepository),
        linked: String(scenario.worktreePool.linkedWorktrees),
        mainCheckoutPath: scenario.worktreePool.mainCheckoutPath,
        defaultBranch: scenario.worktreePool.defaultBranch,
        mainCheckoutBranch: scenario.worktreePool.mainCheckoutBranch,
        mainCheckoutBranchRead: String(scenario.worktreePool.mainCheckoutBranchRead),
        running: String(scenario.worktreePool.running),
        free: String(scenario.worktreePool.free),
      },
    });
    expect(checkByName(report, CHECK_NAME.SESSION_STORE)).toMatchObject({
      verdict: SESSION_STORE_VERDICT.CONSISTENT,
      bucket: VERDICT_BUCKET.HEALTHY,
      readings: { orphaned: String(scenario.sessionStore.orphanedClaims) },
    });
    expect(checkByName(report, CHECK_NAME.MARKETPLACE_INSTALL)).toMatchObject({
      verdict: MARKETPLACE_INSTALL_VERDICT.NOT_APPLICABLE,
      bucket: VERDICT_BUCKET.NOT_APPLICABLE,
      readings: {
        configured: String(false),
        surface: String(false),
        unregistered: String(false),
        drifted: String(false),
      },
    });
    expect(checkByName(report, CHECK_NAME.METHODOLOGY_CONTEXT)).toMatchObject({
      verdict: METHODOLOGY_CONTEXT_VERDICT.RESOLVED,
      bucket: VERDICT_BUCKET.HEALTHY,
      readings: {
        configuredSource: DEFAULT_METHODOLOGY_SOURCE,
        configuredVersion: DEFAULT_METHODOLOGY_VERSION,
        observedSource: scenario.methodology.source,
        observedVersion: scenario.methodology.version,
      },
    });
    expect(result.value.exitCode).toBe(overallExitCode(report.overall));
  });
}

export async function assertManifestPrecedesMalformedConfig(): Promise<void> {
  await withTempDir("diagnose-manifest-precedence-", async (productDir) => {
    await writeFile(join(productDir, DEFAULT_CONFIG_FILENAME), malformedDiagnoseConfigYaml());
    const scenario = spxReachabilityManifestScenario();
    const manifestPath = join(productDir, "diagnose.json");
    await writeFile(manifestPath, scenario.json);
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

function pluginIntentRegistry(observed: HarnessEnvironmentConfig[]): CheckRegistry {
  return {
    [CHECK_NAME.PLUGIN_BOOTSTRAP]: async (facts) => {
      observed.push(facts.harnessEnvironment);
      return classifyPluginBootstrap(facts.harnessEnvironment);
    },
    [CHECK_NAME.MARKETPLACE_INSTALL]: async (facts) => {
      observed.push(facts.harnessEnvironment);
      return classifyMarketplaceInstall({
        configured: true,
        errored: false,
        surfacePresent: true,
        unregistered: false,
        drifted: false,
      });
    },
  };
}

export async function assertConfigResolvesProductPluginIntent(): Promise<void> {
  const scenario = pluginBootstrapMappingCases()[1];
  const observed: HarnessEnvironmentConfig[] = [];
  const manifestFs = new RecordingManifestFileSystem();
  await withTestEnv({
    [DIAGNOSE_SECTION]: {
      [DIAGNOSE_CONFIG_FIELDS.CHECKS]: [
        CHECK_NAME.PLUGIN_BOOTSTRAP,
        CHECK_NAME.MARKETPLACE_INSTALL,
      ],
    },
    [HARNESS_ENVIRONMENT_SECTION]: scenario.config,
  }, async ({ productDir }) => {
    const result = await diagnoseCommand({
      productDir,
      outputMode: DIAGNOSE_OUTPUT_MODE.JSON,
      color: false,
      registry: pluginIntentRegistry(observed),
      fs: manifestFs,
    });
    expect(result.ok).toBe(true);
  });
  expect(manifestFs.reads).toBe(0);
  expect(observed).toStrictEqual([scenario.config, scenario.config]);
}

export async function assertManifestResolvesProductPluginIntent(): Promise<void> {
  const scenario = pluginBootstrapMappingCases()[1];
  const observed: HarnessEnvironmentConfig[] = [];
  await withTestEnv({
    [DIAGNOSE_SECTION]: { [DIAGNOSE_CONFIG_FIELDS.CHECKS]: [42] },
    [HARNESS_ENVIRONMENT_SECTION]: scenario.config,
  }, async ({ productDir }) => {
    const result = await diagnoseCommand({
      manifestPath: DEFAULT_CONFIG_FILENAME,
      productDir,
      outputMode: DIAGNOSE_OUTPUT_MODE.JSON,
      color: false,
      registry: pluginIntentRegistry(observed),
      fs: {
        readFile: () =>
          Promise.resolve(manifestJson({
            ...sampleDiagnoseTestValue(arbitraryManifestFacts()),
            checks: [CHECK_NAME.PLUGIN_BOOTSTRAP, CHECK_NAME.MARKETPLACE_INSTALL],
          })),
      },
    });
    expect(result.ok).toBe(true);
  });
  expect(observed).toStrictEqual([scenario.config, scenario.config]);
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
    for (const testCase of invalidOutputOptionCases(absentManifestPath, controlByte)) {
      const recording = new RecordingCheckRegistry(allProviderRecords());
      const manifestFs = new RecordingManifestFileSystem();
      const stderr: string[] = [];
      const program = createCliProgram({
        domains: [createDiagnoseDomain({
          registry: recording.registry,
          fs: manifestFs,
        })],
        processCwd: () => productDir,
        writeStderr: (value) => stderr.push(value),
      });
      program.exitOverride();
      await expect(program.parseAsync([DIAGNOSE_CLI.COMMAND, ...testCase.args], {
        from: SPX_COMMANDER_PARSE_SOURCE,
      })).rejects.toBeDefined();
      expect(recording.calls).toEqual([]);
      expect(manifestFs.reads).toBe(0);
      expect(stderr.join("")).not.toContain("cannot read diagnose manifest");
      expect(stderr.join("")).not.toContain(controlByte);
      for (const token of testCase.expectedTokens) expect(stderr.join("")).toContain(token);
    }
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
    await writeFile(manifestPath, invalidManifestCheckJson(controlByte));
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
