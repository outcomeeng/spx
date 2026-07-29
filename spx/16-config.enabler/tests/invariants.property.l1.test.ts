import { readdir } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index";
import { specTreeConfigDescriptor } from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import { CONFIG_TEST_GENERATOR } from "@testing/generators/config/descriptors";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("resolveConfig — side-effect freedom (property)", () => {
  it("leaves the project directory unchanged across any config shape drawn from the registry", async () => {
    await assertProperty(
      CONFIG_TEST_GENERATOR.configShape(),
      async (projectConfig) => {
        await withTestEnv(projectConfig, async ({ productDir }) => {
          const before = await readdir(productDir);
          await resolveConfig(productDir, [specTreeConfigDescriptor]);
          const after = await readdir(productDir);

          expect(after.sort(compareAsciiStrings)).toEqual(before.sort(compareAsciiStrings));
        });
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("leaves the process environment unchanged across any config shape", async () => {
    await assertProperty(
      CONFIG_TEST_GENERATOR.configEnvironmentCase(),
      async ({ config, sentinel }) => {
        process.env[sentinel.key] = sentinel.value;
        try {
          await withTestEnv(config, async ({ productDir }) => {
            await resolveConfig(productDir, [specTreeConfigDescriptor]);
            expect(process.env[sentinel.key]).toBe(sentinel.value);
          });
        } finally {
          delete process.env[sentinel.key];
        }
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("does not mutate process.cwd during resolution across any config shape", async () => {
    await assertProperty(
      CONFIG_TEST_GENERATOR.configShape(),
      async (projectConfig) => {
        const before = process.cwd();
        await withTestEnv(projectConfig, async ({ productDir }) => {
          await resolveConfig(productDir, [specTreeConfigDescriptor]);
        });
        expect(process.cwd()).toBe(before);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
