import { unlink } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LITERAL_EXIT_CODES } from "@/commands/validation/literal";
import {
  CONFIG_FILE_FORMAT,
  CONFIG_FILENAMES,
  DEFAULT_CONFIG_FILENAME,
  readProductConfigFile,
  resolveConfig,
  serializeConfigFileSections,
} from "@/config/index";
import { compareAsciiStrings } from "@/lib/state-store";
import {
  VALIDATION_PATH_TOOL_SUBSECTIONS,
  type ValidationConfig,
  validationConfigDescriptor,
} from "@/validation/config/descriptor";
import { validationPathFilterForTool } from "@/validation/config/path-filter";
import { allowlistExisting } from "@/validation/literal/allowlist-existing";
import { validateLiteralReuse } from "@/validation/literal/index";
import {
  LITERAL_TEST_GENERATOR,
  LITERAL_TEST_GENERATOR_COUNTS,
  literalEmptyConfig,
  sampleLiteralSourceReuseFixtures,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";

import {
  buildBaselineConfig,
  buildConfigWithValidationPaths,
  readLiteralAllowlist,
  readProductConfigSections,
} from "@testing/harnesses/literal-reuse/allowlist-existing";

function serializeEmptyJsonConfig(): string {
  const serialized = serializeConfigFileSections(CONFIG_FILE_FORMAT.JSON, literalEmptyConfig());
  return serialized.value;
}

describe("allowlist-existing scenario", () => {
  it("appends current finding values to validation.literal.values.include and a subsequent run reports zero findings", async () => {
    const fixture = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceReuseFixtureInputs());
    await withLiteralFixtureEnv(buildBaselineConfig(), async (env) => {
      await env.writeSourceReuseFixture(fixture);

      const result = await allowlistExisting({ productDir: env.productDir });

      expect(result.exitCode).toBe(LITERAL_EXIT_CODES.OK);

      const parsed = await readProductConfigSections(env);
      const allowlist = readLiteralAllowlist(parsed);
      expect(allowlist.include).toContain(fixture.literal);

      const resolved = await resolveConfig(env.productDir, [validationConfigDescriptor]);
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) return;
      const updatedValidation = resolved.value[validationConfigDescriptor.section] as ValidationConfig;

      const second = await validateLiteralReuse({
        productDir: env.productDir,
        config: updatedValidation.literal.values,
        pathConfig: validationPathFilterForTool(
          updatedValidation.paths,
          VALIDATION_PATH_TOOL_SUBSECTIONS.LITERAL,
        ),
      });
      expect(second.findings.srcReuse.length + second.findings.testDupe.length).toBe(
        LITERAL_TEST_GENERATOR_COUNTS.none,
      );
    });
  });

  it("creates the config module's default file when no spx.config.* exists at the product directory", async () => {
    const fixture = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceReuseFixtureInputs());
    await withLiteralFixtureEnv(buildBaselineConfig(), async (env) => {
      await env.writeSourceReuseFixture(fixture);
      await unlink(join(env.productDir, DEFAULT_CONFIG_FILENAME));

      const result = await allowlistExisting({ productDir: env.productDir });

      expect(result.exitCode).toBe(LITERAL_EXIT_CODES.OK);

      const allowlist = readLiteralAllowlist(await readProductConfigSections(env));
      expect(allowlist.include).toContain(fixture.literal);

      const configRead = await readProductConfigFile(env.productDir);
      expect(configRead.ok).toBe(true);
      if (!configRead.ok || configRead.value.kind !== "ok") return;
      expect(configRead.value.file.filename).toBe(DEFAULT_CONFIG_FILENAME);
    });
  });

  it("adds the literal section when the default product config file exists without one", async () => {
    const fixture = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceReuseFixtureInputs());
    await withLiteralFixtureEnv(literalEmptyConfig(), async (env) => {
      await env.writeSourceReuseFixture(fixture);

      const result = await allowlistExisting({ productDir: env.productDir });

      expect(result.exitCode).toBe(LITERAL_EXIT_CODES.OK);

      const allowlist = readLiteralAllowlist(await readProductConfigSections(env));
      expect(allowlist.include).toContain(fixture.literal);
    });
  });

  it("appends new include entries in alphabetical order when multiple distinct findings are present", async () => {
    const fixtures = sampleLiteralSourceReuseFixtures(LITERAL_TEST_GENERATOR_COUNTS.multiFixture);
    const literals = fixtures.map((fixture) => fixture.literal);
    await withLiteralFixtureEnv(buildBaselineConfig(), async (env) => {
      await env.writeSourceReuseFixtures(fixtures);

      const result = await allowlistExisting({ productDir: env.productDir });
      expect(result.exitCode).toBe(LITERAL_EXIT_CODES.OK);

      const allowlist = readLiteralAllowlist(await readProductConfigSections(env));
      const include = allowlist.include ?? [];
      const indices = literals.map((value) => include.indexOf(value));
      indices.forEach((idx) => expect(idx).toBeGreaterThan(-1));

      const expectedOrder = [...literals].sort(compareAsciiStrings);
      const observedOrder = include.filter((value) => literals.includes(value));
      expect(observedOrder).toEqual(expectedOrder);
    });
  });

  it("uses resolved validation.paths.exclude before collecting values for validation.literal.values.include", async () => {
    const fixture = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.pathScopedSourceReuseFixtureInputs());
    const config = buildConfigWithValidationPaths({
      exclude: [fixture.excludedPathPrefix],
    });

    await withLiteralFixtureEnv(config, async (env) => {
      await env.writePathScopedSourceReuseFixture(fixture);

      const result = await allowlistExisting({ productDir: env.productDir });
      expect(result.exitCode).toBe(LITERAL_EXIT_CODES.OK);

      const allowlist = readLiteralAllowlist(await readProductConfigSections(env));
      expect(allowlist.include).toContain(fixture.included.literal);
      expect(allowlist.include).not.toContain(fixture.excluded.literal);
    });
  });

  it("returns the resolveConfig ambiguity error and writes nothing when multiple spx.config.* files are present", async () => {
    const fixture = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceReuseFixtureInputs());
    await withLiteralFixtureEnv(buildBaselineConfig(), async (env) => {
      await env.writeSourceReuseFixture(fixture);
      const defaultConfigBefore = await env.readFile(DEFAULT_CONFIG_FILENAME);
      const jsonBefore = serializeEmptyJsonConfig();
      await env.writeRaw(CONFIG_FILENAMES.json, jsonBefore);

      const result = await allowlistExisting({ productDir: env.productDir });

      expect(result.exitCode).not.toBe(LITERAL_EXIT_CODES.OK);
      expect(result.output).toContain(DEFAULT_CONFIG_FILENAME);
      expect(result.output).toContain(CONFIG_FILENAMES.json);

      expect(await env.readFile(DEFAULT_CONFIG_FILENAME)).toBe(defaultConfigBefore);
      expect(await env.readFile(CONFIG_FILENAMES.json)).toBe(jsonBefore);
    });
  });
});
