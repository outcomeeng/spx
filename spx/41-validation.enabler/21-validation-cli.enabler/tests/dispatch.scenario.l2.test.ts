import { describe, it } from "vitest";

import {
  expectAsciiControlCharactersEscapedBeforeStderr,
  expectCircularCommandRejectsFullPipelineCircularOverride,
  expectEmptyArgumentReportsSentinel,
  expectLiteralCommandRejectsFullPipelineLiteralOverride,
  expectLiteralCommandRejectsInvalidKindBeforeStageWork,
  expectLiteralHelpListsLiteralFlagsAndProblemKinds,
  expectLiteralHelpOmitsValidationAllOverrideFlags,
  expectMultiByteUnicodePreservedInStderr,
  expectPathEscapeRejectedBeforeValidation,
  expectRegisteredSubcommandPropagatesNonZeroExitCode,
  expectRegisteredSubcommandRunsHandlerWithoutDispatchFailure,
  expectSymlinkedInvocationDirectoryResolvesInProductOperand,
  expectUnknownSubcommandReachesSanitizedDiagnostic,
  expectValidationAllHelpListsOverrideFlags,
} from "@testing/harnesses/validation/cli";

describe("spx validation dispatch — observable scenarios", () => {
  it("registered subcommand runs its handler without dispatch failure", async () => {
    await expectRegisteredSubcommandRunsHandlerWithoutDispatchFailure();
  });

  it("registered subcommand propagates a non-zero handler exit code", async () => {
    await expectRegisteredSubcommandPropagatesNonZeroExitCode();
  });

  it("registered subcommand rejects invalid options before stage work", async () => {
    await expectLiteralCommandRejectsInvalidKindBeforeStageWork();
  });

  it("path operands that escape the product directory are rejected before validation runs", async () => {
    await expectPathEscapeRejectedBeforeValidation();
  });

  it("non-existent in-product path operands resolve from a symlinked invocation directory", async () => {
    await expectSymlinkedInvocationDirectoryResolvesInProductOperand();
  });

  it("unknown subcommand reaches the sanitized diagnostic path", async () => {
    await expectUnknownSubcommandReachesSanitizedDiagnostic();
  });

  it("empty argument reports the empty-value sentinel", async () => {
    await expectEmptyArgumentReportsSentinel();
  });

  it("ASCII control characters are escaped before reaching stderr", async () => {
    await expectAsciiControlCharactersEscapedBeforeStderr();
  });

  it("multi-byte Unicode arguments are preserved in stderr", async () => {
    await expectMultiByteUnicodePreservedInStderr();
  });

  it("literal help lists literal flags and valid problem kinds", async () => {
    await expectLiteralHelpListsLiteralFlagsAndProblemKinds();
  });

  it("validation all help lists registry-derived full-pipeline override flags", async () => {
    await expectValidationAllHelpListsOverrideFlags();
  });

  it("literal help omits full-pipeline override flags", async () => {
    await expectLiteralHelpOmitsValidationAllOverrideFlags();
  });

  it("literal command rejects the full-pipeline literal override flag", async () => {
    await expectLiteralCommandRejectsFullPipelineLiteralOverride();
  });

  it("circular command rejects the full-pipeline circular override flag", async () => {
    await expectCircularCommandRejectsFullPipelineCircularOverride();
  });
});
