import { describe, expect, it } from "vitest";

import { LITERAL_EXIT_CODES } from "@/commands/validation/literal";
import { CONFIG_FILE_FORMAT_ORDER, CONFIG_FILENAMES, readProductConfigFile } from "@/config/index";
import {
  VALIDATION_LITERAL_SUBSECTION,
  VALIDATION_LITERAL_VALUES_SUBSECTION,
  VALIDATION_SECTION,
} from "@/validation/config/descriptor";
import { allowlistExisting } from "@/validation/literal/allowlist-existing";
import { LITERAL_DEFAULTS, PRESET_NAMES } from "@/validation/literal/config";
import {
  arbitraryDomainLiteral,
  LITERAL_TEST_GENERATOR,
  LITERAL_TEST_GENERATOR_COUNTS,
  LITERAL_TEST_INDEXES,
  LITERAL_TEXT_LAYOUT,
  LITERAL_YAML_LAYOUT,
  sampleDistinctDomainLiterals,
  sampleLiteralPair,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";

import {
  buildConfigWithAllowlist,
  buildConfigWithForeignSection,
  readLiteralAllowlist,
  readProductConfigSections,
  writeProjectConfig,
} from "@testing/harnesses/literal-reuse/allowlist-existing";

function sampleCommentText(): string {
  return `# ${sampleLiteralTestValue(arbitraryDomainLiteral())}`;
}

function sampleForeignSection(): { readonly key: string; readonly body: Record<string, unknown> } {
  const [keySlug, bodyKeySlug, bodyValueSlug] = sampleDistinctDomainLiterals(
    LITERAL_TEST_GENERATOR_COUNTS.multiFixture,
  );
  const key = keySlug === VALIDATION_SECTION ? `${keySlug}-foreign` : keySlug;
  return {
    key,
    body: { [bodyKeySlug]: bodyValueSlug },
  };
}

describe("allowlist-existing compliance", () => {
  it("writes only to validation.literal.values.include while leaving presets and exclude unchanged", async () => {
    const fixture = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceReuseFixtureInputs());
    const excludeLiteral = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const config = buildConfigWithAllowlist({
      include: [],
      presets: [PRESET_NAMES.WEB],
      exclude: [excludeLiteral],
    });
    await withLiteralFixtureEnv(config, async (env) => {
      await env.writeSourceReuseFixture(fixture);

      const result = await allowlistExisting({ productDir: env.productDir });
      expect(result.exitCode).toBe(LITERAL_EXIT_CODES.OK);

      const allowlist = readLiteralAllowlist(await readProductConfigSections(env));
      expect(allowlist.minStringLength).toBe(LITERAL_DEFAULTS.minStringLength);
      expect(allowlist.minNumberDigits).toBe(LITERAL_DEFAULTS.minNumberDigits);
      expect(allowlist.presets).toEqual([PRESET_NAMES.WEB]);
      expect(allowlist.exclude).toEqual([excludeLiteral]);
    });
  });

  it("leaves non-literal top-level sections of spx.config.* unchanged", async () => {
    const fixture = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceReuseFixtureInputs());
    const foreign = sampleForeignSection();
    await withLiteralFixtureEnv(buildConfigWithForeignSection(foreign.key, foreign.body), async (env) => {
      await env.writeSourceReuseFixture(fixture);

      const result = await allowlistExisting({ productDir: env.productDir });
      expect(result.exitCode).toBe(LITERAL_EXIT_CODES.OK);

      const parsed = await readProductConfigSections(env);
      expect(parsed[foreign.key]).toEqual(foreign.body);
    });
  });

  it("is idempotent — a second run against unchanged source yields the same include set as the first", async () => {
    const fixture = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceReuseFixtureInputs());
    const config = buildConfigWithAllowlist({ include: [] });
    await withLiteralFixtureEnv(config, async (env) => {
      await env.writeSourceReuseFixture(fixture);

      const first = await allowlistExisting({ productDir: env.productDir });
      expect(first.exitCode).toBe(LITERAL_EXIT_CODES.OK);
      const allowlistAfterFirst = readLiteralAllowlist(await readProductConfigSections(env));

      const second = await allowlistExisting({ productDir: env.productDir });
      expect(second.exitCode).toBe(LITERAL_EXIT_CODES.OK);
      const allowlistAfterSecond = readLiteralAllowlist(await readProductConfigSections(env));

      expect(allowlistAfterSecond.include).toEqual(allowlistAfterFirst.include);
    });
  });

  it("never removes or reorders existing include entries — appends new values", async () => {
    const [existingFirst, existingSecond] = sampleLiteralPair();
    const fixture = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceReuseFixtureInputs());
    const config = buildConfigWithAllowlist({
      include: [existingFirst, existingSecond],
    });
    await withLiteralFixtureEnv(config, async (env) => {
      await env.writeSourceReuseFixture(fixture);

      const result = await allowlistExisting({ productDir: env.productDir });
      expect(result.exitCode).toBe(LITERAL_EXIT_CODES.OK);

      const allowlist = readLiteralAllowlist(await readProductConfigSections(env));
      const include = allowlist.include ?? [];

      expect(include.indexOf(existingFirst)).toBe(LITERAL_TEST_INDEXES.first);
      expect(include.indexOf(existingSecond)).toBe(LITERAL_TEST_INDEXES.second);
    });
  });

  it("deduplicates against the existing include set — a finding equal to an existing entry adds no duplicate", async () => {
    const fixture = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceReuseFixtureInputs());
    const config = buildConfigWithAllowlist({ include: [fixture.literal] });
    await withLiteralFixtureEnv(config, async (env) => {
      await env.writeSourceReuseFixture(fixture);

      const result = await allowlistExisting({ productDir: env.productDir });
      expect(result.exitCode).toBe(LITERAL_EXIT_CODES.OK);

      const allowlist = readLiteralAllowlist(await readProductConfigSections(env));
      const include = allowlist.include ?? [];
      const occurrences = include.filter((value) => value === fixture.literal).length;
      expect(occurrences).toBe(LITERAL_TEST_GENERATOR_COUNTS.one);
    });
  });

  it.each(CONFIG_FILE_FORMAT_ORDER)(
    "preserves the config module's %s file format while updating validation.literal.values.include",
    async (format) => {
      const fixture = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceReuseFixtureInputs());
      const config = buildConfigWithAllowlist({ include: [] });
      await withLiteralFixtureEnv(config, async (env) => {
        await writeProjectConfig(env, format, config);
        await env.writeSourceReuseFixture(fixture);

        const result = await allowlistExisting({ productDir: env.productDir });
        expect(result.exitCode).toBe(LITERAL_EXIT_CODES.OK);

        const read = await readProductConfigFile(env.productDir);
        expect(read.ok).toBe(true);
        if (!read.ok || read.value.kind !== "ok") return;
        expect(read.value.file.format).toBe(format);

        const allowlist = readLiteralAllowlist(await readProductConfigSections(env));
        expect(allowlist.include).toContain(fixture.literal);
      });
    },
  );

  it("preserves YAML comments while updating validation.literal.values.include", async () => {
    const fixture = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceReuseFixtureInputs());
    const seedIncludeEntry = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const projectConfigComment = sampleCommentText();
    const includeSectionComment = sampleCommentText();
    const minStringLengthComment = sampleCommentText();
    const sectionIndent = " ".repeat(LITERAL_YAML_LAYOUT.sectionIndentWidth);
    const nestedIndent = " ".repeat(LITERAL_YAML_LAYOUT.nestedIndentWidth);
    const valuesIndent = " ".repeat(LITERAL_YAML_LAYOUT.nestedIndentWidth + LITERAL_YAML_LAYOUT.sectionIndentWidth);
    const listIndent = " ".repeat(LITERAL_YAML_LAYOUT.nestedIndentWidth + LITERAL_YAML_LAYOUT.nestedIndentWidth);
    await withLiteralFixtureEnv({}, async (env) => {
      await env.writeRaw(
        CONFIG_FILENAMES.yaml,
        [
          projectConfigComment,
          `${VALIDATION_SECTION}:`,
          `${sectionIndent}${VALIDATION_LITERAL_SUBSECTION}:`,
          `${nestedIndent}${VALIDATION_LITERAL_VALUES_SUBSECTION}:`,
          `${valuesIndent}${includeSectionComment}`,
          `${valuesIndent}include:`,
          `${listIndent}- ${seedIncludeEntry}`,
          `${valuesIndent}${minStringLengthComment}`,
          `${valuesIndent}minStringLength: ${LITERAL_DEFAULTS.minStringLength}`,
          `${valuesIndent}minNumberDigits: ${LITERAL_DEFAULTS.minNumberDigits}`,
          "",
        ].join(LITERAL_TEXT_LAYOUT.lineSeparator),
      );
      await env.writeSourceReuseFixture(fixture);

      const result = await allowlistExisting({ productDir: env.productDir });
      expect(result.exitCode).toBe(LITERAL_EXIT_CODES.OK);

      const rawConfig = await env.readFile(CONFIG_FILENAMES.yaml);
      expect(rawConfig).toContain(projectConfigComment);
      expect(rawConfig).toContain(includeSectionComment);
      expect(rawConfig).toContain(minStringLengthComment);

      const allowlist = readLiteralAllowlist(await readProductConfigSections(env));
      expect(allowlist.include).toContain(fixture.literal);
    });
  });
});
