import { rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONFIG_FILENAMES, resolveConfig } from "@/config/index.js";
import { specTreeConfigDescriptor } from "@/spec/config.js";
import { withTestEnv } from "@/spec/testing/index.js";

describe("resolveConfig — ambiguity error", () => {
  it("returns an error naming both files when json and yaml are both present at projectRoot", async () => {
    await withTestEnv({}, async ({ projectDir, writeRaw }) => {
      await writeRaw(CONFIG_FILENAMES.json, "{}");

      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(CONFIG_FILENAMES.json);
        expect(result.error).toContain(CONFIG_FILENAMES.yaml);
      }
    });
  });

  it("returns an error naming both files when yaml and toml are both present at projectRoot", async () => {
    await withTestEnv({}, async ({ projectDir, writeRaw }) => {
      await writeRaw(CONFIG_FILENAMES.toml, "");

      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(CONFIG_FILENAMES.yaml);
        expect(result.error).toContain(CONFIG_FILENAMES.toml);
      }
    });
  });

  it("returns an error naming both files when json and toml are both present at projectRoot", async () => {
    await withTestEnv({}, async ({ projectDir, writeRaw }) => {
      await rm(join(projectDir, CONFIG_FILENAMES.yaml));
      await writeRaw(CONFIG_FILENAMES.json, "{}");
      await writeRaw(CONFIG_FILENAMES.toml, "");

      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(CONFIG_FILENAMES.json);
        expect(result.error).toContain(CONFIG_FILENAMES.toml);
      }
    });
  });

  it("names all three files in the error when json, yaml, and toml are all present at projectRoot", async () => {
    await withTestEnv({}, async ({ projectDir, writeRaw }) => {
      await writeRaw(CONFIG_FILENAMES.json, "{}");
      await writeRaw(CONFIG_FILENAMES.toml, "");

      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(CONFIG_FILENAMES.json);
        expect(result.error).toContain(CONFIG_FILENAMES.yaml);
        expect(result.error).toContain(CONFIG_FILENAMES.toml);
      }
    });
  });
});
