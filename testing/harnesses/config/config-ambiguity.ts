import { rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONFIG_FILE_FORMAT, CONFIG_FILENAMES, resolveConfig, serializeConfigFileSections } from "@/config/index";
import { specTreeConfigDescriptor } from "@/lib/spec-tree";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

function serializeEmptyConfig(
  format: typeof CONFIG_FILE_FORMAT.JSON | typeof CONFIG_FILE_FORMAT.TOML,
): string {
  const serialized = serializeConfigFileSections(
    format,
    sampleConfigTestValue(CONFIG_TEST_GENERATOR.emptyConfig()),
  );
  if (!serialized.ok) {
    throw new Error(serialized.error);
  }
  return serialized.value;
}

export function registerConfigAmbiguityScenarios(): void {
  describe("resolveConfig — ambiguity error", () => {
    it("returns an error naming both files when json and yaml are both present at productDir", async () => {
      await withTestEnv({}, async ({ productDir, writeRaw }) => {
        await writeRaw(
          CONFIG_FILENAMES.json,
          serializeEmptyConfig(CONFIG_FILE_FORMAT.JSON),
        );

        const result = await resolveConfig(productDir, [
          specTreeConfigDescriptor,
        ]);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain(CONFIG_FILENAMES.json);
          expect(result.error).toContain(CONFIG_FILENAMES.yaml);
        }
      });
    });

    it("returns an error naming both files when yaml and toml are both present at productDir", async () => {
      await withTestEnv({}, async ({ productDir, writeRaw }) => {
        await writeRaw(
          CONFIG_FILENAMES.toml,
          serializeEmptyConfig(CONFIG_FILE_FORMAT.TOML),
        );

        const result = await resolveConfig(productDir, [
          specTreeConfigDescriptor,
        ]);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain(CONFIG_FILENAMES.yaml);
          expect(result.error).toContain(CONFIG_FILENAMES.toml);
        }
      });
    });

    it("returns an error naming both files when json and toml are both present at productDir", async () => {
      await withTestEnv({}, async ({ productDir, writeRaw }) => {
        await rm(join(productDir, CONFIG_FILENAMES.yaml));
        await writeRaw(
          CONFIG_FILENAMES.json,
          serializeEmptyConfig(CONFIG_FILE_FORMAT.JSON),
        );
        await writeRaw(
          CONFIG_FILENAMES.toml,
          serializeEmptyConfig(CONFIG_FILE_FORMAT.TOML),
        );

        const result = await resolveConfig(productDir, [
          specTreeConfigDescriptor,
        ]);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain(CONFIG_FILENAMES.json);
          expect(result.error).toContain(CONFIG_FILENAMES.toml);
        }
      });
    });

    it("names all three files in the error when json, yaml, and toml are all present at productDir", async () => {
      await withTestEnv({}, async ({ productDir, writeRaw }) => {
        await writeRaw(
          CONFIG_FILENAMES.json,
          serializeEmptyConfig(CONFIG_FILE_FORMAT.JSON),
        );
        await writeRaw(
          CONFIG_FILENAMES.toml,
          serializeEmptyConfig(CONFIG_FILE_FORMAT.TOML),
        );

        const result = await resolveConfig(productDir, [
          specTreeConfigDescriptor,
        ]);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain(CONFIG_FILENAMES.json);
          expect(result.error).toContain(CONFIG_FILENAMES.yaml);
          expect(result.error).toContain(CONFIG_FILENAMES.toml);
        }
      });
    });
  });
}
