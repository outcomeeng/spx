import { describe, it } from "vitest";

import {
  expectAsciiControlCharactersEscapedBeforeStderr,
  expectEmptyArgumentReportsSentinel,
  expectFullPipelineStageParticipationFollowsCliOverrides,
  expectFullPipelineStreamsProgressBeforeFailureSummary,
  expectLiteralCommandRejectsInvalidKindBeforeStageWork,
  expectLiteralHelpListsLiteralFlagsAndProblemKinds,
  expectLiteralHelpOmitsValidationAllOverrideFlags,
  expectMultiByteUnicodePreservedInStderr,
  expectPackagedCircularSubcommandRoutesHandler,
  expectPathEscapeRejectedBeforeValidation,
  expectRegisteredSubcommandPropagatesNonZeroExitCode,
  expectRegisteredSubcommandRunsHandlerWithoutDispatchFailure,
  expectStandaloneTypeScriptCapturesSubprocessOutput,
  expectSymlinkedInvocationDirectoryResolvesInProductOperand,
  expectUnknownSubcommandReachesSanitizedDiagnostic,
  expectValidationAllHelpListsOverrideFlags,
  expectValidationAllJsonOutputIsMachineReadable,
  expectValidationAllJsonOutputWithRealSubprocessIsMachineReadable,
} from "@testing/harnesses/validation/cli";

describe("spx validation dispatch — observable scenarios", () => {
  it("registered subcommand runs its handler without dispatch failure", async () => {
    await expectRegisteredSubcommandRunsHandlerWithoutDispatchFailure();
  });

  it("registered subcommand propagates a non-zero handler exit code", async () => {
    await expectRegisteredSubcommandPropagatesNonZeroExitCode();
  });

  it("validation all keeps streamed progress on stdout before returning a failure summary", async () => {
    await expectFullPipelineStreamsProgressBeforeFailureSummary();
  });

  it("packaged executable routes validation circular through the built CLI", async () => {
    await expectPackagedCircularSubcommandRoutesHandler();
  });

  it("standalone TypeScript dispatch captures subprocess diagnostics for stderr", async () => {
    await expectStandaloneTypeScriptCapturesSubprocessOutput();
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

  it("validation all override flags control one full-pipeline invocation", async () => {
    await expectFullPipelineStageParticipationFollowsCliOverrides();
  });

  it("validation all JSON output contains only machine-readable records", async () => {
    await expectValidationAllJsonOutputIsMachineReadable();
  });

  it("validation all JSON output isolates real subprocess output", async () => {
    await expectValidationAllJsonOutputWithRealSubprocessIsMachineReadable();
  });

  it("literal help omits full-pipeline override flags", async () => {
    await expectLiteralHelpOmitsValidationAllOverrideFlags();
  });
});
