import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { allCommand } from "@/commands/validation/all";
import { MARKDOWN_COMMAND_OUTPUT, markdownCommand } from "@/commands/validation/markdown";
import { validationCliDefinition } from "@/interfaces/cli/validation-contract";
import { MARKDOWN_VALIDATION_TARGET_DIAGNOSTICS } from "@/validation/steps/markdown";
import { MARKDOWN_VALIDATION_DATA } from "@testing/generators/validation/markdown";
import { runValidationSubprocess } from "@testing/harnesses/validation/cli";
import { withMarkdownTempProject, writeMarkdownFile } from "@testing/harnesses/validation/markdown";
import { MARKDOWN_FIXTURES, MARKDOWN_HARNESS_TIMEOUT, withMarkdownEnv } from "@testing/harnesses/with-markdown-env";

describe("Given spx/ and docs/ directories exist", () => {
  it("validates both directories when spx validation markdown runs with no arguments", async () => {
    await withMarkdownTempProject(async ({ docsDir, productDir, spxDir, writeValidMarkdownPair }) => {
      await writeValidMarkdownPair(spxDir);
      await writeValidMarkdownPair(docsDir);
      await writeMarkdownFile(
        join(spxDir, MARKDOWN_VALIDATION_DATA.defaultSpxBrokenFile),
        MARKDOWN_VALIDATION_DATA.brokenMarkdownContent,
      );
      await writeMarkdownFile(
        join(docsDir, MARKDOWN_VALIDATION_DATA.defaultDocsBrokenFile),
        MARKDOWN_VALIDATION_DATA.brokenMarkdownContent,
      );

      const result = await markdownCommand({ cwd: productDir });

      expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.one);
      expect(result.output).toContain(MARKDOWN_COMMAND_OUTPUT.PROBLEM_TERM);
      expect(result.output).toContain(MARKDOWN_VALIDATION_DATA.defaultSpxBrokenFile);
      expect(result.output).toContain(MARKDOWN_VALIDATION_DATA.defaultDocsBrokenFile);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given spx/ is supplied as a positional operand", () => {
  it("validates only the specified directory", async () => {
    await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.CLEAN_TREE }, async ({ docsDir, path, spxDir }) => {
      await writeMarkdownFile(
        join(docsDir, MARKDOWN_VALIDATION_DATA.explicitScopeDocsDecoyFile),
        MARKDOWN_VALIDATION_DATA.brokenMarkdownContent,
      );

      const result = await markdownCommand({ cwd: path, files: [spxDir] });

      expect(result.output).not.toContain(MARKDOWN_VALIDATION_DATA.explicitScopeDocsDecoyFile);
      expect(result.output).toContain(MARKDOWN_COMMAND_OUTPUT.NO_ISSUES);
      expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.zero);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given spx validation all runs", () => {
  it("executes markdown validation as a step whose failure fails the pipeline", async () => {
    await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.BROKEN_LINKS }, async ({ path }) => {
      const result = await allCommand({ cwd: path, quiet: true });

      expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.one);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given a user runs spx validation markdown", () => {
  it("registers the command in the packaged executable's help", async () => {
    const result = await runValidationSubprocess([
      validationCliDefinition.subcommands.markdown.commandName,
      MARKDOWN_VALIDATION_DATA.helpFlag,
    ]);

    expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.zero);
    expect(result.stdout).toContain(validationCliDefinition.subcommands.markdown.commandName);
    expect(result.stdout).toContain(validationCliDefinition.subcommands.markdown.description);
  }, MARKDOWN_HARNESS_TIMEOUT);

  it("executes markdown validation over a valid directory operand", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir, writeValidMarkdownPair }) => {
      await writeValidMarkdownPair(spxDir);

      const result = await runValidationSubprocess([
        validationCliDefinition.subcommands.markdown.commandName,
        spxDir,
      ], { cwd: productDir });

      expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.zero);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);

  it("executes markdown validation over a direct markdown file operand", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir, writeValidMarkdownPair }) => {
      const sourceFile = await writeValidMarkdownPair(spxDir);

      const result = await runValidationSubprocess([
        validationCliDefinition.subcommands.markdown.commandName,
        sourceFile,
      ], { cwd: productDir });

      expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.zero);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given a user runs spx validation markdown on a directory with a broken link", () => {
  it("exits with code 1 and identifies the broken link in the error output", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir }) => {
      await writeMarkdownFile(
        join(spxDir, MARKDOWN_VALIDATION_DATA.brokenMarkdownFile),
        MARKDOWN_VALIDATION_DATA.brokenMarkdownContent,
      );

      const result = await runValidationSubprocess([
        validationCliDefinition.subcommands.markdown.commandName,
        spxDir,
      ], { cwd: productDir });

      expect(result.stderr).toContain(MARKDOWN_VALIDATION_DATA.brokenMarkdownFile);
      expect(result.stderr).toContain(MARKDOWN_VALIDATION_DATA.missingFileMarker);
      expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.one);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given a file scope contains a missing markdown file path", () => {
  it("reports the skipped scope and exits 0 when no markdown target remains", async () => {
    await withMarkdownTempProject(async ({ productDir }) => {
      const missingFile = join(productDir, MARKDOWN_VALIDATION_DATA.missingMarkdownScopeFile);

      const result = await markdownCommand({ cwd: productDir, files: [missingFile] });

      expect(result.output).toContain(MARKDOWN_COMMAND_OUTPUT.SKIPPED_FILE_SCOPE_PREFIX);
      expect(result.output).toContain(MARKDOWN_VALIDATION_TARGET_DIAGNOSTICS.MISSING_OR_UNRELATED_SCOPE);
      expect(result.output).toContain(missingFile);
      expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.zero);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given a file scope contains a path that is neither an existing directory nor a markdown file", () => {
  it("reports the skipped scope and exits 0 when no markdown target remains", async () => {
    await withMarkdownTempProject(async ({ productDir }) => {
      const unrelatedFile = await writeMarkdownFile(
        join(productDir, MARKDOWN_VALIDATION_DATA.unrelatedMarkdownScopeFile),
        MARKDOWN_VALIDATION_DATA.unrelatedMarkdownScopeContent,
      );

      const result = await markdownCommand({ cwd: productDir, files: [unrelatedFile] });

      expect(result.output).toContain(MARKDOWN_COMMAND_OUTPUT.SKIPPED_FILE_SCOPE_PREFIX);
      expect(result.output).toContain(MARKDOWN_VALIDATION_TARGET_DIAGNOSTICS.MISSING_OR_UNRELATED_SCOPE);
      expect(result.output).toContain(unrelatedFile);
      expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.zero);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});

describe("Given file scope contains both a valid markdown target and an unrelated file", () => {
  it("validates the markdown target and reports the skipped unrelated file", async () => {
    await withMarkdownTempProject(async ({ productDir, spxDir, writeValidMarkdownPair }) => {
      const sourceFile = await writeValidMarkdownPair(spxDir);
      const unrelatedFile = await writeMarkdownFile(
        join(productDir, MARKDOWN_VALIDATION_DATA.unrelatedMarkdownScopeFile),
        MARKDOWN_VALIDATION_DATA.unrelatedMarkdownScopeContent,
      );

      const result = await markdownCommand({ cwd: productDir, files: [sourceFile, unrelatedFile] });

      expect(result.output).toContain(MARKDOWN_COMMAND_OUTPUT.NO_ISSUES);
      expect(result.output).toContain(MARKDOWN_COMMAND_OUTPUT.SKIPPED_FILE_SCOPE_PREFIX);
      expect(result.output).toContain(unrelatedFile);
      expect(result.exitCode).toBe(MARKDOWN_VALIDATION_DATA.zero);
    });
  }, MARKDOWN_HARNESS_TIMEOUT);
});
