import { describe, expect, it } from "vitest";

import { validationCliDefinition } from "@/interfaces/cli/validation";
import { VALIDATION_CLI_GENERATOR, VALIDATION_PIPELINE_DATA } from "@testing/generators/validation/validation";
import {
  assertProperty,
  PROPERTY_LEVEL,
  PROPERTY_SIZE,
  PROPERTY_TIMEOUTS_MS,
} from "@testing/harnesses/property/property";
import { runValidationSubprocess } from "@testing/harnesses/validation/cli";

async function expectUnknownSubcommandRejected(candidate: string): Promise<void> {
  const result = await runValidationSubprocess([candidate]);

  expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  expect(result.stderr).toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
}

export function registerValidationCliPropertyTests(): void {
  describe("spx validation dispatch — invariant over non-matching argument strings", () => {
    it(
      "every unknown subcommand string reaches the unknown-subcommand diagnostic path",
      async () => {
        await assertProperty(
          VALIDATION_CLI_GENERATOR.unknownSubcommand(),
          expectUnknownSubcommandRejected,
          { level: PROPERTY_LEVEL.L2, size: PROPERTY_SIZE.SMALL },
        );
      },
      VALIDATION_PIPELINE_DATA.repeatedRunTimeout + PROPERTY_TIMEOUTS_MS[PROPERTY_LEVEL.L2],
    );
  });
}
