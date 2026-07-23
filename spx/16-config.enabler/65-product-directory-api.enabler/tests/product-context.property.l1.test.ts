import { describe, expect, it } from "vitest";

import { TYPESCRIPT_VALIDATION_MESSAGES } from "@/commands/validation/typescript";
import { PRODUCT_DIR_NOT_GIT_WARNING } from "@/domains/config/root";
import { NOT_GIT_REPO_WARNING } from "@/lib/git/root";
import { CONFIG_TEST_GENERATOR } from "@testing/generators/config/descriptors";
import {
  observeAbsentContextMapping,
  observeConfigContextMapping,
  observedTestingConfig,
  observeSessionContextMapping,
  observeValidationContextMapping,
  parseObservedProductContextConfig,
} from "@testing/harnesses/product-context/mapping";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

describe("product context properties", () => {
  it("maps -C to the same resolved config from generated nested product directories", async () => {
    await assertProperty(
      CONFIG_TEST_GENERATOR.resolutionScope(),
      async (scope) => {
        const observation = await observeConfigContextMapping(scope);
        const parsed = parseObservedProductContextConfig(observation);

        expect(observation.redirected.exitCodes).toEqual(observation.direct.exitCodes);
        expect(observation.redirected.stderr).toBe(observation.direct.stderr);
        expect(parsed.redirected).toEqual(parsed.direct);
        expect(observedTestingConfig(parsed.redirected)).toEqual(observation.expectedTestingConfig);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("maps -C to the same validation result from generated nested product directories", async () => {
    await assertProperty(
      CONFIG_TEST_GENERATOR.resolutionScope(),
      async (scope) => {
        const observation = await observeValidationContextMapping(scope);
        expect(observation.redirected).toEqual(observation.direct);
        expect(observation.redirected.stdout).toContain(TYPESCRIPT_VALIDATION_MESSAGES.SUCCESS);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("maps -C to the same session list from generated caller directories", async () => {
    await assertProperty(
      CONFIG_TEST_GENERATOR.resolutionScope(),
      async (scope) => {
        const observation = await observeSessionContextMapping(scope);
        expect(observation.redirected).toEqual(observation.direct);
        expect(observation.redirected.exitCodes).toEqual([]);
        expect(observation.redirected.stdout).toContain(observation.sessionId);
        expect(observation.redirected.stderr).not.toContain(NOT_GIT_REPO_WARNING);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("maps absent -C from generated process directories and preserves the non-git warning", async () => {
    await assertProperty(
      CONFIG_TEST_GENERATOR.resolutionScope(),
      async (scope) => {
        const observation = await observeAbsentContextMapping(scope);
        expect(observation.result.stdout).toContain(observation.processDir);
        expect(observation.result.stderr).toContain(observation.processDir);
        expect(observation.result.stderr).toContain(PRODUCT_DIR_NOT_GIT_WARNING);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
