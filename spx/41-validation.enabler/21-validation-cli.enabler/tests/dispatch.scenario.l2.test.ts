import { describe, expect, it } from "vitest";

import { LITERAL_PROBLEM_KIND } from "@/commands/validation";
import { allValidationCliOptions, literalValidationCliOptions, validationCliDefinition } from "@/domains/validation";
import { sanitizeCliArgument, SENTINEL_EMPTY } from "@/interfaces/cli/sanitize";
import {
  sampleValidationCliTestValue,
  VALIDATION_CLI_GENERATOR,
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
    const result = await runValidationSubprocess([validationCliDefinition.subcommands.all.commandName]);

    expect(result.stderr).not.toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
  });

  it("unknown subcommand reaches the sanitized diagnostic path", async () => {
    const unknownStage = sampleValidationCliTestValue(VALIDATION_CLI_GENERATOR.unknownSubcommand());
    const result = await runValidationSubprocess([unknownStage]);

    expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
    expect(result.stderr).toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
    expect(result.stderr).toContain(unknownStage);
  });

  it("empty argument reports the empty-value sentinel", async () => {
    const result = await runValidationSubprocess([
      sampleValidationCliTestValue(VALIDATION_CLI_GENERATOR.emptyArgument()),
    ]);

    expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
    expect(result.stderr).toContain(SENTINEL_EMPTY);
  });

  it("ASCII control characters are escaped before reaching stderr", async () => {
    const unsafeArgument = sampleValidationCliTestValue(VALIDATION_CLI_GENERATOR.controlArgument());
    const result = await runValidationSubprocess([unsafeArgument]);

    expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
    expect(result.stderr).toContain(sanitizeCliArgument(unsafeArgument));
    expect(result.stderr).not.toContain(unsafeArgument);
  });

  it("multi-byte Unicode arguments are preserved in stderr", async () => {
    const unicodeArgument = sampleValidationCliTestValue(VALIDATION_CLI_GENERATOR.unicodeArgument());
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
    expect(result.stdout).toContain(LITERAL_PROBLEM_KIND.REUSE);
    expect(result.stdout).toContain(LITERAL_PROBLEM_KIND.DUPE);
  });

  it("validation all help lists the literal skip flag", async () => {
    const result = await runValidationInProcess([
      validationCliDefinition.subcommands.all.commandName,
      validationCliDefinition.commanderHelpOperands.longFlag,
    ]);

    expect(result.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
    expect(result.stderr).toHaveLength(validationCliEmptyOutputLength());
    expect(result.stdout).toContain(allValidationCliOptions.skipLiteral.flag);
  });

  it("literal help omits the full-pipeline literal skip flag", async () => {
    const result = await runValidationInProcess([
      validationCliDefinition.subcommands.literal.commandName,
      validationCliDefinition.commanderHelpOperands.longFlag,
    ]);

    expect(result.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
    expect(result.stderr).toHaveLength(validationCliEmptyOutputLength());
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

  it("unknown literal problem kind is rejected before detection", async () => {
    await withEmptyValidationProject(async (projectRoot) => {
      const unsafeKind = sampleValidationCliTestValue(VALIDATION_CLI_GENERATOR.invalidLiteralProblemKind());
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
    });
  });
});
