import { unlink } from "node:fs/promises";
import { join } from "node:path";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  CONFIG_FILE_FORMAT,
  CONFIG_FILENAMES,
  DEFAULT_CONFIG_FILENAME,
  resolveConfig,
  serializeConfigFileSections,
} from "@/config/index";
import { type ValidationConfig, validationConfigDescriptor } from "@/validation/config/descriptor";
import { allowlistExisting } from "@/validation/literal/allowlist-existing";
import { validateLiteralReuse } from "@/validation/literal/index";
import {
  arbitraryDomainLiteral,
  LITERAL_TEST_GENERATOR,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

import {
  buildBaselineConfig,
  readLiteralAllowlist,
  readProjectConfigSections,
  writeDuplicatedLiteralFixture,
  writeMultipleLiteralFixtures,
} from "./support";

const MULTI_FIXTURE_COUNT = 3;
const EMPTY_CONFIG: Record<string, unknown> = {};

function serializeEmptyJsonConfig(): string {
  const serialized = serializeConfigFileSections(CONFIG_FILE_FORMAT.JSON, EMPTY_CONFIG);
  if (!serialized.ok) {
    throw new Error(serialized.error);
  }
  return serialized.value;
}

function sampleDistinctLiterals(count: number): readonly string[] {
  return sampleLiteralTestValue(
    fc.uniqueArray(arbitraryDomainLiteral(), { minLength: count, maxLength: count }),
  );
}

describe("allowlist-existing scenario", () => {
  it("appends current finding values to literal.allowlist.include and a subsequent run reports zero findings", async () => {
    const literal = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    await withTestEnv(buildBaselineConfig(), async (env) => {
      await writeDuplicatedLiteralFixture(env, literal);

      const result = await allowlistExisting({ projectRoot: env.projectDir });

      expect(result.exitCode).toBe(0);

      const parsed = await readProjectConfigSections(env);
      const allowlist = readLiteralAllowlist(parsed);
      expect(allowlist.include).toContain(literal);

      const resolved = await resolveConfig(env.projectDir, [validationConfigDescriptor]);
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) return;
      const updatedValidation = resolved.value[validationConfigDescriptor.section] as ValidationConfig;

      const second = await validateLiteralReuse({
        projectRoot: env.projectDir,
        config: updatedValidation.literal.values,
      });
      expect(second.findings.srcReuse.length + second.findings.testDupe.length).toBe(0);
    });
  });

  it("creates the config module's default file when no spx.config.* exists at the project root", async () => {
    const literal = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    await withTestEnv(buildBaselineConfig(), async (env) => {
      await writeDuplicatedLiteralFixture(env, literal);
      await unlink(join(env.projectDir, DEFAULT_CONFIG_FILENAME));

      const result = await allowlistExisting({ projectRoot: env.projectDir });

      expect(result.exitCode).toBe(0);

      const allowlist = readLiteralAllowlist(await readProjectConfigSections(env));
      expect(allowlist.include).toContain(literal);
    });
  });

  it("adds the literal section when the default project config file exists without one", async () => {
    const literal = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    await withTestEnv(EMPTY_CONFIG, async (env) => {
      await writeDuplicatedLiteralFixture(env, literal);

      const result = await allowlistExisting({ projectRoot: env.projectDir });

      expect(result.exitCode).toBe(0);

      const allowlist = readLiteralAllowlist(await readProjectConfigSections(env));
      expect(allowlist.include).toContain(literal);
    });
  });

  it("appends new include entries in alphabetical order when multiple distinct findings are present", async () => {
    const literals = sampleDistinctLiterals(MULTI_FIXTURE_COUNT);
    await withTestEnv(buildBaselineConfig(), async (env) => {
      await writeMultipleLiteralFixtures(env, literals);

      const result = await allowlistExisting({ projectRoot: env.projectDir });
      expect(result.exitCode).toBe(0);

      const allowlist = readLiteralAllowlist(await readProjectConfigSections(env));
      const include = allowlist.include ?? [];
      const indices = literals.map((value) => include.indexOf(value));
      indices.forEach((idx) => expect(idx).toBeGreaterThan(-1));

      const expectedOrder = [...literals].sort();
      const observedOrder = include.filter((value) => literals.includes(value));
      expect(observedOrder).toEqual(expectedOrder);
    });
  });

  it("returns the resolveConfig ambiguity error and writes nothing when multiple spx.config.* files are present", async () => {
    const literal = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    await withTestEnv(buildBaselineConfig(), async (env) => {
      await writeDuplicatedLiteralFixture(env, literal);
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
