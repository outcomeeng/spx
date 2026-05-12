import { describe, expect, it } from "vitest";

import { LITERAL_EXIT_CODES } from "@/commands/validation/literal";
import { CONFIG_FILE_FORMAT_ORDER, CONFIG_FILENAMES, readProjectConfigFile } from "@/config/index";
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
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

import {
  buildConfigWithAllowlist,
  buildConfigWithForeignSection,
  readLiteralAllowlist,
  readProjectConfigSections,
  writeDuplicatedLiteralFixture,
  writeProjectConfig,
} from "./support";

function sampleCommentText(): string {
  return `# ${sampleLiteralTestValue(arbitraryDomainLiteral())}`;
}

function sampleForeignSection(): { readonly key: string; readonly body: Record<string, unknown> } {
  const [keySlug, bodyKeySlug, bodyValueSlug] = sampleDistinctDomainLiterals(
    LITERAL_TEST_GENERATOR_COUNTS.multiFixture,
  );
  return {
    key: keySlug,
    body: { [bodyKeySlug]: bodyValueSlug },
  };
}

describe("allowlist-existing compliance", () => {
  it("writes only to literal.allowlist.include — leaves presets and exclude unchanged", async () => {
    const fixtureLiteral = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const excludeLiteral = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const config = buildConfigWithAllowlist({
      include: [],
      presets: [PRESET_NAMES.WEB],
      exclude: [excludeLiteral],
    });
    await withTestEnv(config, async (env) => {
      await writeDuplicatedLiteralFixture(env, fixtureLiteral);

      const result = await allowlistExisting({ projectRoot: env.productDir });
      expect(result.exitCode).toBe(LITERAL_EXIT_CODES.OK);

      const allowlist = readLiteralAllowlist(await readProjectConfigSections(env));
      expect(allowlist.presets).toEqual([PRESET_NAMES.WEB]);
      expect(allowlist.exclude).toEqual([excludeLiteral]);
    });
  });

  it("leaves non-literal top-level sections of spx.config.* unchanged", async () => {
    const fixtureLiteral = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const foreign = sampleForeignSection();
    await withTestEnv(buildConfigWithForeignSection(foreign.key, foreign.body), async (env) => {
      await writeDuplicatedLiteralFixture(env, fixtureLiteral);

      const result = await allowlistExisting({ projectRoot: env.productDir });
      expect(result.exitCode).toBe(LITERAL_EXIT_CODES.OK);

      const parsed = await readProjectConfigSections(env);
      expect(parsed[foreign.key]).toEqual(foreign.body);
    });
  });

  it("is idempotent — a second run against unchanged source yields the same include set as the first", async () => {
    const fixtureLiteral = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const config = buildConfigWithAllowlist({ include: [] });
    await withTestEnv(config, async (env) => {
      await writeDuplicatedLiteralFixture(env, fixtureLiteral);

      const first = await allowlistExisting({ projectRoot: env.productDir });
      expect(first.exitCode).toBe(LITERAL_EXIT_CODES.OK);
      const allowlistAfterFirst = readLiteralAllowlist(await readProjectConfigSections(env));

      const second = await allowlistExisting({ projectRoot: env.productDir });
      expect(second.exitCode).toBe(LITERAL_EXIT_CODES.OK);
      const allowlistAfterSecond = readLiteralAllowlist(await readProjectConfigSections(env));

      expect(allowlistAfterSecond.include).toEqual(allowlistAfterFirst.include);
    });
  });

  it("never removes or reorders existing include entries — appends new values", async () => {
    const [existingFirst, existingSecond] = sampleLiteralPair();
    const fixtureLiteral = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const config = buildConfigWithAllowlist({
      include: [existingFirst, existingSecond],
    });
    await withTestEnv(config, async (env) => {
      await writeDuplicatedLiteralFixture(env, fixtureLiteral);

      const result = await allowlistExisting({ projectRoot: env.productDir });
      expect(result.exitCode).toBe(LITERAL_EXIT_CODES.OK);

      const allowlist = readLiteralAllowlist(await readProjectConfigSections(env));
      const include = allowlist.include ?? [];

      expect(include.indexOf(existingFirst)).toBe(LITERAL_TEST_INDEXES.first);
      expect(include.indexOf(existingSecond)).toBe(LITERAL_TEST_INDEXES.second);
    });
  });

  it("deduplicates against the existing include set — a finding equal to an existing entry adds no duplicate", async () => {
    const fixtureLiteral = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const config = buildConfigWithAllowlist({ include: [fixtureLiteral] });
    await withTestEnv(config, async (env) => {
      await writeDuplicatedLiteralFixture(env, fixtureLiteral);

      const result = await allowlistExisting({ projectRoot: env.productDir });
      expect(result.exitCode).toBe(LITERAL_EXIT_CODES.OK);

      const allowlist = readLiteralAllowlist(await readProjectConfigSections(env));
      const include = allowlist.include ?? [];
      const occurrences = include.filter((value) => value === fixtureLiteral).length;
      expect(occurrences).toBe(LITERAL_TEST_GENERATOR_COUNTS.one);
    });
  });

  it.each(CONFIG_FILE_FORMAT_ORDER)(
    "preserves the config module's %s file format while updating literal.allowlist.include",
    async (format) => {
      const fixtureLiteral = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
      const config = buildConfigWithAllowlist({ include: [] });
      await withTestEnv(config, async (env) => {
        await writeProjectConfig(env, format, config);
        await writeDuplicatedLiteralFixture(env, fixtureLiteral);

        const result = await allowlistExisting({ projectRoot: env.productDir });
        expect(result.exitCode).toBe(LITERAL_EXIT_CODES.OK);

        const read = await readProjectConfigFile(env.productDir);
        expect(read.ok).toBe(true);
        if (!read.ok || read.value.kind !== "ok") return;
        expect(read.value.file.format).toBe(format);

        const allowlist = readLiteralAllowlist(await readProjectConfigSections(env));
        expect(allowlist.include).toContain(fixtureLiteral);
      });
    },
  );

  it("preserves YAML comments while updating literal.allowlist.include", async () => {
    const fixtureLiteral = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const seedIncludeEntry = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const projectConfigComment = sampleCommentText();
    const allowlistSectionComment = sampleCommentText();
    const includeListComment = sampleCommentText();
    const sectionIndent = " ".repeat(LITERAL_YAML_LAYOUT.sectionIndentWidth);
    const nestedIndent = " ".repeat(LITERAL_YAML_LAYOUT.nestedIndentWidth);
    const valuesIndent = " ".repeat(LITERAL_YAML_LAYOUT.nestedIndentWidth + LITERAL_YAML_LAYOUT.sectionIndentWidth);
    const allowlistIndent = " ".repeat(
      LITERAL_YAML_LAYOUT.nestedIndentWidth + LITERAL_YAML_LAYOUT.nestedIndentWidth,
    );
    const listIndent = " ".repeat(LITERAL_YAML_LAYOUT.listIndentWidth + LITERAL_YAML_LAYOUT.nestedIndentWidth);
    await withTestEnv({}, async (env) => {
      await env.writeRaw(
        CONFIG_FILENAMES.yaml,
        [
          projectConfigComment,
          "validation:",
          `${sectionIndent}literal:`,
          `${nestedIndent}values:`,
          `${valuesIndent}${allowlistSectionComment}`,
          `${valuesIndent}allowlist:`,
          `${allowlistIndent}${includeListComment}`,
          `${allowlistIndent}include:`,
          `${listIndent}- ${seedIncludeEntry}`,
          `${valuesIndent}minStringLength: ${LITERAL_DEFAULTS.minStringLength}`,
          `${valuesIndent}minNumberDigits: ${LITERAL_DEFAULTS.minNumberDigits}`,
          "",
        ].join(LITERAL_TEXT_LAYOUT.lineSeparator),
      );
      await writeDuplicatedLiteralFixture(env, fixtureLiteral);

      const result = await allowlistExisting({ projectRoot: env.productDir });
      expect(result.exitCode).toBe(LITERAL_EXIT_CODES.OK);

      const rawConfig = await env.readFile(CONFIG_FILENAMES.yaml);
      expect(rawConfig).toContain(projectConfigComment);
      expect(rawConfig).toContain(allowlistSectionComment);
      expect(rawConfig).toContain(includeListComment);

      const allowlist = readLiteralAllowlist(await readProjectConfigSections(env));
      expect(allowlist.include).toContain(fixtureLiteral);
    });
  });
});
