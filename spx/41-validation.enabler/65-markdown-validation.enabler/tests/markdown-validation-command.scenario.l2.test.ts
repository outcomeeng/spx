import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { allCommand } from "@/commands/validation/all";
import { MARKDOWN_COMMAND_OUTPUT, markdownCommand } from "@/commands/validation/markdown";
import { VALIDATION_EXIT_CODES, VALIDATION_STAGE_DISPLAY_NAMES } from "@/commands/validation/messages";
import type { AllValidationJsonOutput } from "@/commands/validation/types";
import { validationCliDefinition } from "@/interfaces/cli/validation-contract";
import { MARKDOWN_VALIDATION_STAGE_PARTICIPATION } from "@/validation/languages/markdown";
import { MARKDOWN_VALIDATION_TARGET_DIAGNOSTICS } from "@/validation/steps/markdown";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  arbitrarySpecTreeLinkScenario,
  markdownBrokenRelativeLink,
  markdownMissingScopePath,
  markdownUnrelatedScopeFile,
  markdownValidRelativeLink,
} from "@testing/generators/validation/markdown";
import { runValidationSubprocess } from "@testing/harnesses/validation/cli";
import { withMarkdownTempProject } from "@testing/harnesses/validation/markdown";
import { MARKDOWN_FIXTURES, MARKDOWN_HARNESS_TIMEOUT, withMarkdownEnv } from "@testing/harnesses/with-markdown-env";

describe("Given spx/ and docs/ directories exist", () => {
  it("validates both directories when spx validation markdown runs with no arguments", async () => {
    await withMarkdownTempProject(async ({ docsDir, productDir, spxDir, write, writeLinkCase }) => {
      const scenario = sampleGeneratedValue(arbitrarySpecTreeLinkScenario());
      await writeLinkCase(markdownValidRelativeLink(scenario, relative(productDir, spxDir)));
      await writeLinkCase(markdownValidRelativeLink(scenario, relative(productDir, docsDir)));
      const specTreeBroken = markdownBrokenRelativeLink(scenario, relative(productDir, spxDir));
      const docsBroken = markdownBrokenRelativeLink(scenario, relative(productDir, docsDir));
      await write(specTreeBroken.citingFile, specTreeBroken.content);
      await write(docsBroken.citingFile, docsBroken.content);

      const result = await markdownCommand({ cwd: productDir });

      expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.FAILURE);
      expect(result.output).toContain(MARKDOWN_COMMAND_OUTPUT.PROBLEM_TERM);
      expect(result.output).toContain(specTreeBroken.citingFile);
      expect(result.output).toContain(docsBroken.citingFile);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given spx/ is supplied as a positional operand", () => {
  it("validates only the specified directory", async () => {
    await withMarkdownTempProject(async ({ docsDir, productDir, spxDir, write, writeLinkCase }) => {
      const scenario = sampleGeneratedValue(arbitrarySpecTreeLinkScenario());
      await writeLinkCase(markdownValidRelativeLink(scenario, relative(productDir, spxDir)));
      const docsBroken = markdownBrokenRelativeLink(scenario, relative(productDir, docsDir));
      await write(docsBroken.citingFile, docsBroken.content);

      const result = await markdownCommand({ cwd: productDir, files: [spxDir] });

      expect(result.output).not.toContain(docsBroken.citingFile);
      expect(result.output).toContain(MARKDOWN_COMMAND_OUTPUT.NO_ISSUES);
      expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given spx validation all runs", () => {
  it("executes markdown validation as a step whose failure fails the pipeline", async () => {
    await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.BROKEN_LINKS }, async ({ path }) => {
      const result = await allCommand({ cwd: path, json: true });
      const report = JSON.parse(result.output) as AllValidationJsonOutput;

      expect(report.steps).toContainEqual(
        expect.objectContaining({
          name: VALIDATION_STAGE_DISPLAY_NAMES.MARKDOWN,
          exitCode: VALIDATION_EXIT_CODES.FAILURE,
        }),
      );
      expect(report.success).toBe(false);
      expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.FAILURE);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);

  it("passes the same pipeline once only the markdown step is skipped", async () => {
    await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.BROKEN_LINKS }, async ({ path }) => {
      const result = await allCommand({
        cwd: path,
        quiet: true,
        participationOverrides: [
          MARKDOWN_VALIDATION_STAGE_PARTICIPATION[VALIDATION_STAGE_DISPLAY_NAMES.MARKDOWN].override.flag,
        ],
      });

      expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given a user runs spx validation markdown", () => {
  it("registers the command in the packaged executable's help", async () => {
    const result = await runValidationSubprocess([
      validationCliDefinition.subcommands.markdown.commandName,
      validationCliDefinition.commanderHelpOperands.longFlag,
    ]);

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain(validationCliDefinition.subcommands.markdown.commandName);
    expect(result.stdout).toContain(validationCliDefinition.subcommands.markdown.description);
  }, MARKDOWN_HARNESS_TIMEOUT);

  it("executes markdown validation over a valid directory operand", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir, writeLinkCase }) => {
      await writeLinkCase(
        markdownValidRelativeLink(sampleGeneratedValue(arbitrarySpecTreeLinkScenario()), relative(productDir, spxDir)),
      );

      const result = await runValidationSubprocess([
        validationCliDefinition.subcommands.markdown.commandName,
        spxDir,
      ], { cwd: productDir });

      expect(result.stdout).toContain(MARKDOWN_COMMAND_OUTPUT.NO_ISSUES);
      expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);

  it("executes markdown validation over a direct markdown file operand", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir, writeLinkCase }) => {
      const sourceFile = await writeLinkCase(
        markdownValidRelativeLink(sampleGeneratedValue(arbitrarySpecTreeLinkScenario()), relative(productDir, spxDir)),
      );

      const result = await runValidationSubprocess([
        validationCliDefinition.subcommands.markdown.commandName,
        sourceFile,
      ], { cwd: productDir });

      expect(result.stdout).toContain(MARKDOWN_COMMAND_OUTPUT.NO_ISSUES);
      expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);

  it("reports the broken link of a direct markdown file operand", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir, write }) => {
      const link = markdownBrokenRelativeLink(
        sampleGeneratedValue(arbitrarySpecTreeLinkScenario()),
        relative(productDir, spxDir),
      );
      const brokenFile = await write(link.citingFile, link.content);

      const result = await runValidationSubprocess([
        validationCliDefinition.subcommands.markdown.commandName,
        brokenFile,
      ], { cwd: productDir });

      expect(result.stderr).toContain(link.href);
      expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.FAILURE);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given a user runs spx validation markdown on a directory with a broken link", () => {
  it("exits with code 1 and identifies the broken link in the error output", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir, write }) => {
      const link = markdownBrokenRelativeLink(
        sampleGeneratedValue(arbitrarySpecTreeLinkScenario()),
        relative(productDir, spxDir),
      );
      await write(link.citingFile, link.content);

      const result = await runValidationSubprocess([
        validationCliDefinition.subcommands.markdown.commandName,
        spxDir,
      ], { cwd: productDir });

      expect(result.stderr).toContain(link.citingFile);
      expect(result.stderr).toContain(link.href);
      expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.FAILURE);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given a file scope contains a missing markdown file path", () => {
  it("reports the skipped scope and exits 0 when no markdown target remains", async () => {
    await withMarkdownTempProject(async ({ productDir }) => {
      const missingFile = join(
        productDir,
        markdownMissingScopePath(sampleGeneratedValue(arbitrarySpecTreeLinkScenario())),
      );

      const result = await markdownCommand({ cwd: productDir, files: [missingFile] });

      expect(result.output).toContain(MARKDOWN_COMMAND_OUTPUT.SKIPPED_FILE_SCOPE_PREFIX);
      expect(result.output).toContain(MARKDOWN_VALIDATION_TARGET_DIAGNOSTICS.MISSING_OR_UNRELATED_SCOPE);
      expect(result.output).toContain(missingFile);
      expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given a file scope contains a path that is neither an existing directory nor a markdown file", () => {
  it("reports the skipped scope and exits 0 when no markdown target remains", async () => {
    await withMarkdownTempProject(async ({ productDir, write }) => {
      const unrelated = markdownUnrelatedScopeFile(sampleGeneratedValue(arbitrarySpecTreeLinkScenario()));
      const unrelatedFile = await write(unrelated.path, unrelated.content);

      const result = await markdownCommand({ cwd: productDir, files: [unrelatedFile] });

      expect(result.output).toContain(MARKDOWN_COMMAND_OUTPUT.SKIPPED_FILE_SCOPE_PREFIX);
      expect(result.output).toContain(MARKDOWN_VALIDATION_TARGET_DIAGNOSTICS.MISSING_OR_UNRELATED_SCOPE);
      expect(result.output).toContain(unrelatedFile);
      expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given file scope contains both a valid markdown target and an unrelated file", () => {
  it("validates the markdown target and reports the skipped unrelated file", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir, write, writeLinkCase }) => {
      const scenario = sampleGeneratedValue(arbitrarySpecTreeLinkScenario());
      const sourceFile = await writeLinkCase(markdownValidRelativeLink(scenario, relative(productDir, spxDir)));
      const unrelated = markdownUnrelatedScopeFile(scenario);
      const unrelatedFile = await write(unrelated.path, unrelated.content);

      const result = await markdownCommand({ cwd: productDir, files: [sourceFile, unrelatedFile] });

      expect(result.output).toContain(MARKDOWN_COMMAND_OUTPUT.NO_ISSUES);
      expect(result.output).toContain(MARKDOWN_COMMAND_OUTPUT.SKIPPED_FILE_SCOPE_PREFIX);
      expect(result.output).toContain(unrelatedFile);
      expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});
