import { readdirSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";

import { allCommand } from "@/commands/validation/all";
import { MARKDOWN_COMMAND_OUTPUT, markdownCommand } from "@/commands/validation/markdown";
import { validationCliDefinition } from "@/domains/validation";
import {
  buildMarkdownlintConfig,
  getDefaultDirectories,
  MARKDOWN_CUSTOM_RULE_NAMES,
  validateMarkdown,
} from "@/validation/steps/markdown";
import {
  MARKDOWN_SCENARIO_KIND,
  MARKDOWN_VALIDATION_DATA,
  markdownDirectoryTarget,
  markdownFileTarget,
  type MarkdownValidationScenario,
} from "@testing/generators/validation/markdown";
import { runValidationSubprocess } from "@testing/harnesses/validation/cli";
import { withMarkdownEnv } from "@testing/harnesses/with-markdown-env";

export async function runMarkdownValidationScenario(scenario: MarkdownValidationScenario): Promise<void> {
  switch (scenario.kind) {
    case MARKDOWN_SCENARIO_KIND.CLEAN_TREE:
      return runCleanTreeScenario(scenario);
    case MARKDOWN_SCENARIO_KIND.DATA_URI_ALLOWED:
      return runDataUriScenario(scenario);
    case MARKDOWN_SCENARIO_KIND.BROKEN_LINKS:
      return runBrokenLinksScenario(scenario);
    case MARKDOWN_SCENARIO_KIND.BROKEN_FRAGMENT:
      return runBrokenFragmentScenario(scenario);
    case MARKDOWN_SCENARIO_KIND.ERROR_SHAPE:
      return runErrorShapeScenario(scenario);
    case MARKDOWN_SCENARIO_KIND.PROJECT_ABSOLUTE_LINK:
      return runProjectAbsoluteLinkScenario(scenario);
    case MARKDOWN_SCENARIO_KIND.NO_SIDE_EFFECTS:
      return runNoSideEffectsScenario(scenario);
    case MARKDOWN_SCENARIO_KIND.DEFAULT_DIRECTORIES:
      return runDefaultDirectoriesScenario(scenario);
    case MARKDOWN_SCENARIO_KIND.EXCLUDE_NODE:
      return runExcludeScenario(scenario);
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

async function runBrokenLinksScenario(scenario: MarkdownValidationScenario): Promise<void> {
  await withMarkdownScenarioEnv(scenario, async ({ spxDir }) => {
    const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)] });

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(MARKDOWN_VALIDATION_DATA.three);
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

async function runProjectAbsoluteLinkScenario(scenario: MarkdownValidationScenario): Promise<void> {
  await withMarkdownScenarioEnv(scenario, async ({ path, spxDir }) => {
    const result = await validateMarkdown({
      targets: [markdownDirectoryTarget(spxDir)],
      projectRoot: path,
    });
    const absoluteErrors = result.errors.filter((error) =>
      error.detail.includes(MARKDOWN_VALIDATION_DATA.missingFileMarker)
    );

    expect(result.success).toBe(false);
    expect(absoluteErrors.length).toBeGreaterThanOrEqual(MARKDOWN_VALIDATION_DATA.one);
  });
}

async function runNoSideEffectsScenario(scenario: MarkdownValidationScenario): Promise<void> {
  await withMarkdownScenarioEnv(scenario, async ({ spxDir }) => {
    const featureDir = join(spxDir, MARKDOWN_VALIDATION_DATA.featureDirectoryName);
    const rootBefore = new Set(readdirSync(spxDir));
    const featureBefore = new Set(readdirSync(featureDir));

    await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)] });

    expect(new Set(readdirSync(spxDir))).toEqual(rootBefore);
    expect(new Set(readdirSync(featureDir))).toEqual(featureBefore);
  });
}

async function runDefaultDirectoriesScenario(scenario: MarkdownValidationScenario): Promise<void> {
  await withMarkdownScenarioEnv(scenario, async ({ path }) => {
    const dirs = getDefaultDirectories(path);

    expect(dirs).toHaveLength(MARKDOWN_VALIDATION_DATA.two);
    expect(dirs).toContain(join(path, MARKDOWN_VALIDATION_DATA.spxDirectoryName));
    expect(dirs).toContain(join(path, MARKDOWN_VALIDATION_DATA.docsDirectoryName));
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

async function runDuplicateHeadingsScenario(scenario: MarkdownValidationScenario): Promise<void> {
  await withMarkdownScenarioEnv(scenario, async ({ docsDir, spxDir }) => {
    const spxResult = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)] });
    const md024Errors = spxResult.errors.filter((error) =>
      error.detail.includes(MARKDOWN_VALIDATION_DATA.md024RuleMarker)
    );
    const featureMd024Errors = spxResult.errors.filter((error) =>
      error.file.includes(MARKDOWN_VALIDATION_DATA.featureMarkdownFile)
      && error.detail.includes(MARKDOWN_VALIDATION_DATA.md024RuleMarker)
    );
    const docsResult = await validateMarkdown({ targets: [markdownDirectoryTarget(docsDir)] });
    const docsMd024Errors = docsResult.errors.filter((error) =>
      error.detail.includes(MARKDOWN_VALIDATION_DATA.md024RuleMarker)
    );

    expect(md024Errors.length).toBeGreaterThanOrEqual(MARKDOWN_VALIDATION_DATA.one);
    expect(md024Errors.some((error) => error.file.includes(MARKDOWN_VALIDATION_DATA.childMarkdownFile))).toBe(true);
    expect(featureMd024Errors).toHaveLength(MARKDOWN_VALIDATION_DATA.zero);
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

  expect(spxConfig.default).toBe(false);
  expect(spxConfig.MD001).toBe(true);
  expect(spxConfig.MD003).toBe(true);
  expect(spxConfig.MD009).toBe(true);
  expect(spxConfig.MD010).toBe(true);
  expect(spxConfig.MD025).toBe(true);
  expect(spxConfig.MD047).toBe(true);
  expect(spxConfig.MD024).toEqual({ siblings_only: true });
  expect(docsConfig.MD024).toBe(false);
  expect(spxConfig.customRules).toHaveLength(MARKDOWN_VALIDATION_DATA.one);
  expect(spxConfig.customRules[MARKDOWN_VALIDATION_DATA.zero].names).toEqual(MARKDOWN_CUSTOM_RULE_NAMES);
}

async function runCommandDefaultsScenario(scenario: MarkdownValidationScenario): Promise<void> {
  await withMarkdownScenarioEnv(scenario, async ({ path }) => {
    const result = await markdownCommand({ cwd: path });

    expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.one);
    expect(result.output).toContain(MARKDOWN_COMMAND_OUTPUT.ERROR_SUMMARY_SUFFIX);
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
  await withMarkdownScenarioEnv(scenario, async ({ path, spxDir }) => {
    const result = await markdownCommand({
      cwd: path,
      files: [spxDir],
    });

    expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.zero);
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
  await withMarkdownTempProject(async ({ spxDir }) => {
    await mkdir(spxDir, { recursive: true });
    await writeFile(
      join(spxDir, MARKDOWN_VALIDATION_DATA.brokenMarkdownFile),
      MARKDOWN_VALIDATION_DATA.brokenMarkdownContent,
    );

    const result = await runValidationSubprocess([
      validationCliDefinition.subcommands.markdown.commandName,
      MARKDOWN_VALIDATION_DATA.filesFlag,
      spxDir,
    ]);

    expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.one);
    expect(result.stdout).toContain(MARKDOWN_VALIDATION_DATA.missingFileMarker);
  });
}

async function runE2eValidDirectoryScenario(): Promise<void> {
  await withMarkdownTempProject(async ({ spxDir }) => {
    await writeValidMarkdownPair(spxDir);

    const result = await runValidationSubprocess([
      validationCliDefinition.subcommands.markdown.commandName,
      MARKDOWN_VALIDATION_DATA.filesFlag,
      spxDir,
    ]);

    expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.zero);
  });
}

async function runE2eDirectFileScenario(): Promise<void> {
  await withMarkdownTempProject(async ({ spxDir }) => {
    const sourceFile = await writeValidMarkdownPair(spxDir);

    const result = await runValidationSubprocess([
      validationCliDefinition.subcommands.markdown.commandName,
      MARKDOWN_VALIDATION_DATA.filesFlag,
      sourceFile,
    ]);

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

async function withMarkdownTempProject(
  callback: (context: { readonly path: string; readonly spxDir: string }) => Promise<void>,
): Promise<void> {
  const path = await mkdtemp(join(tmpdir(), MARKDOWN_VALIDATION_DATA.e2eTempPrefix));
  try {
    await callback({
      path,
      spxDir: join(path, MARKDOWN_VALIDATION_DATA.spxDirectoryName),
    });
  } finally {
    await rm(path, { recursive: true, force: true });
  }
}

async function withMarkdownScenarioEnv(
  scenario: MarkdownValidationScenario,
  callback: Parameters<typeof withMarkdownEnv>[1],
): Promise<void> {
  if (scenario.fixture === undefined) {
    throw new Error(scenario.title);
  }
  await withMarkdownEnv({ fixture: scenario.fixture }, callback);
}
