import { mkdir, symlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { collectHarnessTestCases, describe, expect, it } from "@testing/harnesses/vitest-registration";

import { VALIDATION_COMMAND_OUTPUT } from "@/commands/validation";
import { SPX_PROGRAM_NAME } from "@/interfaces/cli/program";
import {
  allValidationCliOptions,
  literalValidationCliOptions,
  VALIDATION_EMPTY_CLI_OPERAND,
  validationCliDefinition,
  validationLiteralProblemKinds,
} from "@/interfaces/cli/validation-contract";
import { sanitizeCliArgument, SENTINEL_EMPTY } from "@/lib/sanitize-cli-argument";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import {
  VALIDATION_CLI_GENERATOR,
  VALIDATION_PIPELINE_DATA,
  validationCliSuccessExitCodeUpperBound,
} from "@testing/generators/validation/validation";
import {
  createRecordingValidationDomain,
  expectedEscapedControlArgument,
  expectValidationDispatchFailureInvokesNoHandler,
  runValidationInProcess,
  runValidationSubprocess,
  VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT,
  validationCliEmptyOutput,
  validationCliOptionName,
  withEmptyValidationProject,
  withIsolatedPackagedValidationCli,
} from "@testing/harnesses/validation/cli";
import { PROJECT_FIXTURES, withValidationEnv } from "@testing/harnesses/with-validation-env";

async function expectRegisteredSubcommandRuns(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    await withIsolatedPackagedValidationCli(async ({ executablePath }) => {
      const result = await runValidationSubprocess([
        validationCliDefinition.subcommands.all.commandName,
        allValidationCliOptions.skipCircular.flag,
        allValidationCliOptions.skipLiteral.flag,
      ], { cwd: path, executablePath, timeout: VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT });

      expect(result.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
      expect(result.stdout).toContain(VALIDATION_COMMAND_OUTPUT.TYPESCRIPT_SUCCESS);
      expect(result.stdout).toContain(VALIDATION_COMMAND_OUTPUT.MARKDOWN_NO_ISSUES);
      expect(result.stderr).not.toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
    });
  });
}

async function expectRegisteredSubcommandPropagatesNonZeroExit(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.WITH_TYPE_ERRORS }, async ({ path }) => {
    const result = await runValidationSubprocess([
      validationCliDefinition.subcommands.all.commandName,
      allValidationCliOptions.skipCircular.flag,
      allValidationCliOptions.skipLiteral.flag,
    ], { cwd: path, timeout: VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT });

    expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.FAILURE);
    expect(result.stdout).toContain(VALIDATION_PIPELINE_DATA.stageNames.TYPESCRIPT);
    expect(result.stderr).not.toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
  });
}

async function expectInvalidLiteralKindRejectedBeforeHandler(): Promise<void> {
  await withEmptyValidationProject(async (projectRoot) => {
    const unsafeKind = sampleLiteralTestValue(
      VALIDATION_CLI_GENERATOR.sanitizationSensitiveInvalidLiteralProblemKind(),
    );
    const result = await runValidationSubprocess(
      [
        validationCliDefinition.subcommands.literal.commandName,
        validationCliOptionName(literalValidationCliOptions.kind),
        unsafeKind,
      ],
      { cwd: projectRoot },
    );

    expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownLiteralProblemKind.exitCode);
    const recordedResult = await expectValidationDispatchFailureInvokesNoHandler(
      [
        validationCliDefinition.subcommands.literal.commandName,
        validationCliOptionName(literalValidationCliOptions.kind),
        unsafeKind,
      ],
      { processCwd: () => projectRoot },
    );
    expect(recordedResult.exitCode).toBe(validationCliDefinition.diagnostics.unknownLiteralProblemKind.exitCode);
    expect(result.stderr).toContain(validationCliDefinition.diagnostics.unknownLiteralProblemKind.messageLabel);
    expect(result.stderr).toContain(expectedEscapedControlArgument(unsafeKind));
    expect(result.stderr).not.toContain(unsafeKind);
    expect(result.stderr).not.toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
  });
}

async function expectEscapingPathOperandsRejected(): Promise<void> {
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
    await expectValidationDispatchFailureInvokesNoHandler(
      [
        validationCliDefinition.subcommands.format.commandName,
        VALIDATION_PIPELINE_DATA.escapingPathOperand,
      ],
      { processCwd: () => productRoot },
    );
  });
}

async function expectSymlinkedInvocationDirectoryResolvesInProductOperand(): Promise<void> {
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

    expect(result.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
    expect(result.stdout.length).toBeGreaterThan(VALIDATION_EMPTY_CLI_OPERAND.length);
    expect(result.stderr).not.toContain(validationCliDefinition.diagnostics.invalidPathOperand.messageLabel);
    expect(result.stderr).not.toContain(validationCliDefinition.diagnostics.invalidPathOperand.reason);
  });
}

async function expectMissingPathBelowEscapingSymlinkAncestorRejected(): Promise<void> {
  await withEmptyValidationProject(async (productRoot) => {
    const outsideRoot = join(dirname(productRoot), sampleLiteralTestValue(arbitraryPathSegment()));
    const symlinkName = sampleLiteralTestValue(arbitraryPathSegment());
    const symlinkRoot = join(productRoot, symlinkName);
    const operand = join(symlinkName, sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath()));

    await mkdir(outsideRoot);
    await symlink(outsideRoot, symlinkRoot, "dir");

    const result = await runValidationSubprocess(
      [
        validationCliDefinition.subcommands.format.commandName,
        operand,
      ],
      { cwd: productRoot },
    );

    expect(result.exitCode).toBe(validationCliDefinition.diagnostics.invalidPathOperand.exitCode);
    expect(result.stdout).toBe(validationCliEmptyOutput());
    expect(result.stderr).toContain(validationCliDefinition.diagnostics.invalidPathOperand.messageLabel);
    expect(result.stderr).toContain(sanitizeCliArgument(operand));
    expect(result.stderr).toContain(validationCliDefinition.diagnostics.invalidPathOperand.reason);
    expect(result.stderr).not.toContain(VALIDATION_COMMAND_OUTPUT.FORMATTING_NO_ISSUES);
    await expectValidationDispatchFailureInvokesNoHandler(
      [
        validationCliDefinition.subcommands.format.commandName,
        operand,
      ],
      { processCwd: () => productRoot },
    );
  });
}

async function expectUnknownSubcommandDiagnostic(): Promise<void> {
  const unknownStage = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.unknownSubcommand());
  const result = await runValidationSubprocess([unknownStage]);

  expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  await expectValidationDispatchFailureInvokesNoHandler([unknownStage]);
  expect(result.stderr).toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
  expect(result.stderr).toContain(unknownStage);
}

async function expectEmptyArgumentDiagnostic(): Promise<void> {
  const result = await runValidationSubprocess([
    VALIDATION_EMPTY_CLI_OPERAND,
  ]);

  expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  await expectValidationDispatchFailureInvokesNoHandler([
    VALIDATION_EMPTY_CLI_OPERAND,
  ]);
  expect(result.stderr).toContain(SENTINEL_EMPTY);
}

async function expectControlCharactersEscaped(): Promise<void> {
  const unsafeArgument = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.controlArgument());
  const result = await runValidationSubprocess([unsafeArgument]);

  expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  await expectValidationDispatchFailureInvokesNoHandler([unsafeArgument]);
  expect(result.stderr).toBe(
    `${SPX_PROGRAM_NAME} ${validationCliDefinition.domain.commandName}: ${validationCliDefinition.diagnostics.unknownSubcommand.messageLabel}: ${
      expectedEscapedControlArgument(unsafeArgument)
    }`,
  );
  expect(result.stderr).toContain(expectedEscapedControlArgument(unsafeArgument));
  expect(result.stderr).not.toContain(unsafeArgument);
}

async function expectUnicodeArgumentsPreserved(): Promise<void> {
  const unicodeArgument = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.unicodeArgument());
  const result = await runValidationSubprocess([unicodeArgument]);

  expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  await expectValidationDispatchFailureInvokesNoHandler([unicodeArgument]);
  expect(result.stderr).toContain(unicodeArgument);
}

async function expectLiteralHelpListsLiteralFlags(): Promise<void> {
  const result = await runValidationInProcess([
    validationCliDefinition.subcommands.literal.commandName,
    validationCliDefinition.commanderHelpOperands.longFlag,
  ]);

  expect(result.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
  expect(result.stderr).toHaveLength(VALIDATION_EMPTY_CLI_OPERAND.length);
  expect(result.stdout).toContain(literalValidationCliOptions.allowlistExisting.flag);
  expect(result.stdout).toContain(literalValidationCliOptions.kind.flag);
  expect(result.stdout).toContain(literalValidationCliOptions.filesWithProblems.flag);
  expect(result.stdout).toContain(literalValidationCliOptions.literals.flag);
  expect(result.stdout).toContain(literalValidationCliOptions.verbose.flag);
  expect(result.stdout).toContain(validationCliDefinition.pathOperands.optionalVariadic);
  for (const problemKind of validationLiteralProblemKinds) {
    expect(result.stdout).toContain(problemKind);
  }
}

async function expectValidationAllHelpListsSkipFlags(): Promise<void> {
  const result = await runValidationInProcess([
    validationCliDefinition.subcommands.all.commandName,
    validationCliDefinition.commanderHelpOperands.longFlag,
  ]);

  expect(result.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
  expect(result.stderr).toHaveLength(VALIDATION_EMPTY_CLI_OPERAND.length);
  expect(result.stdout).toContain(allValidationCliOptions.skipCircular.flag);
  expect(result.stdout).toContain(allValidationCliOptions.skipLiteral.flag);
}

async function expectLiteralHelpOmitsSkipFlags(): Promise<void> {
  const result = await runValidationInProcess([
    validationCliDefinition.subcommands.literal.commandName,
    validationCliDefinition.commanderHelpOperands.longFlag,
  ]);

  expect(result.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
  expect(result.stderr).toHaveLength(VALIDATION_EMPTY_CLI_OPERAND.length);
  expect(result.stdout).not.toContain(allValidationCliOptions.skipCircular.flag);
  expect(result.stdout).not.toContain(allValidationCliOptions.skipLiteral.flag);
}

async function expectLiteralCommandRejectsLiteralSkipFlag(): Promise<void> {
  const result = await runValidationInProcess([
    validationCliDefinition.subcommands.literal.commandName,
    allValidationCliOptions.skipLiteral.flag,
  ]);

  expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  expect(result.stdout).toBe(validationCliEmptyOutput());
  expect(result.stderr).toContain(allValidationCliOptions.skipLiteral.flag);
}

async function expectCircularCommandRejectsCircularSkipFlag(): Promise<void> {
  const result = await runValidationInProcess([
    validationCliDefinition.subcommands.circular.commandName,
    allValidationCliOptions.skipCircular.flag,
  ]);

  expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  expect(result.stdout).toBe(validationCliEmptyOutput());
  expect(result.stderr).toContain(allValidationCliOptions.skipCircular.flag);
}

async function expectUnknownOptionInvokesNoHandler(): Promise<void> {
  const unknownOption = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.unknownOption());
  const result = await expectValidationDispatchFailureInvokesNoHandler([unknownOption]);

  expect(result.exitCode).not.toBeLessThan(validationCliSuccessExitCodeUpperBound());
  expect(result.stderr).toContain(unknownOption);
}

async function expectTypedSubcommandRegistryIsExhaustivelyRegistered(): Promise<void> {
  for (const definition of Object.values(validationCliDefinition.subcommands)) {
    const recorder = createRecordingValidationDomain(
      validationCliDefinition.diagnostics.unknownLiteralProblemKind.exitCode,
    );
    const result = await runValidationInProcess([definition.commandName], { domain: recorder.domain });
    expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownLiteralProblemKind.exitCode);
    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0]?.commandName).toBe(definition.commandName);
  }
}

export function registerValidationCliScenarioTests(): void {
  describe("spx validation dispatch — observable scenarios", () => {
    it(
      "registered subcommand runs its handler without dispatch failure",
      expectRegisteredSubcommandRuns,
      VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT,
    );
    it(
      "registered subcommand propagates a non-zero handler exit code",
      expectRegisteredSubcommandPropagatesNonZeroExit,
      VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT,
    );
    it(
      "typed subcommand registry is exhaustively registered with the dispatcher",
      expectTypedSubcommandRegistryIsExhaustivelyRegistered,
    );
    it(
      "path operands that escape the product directory are rejected before validation runs",
      expectEscapingPathOperandsRejected,
    );
    it(
      "non-existent in-product path operands resolve from a symlinked invocation directory",
      expectSymlinkedInvocationDirectoryResolvesInProductOperand,
    );
    it(
      "non-existent path operands below symlink ancestors that escape the product are rejected",
      expectMissingPathBelowEscapingSymlinkAncestorRejected,
    );
    it("unknown subcommand reaches the sanitized diagnostic path", expectUnknownSubcommandDiagnostic);
    it("empty argument reports the empty-value sentinel", expectEmptyArgumentDiagnostic);
    it("ASCII control characters are escaped before reaching stderr", expectControlCharactersEscaped);
    it("multi-byte Unicode arguments are preserved in stderr", expectUnicodeArgumentsPreserved);
    it("literal help lists literal flags and valid problem kinds", expectLiteralHelpListsLiteralFlags);
    it("validation all help lists full-pipeline skip flags", expectValidationAllHelpListsSkipFlags);
    it("literal help omits full-pipeline skip flags", expectLiteralHelpOmitsSkipFlags);
    it("literal command rejects the full-pipeline literal skip flag", expectLiteralCommandRejectsLiteralSkipFlag);
    it("circular command rejects the full-pipeline circular skip flag", expectCircularCommandRejectsCircularSkipFlag);
  });
}

export const validationCliScenarioCases = collectHarnessTestCases(registerValidationCliScenarioTests);

export function registerValidationCliComplianceTests(): void {
  describe("spx validation dispatch compliance", () => {
    it(
      "routes every typed registry subcommand to its intended handler",
      expectTypedSubcommandRegistryIsExhaustivelyRegistered,
    );
    it("emits a sanitized unknown-subcommand diagnostic without running a stage", expectUnknownSubcommandDiagnostic);
    it("escapes control characters in unknown-subcommand diagnostics", expectControlCharactersEscaped);
    it("rejects invalid literal kinds before literal detection", expectInvalidLiteralKindRejectedBeforeHandler);
    it("rejects escaping path operands without invoking a handler", expectEscapingPathOperandsRejected);
    it(
      "rejects paths below escaping symlink ancestors without invoking a handler",
      expectMissingPathBelowEscapingSymlinkAncestorRejected,
    );
    it("registers literal flags and valid problem kinds", expectLiteralHelpListsLiteralFlags);
    it("registers validation-all skip flags", expectValidationAllHelpListsSkipFlags);
    it("keeps literal skip scoped away from the literal command", expectLiteralCommandRejectsLiteralSkipFlag);
    it("keeps circular skip scoped away from the circular command", expectCircularCommandRejectsCircularSkipFlag);
    it("rejects unknown options without invoking a handler", expectUnknownOptionInvokesNoHandler);
  });
}

export const validationCliComplianceCases = collectHarnessTestCases(registerValidationCliComplianceTests);
