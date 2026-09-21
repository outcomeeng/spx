import { describe, expect, it } from "vitest";

import { TYPESCRIPT_VALIDATION_MESSAGES } from "@/commands/validation/typescript";
import { PRODUCT_DIR_FALLBACK_WARNING } from "@/domains/config/root";
import { CONFIG_CLI } from "@/interfaces/cli/config";
import { SESSION_CLI } from "@/interfaces/cli/session";
import { validationCliDefinition } from "@/interfaces/cli/validation-contract";
import { externalValue, renderTerminalText, terminal } from "@/lib/terminal-text/terminal-text";
import {
  arbitraryProductContextCase,
  PRODUCT_CONTEXT_MAPPING_COMMANDS,
} from "@testing/generators/config/product-context";
import { parseProductContextJsonConfig, productContextTestingConfig } from "@testing/harnesses/product-context/cli";
import {
  observeAbsentProductContext,
  observeProductContextMapping,
  PRODUCT_CONTEXT_MAPPING_TEST_OPTIONS,
  runProductContextCases,
} from "@testing/harnesses/product-context/mapping";

describe("product context mapping", () => {
  it.each(PRODUCT_CONTEXT_MAPPING_COMMANDS)(
    "maps product context for $args with directory option $directoryOption",
    PRODUCT_CONTEXT_MAPPING_TEST_OPTIONS,
    async (command) => {
      await runProductContextCases(arbitraryProductContextCase(), async (scenario) => {
        if (command.directoryOption === undefined) {
          const { processDir, result } = await observeAbsentProductContext(command.args, scenario);

          expect(result.exitCodes).toEqual([0]);
          expect(result.stdout).toContain(processDir);
          expect(result.stderr).toContain(processDir);
          expect(result.stderr).toContain(
            renderTerminalText(
              terminal`${PRODUCT_DIR_FALLBACK_WARNING.beforePath}${
                externalValue(processDir)
              }${PRODUCT_DIR_FALLBACK_WARNING.afterPath}`,
            ),
          );
          return;
        }

        const { productDir, direct, redirected } = await observeProductContextMapping(command, scenario);

        expect(redirected.exitCodes).toEqual(direct.exitCodes);
        expect(redirected.stderr).toBe(direct.stderr);
        expect(redirected.stderr).toHaveLength(0);

        if (command.domain === CONFIG_CLI.commandName) {
          expect(redirected.exitCodes).toEqual([0]);
          expect(parseProductContextJsonConfig(redirected.stdout, productDir)).toEqual(
            parseProductContextJsonConfig(direct.stdout, productDir),
          );
          expect(productContextTestingConfig(parseProductContextJsonConfig(redirected.stdout, productDir))).toEqual(
            scenario.testing.expected,
          );
        } else {
          expect(redirected).toEqual(direct);
        }

        if (command.domain === validationCliDefinition.domain.commandName) {
          expect(redirected.stdout).toContain(TYPESCRIPT_VALIDATION_MESSAGES.SUCCESS);
        }
        if (command.domain === SESSION_CLI.commandName) {
          expect(redirected.exitCodes).toEqual([]);
          expect(redirected.stdout).toContain(scenario.sessionId);
        }
      });
    },
  );
});
