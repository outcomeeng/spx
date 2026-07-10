import { readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { expect, it } from "vitest";

import { withTempDir } from "@testing/harnesses/with-temp-dir";

import { allCommand } from "@/commands/validation/all";
import { MARKDOWN_COMMAND_OUTPUT, markdownCommand } from "@/commands/validation/markdown";
import { validationCliDefinition } from "@/interfaces/cli/validation";
import { createNodeStatusExcludeReader, NODE_STATUS_EXCLUDE_FILENAME } from "@/lib/node-status/exclude";
import {
  buildMarkdownlintConfig,
  getDefaultDirectories,
  MARKDOWN_CUSTOM_RULE_NAMES,
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
import { MARKDOWN_FIXTURES, MARKDOWN_HARNESS_TIMEOUT, withMarkdownEnv } from "@testing/harnesses/with-markdown-env";

const SPEC_NODE_DIRECTORY_SUFFIX_PATTERN = /\.(?:enabler|outcome)$/u;
const PRODUCT_SPEC_TREE_DIRECTORY = "spx";

export function registerMarkdownUnitScenarioTests(): void {
  for (const scenario of markdownUnitScenarios()) {
    it(
      scenario.title,
      { timeout: scenario.timeout },
      () => runMarkdownValidationScenario(scenario),
    );
  }
}

export function registerMarkdownIntegrationScenarioTests(): void {
  for (const scenario of markdownIntegrationScenarios()) {
    it(
      scenario.title,
      { timeout: scenario.timeout },
      () => runMarkdownValidationScenario(scenario),
    );
  }
}

export function registerMarkdownE2eScenarioTests(): void {
  for (const scenario of markdownE2eScenarios()) {
    it(
      scenario.title,
      { timeout: scenario.timeout },
      () => runMarkdownValidationScenario(scenario),
    );
  }
}

export function registerMarkdownMappingTests(): void {
  it.each(
    [
      {
        title: "relative links resolve from the markdown file directory",
        kind: MARKDOWN_SCENARIO_KIND.CLEAN_TREE,
        fixture: MARKDOWN_FIXTURES.CLEAN_TREE,
        timeout: MARKDOWN_HARNESS_TIMEOUT,
      },
      {
        title: "external URL links are not checked by local link validation",
        kind: MARKDOWN_SCENARIO_KIND.EXTERNAL_URL_ALLOWED,
        timeout: MARKDOWN_HARNESS_TIMEOUT,
      },
      {
        title: "HTML href links are not checked by local link validation",
        kind: MARKDOWN_SCENARIO_KIND.HTML_LINK_ALLOWED,
        timeout: MARKDOWN_HARNESS_TIMEOUT,
      },
      {
        title: "project absolute links resolve from the project root",
        kind: MARKDOWN_SCENARIO_KIND.PROJECT_ABSOLUTE_LINK,
        timeout: MARKDOWN_HARNESS_TIMEOUT,
      },
      {
        title: "enabled built-in markdown rules map to markdownlint config",
        kind: MARKDOWN_SCENARIO_KIND.CONFIG_BUILDER,
        timeout: MARKDOWN_HARNESS_TIMEOUT,
      },
    ] satisfies readonly MarkdownValidationScenario[],
  )(
    "$title",
    { timeout: MARKDOWN_HARNESS_TIMEOUT },
    (scenario) => runMarkdownValidationScenario(scenario),
  );
}

export function registerMarkdownComplianceTests(): void {
  it(
    "broken markdown links fail the full validation pipeline",
    { timeout: MARKDOWN_HARNESS_TIMEOUT },
    () =>
      runMarkdownValidationScenario({
        title: "broken markdown links fail the full validation pipeline",
        kind: MARKDOWN_SCENARIO_KIND.PIPELINE_FAILURE,
        fixture: MARKDOWN_FIXTURES.BROKEN_LINKS,
        timeout: MARKDOWN_HARNESS_TIMEOUT,
      }),
  );
  it(
    "markdown validation produces no files in validated directories",
    { timeout: MARKDOWN_HARNESS_TIMEOUT },
    runNoSideEffectsCompliance,
  );
  it(
    "markdown command validates only spx and docs by default",
    { timeout: MARKDOWN_HARNESS_TIMEOUT },
    () =>
      runMarkdownValidationScenario({
        title: "markdown command validates only spx and docs by default",
        kind: MARKDOWN_SCENARIO_KIND.COMMAND_DEFAULTS,
        fixture: MARKDOWN_FIXTURES.BROKEN_LINKS,
        timeout: MARKDOWN_HARNESS_TIMEOUT,
      }),
  );
}

export async function runMarkdownValidationScenario(scenario: MarkdownValidationScenario): Promise<void> {
  switch (scenario.kind) {
    case MARKDOWN_SCENARIO_KIND.CLEAN_TREE:
      return runCleanTreeScenario(scenario);
    case MARKDOWN_SCENARIO_KIND.DATA_URI_ALLOWED:
      return runDataUriScenario(scenario);
    case MARKDOWN_SCENARIO_KIND.EXTERNAL_URL_ALLOWED:
      return runExternalUrlScenario();
    case MARKDOWN_SCENARIO_KIND.HTML_LINK_ALLOWED:
      return runHtmlLinkScenario();
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
    case MARKDOWN_SCENARIO_KIND.EXCLUDE_NODE_EXACT_ONLY:
      return runExcludeExactOnlyScenario();
    case MARKDOWN_SCENARIO_KIND.EXCLUDE_NODE_SCOPED_TARGET:
      return runExcludeScopedTargetScenario();
    case MARKDOWN_SCENARIO_KIND.CURRENT_EXCLUDE_MATCHES_FAILURES:
      return runCurrentExcludeMatchesFailuresScenario();
    case MARKDOWN_SCENARIO_KIND.DUPLICATE_HEADINGS:
      return runDuplicateHeadingsScenario(scenario);
    case MARKDOWN_SCENARIO_KIND.CONFIG_BUILDER:
      return runConfigBuilderScenario();
    case MARKDOWN_SCENARIO_KIND.COMMAND_DEFAULTS:
      return runCommandDefaultsScenario(scenario);
    case MARKDOWN_SCENARIO_KIND.FILE_SCOPE_DOCS:
      return runFileScopeDocsScenario(scenario);
    case MARKDOWN_SCENARIO_KIND.FILE_SCOPE_CLEAN_SPX:
      return runFileScopeCleanSpxScenario();
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

async function runExternalUrlScenario(): Promise<void> {
  await withMarkdownTempProject(async ({ path, spxDir }) => {
    await mkdir(spxDir, { recursive: true });
    const sourceFile = join(spxDir, MARKDOWN_VALIDATION_DATA.sourceMarkdownFile);
    await writeFile(sourceFile, MARKDOWN_VALIDATION_DATA.externalUrlMarkdownContent);

    const result = await validateMarkdown({
      targets: [markdownFileTarget(sourceFile)],
      projectRoot: path,
    });

    expect(result.success).toBe(true);
    expect(result.errors.filter((error) => error.detail.includes(MARKDOWN_VALIDATION_DATA.externalUrlMarker)))
      .toHaveLength(MARKDOWN_VALIDATION_DATA.zero);
  });
}

async function runHtmlLinkScenario(): Promise<void> {
  await withMarkdownTempProject(async ({ path, spxDir }) => {
    await mkdir(spxDir, { recursive: true });
    const sourceFile = join(spxDir, MARKDOWN_VALIDATION_DATA.sourceMarkdownFile);
    await writeFile(sourceFile, MARKDOWN_VALIDATION_DATA.htmlLinkMarkdownContent);

    const result = await validateMarkdown({
      targets: [markdownFileTarget(sourceFile)],
      projectRoot: path,
    });

    expect(result.success).toBe(true);
    expect(result.errors.filter((error) => error.detail.includes(MARKDOWN_VALIDATION_DATA.htmlLinkMarker)))
      .toHaveLength(MARKDOWN_VALIDATION_DATA.zero);
  });
}

async function runBrokenLinksScenario(scenario: MarkdownValidationScenario): Promise<void> {
  await withMarkdownScenarioEnv(scenario, async ({ spxDir }) => {
    const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)] });
    const sourceFile = join(
      spxDir,
      MARKDOWN_VALIDATION_DATA.sampleDirectoryName,
      MARKDOWN_VALIDATION_DATA.sampleMarkdownFile,
    );

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(MARKDOWN_VALIDATION_DATA.three);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        file: sourceFile,
        line: MARKDOWN_VALIDATION_DATA.brokenLinkLine,
        detail: expect.stringContaining(MARKDOWN_VALIDATION_DATA.brokenLinkTargetMarker),
      }),
    );
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

async function runProjectAbsoluteLinkScenario(_scenario: MarkdownValidationScenario): Promise<void> {
  await withMarkdownTempProject(async ({ path, spxDir }) => {
    const docsDir = join(path, MARKDOWN_VALIDATION_DATA.docsDirectoryName);
    await mkdir(spxDir, { recursive: true });
    await mkdir(docsDir, { recursive: true });
    const targetFile = join(spxDir, MARKDOWN_VALIDATION_DATA.targetMarkdownFile);
    const sourceFile = join(docsDir, MARKDOWN_VALIDATION_DATA.sourceMarkdownFile);
    await writeFile(targetFile, MARKDOWN_VALIDATION_DATA.validMarkdownTargetContent);
    await writeFile(
      sourceFile,
      `# Source\n\n[project target](/spx/${MARKDOWN_VALIDATION_DATA.targetMarkdownFile})\n`,
    );

    const wrongProjectRoot = await validateMarkdown({
      targets: [markdownDirectoryTarget(docsDir)],
      projectRoot: docsDir,
    });
    const result = await markdownCommand({
      cwd: path,
      files: [MARKDOWN_VALIDATION_DATA.docsDirectoryName],
    });

    expect(wrongProjectRoot.success).toBe(false);
    expect(wrongProjectRoot.errors.length).toBeGreaterThan(MARKDOWN_VALIDATION_DATA.zero);
    expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.zero);
    expect(result.output).toContain(MARKDOWN_COMMAND_OUTPUT.NO_ISSUES);
    expect(result.output).not.toContain(MARKDOWN_VALIDATION_DATA.missingFileMarker);
  });
}

async function runNoSideEffectsScenario(scenario: MarkdownValidationScenario): Promise<void> {
  await withMarkdownScenarioEnv(scenario, async ({ spxDir }) => {
    const treeBefore = snapshotDirectoryTree(spxDir);

    await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)] });

    expect(snapshotDirectoryTree(spxDir)).toEqual(treeBefore);
  });
}

async function runNoSideEffectsCompliance(): Promise<void> {
  await withMarkdownTempProject(async ({ spxDir }) => {
    await mkdir(spxDir, { recursive: true });
    const sampleDir = join(spxDir, MARKDOWN_VALIDATION_DATA.sampleDirectoryName);
    await mkdir(sampleDir, { recursive: true });
    await writeFile(
      join(sampleDir, MARKDOWN_VALIDATION_DATA.brokenMarkdownFile),
      MARKDOWN_VALIDATION_DATA.brokenMarkdownContent,
    );
    const treeBefore = snapshotDirectoryTree(spxDir);

    const result = await validateMarkdown({ targets: [markdownDirectoryTarget(spxDir)] });

    expect(result.success).toBe(false);
    expect(snapshotDirectoryTree(spxDir)).toEqual(treeBefore);
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

async function runCurrentExcludeMatchesFailuresScenario(): Promise<void> {
  const projectRoot = process.cwd();
  const spxDir = join(projectRoot, PRODUCT_SPEC_TREE_DIRECTORY);
  const unexcludedResult = await validateMarkdown({
    targets: [markdownDirectoryTarget(spxDir)],
    projectRoot,
    applyNodeStatusExcludes: false,
  });
  const failingNodePaths = new Set(
    unexcludedResult.errors.map((error) => specNodePathForMarkdownError(projectRoot, error.file)),
  );
  const excludedNodePaths = new Set(createNodeStatusExcludeReader(projectRoot).entries());
  const excludedResult = await validateMarkdown({
    targets: [markdownDirectoryTarget(spxDir)],
    projectRoot,
  });

  expect([...excludedNodePaths].sort((left, right) => left.localeCompare(right))).toEqual(
    [...failingNodePaths].sort((left, right) => left.localeCompare(right)),
  );
  expect(excludedResult.success).toBe(true);
}

function specNodePathForMarkdownError(projectRoot: string, file: string): string {
  const relativeFile = relative(projectRoot, file);
  const segments = relativeFile.split("/");
  for (let index = segments.length - 2; index >= 1; index -= 1) {
    if (SPEC_NODE_DIRECTORY_SUFFIX_PATTERN.test(segments[index])) {
      return segments.slice(1, index + 1).join("/");
    }
  }
  throw new Error(`Markdown failure is not inside a spec node: ${relativeFile}`);
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

  expect(spxConfig.default).toBe(false);
  expect(spxConfig.MD001).toBe(true);
  expect(spxConfig.MD003).toBe(true);
  expect(spxConfig.MD009).toBe(true);
  expect(spxConfig.MD010).toBe(true);
  expect(spxConfig.MD025).toBe(true);
  expect(spxConfig.MD047).toBe(true);
  expect(spxConfig.MD024).toEqual({ siblings_only: true });
  expect(docsConfig.MD024).toBe(false);
  expect(markdownConfigKeys(spxConfig)).toEqual(expectedMarkdownConfigKeys());
  expect(markdownConfigKeys(docsConfig)).toEqual(expectedMarkdownConfigKeys());
  expect(spxConfig.customRules).toHaveLength(MARKDOWN_VALIDATION_DATA.one);
  expect(spxConfig.customRules[MARKDOWN_VALIDATION_DATA.zero].names).toEqual(MARKDOWN_CUSTOM_RULE_NAMES);
}

async function runCommandDefaultsScenario(scenario: MarkdownValidationScenario): Promise<void> {
  await withMarkdownScenarioEnv(scenario, async ({ docsDir, path, spxDir }) => {
    const outsideFile = join(path, MARKDOWN_VALIDATION_DATA.brokenMarkdownFile);
    const outsideDir = join(path, MARKDOWN_VALIDATION_DATA.guideDirectoryName);
    const outsideNestedFile = join(outsideDir, MARKDOWN_VALIDATION_DATA.brokenMarkdownFile);
    await mkdir(outsideDir, { recursive: true });
    await writeFile(outsideFile, MARKDOWN_VALIDATION_DATA.brokenMarkdownContent);
    await writeFile(outsideNestedFile, MARKDOWN_VALIDATION_DATA.brokenMarkdownContent);

    const result = await markdownCommand({ cwd: path });

    expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.one);
    expect(result.output).toContain(MARKDOWN_COMMAND_OUTPUT.ERROR_SUMMARY_SUFFIX);
    expect(result.output).toContain(spxDir);
    expect(result.output).toContain(docsDir);
    expect(result.output).not.toContain(outsideFile);
    expect(result.output).not.toContain(outsideNestedFile);
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

async function runFileScopeCleanSpxScenario(): Promise<void> {
  await withMarkdownTempProject(async ({ docsDir, path, spxDir }) => {
    await writeValidMarkdownPair(spxDir);
    await mkdir(docsDir, { recursive: true });
    const brokenDocsFile = join(docsDir, MARKDOWN_VALIDATION_DATA.brokenMarkdownFile);
    await writeFile(brokenDocsFile, MARKDOWN_VALIDATION_DATA.brokenMarkdownContent);

    const result = await markdownCommand({
      cwd: path,
      files: [spxDir],
    });

    expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.zero);
    expect(result.output).toContain(MARKDOWN_COMMAND_OUTPUT.NO_ISSUES);
    expect(result.output).not.toContain(docsDir);
    expect(result.output).not.toContain(brokenDocsFile);
  });
}

async function runPipelineFailureScenario(scenario: MarkdownValidationScenario): Promise<void> {
  await withMarkdownScenarioEnv(scenario, async ({ path }) => {
    const result = await allCommand({
      cwd: path,
    });

    expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.one);
    expect(result.output).toContain(MARKDOWN_COMMAND_OUTPUT.ERROR_SUMMARY_SUFFIX);
    expect(result.output).toContain(MARKDOWN_VALIDATION_DATA.missingFileMarker);
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
    expect(result.stderr).toContain(MARKDOWN_VALIDATION_DATA.missingFileMarker);
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
  callback: (context: {
    readonly docsDir: string;
    readonly path: string;
    readonly spxDir: string;
  }) => Promise<void>,
): Promise<void> {
  return withTempDir(MARKDOWN_VALIDATION_DATA.e2eTempPrefix, (path) =>
    callback({
      docsDir: join(path, MARKDOWN_VALIDATION_DATA.docsDirectoryName),
      path,
      spxDir: join(path, MARKDOWN_VALIDATION_DATA.spxDirectoryName),
    }));
}

function markdownConfigKeys(config: ReturnType<typeof buildMarkdownlintConfig>): string[] {
  return Object.keys(config).sort(compareStrings);
}

function expectedMarkdownConfigKeys(): string[] {
  return [...MARKDOWN_VALIDATION_DATA.expectedMarkdownConfigKeys].sort(compareStrings);
}

function snapshotDirectoryTree(root: string): readonly string[] {
  const entries: string[] = [];
  collectDirectoryEntries(root, root, entries);
  return entries.sort(compareStrings);
}

function collectDirectoryEntries(root: string, directory: string, entries: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    const relativePath = relative(root, absolutePath);
    entries.push(`${entry.isDirectory() ? "dir" : "file"}:${relativePath}`);
    if (entry.isDirectory()) {
      collectDirectoryEntries(root, absolutePath, entries);
    }
  }
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
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
