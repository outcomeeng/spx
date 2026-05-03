import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { CONFIG_FILE_FORMAT_ORDER, CONFIG_FILENAMES, readProjectConfigFile } from "@/config/index";
import { allowlistExisting } from "@/validation/literal/allowlist-existing";
import { PRESET_NAMES } from "@/validation/literal/config";
import {
  arbitraryDomainLiteral,
  LITERAL_TEST_GENERATOR,
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

const PAIR_LENGTH = 2;
const SECTION_INDENT_WIDTH = 2;
const NESTED_INDENT_WIDTH = 4;
const LIST_INDENT_WIDTH = 6;
const MIN_STRING_LENGTH_FIXTURE = 5;
const MIN_NUMBER_DIGITS_FIXTURE = 3;

function sampleDistinctLiterals(count: number): readonly string[] {
  return sampleLiteralTestValue(
    fc.uniqueArray(arbitraryDomainLiteral(), { minLength: count, maxLength: count }),
  );
}

function sampleCommentText(): string {
  return `# ${sampleLiteralTestValue(arbitraryDomainLiteral())}`;
}

function sampleForeignSection(): { readonly key: string; readonly body: Record<string, unknown> } {
  const [keySlug, bodyKeySlug, bodyValueSlug] = sampleDistinctLiterals(3);
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

      const result = await allowlistExisting({ projectRoot: env.projectDir });
      expect(result.exitCode).toBe(0);

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

      const result = await allowlistExisting({ projectRoot: env.projectDir });
      expect(result.exitCode).toBe(0);

      const parsed = await readProjectConfigSections(env);
      expect(parsed[foreign.key]).toEqual(foreign.body);
    });
  });

  it("is idempotent — a second run against unchanged source yields the same include set as the first", async () => {
    const fixtureLiteral = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const config = buildConfigWithAllowlist({ include: [] });
    await withTestEnv(config, async (env) => {
      await writeDuplicatedLiteralFixture(env, fixtureLiteral);

      const first = await allowlistExisting({ projectRoot: env.projectDir });
      expect(first.exitCode).toBe(0);
      const allowlistAfterFirst = readLiteralAllowlist(await readProjectConfigSections(env));

      const second = await allowlistExisting({ projectRoot: env.projectDir });
      expect(second.exitCode).toBe(0);
      const allowlistAfterSecond = readLiteralAllowlist(await readProjectConfigSections(env));

      expect(allowlistAfterSecond.include).toEqual(allowlistAfterFirst.include);
    });
  });

  it("never removes or reorders existing include entries — appends new values", async () => {
    const [existingFirst, existingSecond] = sampleDistinctLiterals(PAIR_LENGTH);
    if (existingFirst === undefined || existingSecond === undefined) {
      throw new Error("sampleDistinctLiterals returned an incomplete pair");
    }
    const fixtureLiteral = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const config = buildConfigWithAllowlist({
      include: [existingFirst, existingSecond],
    });
    await withTestEnv(config, async (env) => {
      await writeDuplicatedLiteralFixture(env, fixtureLiteral);

      const result = await allowlistExisting({ projectRoot: env.projectDir });
      expect(result.exitCode).toBe(0);

      const allowlist = readLiteralAllowlist(await readProjectConfigSections(env));
      const include = allowlist.include ?? [];

      expect(include.indexOf(existingFirst)).toBe(0);
      expect(include.indexOf(existingSecond)).toBe(1);
    });
  });

  it("deduplicates against the existing include set — a finding equal to an existing entry adds no duplicate", async () => {
    const fixtureLiteral = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const config = buildConfigWithAllowlist({ include: [fixtureLiteral] });
    await withTestEnv(config, async (env) => {
      await writeDuplicatedLiteralFixture(env, fixtureLiteral);

      const result = await allowlistExisting({ projectRoot: env.projectDir });
      expect(result.exitCode).toBe(0);

      const allowlist = readLiteralAllowlist(await readProjectConfigSections(env));
      const include = allowlist.include ?? [];
      const occurrences = include.filter((value) => value === fixtureLiteral).length;
      expect(occurrences).toBe(1);
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

        const result = await allowlistExisting({ projectRoot: env.projectDir });
        expect(result.exitCode).toBe(0);

        const read = await readProjectConfigFile(env.projectDir);
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
    const sectionIndent = " ".repeat(SECTION_INDENT_WIDTH);
    const nestedIndent = " ".repeat(NESTED_INDENT_WIDTH);
    const valuesIndent = " ".repeat(NESTED_INDENT_WIDTH + SECTION_INDENT_WIDTH);
    const allowlistIndent = " ".repeat(NESTED_INDENT_WIDTH + NESTED_INDENT_WIDTH);
    const includeIndent = " ".repeat(NESTED_INDENT_WIDTH + NESTED_INDENT_WIDTH + SECTION_INDENT_WIDTH);
    const listIndent = " ".repeat(LIST_INDENT_WIDTH + NESTED_INDENT_WIDTH);
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
          `${valuesIndent}minStringLength: ${MIN_STRING_LENGTH_FIXTURE}`,
          `${valuesIndent}minNumberDigits: ${MIN_NUMBER_DIGITS_FIXTURE}`,
          "",
        ].join("\n"),
      );
      await writeDuplicatedLiteralFixture(env, fixtureLiteral);

      const result = await allowlistExisting({ projectRoot: env.projectDir });
      expect(result.exitCode).toBe(0);

      const rawConfig = await env.readFile(CONFIG_FILENAMES.yaml);
      expect(rawConfig).toContain(projectConfigComment);
      expect(rawConfig).toContain(allowlistSectionComment);
      expect(rawConfig).toContain(includeListComment);

      const allowlist = readLiteralAllowlist(await readProjectConfigSections(env));
      expect(allowlist.include).toContain(fixtureLiteral);
    });
  });
});
