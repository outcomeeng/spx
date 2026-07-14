import { rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CONFIG_FILE_FORMAT,
  CONFIG_FILE_FORMAT_ORDER,
  CONFIG_FILENAMES,
  configFileForFormat,
  DEFAULT_CONFIG_FILENAME,
  resolveConfig,
  serializeConfigFileSectionsWithSetIn,
} from "@/config/index";
import { specTreeConfigDescriptor } from "@/lib/spec-tree";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

export function registerConfigFormatMappings(): void {
  describe("resolveConfig — format equivalence", () => {
    it.each(CONFIG_FILE_FORMAT_ORDER)(
      "%s config produces the independently derived typed Config",
      async (format) => {
        const scenario = sampleConfigTestValue(CONFIG_TEST_GENERATOR.configFormatScenario());
        await withTestEnv({}, async ({ productDir, writeRaw }) => {
          await rm(join(productDir, DEFAULT_CONFIG_FILENAME));
          await writeRaw(CONFIG_FILENAMES[format], scenario.rawByFormat[format]);
          const result = await resolveConfig(productDir, [specTreeConfigDescriptor]);

          expect(result.ok, result.ok ? undefined : result.error).toBe(true);
          if (result.ok) {
            expect(result.value[specTreeConfigDescriptor.section]).toEqual(
              scenario.expectedSpecTreeConfig,
            );
          }
        });
      },
    );

    it("rejects config mutation requests without a section path", async () => {
      await withTestEnv({}, async ({ productDir }) => {
        const result = serializeConfigFileSectionsWithSetIn(
          configFileForFormat(productDir, CONFIG_FILE_FORMAT.YAML),
          [],
          {},
        );

        expect(result.ok).toBe(false);
      });
    });
  });
}
