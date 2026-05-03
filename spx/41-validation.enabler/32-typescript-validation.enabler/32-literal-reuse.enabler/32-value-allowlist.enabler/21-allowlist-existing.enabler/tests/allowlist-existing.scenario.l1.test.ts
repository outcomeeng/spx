import { unlink } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CONFIG_FILE_FORMAT,
  CONFIG_FILENAMES,
  DEFAULT_CONFIG_FILENAME,
  resolveConfig,
  serializeConfigFileSections,
} from "@/config/index";
import { allowlistExisting } from "@/validation/literal/allowlist-existing";
import { type LiteralConfig, literalConfigDescriptor } from "@/validation/literal/config";
import { validateLiteralReuse } from "@/validation/literal/index";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

import {
  buildBaselineConfig,
  MULTI_FINDINGS_LITERALS,
  readLiteralAllowlist,
  readProjectConfigSections,
  SHARED_FIXTURE_LITERAL,
  writeDuplicatedLiteralFixture,
  writeMultipleLiteralFixtures,
} from "./support";

const EMPTY_CONFIG: Record<string, unknown> = {};

function serializeEmptyJsonConfig(): string {
  const serialized = serializeConfigFileSections(CONFIG_FILE_FORMAT.JSON, EMPTY_CONFIG);
  if (!serialized.ok) {
    throw new Error(serialized.error);
  }
  return serialized.value;
}

describe("allowlist-existing scenario", () => {
  it("appends current finding values to literal.allowlist.include and a subsequent run reports zero findings", async () => {
    await withTestEnv(buildBaselineConfig(), async (env) => {
      await writeDuplicatedLiteralFixture(env);

      const result = await allowlistExisting({ projectRoot: env.projectDir });

      expect(result.exitCode).toBe(0);

      const parsed = await readProjectConfigSections(env);
      const allowlist = readLiteralAllowlist(parsed);
      expect(allowlist.include).toContain(SHARED_FIXTURE_LITERAL);

      const resolved = await resolveConfig(env.projectDir, [literalConfigDescriptor]);
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) return;
      const updatedConfig = resolved.value[literalConfigDescriptor.section] as LiteralConfig;

      const second = await validateLiteralReuse({
        projectRoot: env.projectDir,
        config: updatedConfig,
      });
      expect(second.findings.srcReuse.length + second.findings.testDupe.length).toBe(0);
    });
  });

  it("creates the config module's default file when no spx.config.* exists at the project root", async () => {
    await withTestEnv(buildBaselineConfig(), async (env) => {
      await writeDuplicatedLiteralFixture(env);
      await unlink(join(env.projectDir, DEFAULT_CONFIG_FILENAME));

      const result = await allowlistExisting({ projectRoot: env.projectDir });

      expect(result.exitCode).toBe(0);

      const allowlist = readLiteralAllowlist(await readProjectConfigSections(env));
      expect(allowlist.include).toContain(SHARED_FIXTURE_LITERAL);
    });
  });

  it("adds the literal section when the default project config file exists without one", async () => {
    await withTestEnv(EMPTY_CONFIG, async (env) => {
      await writeDuplicatedLiteralFixture(env);

      const result = await allowlistExisting({ projectRoot: env.projectDir });

      expect(result.exitCode).toBe(0);

      const allowlist = readLiteralAllowlist(await readProjectConfigSections(env));
      expect(allowlist.include).toContain(SHARED_FIXTURE_LITERAL);
    });
  });

  it("appends new include entries in alphabetical order when multiple distinct findings are present", async () => {
    await withTestEnv(buildBaselineConfig(), async (env) => {
      await writeMultipleLiteralFixtures(env, MULTI_FINDINGS_LITERALS);

      const result = await allowlistExisting({ projectRoot: env.projectDir });
      expect(result.exitCode).toBe(0);

      const allowlist = readLiteralAllowlist(await readProjectConfigSections(env));
      const include = allowlist.include ?? [];
      const indices = MULTI_FINDINGS_LITERALS.map((value) => include.indexOf(value));
      indices.forEach((idx) => expect(idx).toBeGreaterThan(-1));

      const expectedOrder = [...MULTI_FINDINGS_LITERALS].sort();
      const observedOrder = include.filter((value) => (MULTI_FINDINGS_LITERALS as readonly string[]).includes(value));
      expect(observedOrder).toEqual(expectedOrder);
    });
  });

  it("returns the resolveConfig ambiguity error and writes nothing when multiple spx.config.* files are present", async () => {
    await withTestEnv(buildBaselineConfig(), async (env) => {
      await writeDuplicatedLiteralFixture(env);
      const defaultConfigBefore = await env.readFile(DEFAULT_CONFIG_FILENAME);
      const jsonBefore = serializeEmptyJsonConfig();
      await env.writeRaw(CONFIG_FILENAMES.json, jsonBefore);

      const result = await allowlistExisting({ projectRoot: env.projectDir });

      expect(result.exitCode).not.toBe(0);
      expect(result.output).toContain(DEFAULT_CONFIG_FILENAME);
      expect(result.output).toContain(CONFIG_FILENAMES.json);

      expect(await env.readFile(DEFAULT_CONFIG_FILENAME)).toBe(defaultConfigBefore);
      expect(await env.readFile(CONFIG_FILENAMES.json)).toBe(jsonBefore);
    });
  });
});
