import { describe, it } from "vitest";

import {
  assertCircularCommandRejectsFullPipelineCircularSkipFlag,
  assertControlCharactersAreEscaped,
  assertEmptyArgumentReportsSentinel,
  assertEscapingPathOperandsRejectBeforeValidation,
  assertLiteralCommandRejectsFullPipelineLiteralSkipFlag,
  assertLiteralHelpListsLiteralFlags,
  assertLiteralHelpOmitsFullPipelineSkipFlags,
  assertRegisteredSubcommandPropagatesHandlerExitCode,
  assertRegisteredSubcommandRunsHandler,
  assertSymlinkedInvocationDirectoryAcceptsInProductOperand,
  assertUnicodeArgumentsArePreserved,
  assertUnknownSubcommandReportsSanitizedDiagnostic,
  assertValidationAllHelpListsSkipFlags,
} from "@testing/harnesses/validation/cli";

describe("spx validation dispatch - observable scenarios", () => {
  it("registered subcommand runs its handler without dispatch failure", assertRegisteredSubcommandRunsHandler);
  it(
    "registered subcommand propagates a non-zero handler exit code",
    assertRegisteredSubcommandPropagatesHandlerExitCode,
  );
  it(
    "path operands that escape the product directory are rejected before validation runs",
    assertEscapingPathOperandsRejectBeforeValidation,
  );
  it(
    "non-existent in-product path operands resolve from a symlinked invocation directory",
    assertSymlinkedInvocationDirectoryAcceptsInProductOperand,
  );
  it("unknown subcommand reaches the sanitized diagnostic path", assertUnknownSubcommandReportsSanitizedDiagnostic);
  it("empty argument reports the empty-value sentinel", assertEmptyArgumentReportsSentinel);
  it("ASCII control characters are escaped before reaching stderr", assertControlCharactersAreEscaped);
  it("multi-byte Unicode arguments are preserved in stderr", assertUnicodeArgumentsArePreserved);
  it("literal help lists literal flags and valid problem kinds", assertLiteralHelpListsLiteralFlags);
  it("validation all help lists full-pipeline skip flags", assertValidationAllHelpListsSkipFlags);
  it("literal help omits full-pipeline skip flags", assertLiteralHelpOmitsFullPipelineSkipFlags);
  it(
    "literal command rejects the full-pipeline literal skip flag",
    assertLiteralCommandRejectsFullPipelineLiteralSkipFlag,
  );
  it(
    "circular command rejects the full-pipeline circular skip flag",
    assertCircularCommandRejectsFullPipelineCircularSkipFlag,
  );
});
