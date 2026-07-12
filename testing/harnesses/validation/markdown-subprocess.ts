import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, it } from "vitest";

import { validationCliDefinition } from "@/interfaces/cli/validation-contract";
import {
  MARKDOWN_SCENARIO_KIND,
  MARKDOWN_VALIDATION_DATA,
  markdownE2eScenarios,
  type MarkdownValidationScenario,
} from "@testing/generators/validation/markdown";
import { runValidationSubprocess } from "@testing/harnesses/validation/cli";
import { withMarkdownTempProject, writeValidMarkdownPair } from "@testing/harnesses/validation/markdown";

export function registerMarkdownE2eScenarioTests(): void {
  for (const scenario of markdownE2eScenarios()) {
    it(
      scenario.title,
      { timeout: scenario.timeout },
      () => runMarkdownE2eScenario(scenario),
    );
  }
}

async function runMarkdownE2eScenario(scenario: MarkdownValidationScenario): Promise<void> {
  switch (scenario.kind) {
    case MARKDOWN_SCENARIO_KIND.E2E_HELP:
      return runHelpScenario();
    case MARKDOWN_SCENARIO_KIND.E2E_BROKEN_DIRECTORY:
      return runBrokenDirectoryScenario();
    case MARKDOWN_SCENARIO_KIND.E2E_VALID_DIRECTORY:
      return runValidDirectoryScenario();
    case MARKDOWN_SCENARIO_KIND.E2E_DIRECT_FILE:
      return runDirectFileScenario();
    case MARKDOWN_SCENARIO_KIND.DOCS_DIRECT_FILE_MD024:
      return runDocsDirectFileMd024Scenario();
    default:
      throw new Error(`Unsupported Markdown subprocess scenario: ${scenario.kind}`);
  }
}

async function runHelpScenario(): Promise<void> {
  const result = await runValidationSubprocess([
    validationCliDefinition.subcommands.markdown.commandName,
    MARKDOWN_VALIDATION_DATA.helpFlag,
  ]);

  expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.zero);
  expect(result.stdout).toContain(validationCliDefinition.subcommands.markdown.commandName);
  expect(result.stdout).toContain(validationCliDefinition.subcommands.markdown.description);
}

async function runBrokenDirectoryScenario(): Promise<void> {
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

async function runValidDirectoryScenario(): Promise<void> {
  await withMarkdownTempProject(async ({ path, spxDir }) => {
    await writeValidMarkdownPair(spxDir);

    const result = await runValidationSubprocess([
      validationCliDefinition.subcommands.markdown.commandName,
      spxDir,
    ], { cwd: path });

    expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.zero);
  });
}

async function runDirectFileScenario(): Promise<void> {
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

    const result = await runValidationSubprocess([
      validationCliDefinition.subcommands.markdown.commandName,
      sourceFile,
    ], { cwd: path });

    expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.zero);
  });
}
