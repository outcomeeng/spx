import { describe, expect, it } from "vitest";

import { TYPESCRIPT_VALIDATION_MESSAGES } from "@/commands/validation/typescript";
import { PRODUCT_DIR_NOT_GIT_WARNING } from "@/domains/config/root";
import { NOT_GIT_REPO_WARNING } from "@/lib/git/root";
import {
  observeAbsentContextMappings,
  observeConfigContextMappings,
  observedTestingConfig,
  observeSessionContextMappings,
  observeValidationContextMappings,
  parseObservedProductContextConfig,
} from "@testing/harnesses/product-context/mapping";

describe("product context mapping", () => {
  it("maps -C to the same resolved config from generated nested product directories", async () => {
    for (const observation of await observeConfigContextMappings()) {
      const parsed = parseObservedProductContextConfig(observation);

      expect(observation.redirected.exitCodes).toEqual(observation.direct.exitCodes);
      expect(observation.redirected.stderr).toBe(observation.direct.stderr);
      expect(parsed.redirected).toEqual(parsed.direct);
      expect(observedTestingConfig(parsed.redirected)).toEqual(observation.expectedTestingConfig);
    }
  });

  it("maps -C to the same validation result from generated nested product directories", async () => {
    for (const observation of await observeValidationContextMappings()) {
      expect(observation.redirected).toEqual(observation.direct);
      expect(observation.redirected.stdout).toContain(TYPESCRIPT_VALIDATION_MESSAGES.SUCCESS);
    }
  });

  it("maps -C to the same session list from generated caller directories", async () => {
    for (const observation of await observeSessionContextMappings()) {
      expect(observation.redirected).toEqual(observation.direct);
      expect(observation.redirected.exitCodes).toEqual([]);
      expect(observation.redirected.stdout).toContain(observation.sessionId);
      expect(observation.redirected.stderr).not.toContain(NOT_GIT_REPO_WARNING);
    }
  });

  it("maps absent -C from generated process directories and preserves the non-git warning", async () => {
    for (const observation of await observeAbsentContextMappings()) {
      expect(observation.result.stdout).toContain(observation.processDir);
      expect(observation.result.stderr).toContain(observation.processDir);
      expect(observation.result.stderr).toContain(PRODUCT_DIR_NOT_GIT_WARNING);
    }
  });
});
