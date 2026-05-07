import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { validationCliDefinition } from "@/domains/validation";
import { sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { VALIDATION_CLI_GENERATOR } from "@testing/generators/validation/validation";
import { runValidationSubprocess } from "@testing/harnesses/validation/cli";

describe("spx validation dispatch — invariant over non-matching argument strings", () => {
  it(
    "every unknown subcommand string reaches the unknown-subcommand diagnostic path",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          VALIDATION_CLI_GENERATOR.unknownSubcommand(),
          async (candidate) => {
            const result = await runValidationSubprocess([candidate]);

            expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
            expect(result.stderr).toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
          },
        ),
        sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.propertyOptions()),
      );
    },
    sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.propertyOptions()).timeout,
  );
});
