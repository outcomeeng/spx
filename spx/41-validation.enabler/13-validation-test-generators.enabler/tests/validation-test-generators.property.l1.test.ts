import { validationCliDefinition } from "@/interfaces/cli/validation-contract";
import { VALIDATION_CLI_GENERATOR } from "@testing/generators/validation/validation";
import {
  assertProperty,
  PROPERTY_CLASSIFICATION,
  propertyTestEnvelopeTimeoutMs,
} from "@testing/harnesses/property/property";
import { dispatchValidationOperands } from "@testing/harnesses/validation/cli";
import { describe, expect, it } from "vitest";

describe("generated unknown validation subcommands", () => {
  it(
    "stay outside the command vocabulary and reach the unknown-subcommand diagnostic with no handler invoked",
    async () => {
      await assertProperty(
        VALIDATION_CLI_GENERATOR.unknownSubcommand(),
        async (candidate) => {
          const { result, calls } = await dispatchValidationOperands([candidate]);

          expect(calls).toHaveLength(0);
          expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
          expect(result.stderr).toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
        },
        PROPERTY_CLASSIFICATION.SMALL_L1,
      );
    },
    propertyTestEnvelopeTimeoutMs(PROPERTY_CLASSIFICATION.SMALL_L1),
  );
});
