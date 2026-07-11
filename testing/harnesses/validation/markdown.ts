import { readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";

import { withTempDir } from "@testing/harnesses/with-temp-dir";

import { allCommand } from "@/commands/validation/all";
import { MARKDOWN_COMMAND_OUTPUT, markdownCommand } from "@/commands/validation/markdown";
import { validationCliDefinition } from "@/interfaces/cli/validation-contract";
import { NODE_STATUS_EXCLUDE_FILENAME } from "@/lib/node-status/exclude";
import {
  buildMarkdownlintConfig,
  getDefaultDirectories,
  MARKDOWN_CONFIG_CONTROL_KEYS,
  MARKDOWN_CUSTOM_RULE_NAMES,
  MARKDOWN_ENABLED_BUILTIN_RULES,
  MARKDOWN_VALIDATION_TARGET_DIAGNOSTICS,
  validateMarkdown,
} from "@/validation/steps/markdown";
import {
  MARKDOWN_SCENARIO_KIND,
  MARKDOWN_VALIDATION_DATA,
  markdownDirectoryTarget,
  markdownE2eScenarios,
  markdownFileTarget,
  markdownIntegrationScenarios,
  markdownUnitScenarios,
  type MarkdownValidationScenario,
} from "@testing/generators/validation/markdown";
import { runValidationSubprocess } from "@testing/harnesses/validation/cli";
import { collectHarnessTestCases, describe, it } from "@testing/harnesses/vitest-registration";
import { withMarkdownEnv } from "@testing/harnesses/with-markdown-env";

export async function runMarkdownValidationScenario(scenario: MarkdownValidationScenario): Promise<void> {
  switch (scenario.kind) {
    case MARKDOWN_SCENARIO_KIND.CLEAN_TREE:
      return runCleanTreeScenario(scenario);
    case MARKDOWN_SCENARIO_KIND.DATA_URI_ALLOWED:
      return runDataUriScenario(scenario);
    case MARKDOWN_SCENARIO_KIND.IGNORED_LINK_TYPES:
      return runIgnoredLinkTypesScenario();
    case MARKDOWN_SCENARIO_KIND.BROKEN_LINKS:
      return runBrokenLinksScenario(scenario);
    case MARKDOWN_SCENARIO_KIND.BROKEN_FRAGMENT:
      return runBrokenFragmentScenario(scenario);
    case MARKDOWN_SCENARIO_KIND.ERROR_SHAPE:
      return runErrorShapeScenario(scenario);
    case MARKDOWN_SCENARIO_KIND.PROJECT_ABSOLUTE_LINK:
      return runProjectAbsoluteLinkScenario();
    case MARKDOWN_SCENARIO_KIND.NO_SIDE_EFFECTS:
      return runNoSideEffectsScenario(scenario);
    case MARKDOWN_SCENARIO_KIND.DEFAULT_DIRECTORIES:
      return runDefaultDirectoriesScenario(scenario);
    case MARKDOWN_SCENARIO_KIND.EXCLUDE_NODE:
      return runExcludeScenario(scenario);
    case MARKDOWN_SCENARIO_KIND.EXCLUDE_NODE_EXACT_ONLY:
      return runExcludeExactOnlyScenario();
    case MARKDOWN_SCENARIO_KIND.EXCLUDE_NODE_SCOPED_TARGET:
      return runExcludeScopedTargetScenario();
    case MARKDOWN_SCENARIO_KIND.DUPLICATE_HEADINGS:
      return runDuplicateHeadingsScenario(scenario);
    case MARKDOWN_SCENARIO_KIND.CONFIG_BUILDER:
      return runConfigBuilderScenario();
    case MARKDOWN_SCENARIO_KIND.COMMAND_DEFAULTS:
      return runCommandDefaultsScenario(scenario);
    case MARKDOWN_SCENARIO_KIND.FILE_SCOPE_DOCS:
      return runFileScopeDocsScenario(scenario);
    case MARKDOWN_SCENARIO_KIND.FILE_SCOPE_CLEAN_SPX:
      return runFileScopeCleanSpxScenario(scenario);
    case MARKDOWN_SCENARIO_KIND.PIPELINE_FAILURE:
      return runPipelineFailureScenario(scenario);
    case MARKDOWN_SCENARIO_KIND.E2E_HELP:
      return runE2eHelpScenario();
    case MARKDOWN_SCENARIO_KIND.E2E_BROKEN_DIRECTORY:
      return runE2eBrokenDirectoryScenario();
    case MARKDOWN_SCENARIO_KIND.E2E_VALID_DIRECTORY:
      return runE2eValidDirectoryScenario();
    case MARKDOWN_SCENARIO_KIND.E2E_DIRECT_FILE:
      return runE2eDirectFileScenario();
    case MARKDOWN_SCENARIO_KIND.DOCS_DIRECT_FILE_MD024:
      return runDocsDirectFileMd024Scenario();
    case MARKDOWN_SCENARIO_KIND.MISSING_FILE_SCOPE_DIAGNOSTIC:
      return runMissingFileScopeDiagnosticScenario();
    case MARKDOWN_SCENARIO_KIND.UNRELATED_FILE_SCOPE_DIAGNOSTIC:
      return runUnrelatedFileScopeDiagnosticScenario();
    case MARKDOWN_SCENARIO_KIND.MIXED_FILE_SCOPE_DIAGNOSTIC:
      return runMixedFileScopeDiagnosticScenario();
    case MARKDOWN_SCENARIO_KIND.DIRECTORY_SCOPE_MD_ONLY:
      return runDirectoryScopeMdOnlyScenario();
    case MARKDOWN_SCENARIO_KIND.COLON_PATH_ERROR:
      return runColonPathErrorScenario();
  }
}

async function runCleanTreeScenario(scenario: MarkdownValidationScenario): Promise<void> {
  await withMarkdownScenarioEnv(scenario, async ({ spxDir }) => {
    const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)] });

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(MARKDOWN_VALIDATION_DATA.zero);
  });
}

async function runDataUriScenario(scenario: MarkdownValidationScenario): Promise<void> {
  await withMarkdownScenarioEnv(scenario, async ({ spxDir }) => {
    const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)] });

    expect(result.success).toBe(true);
    expect(result.errors.filter((error) => error.detail.includes(MARKDOWN_VALIDATION_DATA.dataUriMarker)))
      .toHaveLength(MARKDOWN_VALIDATION_DATA.zero);
  });
}

async function runIgnoredLinkTypesScenario(): Promise<void> {
  await withMarkdownTempProject(async ({ path, spxDir }) => {
    await mkdir(spxDir, { recursive: true });
    await writeFile(
      join(spxDir, MARKDOWN_VALIDATION_DATA.sourceMarkdownFile),
      MARKDOWN_VALIDATION_DATA.ignoredLinkTypesContent,
    );

    const result = await validateMarkdown({
      targets: [markdownDirectoryTarget(spxDir)],
      projectRoot: path,
    });

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(MARKDOWN_VALIDATION_DATA.zero);
  });
}

async function runBrokenLinksScenario(scenario: MarkdownValidationScenario): Promise<void> {
  await withMarkdownScenarioEnv(scenario, async ({ spxDir }) => {
    const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)] });
    const brokenRelativeError = result.errors.find((error) =>
      error.file.includes(MARKDOWN_VALIDATION_DATA.sampleMarkdownFile)
      && error.detail.includes(MARKDOWN_VALIDATION_DATA.brokenRelativeTargetMarker)
    );

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(MARKDOWN_VALIDATION_DATA.three);
    expect(brokenRelativeError?.file).toContain(MARKDOWN_VALIDATION_DATA.sampleMarkdownFile);
    expect(brokenRelativeError?.line).toBeGreaterThan(MARKDOWN_VALIDATION_DATA.zero);
    expect(brokenRelativeError?.detail).toContain(MARKDOWN_VALIDATION_DATA.brokenRelativeTargetMarker);
  });
}

async function runBrokenFragmentScenario(scenario: MarkdownValidationScenario): Promise<void> {
  await withMarkdownScenarioEnv(scenario, async ({ spxDir }) => {
    const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)] });
    const fragmentErrors = result.errors.filter((error) =>
      error.detail.includes(MARKDOWN_VALIDATION_DATA.missingHeadingMarker)
    );

    expect(fragmentErrors.length).toBeGreaterThanOrEqual(MARKDOWN_VALIDATION_DATA.one);
  });
}

async function runErrorShapeScenario(scenario: MarkdownValidationScenario): Promise<void> {
  await withMarkdownScenarioEnv(scenario, async ({ spxDir }) => {
    const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)] });

    for (const error of result.errors) {
      expect(error.file).toBeTruthy();
      expect(error.line).toBeGreaterThan(MARKDOWN_VALIDATION_DATA.zero);
      expect(error.detail).toBeTruthy();
    }
  });
}

async function runProjectAbsoluteLinkScenario(): Promise<void> {
  await withMarkdownTempProject(async ({ path, spxDir }) => {
    await mkdir(spxDir, { recursive: true });
    await writeFile(
      join(spxDir, MARKDOWN_VALIDATION_DATA.targetMarkdownFile),
      MARKDOWN_VALIDATION_DATA.validMarkdownTargetContent,
    );
    const sourceFile = join(spxDir, MARKDOWN_VALIDATION_DATA.sourceMarkdownFile);
    await writeFile(sourceFile, MARKDOWN_VALIDATION_DATA.projectAbsoluteSourceContent);

    const result = await markdownCommand({
      cwd: path,
      files: [sourceFile],
    });

    expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.zero);
    expect(result.output).toContain(MARKDOWN_COMMAND_OUTPUT.NO_ISSUES);
  });
}

async function runNoSideEffectsScenario(scenario: MarkdownValidationScenario): Promise<void> {
  await withMarkdownScenarioEnv(scenario, async ({ spxDir }) => {
    const sampleDir = join(spxDir, MARKDOWN_VALIDATION_DATA.sampleDirectoryName);
    const rootBefore = new Set(readdirSync(spxDir));
    const sampleBefore = new Set(readdirSync(sampleDir));

    await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)] });

    expect(new Set(readdirSync(spxDir))).toEqual(rootBefore);
    expect(new Set(readdirSync(sampleDir))).toEqual(sampleBefore);
  });
}

async function runDefaultDirectoriesScenario(scenario: MarkdownValidationScenario): Promise<void> {
  await withMarkdownScenarioEnv(scenario, async ({ path }) => {
    const dirs = getDefaultDirectories(path);
    const outsideDirectory = join(path, MARKDOWN_VALIDATION_DATA.outsideDefaultDirectoryName);
    await mkdir(outsideDirectory, { recursive: true });
    await writeFile(
      join(outsideDirectory, MARKDOWN_VALIDATION_DATA.outsideDefaultBrokenFile),
      MARKDOWN_VALIDATION_DATA.brokenMarkdownContent,
    );
    const result = await markdownCommand({ cwd: path });

    expect(dirs).toHaveLength(MARKDOWN_VALIDATION_DATA.two);
    expect(dirs).toContain(join(path, MARKDOWN_VALIDATION_DATA.spxDirectoryName));
    expect(dirs).toContain(join(path, MARKDOWN_VALIDATION_DATA.docsDirectoryName));
    expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.zero);
    expect(result.output).not.toContain(MARKDOWN_VALIDATION_DATA.outsideDefaultBrokenFile);
  });
}

async function runExcludeScenario(scenario: MarkdownValidationScenario): Promise<void> {
  await withMarkdownScenarioEnv(scenario, async ({ path, spxDir }) => {
    const result = await validateMarkdown({
      targets: [markdownDirectoryTarget(spxDir)],
      projectRoot: path,
    });
    const declaredErrors = result.errors.filter((error) =>
      error.file.includes(MARKDOWN_VALIDATION_DATA.declaredNodeFragment)
    );

    expect(result.success).toBe(true);
    expect(declaredErrors).toHaveLength(MARKDOWN_VALIDATION_DATA.zero);
  });
}

async function runExcludeExactOnlyScenario(): Promise<void> {
  await withMarkdownTempProject(async ({ path, spxDir }) => {
    const declaredNodeDir = join(spxDir, MARKDOWN_VALIDATION_DATA.declaredNodeDirectory);
    const childNodeDir = join(declaredNodeDir, MARKDOWN_VALIDATION_DATA.declaredChildDirectory);
    const declaredFile = join(declaredNodeDir, MARKDOWN_VALIDATION_DATA.declaredMarkdownFile);
    const declaredMarkdownExtensionFile = join(
      declaredNodeDir,
      MARKDOWN_VALIDATION_DATA.declaredMarkdownExtensionFile,
    );
    const childFile = join(childNodeDir, MARKDOWN_VALIDATION_DATA.childMarkdownFile);
    await mkdir(childNodeDir, { recursive: true });
    await writeFile(
      join(spxDir, NODE_STATUS_EXCLUDE_FILENAME),
      `${MARKDOWN_VALIDATION_DATA.declaredNodeDirectory}\n`,
    );
    await writeFile(declaredFile, MARKDOWN_VALIDATION_DATA.brokenMarkdownContent);
    await writeFile(declaredMarkdownExtensionFile, MARKDOWN_VALIDATION_DATA.brokenMarkdownContent);
    await writeFile(childFile, MARKDOWN_VALIDATION_DATA.brokenMarkdownContent);

    const result = await validateMarkdown({
      targets: [markdownDirectoryTarget(spxDir)],
      projectRoot: path,
    });

    expect(result.errors.some((error) => error.file === declaredFile)).toBe(false);
    expect(result.errors.some((error) => error.file === declaredMarkdownExtensionFile)).toBe(false);
    expect(result.errors.some((error) => error.file === childFile)).toBe(true);
  });
}

async function runExcludeScopedTargetScenario(): Promise<void> {
  await withMarkdownTempProject(async ({ path, spxDir }) => {
    const declaredNodeDir = join(spxDir, MARKDOWN_VALIDATION_DATA.declaredNodeDirectory);
    const childNodeDir = join(declaredNodeDir, MARKDOWN_VALIDATION_DATA.declaredChildDirectory);
    const declaredFile = join(declaredNodeDir, MARKDOWN_VALIDATION_DATA.declaredMarkdownFile);
    const childFile = join(childNodeDir, MARKDOWN_VALIDATION_DATA.childMarkdownFile);
    await mkdir(childNodeDir, { recursive: true });
    await writeFile(
      join(spxDir, NODE_STATUS_EXCLUDE_FILENAME),
      `${MARKDOWN_VALIDATION_DATA.declaredNodeDirectory}\n`,
    );
    await writeFile(declaredFile, MARKDOWN_VALIDATION_DATA.brokenMarkdownContent);
    await writeFile(childFile, MARKDOWN_VALIDATION_DATA.brokenMarkdownContent);

    const result = await validateMarkdown({
      targets: [markdownDirectoryTarget(declaredNodeDir)],
      projectRoot: path,
    });

    expect(result.errors.some((error) => error.file === declaredFile)).toBe(false);
    expect(result.errors.some((error) => error.file === childFile)).toBe(true);
  });
}

async function runDuplicateHeadingsScenario(scenario: MarkdownValidationScenario): Promise<void> {
  await withMarkdownScenarioEnv(scenario, async ({ docsDir, spxDir }) => {
    const spxResult = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)] });
    const md024Errors = spxResult.errors.filter((error) =>
      error.detail.includes(MARKDOWN_VALIDATION_DATA.md024RuleMarker)
    );
    const sampleMd024Errors = spxResult.errors.filter((error) =>
      error.file.includes(MARKDOWN_VALIDATION_DATA.sampleMarkdownFile)
      && error.detail.includes(MARKDOWN_VALIDATION_DATA.md024RuleMarker)
    );
    const docsResult = await validateMarkdown({ targets: [markdownDirectoryTarget(docsDir)] });
    const docsMd024Errors = docsResult.errors.filter((error) =>
      error.detail.includes(MARKDOWN_VALIDATION_DATA.md024RuleMarker)
    );

    expect(md024Errors.length).toBeGreaterThanOrEqual(MARKDOWN_VALIDATION_DATA.one);
    expect(md024Errors.some((error) => error.file.includes(MARKDOWN_VALIDATION_DATA.childMarkdownFile))).toBe(true);
    expect(sampleMd024Errors).toHaveLength(MARKDOWN_VALIDATION_DATA.zero);
    expect(docsMd024Errors).toHaveLength(MARKDOWN_VALIDATION_DATA.zero);
    expect(docsResult.success).toBe(false);
    expect(docsResult.errors.some((error) => error.detail.includes(MARKDOWN_VALIDATION_DATA.missingFileMarker))).toBe(
      true,
    );
  });
}

function runConfigBuilderScenario(): void {
  const spxConfig = buildMarkdownlintConfig(MARKDOWN_VALIDATION_DATA.spxDirectoryName);
  const docsConfig = buildMarkdownlintConfig(MARKDOWN_VALIDATION_DATA.docsDirectoryName);
  const expectedConfigKeyCount = Object.keys(MARKDOWN_ENABLED_BUILTIN_RULES).length
    + Object.keys(MARKDOWN_CONFIG_CONTROL_KEYS).length;

  expect(Object.keys(spxConfig)).toHaveLength(expectedConfigKeyCount);
  expect(Object.keys(docsConfig)).toHaveLength(expectedConfigKeyCount);
  expect(spxConfig).toMatchObject({
    [MARKDOWN_CONFIG_CONTROL_KEYS.DEFAULT]: false,
    ...MARKDOWN_ENABLED_BUILTIN_RULES,
    [MARKDOWN_CONFIG_CONTROL_KEYS.DUPLICATE_HEADINGS]: { siblings_only: true },
  });
  expect(docsConfig).toMatchObject({
    [MARKDOWN_CONFIG_CONTROL_KEYS.DEFAULT]: false,
    ...MARKDOWN_ENABLED_BUILTIN_RULES,
    [MARKDOWN_CONFIG_CONTROL_KEYS.DUPLICATE_HEADINGS]: false,
  });
  expect(spxConfig[MARKDOWN_CONFIG_CONTROL_KEYS.CUSTOM_RULES]).toHaveLength(
    MARKDOWN_VALIDATION_DATA.one,
  );
  expect(
    spxConfig[MARKDOWN_CONFIG_CONTROL_KEYS.CUSTOM_RULES][MARKDOWN_VALIDATION_DATA.zero].names,
  ).toEqual(MARKDOWN_CUSTOM_RULE_NAMES);
}

async function runCommandDefaultsScenario(scenario: MarkdownValidationScenario): Promise<void> {
  await withMarkdownScenarioEnv(scenario, async ({ docsDir, path, spxDir }) => {
    await writeFile(
      join(spxDir, MARKDOWN_VALIDATION_DATA.defaultSpxBrokenFile),
      MARKDOWN_VALIDATION_DATA.brokenMarkdownContent,
    );
    await writeFile(
      join(docsDir, MARKDOWN_VALIDATION_DATA.defaultDocsBrokenFile),
      MARKDOWN_VALIDATION_DATA.brokenMarkdownContent,
    );
    const result = await markdownCommand({ cwd: path });

    expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.one);
    expect(result.output).toContain(MARKDOWN_COMMAND_OUTPUT.ERROR_SUMMARY_SUFFIX);
    expect(result.output).toContain(MARKDOWN_VALIDATION_DATA.defaultSpxBrokenFile);
    expect(result.output).toContain(MARKDOWN_VALIDATION_DATA.defaultDocsBrokenFile);
  });
}

async function runFileScopeDocsScenario(scenario: MarkdownValidationScenario): Promise<void> {
  await withMarkdownScenarioEnv(scenario, async ({ docsDir, path, spxDir }) => {
    const result = await markdownCommand({
      cwd: path,
      files: [docsDir],
    });
    const detailed = await validateMarkdown({
      targets: [markdownDirectoryTarget(docsDir)],
      projectRoot: path,
    });

    expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.one);
    expect(detailed.errors.length).toBeGreaterThan(MARKDOWN_VALIDATION_DATA.zero);
    for (const error of detailed.errors) {
      expect(error.file).toContain(docsDir);
      expect(error.file).not.toContain(spxDir);
    }
  });
}

async function runFileScopeCleanSpxScenario(scenario: MarkdownValidationScenario): Promise<void> {
  await withMarkdownScenarioEnv(scenario, async ({ docsDir, path, spxDir }) => {
    await writeFile(
      join(docsDir, MARKDOWN_VALIDATION_DATA.explicitScopeDocsDecoyFile),
      MARKDOWN_VALIDATION_DATA.brokenMarkdownContent,
    );
    const result = await markdownCommand({
      cwd: path,
      files: [spxDir],
    });

    expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.zero);
    expect(result.output).not.toContain(MARKDOWN_VALIDATION_DATA.explicitScopeDocsDecoyFile);
  });
}

async function runPipelineFailureScenario(scenario: MarkdownValidationScenario): Promise<void> {
  await withMarkdownScenarioEnv(scenario, async ({ path }) => {
    const result = await allCommand({
      cwd: path,
      quiet: true,
    });

    expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.one);
  });
}

async function runE2eHelpScenario(): Promise<void> {
  const result = await runValidationSubprocess([
    validationCliDefinition.subcommands.markdown.commandName,
    MARKDOWN_VALIDATION_DATA.helpFlag,
  ]);

  expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.zero);
  expect(result.stdout).toContain(validationCliDefinition.subcommands.markdown.commandName);
  expect(result.stdout).toContain(validationCliDefinition.subcommands.markdown.description);
}

async function runE2eBrokenDirectoryScenario(): Promise<void> {
  await withMarkdownTempProject(async ({ path, spxDir }) => {
    await mkdir(spxDir, { recursive: true });
    await writeFile(
      join(spxDir, MARKDOWN_VALIDATION_DATA.brokenMarkdownFile),
      MARKDOWN_VALIDATION_DATA.brokenMarkdownContent,
    );

    const result = await runValidationSubprocess([
      validationCliDefinition.subcommands.markdown.commandName,
      spxDir,
    ], { cwd: path });

    expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.one);
    expect(result.stdout).toContain(MARKDOWN_VALIDATION_DATA.missingFileMarker);
  });
}

async function runE2eValidDirectoryScenario(): Promise<void> {
  await withMarkdownTempProject(async ({ path, spxDir }) => {
    await writeValidMarkdownPair(spxDir);

    const result = await runValidationSubprocess([
      validationCliDefinition.subcommands.markdown.commandName,
      spxDir,
    ], { cwd: path });

    expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.zero);
  });
}

async function runE2eDirectFileScenario(): Promise<void> {
  await withMarkdownTempProject(async ({ path, spxDir }) => {
    const sourceFile = await writeValidMarkdownPair(spxDir);

    const result = await runValidationSubprocess([
      validationCliDefinition.subcommands.markdown.commandName,
      sourceFile,
    ], { cwd: path });

    expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.zero);
  });
}

async function runDocsDirectFileMd024Scenario(): Promise<void> {
  await withMarkdownTempProject(async ({ path }) => {
    const docsGuideDir = join(
      path,
      MARKDOWN_VALIDATION_DATA.docsDirectoryName,
      MARKDOWN_VALIDATION_DATA.guideDirectoryName,
    );
    await mkdir(docsGuideDir, { recursive: true });
    const sourceFile = join(docsGuideDir, MARKDOWN_VALIDATION_DATA.sourceMarkdownFile);
    await writeFile(sourceFile, MARKDOWN_VALIDATION_DATA.docsDirectFileMd024Content);

    const result = await validateMarkdown({
      targets: [markdownFileTarget(sourceFile)],
      projectRoot: path,
    });

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(MARKDOWN_VALIDATION_DATA.zero);
  });
}

async function runMissingFileScopeDiagnosticScenario(): Promise<void> {
  await withMarkdownTempProject(async ({ path }) => {
    const missingFile = join(path, MARKDOWN_VALIDATION_DATA.missingMarkdownScopeFile);

    const result = await markdownCommand({
      cwd: path,
      files: [missingFile],
    });

    expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.zero);
    expect(result.output).toContain(MARKDOWN_COMMAND_OUTPUT.SKIPPED_FILE_SCOPE_PREFIX);
    expect(result.output).toContain(MARKDOWN_VALIDATION_TARGET_DIAGNOSTICS.MISSING_OR_UNRELATED_SCOPE);
    expect(result.output).toContain(missingFile);
  });
}

async function runUnrelatedFileScopeDiagnosticScenario(): Promise<void> {
  await withMarkdownTempProject(async ({ path }) => {
    const unrelatedFile = join(path, MARKDOWN_VALIDATION_DATA.unrelatedMarkdownScopeFile);
    await writeFile(unrelatedFile, MARKDOWN_VALIDATION_DATA.unrelatedMarkdownScopeContent);

    const result = await markdownCommand({
      cwd: path,
      files: [unrelatedFile],
    });

    expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.zero);
    expect(result.output).toContain(MARKDOWN_COMMAND_OUTPUT.SKIPPED_FILE_SCOPE_PREFIX);
    expect(result.output).toContain(MARKDOWN_VALIDATION_TARGET_DIAGNOSTICS.MISSING_OR_UNRELATED_SCOPE);
    expect(result.output).toContain(unrelatedFile);
  });
}

async function runMixedFileScopeDiagnosticScenario(): Promise<void> {
  await withMarkdownTempProject(async ({ path, spxDir }) => {
    const sourceFile = await writeValidMarkdownPair(spxDir);
    const unrelatedFile = join(path, MARKDOWN_VALIDATION_DATA.unrelatedMarkdownScopeFile);
    await writeFile(unrelatedFile, MARKDOWN_VALIDATION_DATA.unrelatedMarkdownScopeContent);

    const result = await markdownCommand({
      cwd: path,
      files: [sourceFile, unrelatedFile],
    });

    expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.zero);
    expect(result.output).toContain(MARKDOWN_COMMAND_OUTPUT.NO_ISSUES);
    expect(result.output).toContain(MARKDOWN_COMMAND_OUTPUT.SKIPPED_FILE_SCOPE_PREFIX);
    expect(result.output).toContain(unrelatedFile);
  });
}

async function runDirectoryScopeMdOnlyScenario(): Promise<void> {
  await withMarkdownTempProject(async ({ path, spxDir }) => {
    await mkdir(spxDir, { recursive: true });
    const markdownExtensionFile = join(spxDir, MARKDOWN_VALIDATION_DATA.brokenMarkdownExtensionFile);
    await writeFile(markdownExtensionFile, MARKDOWN_VALIDATION_DATA.brokenMarkdownContent);

    const directoryResult = await validateMarkdown({
      targets: [markdownDirectoryTarget(spxDir)],
      projectRoot: path,
    });
    const directFileResult = await validateMarkdown({
      targets: [markdownFileTarget(markdownExtensionFile)],
      projectRoot: path,
    });

    expect(directoryResult.success).toBe(true);
    expect(directoryResult.errors).toHaveLength(MARKDOWN_VALIDATION_DATA.zero);
    expect(directFileResult.success).toBe(false);
    expect(directFileResult.errors.length).toBeGreaterThanOrEqual(MARKDOWN_VALIDATION_DATA.one);
  });
}

async function runColonPathErrorScenario(): Promise<void> {
  await withMarkdownTempProject(async ({ path, spxDir }) => {
    await mkdir(spxDir, { recursive: true });
    const colonFile = join(spxDir, MARKDOWN_VALIDATION_DATA.colonMarkdownFile);
    await writeFile(colonFile, MARKDOWN_VALIDATION_DATA.brokenMarkdownContent);

    const result = await validateMarkdown({
      targets: [markdownFileTarget(colonFile)],
      projectRoot: path,
    });

    expect(result.success).toBe(false);
    expect(result.errors).toEqual([
      expect.objectContaining({
        file: colonFile,
        line: MARKDOWN_VALIDATION_DATA.three,
      }),
    ]);
    expect(result.errors[MARKDOWN_VALIDATION_DATA.zero]?.detail).toContain(MARKDOWN_VALIDATION_DATA.missingFileMarker);
  });
}

async function writeValidMarkdownPair(spxDir: string): Promise<string> {
  await mkdir(spxDir, { recursive: true });
  await writeFile(
    join(spxDir, MARKDOWN_VALIDATION_DATA.targetMarkdownFile),
    MARKDOWN_VALIDATION_DATA.validMarkdownTargetContent,
  );
  const sourceFile = join(spxDir, MARKDOWN_VALIDATION_DATA.sourceMarkdownFile);
  await writeFile(sourceFile, MARKDOWN_VALIDATION_DATA.validMarkdownSourceContent);
  return sourceFile;
}

function withMarkdownTempProject(
  callback: (context: { readonly path: string; readonly spxDir: string }) => Promise<void>,
): Promise<void> {
  return withTempDir(MARKDOWN_VALIDATION_DATA.e2eTempPrefix, (path) =>
    callback({
      path,
      spxDir: join(path, MARKDOWN_VALIDATION_DATA.spxDirectoryName),
    }));
}

async function withMarkdownScenarioEnv(
  scenario: MarkdownValidationScenario,
  callback: Parameters<typeof withMarkdownEnv>[1],
): Promise<void> {
  if (scenario.fixture === undefined) {
    throw new Error(`${MARKDOWN_VALIDATION_DATA.missingFixtureDiagnostic}: ${scenario.title}`);
  }
  await withMarkdownEnv({ fixture: scenario.fixture }, callback);
}

const MARKDOWN_MAPPING_KINDS: ReadonlySet<MarkdownValidationScenario["kind"]> = new Set([
  MARKDOWN_SCENARIO_KIND.CLEAN_TREE,
  MARKDOWN_SCENARIO_KIND.DATA_URI_ALLOWED,
  MARKDOWN_SCENARIO_KIND.IGNORED_LINK_TYPES,
  MARKDOWN_SCENARIO_KIND.PROJECT_ABSOLUTE_LINK,
  MARKDOWN_SCENARIO_KIND.CONFIG_BUILDER,
]);
const MARKDOWN_COMPLIANCE_KINDS: ReadonlySet<MarkdownValidationScenario["kind"]> = new Set([
  MARKDOWN_SCENARIO_KIND.NO_SIDE_EFFECTS,
  MARKDOWN_SCENARIO_KIND.DEFAULT_DIRECTORIES,
  MARKDOWN_SCENARIO_KIND.PIPELINE_FAILURE,
]);

function registerMarkdownScenarios(
  title: string,
  scenarios: readonly MarkdownValidationScenario[],
): void {
  describe(title, () => {
    for (const scenario of scenarios) {
      it(
        scenario.title,
        async () => runMarkdownValidationScenario(scenario),
        scenario.timeout,
      );
    }
  });
}

export const markdownValidationScenarioL1Cases = collectHarnessTestCases(() => {
  registerMarkdownScenarios("markdown validation L1 scenarios", markdownUnitScenarios());
});

export const markdownValidationScenarioL2Cases = collectHarnessTestCases(() => {
  registerMarkdownScenarios(
    "markdown validation L2 scenarios",
    [...markdownIntegrationScenarios(), ...markdownE2eScenarios()],
  );
});

export const markdownValidationMappingCases = collectHarnessTestCases(() => {
  registerMarkdownScenarios(
    "markdown validation mappings",
    markdownUnitScenarios().filter((scenario) => MARKDOWN_MAPPING_KINDS.has(scenario.kind)),
  );
});

export const markdownValidationComplianceCases = collectHarnessTestCases(() => {
  registerMarkdownScenarios(
    "markdown validation compliance",
    [...markdownUnitScenarios(), ...markdownIntegrationScenarios()].filter((scenario) =>
      MARKDOWN_COMPLIANCE_KINDS.has(scenario.kind)
    ),
  );
});
