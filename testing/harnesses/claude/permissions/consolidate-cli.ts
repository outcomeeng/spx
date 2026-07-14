import assert from "node:assert/strict";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { parseSettingsFile } from "@/commands/claude/settings/parser";
import { CLAUDE_SETTINGS_PATH } from "@/domains/claude/settings/files";
import { CONSOLIDATION_REPORT_TEXT } from "@/domains/claude/settings/reporter";
import {
  type ClaudeSettings,
  createEmptyClaudeSettings,
  SETTINGS_FILE_PARSE_STATUS,
} from "@/domains/claude/settings/types";
import { CLAUDE_SETTINGS_CLI, CLAUDE_SETTINGS_MUTUAL_EXCLUSION_ERROR } from "@/interfaces/cli/claude";
import {
  CLI_EXIT_CODE,
  PACKAGED_CLI_ENTRYPOINT,
  PACKAGED_CLI_EXECUTABLE,
  PACKAGED_CLI_INVOCATION,
} from "@/interfaces/cli/invocation";
import {
  arbitraryConsolidationCliScenario,
  type ConsolidationCliScenario,
  sampleScenario,
} from "@testing/generators/claude/permissions/scenarios";
import { PRODUCT_ROOT } from "@testing/harnesses/constants";
import { execa } from "execa";
import { withPermissionsTempDir } from "./temp-directory";

interface ConsolidationCliEnvironment {
  readonly productDir: string;
  readonly globalSettingsPath: string;
  readonly outputFilePath: string;
  readonly managedFilePaths: readonly string[];
  readonly scenario: ConsolidationCliScenario;
}

interface ConsolidationCliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

interface ProductFileSnapshot {
  readonly entries: readonly string[];
  readonly contents: readonly Buffer[];
}

export async function assertConsolidatePreview(): Promise<void> {
  await withConsolidationCliEnvironment(async (environment) => {
    const before = await productFileSnapshot(environment);
    const result = await runConsolidateCli(consolidateArguments(environment));

    assert.equal(result.exitCode, CLI_EXIT_CODE.SUCCESS);
    assert.ok(result.stdout.includes(CONSOLIDATION_REPORT_TEXT.PREVIEW_MODE));
    assert.ok(result.stdout.includes(consolidationUsage(CLAUDE_SETTINGS_CLI.OPTION.WRITE.token)));
    assert.ok(
      result.stdout.includes(
        consolidationUsage(
          CLAUDE_SETTINGS_CLI.OPTION.OUTPUT_FILE.token,
          CLAUDE_SETTINGS_CLI.OPTION.OUTPUT_FILE.operand,
        ),
      ),
    );
    assertReportIncludesPermissions(result.stdout, environment.scenario);
    assert.deepEqual(await productFileSnapshot(environment), before);
  });
}

export async function assertConsolidateWritesGlobalSettingsAndBackup(): Promise<void> {
  await withConsolidationCliEnvironment(async (environment) => {
    const result = await runConsolidateCli([
      ...consolidateArguments(environment),
      CLAUDE_SETTINGS_CLI.OPTION.WRITE.token,
    ]);

    assert.equal(result.exitCode, CLI_EXIT_CODE.SUCCESS);
    assert.ok(result.stdout.includes(CONSOLIDATION_REPORT_TEXT.GLOBAL_SETTINGS_UPDATED));
    assert.ok(result.stdout.includes(CONSOLIDATION_REPORT_TEXT.BACKUP_CREATED));
    assert.deepEqual(
      new Set(await readAllowPermissions(environment.globalSettingsPath)),
      new Set(environment.scenario.expectedAllowPermissions),
    );

    const backupName = (await readdir(dirname(environment.globalSettingsPath))).find((name) =>
      name.startsWith(`${CLAUDE_SETTINGS_PATH.GLOBAL_FILE}${CLAUDE_SETTINGS_PATH.BACKUP_MARKER}`)
    );
    assert.ok(backupName);
    assert.deepEqual(
      await readAllowPermissions(join(dirname(environment.globalSettingsPath), backupName)),
      createEmptyClaudeSettings().permissions?.allow,
    );
  });
}

export async function assertConsolidateWritesOutputFile(): Promise<void> {
  await withConsolidationCliEnvironment(async (environment) => {
    const globalSettingsBefore = await readFile(environment.globalSettingsPath);
    const result = await runConsolidateCli([
      ...consolidateArguments(environment),
      CLAUDE_SETTINGS_CLI.OPTION.OUTPUT_FILE.token,
      environment.outputFilePath,
    ]);

    assert.equal(result.exitCode, CLI_EXIT_CODE.SUCCESS);
    assert.ok(result.stdout.includes(CONSOLIDATION_REPORT_TEXT.SETTINGS_WRITTEN));
    assert.ok(result.stdout.includes(environment.outputFilePath));
    assert.deepEqual(
      new Set(await readAllowPermissions(environment.outputFilePath)),
      new Set(environment.scenario.expectedAllowPermissions),
    );
    assert.deepEqual(await readFile(environment.globalSettingsPath), globalSettingsBefore);
  });
}

export async function assertConsolidateReportsNoSettings(): Promise<void> {
  await withPermissionsTempDir(async (productDir) => {
    const entriesBefore = await readdir(productDir);
    const result = await runConsolidateCli([
      ...consolidateCommandPath(),
      CLAUDE_SETTINGS_CLI.OPTION.ROOT.token,
      productDir,
    ]);

    assert.equal(result.exitCode, CLI_EXIT_CODE.SUCCESS);
    assert.ok(result.stdout.includes(CONSOLIDATION_REPORT_TEXT.NO_SETTINGS_FILES));
    assert.deepEqual(await readdir(productDir), entriesBefore);
  });
}

export async function assertConsolidateRejectsMutuallyExclusiveOutputs(): Promise<void> {
  await withConsolidationCliEnvironment(async (environment) => {
    const result = await runConsolidateCli([
      ...consolidateArguments(environment),
      CLAUDE_SETTINGS_CLI.OPTION.WRITE.token,
      CLAUDE_SETTINGS_CLI.OPTION.OUTPUT_FILE.token,
      environment.outputFilePath,
    ]);

    assert.equal(result.exitCode, CLI_EXIT_CODE.ERROR);
    assert.equal(result.stderr, CLAUDE_SETTINGS_MUTUAL_EXCLUSION_ERROR);
  });
}

async function withConsolidationCliEnvironment<T>(
  callback: (environment: ConsolidationCliEnvironment) => Promise<T>,
): Promise<T> {
  return withPermissionsTempDir(async (productDir) => {
    const scenario = sampleScenario(arbitraryConsolidationCliScenario());
    const globalSettingsPath = join(
      productDir,
      CLAUDE_SETTINGS_PATH.DIRECTORY,
      CLAUDE_SETTINGS_PATH.GLOBAL_FILE,
    );
    const outputFilePath = join(productDir, ...scenario.outputPathSegments);
    const projectSettingsFiles = scenario.projects.map((project) => ({
      path: join(
        productDir,
        project.relativeDirectory,
        CLAUDE_SETTINGS_PATH.DIRECTORY,
        CLAUDE_SETTINGS_PATH.LOCAL_FILE,
      ),
      settings: project.settings,
    }));

    await writeSettingsFile(globalSettingsPath, createEmptyClaudeSettings());
    await Promise.all(
      projectSettingsFiles.map((file) => writeSettingsFile(file.path, file.settings)),
    );

    return callback({
      productDir,
      globalSettingsPath,
      outputFilePath,
      managedFilePaths: [
        globalSettingsPath,
        ...projectSettingsFiles.map((file) => file.path),
      ],
      scenario,
    });
  });
}

async function writeSettingsFile(
  filePath: string,
  settings: ClaudeSettings,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(settings));
}

function consolidateCommandPath(): string[] {
  return [
    CLAUDE_SETTINGS_CLI.DOMAIN,
    CLAUDE_SETTINGS_CLI.SETTINGS_COMMAND,
    CLAUDE_SETTINGS_CLI.CONSOLIDATE_COMMAND,
  ];
}

function consolidationUsage(option: string, operand?: string): string {
  return [
    PACKAGED_CLI_INVOCATION,
    ...consolidateCommandPath(),
    option,
    ...(operand === undefined ? [] : [operand]),
  ].join(" ");
}

function consolidateArguments(environment: ConsolidationCliEnvironment): string[] {
  return [
    ...consolidateCommandPath(),
    CLAUDE_SETTINGS_CLI.OPTION.ROOT.token,
    environment.productDir,
    CLAUDE_SETTINGS_CLI.OPTION.GLOBAL_SETTINGS.token,
    environment.globalSettingsPath,
  ];
}

async function runConsolidateCli(
  arguments_: readonly string[],
): Promise<ConsolidationCliResult> {
  const result = await execa(
    PACKAGED_CLI_EXECUTABLE,
    [PACKAGED_CLI_ENTRYPOINT, ...arguments_],
    { cwd: PRODUCT_ROOT, reject: false },
  );
  if (result.exitCode === undefined) {
    throw new Error("Consolidation CLI process completed without an exit code");
  }
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
}

async function productFileSnapshot(
  environment: ConsolidationCliEnvironment,
): Promise<ProductFileSnapshot> {
  return {
    entries: (await readdir(environment.productDir, { recursive: true })).sort(
      (left, right) => left.localeCompare(right),
    ),
    contents: await Promise.all(environment.managedFilePaths.map((filePath) => readFile(filePath))),
  };
}

async function readAllowPermissions(filePath: string): Promise<readonly string[]> {
  const result = await parseSettingsFile(filePath);
  assert.equal(result.status, SETTINGS_FILE_PARSE_STATUS.SUCCESS);
  return result.settings.permissions?.allow ?? [];
}

function assertReportIncludesPermissions(
  report: string,
  scenario: ConsolidationCliScenario,
): void {
  for (const permission of scenario.expectedAllowPermissions) {
    assert.ok(report.includes(permission));
  }
}
