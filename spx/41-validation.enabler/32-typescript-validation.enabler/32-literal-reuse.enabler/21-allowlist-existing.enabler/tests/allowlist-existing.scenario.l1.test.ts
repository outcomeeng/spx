import { unlink } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import { CONFIG_FILENAMES, resolveConfig } from "@/config/index.js";
import { withTestEnv } from "@/spec/testing/index.js";
import { allowlistExisting } from "@/validation/literal/allowlist-existing.js";
import { type LiteralConfig, literalConfigDescriptor } from "@/validation/literal/config.js";
import { validateLiteralReuse } from "@/validation/literal/index.js";

import {
  buildBaselineConfig,
  MULTI_FINDINGS_LITERALS,
  readLiteralAllowlist,
  SHARED_FIXTURE_LITERAL,
  writeDuplicatedLiteralFixture,
  writeMultipleLiteralFixtures,
} from "./support.js";

const EMPTY_JSON_BODY = "{}\n";
const EMPTY_CONFIG: Record<string, unknown> = {};

describe("allowlist-existing scenario", () => {
  it("appends current finding values to literal.allowlist.include and a subsequent run reports zero findings", async () => {
    await withTestEnv(buildBaselineConfig(), async (env) => {
      await writeDuplicatedLiteralFixture(env);

      const result = await allowlistExisting({ projectRoot: env.projectDir });

      expect(result.exitCode).toBe(0);

      const parsed = parseYaml(await env.readFile(CONFIG_FILENAMES.yaml));
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

  it("creates spx.config.yaml when no spx.config.* exists at the project root", async () => {
    await withTestEnv(buildBaselineConfig(), async (env) => {
      await writeDuplicatedLiteralFixture(env);
      await unlink(join(env.projectDir, CONFIG_FILENAMES.yaml));

      const result = await allowlistExisting({ projectRoot: env.projectDir });

      expect(result.exitCode).toBe(0);

      const allowlist = readLiteralAllowlist(parseYaml(await env.readFile(CONFIG_FILENAMES.yaml)));
      expect(allowlist.include).toContain(SHARED_FIXTURE_LITERAL);
    });
  });

  it("adds the literal section when spx.config.yaml exists without one", async () => {
    await withTestEnv(EMPTY_CONFIG, async (env) => {
      await writeDuplicatedLiteralFixture(env);

      const result = await allowlistExisting({ projectRoot: env.projectDir });

      expect(result.exitCode).toBe(0);

      const allowlist = readLiteralAllowlist(parseYaml(await env.readFile(CONFIG_FILENAMES.yaml)));
      expect(allowlist.include).toContain(SHARED_FIXTURE_LITERAL);
    });
  });

  it("appends new include entries in alphabetical order when multiple distinct findings are present", async () => {
    await withTestEnv(buildBaselineConfig(), async (env) => {
      await writeMultipleLiteralFixtures(env, MULTI_FINDINGS_LITERALS);

      const result = await allowlistExisting({ projectRoot: env.projectDir });
      expect(result.exitCode).toBe(0);

      const allowlist = readLiteralAllowlist(parseYaml(await env.readFile(CONFIG_FILENAMES.yaml)));
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
      const yamlBefore = await env.readFile(CONFIG_FILENAMES.yaml);
      await env.writeRaw(CONFIG_FILENAMES.json, EMPTY_JSON_BODY);

      const result = await allowlistExisting({ projectRoot: env.projectDir });

      expect(result.exitCode).not.toBe(0);
      expect(result.output).toContain(CONFIG_FILENAMES.yaml);
      expect(result.output).toContain(CONFIG_FILENAMES.json);

      expect(await env.readFile(CONFIG_FILENAMES.yaml)).toBe(yamlBefore);
      expect(await env.readFile(CONFIG_FILENAMES.json)).toBe(EMPTY_JSON_BODY);
    });
  });
});
