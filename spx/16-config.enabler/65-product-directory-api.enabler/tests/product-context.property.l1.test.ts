import { describe, expect, it } from "vitest";

import { formatProductDirNotGitWarning } from "@/domains/config/root";
import { NOT_GIT_REPO_WARNING } from "@/lib/git/root";
import { CONFIG_TEST_GENERATOR } from "@testing/generators/config/descriptors";
import {
  observeAbsentContextMapping,
  observeConfigContextMapping,
  observedTestingConfig,
  observeSessionContextMapping,
  observeValidationContextMapping,
  parseObservedProductContextConfig,
  PRODUCT_CONTEXT_PROPERTY_CLASSIFICATION,
} from "@testing/harnesses/product-context/mapping";
import { assertProperty } from "@testing/harnesses/property/property";

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
      PRODUCT_CONTEXT_PROPERTY_CLASSIFICATION,
    );
  });

  it("maps -C to the same validation result from generated nested product directories", async () => {
    await assertProperty(
      CONFIG_TEST_GENERATOR.resolutionScope(),
      async (scope) => {
        const observation = await observeValidationContextMapping(scope);
        expect(observation.redirected).toEqual(observation.direct);
        expect(observation.redirected.stdout.trim()).toBe(observation.productDir);
      },
      PRODUCT_CONTEXT_PROPERTY_CLASSIFICATION,
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
      PRODUCT_CONTEXT_PROPERTY_CLASSIFICATION,
    );
  });

  it("maps absent -C from generated process directories and preserves the non-git warning", async () => {
    await assertProperty(
      CONFIG_TEST_GENERATOR.resolutionScope(),
      async (scope) => {
        const observation = await observeAbsentContextMapping(scope);
        expect(observation.result.exitCodes).toEqual([0]);
        expect(observation.result.stdout).toContain(observation.processDir);
        expect(observation.result.stderr.trimEnd()).toBe(
          formatProductDirNotGitWarning(observation.processDir),
        );
      },
      PRODUCT_CONTEXT_PROPERTY_CLASSIFICATION,
    );
  });
});
