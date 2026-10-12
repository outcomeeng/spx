import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index";
import { CONFIG_TEST_GENERATOR } from "@testing/generators/config/descriptors";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("resolveConfig — determinism", () => {
  it("produces the same resolved Config on every load against any config drawn over generated descriptors", async () => {
    await assertProperty(
      CONFIG_TEST_GENERATOR.descriptorSet(),
      async ({ config, descriptors }) => {
        await withTestEnv(config, async ({ productDir }) => {
          const first = await resolveConfig(productDir, descriptors);
          const second = await resolveConfig(productDir, descriptors);

          expect(first).toEqual(second);
        });
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("is deterministic across distinct temp roots when the config content is identical", async () => {
    await assertProperty(
      CONFIG_TEST_GENERATOR.descriptorSet(),
      async ({ config, descriptors }) => {
        let firstValue: unknown;
        let secondValue: unknown;

        await withTestEnv(config, async ({ productDir }) => {
          const result = await resolveConfig(productDir, descriptors);
          expect(result.ok).toBe(true);
          if (result.ok) firstValue = result.value;
        });

        await withTestEnv(config, async ({ productDir }) => {
          const result = await resolveConfig(productDir, descriptors);
          expect(result.ok).toBe(true);
          if (result.ok) secondValue = result.value;
        });

        expect(firstValue).toEqual(secondValue);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
