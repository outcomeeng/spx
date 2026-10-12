import { rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG_FILENAME, resolveConfig } from "@/config/index";
import { compareAsciiStrings } from "@/lib/state-store";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

function emptyConfig(): Config {
  return sampleConfigTestValue(CONFIG_TEST_GENERATOR.emptyConfig());
}

describe("resolveConfig — no product config file", () => {
  it("resolves every registered descriptor to its declared defaults when the file is absent", async () => {
    const { descriptors } = sampleConfigTestValue(CONFIG_TEST_GENERATOR.descriptorSet());

    await withTestEnv(emptyConfig(), async ({ productDir }) => {
      await rm(join(productDir, DEFAULT_CONFIG_FILENAME));

      const result = await resolveConfig(productDir, descriptors);

      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const descriptor of descriptors) {
          expect(result.value[descriptor.section]).toEqual(descriptor.defaults);
        }
      }
    });
  });

  it("returns a Config containing every descriptor's section keyed by its section name", async () => {
    const { descriptors } = sampleConfigTestValue(CONFIG_TEST_GENERATOR.descriptorSet());

    await withTestEnv(emptyConfig(), async ({ productDir }) => {
      await rm(join(productDir, DEFAULT_CONFIG_FILENAME));

      const result = await resolveConfig(productDir, descriptors);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Object.keys(result.value).sort(compareAsciiStrings)).toEqual(
          descriptors.map((descriptor) => descriptor.section).sort(compareAsciiStrings),
        );
      }
    });
  });

  it("treats an empty product config file the same as an absent file — defaults apply uniformly", async () => {
    const { descriptors } = sampleConfigTestValue(CONFIG_TEST_GENERATOR.descriptorSet());

    await withTestEnv(emptyConfig(), async ({ productDir }) => {
      const result = await resolveConfig(productDir, descriptors);

      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const descriptor of descriptors) {
          expect(result.value[descriptor.section]).toEqual(descriptor.defaults);
        }
      }
    });
  });
});
