import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import { CONFIG_FILENAMES } from "@/config/index.js";
import { withTestEnv } from "@/spec/testing/index.js";
import { allowlistExisting } from "@/validation/literal/allowlist-existing.js";

import {
  buildConfigWithAllowlist,
  buildConfigWithForeignSection,
  EXISTING_INCLUDE_FIRST,
  EXISTING_INCLUDE_SECOND,
  FOREIGN_SECTION_BODY,
  FOREIGN_SECTION_KEY,
  readLiteralAllowlist,
  SAMPLE_EXCLUDE_VALUE,
  SHARED_FIXTURE_LITERAL,
  WEB_PRESET_NAME,
  writeDuplicatedLiteralFixture,
} from "./support.js";

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

      const allowlist = readLiteralAllowlist(parseYaml(await env.readFile(CONFIG_FILENAMES.yaml)));
      expect(allowlist.presets).toEqual([WEB_PRESET_NAME]);
      expect(allowlist.exclude).toEqual([SAMPLE_EXCLUDE_VALUE]);
    });
  });

  it("leaves non-literal top-level sections of spx.config.* unchanged", async () => {
    await withTestEnv(buildConfigWithForeignSection(), async (env) => {
      await writeDuplicatedLiteralFixture(env);

      const result = await allowlistExisting({ projectRoot: env.projectDir });
      expect(result.exitCode).toBe(0);

      const parsed = parseYaml(await env.readFile(CONFIG_FILENAMES.yaml)) as Record<string, unknown>;
      expect(parsed[FOREIGN_SECTION_KEY]).toEqual(FOREIGN_SECTION_BODY);
    });
  });

  it("is idempotent — a second run against unchanged source yields the same include set as the first", async () => {
    const config = buildConfigWithAllowlist({ include: [] });
    await withTestEnv(config, async (env) => {
      await writeDuplicatedLiteralFixture(env);

      const first = await allowlistExisting({ projectRoot: env.projectDir });
      expect(first.exitCode).toBe(0);
      const allowlistAfterFirst = readLiteralAllowlist(
        parseYaml(await env.readFile(CONFIG_FILENAMES.yaml)),
      );

      const second = await allowlistExisting({ projectRoot: env.projectDir });
      expect(second.exitCode).toBe(0);
      const allowlistAfterSecond = readLiteralAllowlist(
        parseYaml(await env.readFile(CONFIG_FILENAMES.yaml)),
      );

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

      const allowlist = readLiteralAllowlist(parseYaml(await env.readFile(CONFIG_FILENAMES.yaml)));
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

      const allowlist = readLiteralAllowlist(parseYaml(await env.readFile(CONFIG_FILENAMES.yaml)));
      const include = allowlist.include ?? [];
      const occurrences = include.filter((value) => value === SHARED_FIXTURE_LITERAL).length;
      expect(occurrences).toBe(1);
    });
  });
});
