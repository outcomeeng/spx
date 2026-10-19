import { readdir } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index";
import { compareAsciiStrings } from "@/lib/state-store";
import { CONFIG_TEST_GENERATOR } from "@testing/generators/config/descriptors";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("resolveConfig — side-effect freedom (property)", () => {
  it("leaves the project directory unchanged across any config drawn over generated descriptors", async () => {
    await assertProperty(
      CONFIG_TEST_GENERATOR.descriptorSet(),
      async ({ config, descriptors }) => {
        await withTestEnv(config, async ({ productDir }) => {
          const before = await readdir(productDir);
          await resolveConfig(productDir, descriptors);
          const after = await readdir(productDir);

          expect(after.sort(compareAsciiStrings)).toEqual(before.sort(compareAsciiStrings));
        });
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("leaves the process environment unchanged across any generated config", async () => {
    await assertProperty(
      CONFIG_TEST_GENERATOR.configEnvironmentCase(),
      async ({ descriptorSet, sentinel }) => {
        process.env[sentinel.key] = sentinel.value;
        try {
          await withTestEnv(descriptorSet.config, async ({ productDir }) => {
            await resolveConfig(productDir, descriptorSet.descriptors);
            expect(process.env[sentinel.key]).toBe(sentinel.value);
          });
        } finally {
          delete process.env[sentinel.key];
        }
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("does not mutate process.cwd during resolution across any generated config", async () => {
    await assertProperty(
      CONFIG_TEST_GENERATOR.descriptorSet(),
      async ({ config, descriptors }) => {
        const before = process.cwd();
        await withTestEnv(config, async ({ productDir }) => {
          await resolveConfig(productDir, descriptors);
        });
        expect(process.cwd()).toBe(before);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
