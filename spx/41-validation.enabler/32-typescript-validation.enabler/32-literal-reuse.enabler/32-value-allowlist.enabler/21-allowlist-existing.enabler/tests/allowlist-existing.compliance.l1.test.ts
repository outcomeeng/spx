import { describe, expect, it } from "vitest";

import { CONFIG_FILE_FORMAT_ORDER, CONFIG_FILENAMES, readProjectConfigFile } from "@/config/index";
import { allowlistExisting } from "@/validation/literal/allowlist-existing";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

import {
  buildConfigWithAllowlist,
  buildConfigWithForeignSection,
  EXISTING_INCLUDE_FIRST,
  EXISTING_INCLUDE_SECOND,
  FOREIGN_SECTION_BODY,
  FOREIGN_SECTION_KEY,
  readLiteralAllowlist,
  readProjectConfigSections,
  SAMPLE_EXCLUDE_VALUE,
  SHARED_FIXTURE_LITERAL,
  WEB_PRESET_NAME,
  writeDuplicatedLiteralFixture,
  writeProjectConfig,
} from "./support";

describe("allowlist-existing compliance", () => {
  it("writes only to literal.allowlist.include — leaves presets and exclude unchanged", async () => {
    const config = buildConfigWithAllowlist({
      include: [],
      presets: [WEB_PRESET_NAME],
      exclude: [SAMPLE_EXCLUDE_VALUE],
    });
    await withTestEnv(config, async (env) => {
      await writeDuplicatedLiteralFixture(env);

      const result = await allowlistExisting({ projectRoot: env.projectDir });
      expect(result.exitCode).toBe(0);

      const allowlist = readLiteralAllowlist(await readProjectConfigSections(env));
      expect(allowlist.presets).toEqual([WEB_PRESET_NAME]);
      expect(allowlist.exclude).toEqual([SAMPLE_EXCLUDE_VALUE]);
    });
  });

  it("leaves non-literal top-level sections of spx.config.* unchanged", async () => {
    await withTestEnv(buildConfigWithForeignSection(), async (env) => {
      await writeDuplicatedLiteralFixture(env);

      const result = await allowlistExisting({ projectRoot: env.projectDir });
      expect(result.exitCode).toBe(0);

      const parsed = await readProjectConfigSections(env);
      expect(parsed[FOREIGN_SECTION_KEY]).toEqual(FOREIGN_SECTION_BODY);
    });
  });

  it("is idempotent — a second run against unchanged source yields the same include set as the first", async () => {
    const config = buildConfigWithAllowlist({ include: [] });
    await withTestEnv(config, async (env) => {
      await writeDuplicatedLiteralFixture(env);

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
    const config = buildConfigWithAllowlist({
      include: [EXISTING_INCLUDE_FIRST, EXISTING_INCLUDE_SECOND],
    });
    await withTestEnv(config, async (env) => {
      await writeDuplicatedLiteralFixture(env);

      const result = await allowlistExisting({ projectRoot: env.projectDir });
      expect(result.exitCode).toBe(0);

      const allowlist = readLiteralAllowlist(await readProjectConfigSections(env));
      const include = allowlist.include ?? [];

      expect(include.indexOf(EXISTING_INCLUDE_FIRST)).toBe(0);
      expect(include.indexOf(EXISTING_INCLUDE_SECOND)).toBe(1);
    });
  });

  it("deduplicates against the existing include set — a finding equal to an existing entry adds no duplicate", async () => {
    const config = buildConfigWithAllowlist({ include: [SHARED_FIXTURE_LITERAL] });
    await withTestEnv(config, async (env) => {
      await writeDuplicatedLiteralFixture(env);

      const result = await allowlistExisting({ projectRoot: env.projectDir });
      expect(result.exitCode).toBe(0);

      const allowlist = readLiteralAllowlist(await readProjectConfigSections(env));
      const include = allowlist.include ?? [];
      const occurrences = include.filter((value) => value === SHARED_FIXTURE_LITERAL).length;
      expect(occurrences).toBe(1);
    });
  });

  it.each(CONFIG_FILE_FORMAT_ORDER)(
    "preserves the config module's %s file format while updating literal.allowlist.include",
    async (format) => {
      const config = buildConfigWithAllowlist({ include: [] });
      await withTestEnv(config, async (env) => {
        await writeProjectConfig(env, format, config);
        await writeDuplicatedLiteralFixture(env);

        const result = await allowlistExisting({ projectRoot: env.projectDir });
        expect(result.exitCode).toBe(0);

        const read = await readProjectConfigFile(env.projectDir);
        expect(read.ok).toBe(true);
        if (!read.ok || read.value.kind !== "ok") return;
        expect(read.value.file.format).toBe(format);

        const allowlist = readLiteralAllowlist(await readProjectConfigSections(env));
        expect(allowlist.include).toContain(SHARED_FIXTURE_LITERAL);
      });
    },
  );

  it("preserves YAML comments while updating literal.allowlist.include", async () => {
    const projectConfigComment = "# project config comment";
    const allowlistSectionComment = "# allowlist section comment";
    const includeListComment = "# include list comment";
    const sectionIndent = " ".repeat(2);
    const nestedIndent = " ".repeat(4);
    const listIndent = " ".repeat(6);
    await withTestEnv({}, async (env) => {
      await env.writeRaw(
        CONFIG_FILENAMES.yaml,
        [
          projectConfigComment,
          "literal:",
          `${sectionIndent}${allowlistSectionComment}`,
          `${sectionIndent}allowlist:`,
          `${nestedIndent}${includeListComment}`,
          `${nestedIndent}include:`,
          `${listIndent}- ${EXISTING_INCLUDE_FIRST}`,
          `${sectionIndent}minStringLength: 5`,
          `${sectionIndent}minNumberDigits: 3`,
          "",
        ].join("\n"),
      );
      await writeDuplicatedLiteralFixture(env);

      const result = await allowlistExisting({ projectRoot: env.projectDir });
      expect(result.exitCode).toBe(0);

      const rawConfig = await env.readFile(CONFIG_FILENAMES.yaml);
      expect(rawConfig).toContain(projectConfigComment);
      expect(rawConfig).toContain(allowlistSectionComment);
      expect(rawConfig).toContain(includeListComment);

      const allowlist = readLiteralAllowlist(await readProjectConfigSections(env));
      expect(allowlist.include).toContain(SHARED_FIXTURE_LITERAL);
    });
  });
});
