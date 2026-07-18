import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index";
import { specTreeConfigDescriptor } from "@/lib/spec-tree";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

export function registerConfigDeterminismProperties(): void {
  describe("resolveConfig — determinism", () => {
    it("produces the same resolved Config on every load against any config shape drawn from the registry", async () => {
      await assertProperty(
        CONFIG_TEST_GENERATOR.configShape(),
        async (projectConfig) => {
          await withTestEnv(projectConfig, async ({ productDir }) => {
            const first = await resolveConfig(productDir, [
              specTreeConfigDescriptor,
            ]);
            const second = await resolveConfig(productDir, [
              specTreeConfigDescriptor,
            ]);

            expect(first).toEqual(second);
          });
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });

    it("is deterministic across distinct temp roots when the config content is identical", async () => {
      const projectConfig = sampleConfigTestValue(
        CONFIG_TEST_GENERATOR.specTreeSubsetConfig(),
      );

      let firstValue: unknown;
      let secondValue: unknown;

      await withTestEnv(projectConfig, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [
          specTreeConfigDescriptor,
        ]);
        expect(result.ok).toBe(true);
        if (result.ok) firstValue = result.value;
      });

      await withTestEnv(projectConfig, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [
          specTreeConfigDescriptor,
        ]);
        expect(result.ok).toBe(true);
        if (result.ok) secondValue = result.value;
      });

      expect(firstValue).toEqual(secondValue);
    });
  });
}
