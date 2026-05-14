import { unlink } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LITERAL_EXIT_CODES } from "@/commands/validation/literal";
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
  LITERAL_TEST_GENERATOR,
  LITERAL_TEST_GENERATOR_COUNTS,
  literalEmptyConfig,
  sampleIndependentDomainLiterals,
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

function serializeEmptyJsonConfig(): string {
  const serialized = serializeConfigFileSections(CONFIG_FILE_FORMAT.JSON, literalEmptyConfig());
  if (!serialized.ok) {
    throw new Error(serialized.error);
  }
  return serialized.value;
}

describe("allowlist-existing scenario", () => {
  it("appends current finding values to literal.allowlist.include and a subsequent run reports zero findings", async () => {
    const literal = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    await withTestEnv(buildBaselineConfig(), async (env) => {
      await writeDuplicatedLiteralFixture(env, literal);

      const result = await allowlistExisting({ projectRoot: env.productDir });

      expect(result.exitCode).toBe(LITERAL_EXIT_CODES.OK);

      const parsed = await readProjectConfigSections(env);
      const allowlist = readLiteralAllowlist(parsed);
      expect(allowlist.include).toContain(literal);

      const resolved = await resolveConfig(env.productDir, [validationConfigDescriptor]);
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) return;
      const updatedValidation = resolved.value[validationConfigDescriptor.section] as ValidationConfig;

      const second = await validateLiteralReuse({
        projectRoot: env.productDir,
        config: updatedValidation.literal.values,
      });
      expect(second.findings.srcReuse.length + second.findings.testDupe.length).toBe(
        LITERAL_TEST_GENERATOR_COUNTS.none,
      );
    });
  });

  it("creates the config module's default file when no spx.config.* exists at the project root", async () => {
    const literal = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    await withTestEnv(buildBaselineConfig(), async (env) => {
      await writeDuplicatedLiteralFixture(env, literal);
      await unlink(join(env.productDir, DEFAULT_CONFIG_FILENAME));

      const result = await allowlistExisting({ projectRoot: env.productDir });

      expect(result.exitCode).toBe(LITERAL_EXIT_CODES.OK);

      const allowlist = readLiteralAllowlist(await readProjectConfigSections(env));
      expect(allowlist.include).toContain(literal);
    });
  });

  it("adds the literal section when the default project config file exists without one", async () => {
    const literal = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    await withTestEnv(literalEmptyConfig(), async (env) => {
      await writeDuplicatedLiteralFixture(env, literal);

      const result = await allowlistExisting({ projectRoot: env.productDir });

      expect(result.exitCode).toBe(LITERAL_EXIT_CODES.OK);

      const allowlist = readLiteralAllowlist(await readProjectConfigSections(env));
      expect(allowlist.include).toContain(literal);
    });
  });

  it("appends new include entries in alphabetical order when multiple distinct findings are present", async () => {
    const literals = sampleIndependentDomainLiterals(LITERAL_TEST_GENERATOR_COUNTS.multiFixture);
    await withTestEnv(buildBaselineConfig(), async (env) => {
      await writeMultipleLiteralFixtures(env, literals);

      const result = await allowlistExisting({ projectRoot: env.productDir });
      expect(result.exitCode).toBe(LITERAL_EXIT_CODES.OK);

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

      const result = await allowlistExisting({ projectRoot: env.productDir });

      expect(result.exitCode).not.toBe(LITERAL_EXIT_CODES.OK);
      expect(result.output).toContain(DEFAULT_CONFIG_FILENAME);
      expect(result.output).toContain(CONFIG_FILENAMES.json);

      expect(await env.readFile(DEFAULT_CONFIG_FILENAME)).toBe(defaultConfigBefore);
      expect(await env.readFile(CONFIG_FILENAMES.json)).toBe(jsonBefore);
    });
  });
});
