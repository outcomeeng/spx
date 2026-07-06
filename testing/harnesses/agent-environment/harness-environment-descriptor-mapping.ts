import { rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CONFIG_FILE_FORMAT,
  CONFIG_FILE_FORMAT_ORDER,
  CONFIG_FILENAMES,
  type ConfigFileFormat,
  DEFAULT_CONFIG_FILENAME,
  resolveConfig,
} from "@/config/index";
import { HARNESS_ENVIRONMENT_SECTION, harnessEnvironmentConfigDescriptor } from "@/domains/agent-environment/config";
import { compareAsciiStrings } from "@/lib/state-store";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { serializeConfig } from "@testing/harnesses/agent-environment/config";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

export function runHarnessEnvironmentDescriptorMappingTests(): void {
  describe("harness environment descriptor format mapping", () => {
    it("resolves equivalent harness environment sections from JSON, YAML, and TOML config files", async () => {
      const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.harnessEnvironmentConfig());
      const results: Partial<Record<ConfigFileFormat, Config>> = {};

      for (const format of CONFIG_FILE_FORMAT_ORDER) {
        await withTestEnv({}, async ({ productDir, writeRaw }) => {
          const defaultConfigPath = join(productDir, DEFAULT_CONFIG_FILENAME);
          await rm(defaultConfigPath);
          await writeRaw(CONFIG_FILENAMES[format], serializeConfig(format, generated.config));
          const result = await resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]);
          expect(result.ok).toBe(true);
          if (result.ok) results[format] = result.value;
        });
      }

      expect(Object.keys(results).sort(compareAsciiStrings)).toEqual(
        [...CONFIG_FILE_FORMAT_ORDER].sort(compareAsciiStrings),
      );
      expect(results[CONFIG_FILE_FORMAT.JSON]?.[HARNESS_ENVIRONMENT_SECTION]).toEqual(generated.expected);
      expect(results[CONFIG_FILE_FORMAT.YAML]?.[HARNESS_ENVIRONMENT_SECTION]).toEqual(generated.expected);
      expect(results[CONFIG_FILE_FORMAT.TOML]?.[HARNESS_ENVIRONMENT_SECTION]).toEqual(generated.expected);
      expect(results[CONFIG_FILE_FORMAT.JSON]).toEqual(results[CONFIG_FILE_FORMAT.YAML]);
      expect(results[CONFIG_FILE_FORMAT.TOML]).toEqual(results[CONFIG_FILE_FORMAT.YAML]);
    });
  });
}
