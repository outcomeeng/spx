import { symlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { LITERAL_PROBLEM_KIND, VALIDATION_COMMAND_OUTPUT } from "@/commands/validation";
import {
  allValidationCliOptions,
  literalValidationCliOptions,
  validationCliDefinition,
} from "@/interfaces/cli/validation";
import { sanitizeCliArgument, SENTINEL_EMPTY } from "@/lib/sanitize-cli-argument";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import {
  VALIDATION_CLI_GENERATOR,
  VALIDATION_PIPELINE_DATA,
  validationCliEmptyOutputLength,
  validationCliSuccessExitCodeUpperBound,
} from "@testing/generators/validation/validation";
import {
  runValidationInProcess,
  runValidationSubprocess,
  validationCliEmptyOutput,
  validationCliOptionName,
  withEmptyValidationProject,
} from "@testing/harnesses/validation/cli";

describe("spx validation dispatch — observable scenarios", () => {
  it("registered subcommand runs its handler without dispatch failure", async () => {
    const result = await runValidationSubprocess([
      validationCliDefinition.subcommands.all.commandName,
      allValidationCliOptions.skipCircular.flag,
      allValidationCliOptions.skipLiteral.flag,
    ], { timeout: VALIDATION_PIPELINE_DATA.allTimeout });

    expect(result.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
    expect(result.stdout).toContain(VALIDATION_COMMAND_OUTPUT.TYPESCRIPT_SUCCESS);
    expect(result.stdout).toContain(VALIDATION_COMMAND_OUTPUT.MARKDOWN_NO_ISSUES);
    expect(result.stderr).not.toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
  }, VALIDATION_PIPELINE_DATA.allTimeout);

  it("registered subcommand propagates a non-zero handler exit code", async () => {
    await withEmptyValidationProject(async (projectRoot) => {
      const unsafeKind = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.invalidLiteralProblemKind());
      const result = await runValidationSubprocess(
        [
          validationCliDefinition.subcommands.literal.commandName,
          validationCliOptionName(literalValidationCliOptions.kind),
          unsafeKind,
        ],
        { cwd: projectRoot },
      );

      expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownLiteralProblemKind.exitCode);
      expect(result.stdout).toBe(validationCliEmptyOutput());
      expect(result.stderr).toContain(validationCliDefinition.diagnostics.unknownLiteralProblemKind.messageLabel);
      expect(result.stderr).toContain(sanitizeCliArgument(unsafeKind));
      expect(result.stderr).not.toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
    });
  });

  it("path operands that escape the product directory are rejected before validation runs", async () => {
    await withEmptyValidationProject(async (productRoot) => {
      const result = await runValidationSubprocess(
        [
          validationCliDefinition.subcommands.format.commandName,
          VALIDATION_PIPELINE_DATA.escapingPathOperand,
        ],
        { cwd: productRoot },
      );

      expect(result.exitCode).toBe(validationCliDefinition.diagnostics.invalidPathOperand.exitCode);
      expect(result.stdout).toBe(validationCliEmptyOutput());
      expect(result.stderr).toContain(validationCliDefinition.diagnostics.invalidPathOperand.messageLabel);
      expect(result.stderr).toContain(sanitizeCliArgument(VALIDATION_PIPELINE_DATA.escapingPathOperand));
      expect(result.stderr).toContain(validationCliDefinition.diagnostics.invalidPathOperand.reason);
      expect(result.stderr).not.toContain(VALIDATION_COMMAND_OUTPUT.FORMATTING_NO_ISSUES);
    });
  });

  it("non-existent in-product path operands resolve from a symlinked invocation directory", async () => {
    await withEmptyValidationProject(async (productRoot) => {
      const symlinkRoot = join(dirname(productRoot), `${basename(productRoot)}-link`);
      const operand = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
      await symlink(productRoot, symlinkRoot, "dir");

      const result = await runValidationSubprocess(
        [
          validationCliDefinition.subcommands.format.commandName,
          operand,
        ],
        { cwd: symlinkRoot },
      );

      expect(result.exitCode).not.toBe(validationCliDefinition.diagnostics.invalidPathOperand.exitCode);
      expect(result.stderr).not.toContain(validationCliDefinition.diagnostics.invalidPathOperand.messageLabel);
      expect(result.stderr).not.toContain(validationCliDefinition.diagnostics.invalidPathOperand.reason);
    });
  });

  it("unknown subcommand reaches the sanitized diagnostic path", async () => {
    const unknownStage = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.unknownSubcommand());
    const result = await runValidationSubprocess([unknownStage]);

    expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
    expect(result.stderr).toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
    expect(result.stderr).toContain(unknownStage);
  });

  it("empty argument reports the empty-value sentinel", async () => {
    const result = await runValidationSubprocess([
      sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.emptyArgument()),
    ]);

    expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
    expect(result.stderr).toContain(SENTINEL_EMPTY);
  });

  it("ASCII control characters are escaped before reaching stderr", async () => {
    const unsafeArgument = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.controlArgument());
    const result = await runValidationSubprocess([unsafeArgument]);

    expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
    expect(result.stderr).toContain(sanitizeCliArgument(unsafeArgument));
    expect(result.stderr).not.toContain(unsafeArgument);
  });

  it("multi-byte Unicode arguments are preserved in stderr", async () => {
    const unicodeArgument = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.unicodeArgument());
    const result = await runValidationSubprocess([unicodeArgument]);

    expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
    expect(result.stderr).toContain(unicodeArgument);
  });

  it("literal help lists literal flags and valid problem kinds", async () => {
    const result = await runValidationInProcess([
      validationCliDefinition.subcommands.literal.commandName,
      validationCliDefinition.commanderHelpOperands.longFlag,
    ]);

    expect(result.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
    expect(result.stderr).toHaveLength(validationCliEmptyOutputLength());
    expect(result.stdout).toContain(literalValidationCliOptions.allowlistExisting.flag);
    expect(result.stdout).toContain(literalValidationCliOptions.kind.flag);
    expect(result.stdout).toContain(literalValidationCliOptions.filesWithProblems.flag);
    expect(result.stdout).toContain(literalValidationCliOptions.literals.flag);
    expect(result.stdout).toContain(literalValidationCliOptions.verbose.flag);
    expect(result.stdout).toContain(validationCliDefinition.pathOperands.optionalVariadic);
    expect(result.stdout).toContain(LITERAL_PROBLEM_KIND.REUSE);
    expect(result.stdout).toContain(LITERAL_PROBLEM_KIND.DUPE);
  });

  it("validation all help lists full-pipeline skip flags", async () => {
    const result = await runValidationInProcess([
      validationCliDefinition.subcommands.all.commandName,
      validationCliDefinition.commanderHelpOperands.longFlag,
    ]);

    expect(result.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
    expect(result.stderr).toHaveLength(validationCliEmptyOutputLength());
    expect(result.stdout).toContain(allValidationCliOptions.skipCircular.flag);
    expect(result.stdout).toContain(allValidationCliOptions.skipLiteral.flag);
  });

  it("literal help omits full-pipeline skip flags", async () => {
    const result = await runValidationInProcess([
      validationCliDefinition.subcommands.literal.commandName,
      validationCliDefinition.commanderHelpOperands.longFlag,
    ]);

    expect(result.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
    expect(result.stderr).toHaveLength(validationCliEmptyOutputLength());
    expect(result.stdout).not.toContain(allValidationCliOptions.skipCircular.flag);
    expect(result.stdout).not.toContain(allValidationCliOptions.skipLiteral.flag);
  });

  it("literal command rejects the full-pipeline literal skip flag", async () => {
    const result = await runValidationInProcess([
      validationCliDefinition.subcommands.literal.commandName,
      allValidationCliOptions.skipLiteral.flag,
    ]);

    expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
    expect(result.stdout).toBe(validationCliEmptyOutput());
    expect(result.stderr).toContain(allValidationCliOptions.skipLiteral.flag);
  });

  it("circular command rejects the full-pipeline circular skip flag", async () => {
    const result = await runValidationInProcess([
      validationCliDefinition.subcommands.circular.commandName,
      allValidationCliOptions.skipCircular.flag,
    ]);

    expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
    expect(result.stdout).toBe(validationCliEmptyOutput());
    expect(result.stderr).toContain(allValidationCliOptions.skipCircular.flag);
  });
});
