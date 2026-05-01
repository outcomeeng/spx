import { unlink } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { literalCommand } from "@/commands/validation/literal";
import { CONFIG_FILENAMES } from "@/config/index";
import { withTestEnv } from "@/spec/testing/index";
import { TYPESCRIPT_MARKER } from "@/validation/discovery/index";
import { LITERAL_SECTION } from "@/validation/literal/config";
import {
  buildIndex,
  collectLiterals,
  defaultVisitorKeys,
  detectReuse,
  LITERAL_KIND,
  type LiteralIndex,
  type LiteralOccurrence,
  parseLiteralReuseResult,
  REMEDIATION,
  validateLiteralReuse,
} from "@/validation/literal/index";

import {
  configWithAllowlist,
  DETECTOR_OPTIONS_DEFAULTS,
  EMPTY_ALLOWLIST,
  INTEGRATION_CONFIG,
  writeSourceWithLiteral,
  writeTestWithLiteral,
} from "./support";

const DEFAULT_OPTIONS = {
  visitorKeys: defaultVisitorKeys,
  ...DETECTOR_OPTIONS_DEFAULTS,
};

function indexSources(
  ...sources: ReadonlyArray<readonly [string, string]>
): LiteralIndex {
  const all: LiteralOccurrence[] = [];
  for (const [filename, source] of sources) {
    all.push(...collectLiterals(source, filename, DEFAULT_OPTIONS));
  }
  return buildIndex(all);
}

function testOccurrences(
  ...entries: ReadonlyArray<readonly [string, string]>
): ReadonlyMap<string, readonly LiteralOccurrence[]> {
  const map = new Map<string, readonly LiteralOccurrence[]>();
  for (const [filename, source] of entries) {
    map.set(filename, collectLiterals(source, filename, DEFAULT_OPTIONS));
  }
  return map;
}

const SRC_LITERAL = "src-owned-token";
const TEST_DUPE_LITERAL = "test-dupe-token";
const SOLITARY_LITERAL = "only-once-value-abc";
const EXCLUDED_NODE_DIR = "spx/21-excluded.enabler";
const WEB_PRESET_ID = "web";
const ALLOWLISTED_PRESET_TOKEN = "Authorization";
const UNKNOWN_PRESET_ID = "ecosystem-nonexistent";

describe("literal-reuse detection — scenarios", () => {
  it("string literal carrying domain meaning in src and in a test file produces a src↔test reuse finding citing both locations", () => {
    const sourceFile = "src/status.ts";
    const testFile = "tests/status.test.ts";
    const srcIndex = indexSources([sourceFile, `export const STATE = "${SRC_LITERAL}";`]);
    const tests = testOccurrences(
      [testFile, `expect(value).toBe("${SRC_LITERAL}");`],
    );

    const result = detectReuse({
      srcIndex,
      testOccurrencesByFile: tests,
      allowlist: EMPTY_ALLOWLIST,
    });

    const finding = result.srcReuse.find((f) => f.value === SRC_LITERAL);
    expect(finding).toBeDefined();
    expect(finding?.kind).toBe(LITERAL_KIND.STRING);
    expect(finding?.test.file).toBe(testFile);
    expect(finding?.src.map((s) => s.file)).toContain(sourceFile);
    expect(result.testDupe).toHaveLength(0);
  });

  it("string literal in two or more test files with no source occurrence produces a test↔test duplication finding citing every test location", () => {
    const srcIndex = indexSources(["src/other.ts", `export const OTHER = "unrelated-value";`]);
    const tests = testOccurrences(
      ["tests/a.test.ts", `expect(v).toBe("${TEST_DUPE_LITERAL}");`],
      ["tests/b.test.ts", `expect(v).toBe("${TEST_DUPE_LITERAL}");`],
    );

    const result = detectReuse({
      srcIndex,
      testOccurrencesByFile: tests,
      allowlist: EMPTY_ALLOWLIST,
    });

    const findings = result.testDupe.filter((f) => f.value === TEST_DUPE_LITERAL);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    const files = new Set<string>();
    for (const f of findings) {
      files.add(f.test.file);
      for (const o of f.otherTests) files.add(o.file);
    }
    expect(files.has("tests/a.test.ts")).toBe(true);
    expect(files.has("tests/b.test.ts")).toBe(true);
  });

  it("numeric literal of meaningful magnitude duplicating between source and test produces a src↔test reuse finding", () => {
    const numericLiteral = "30000";
    const srcIndex = indexSources(["src/timeout.ts", `export const DEADLINE_MS = ${numericLiteral};`]);
    const tests = testOccurrences(
      ["tests/timeout.test.ts", `expect(computeDeadline()).toBe(${numericLiteral});`],
    );

    const result = detectReuse({
      srcIndex,
      testOccurrencesByFile: tests,
      allowlist: EMPTY_ALLOWLIST,
    });

    const finding = result.srcReuse.find((f) => f.value === numericLiteral);
    expect(finding).toBeDefined();
    expect(finding?.kind).toBe(LITERAL_KIND.NUMBER);
  });

  it("literal value appearing exactly once in the codebase produces no finding for that value", () => {
    const srcIndex = indexSources(["src/only.ts", `export const VALUE = "${SOLITARY_LITERAL}";`]);
    const tests = testOccurrences(["tests/other.test.ts", `expect(v).toBe("different");`]);

    const result = detectReuse({
      srcIndex,
      testOccurrencesByFile: tests,
      allowlist: EMPTY_ALLOWLIST,
    });

    const hits = [
      ...result.srcReuse.filter((f) => f.value === SOLITARY_LITERAL),
      ...result.testDupe.filter((f) => f.value === SOLITARY_LITERAL),
    ];
    expect(hits).toHaveLength(0);
  });

  it("literal.allowlist.include in spx.config.yaml suppresses findings for that value via literalCommand", async () => {
    const includedLiteral = "include-token-via-config";
    await withTestEnv(configWithAllowlist({ include: [includedLiteral] }), async (env) => {
      await env.writeRaw(TYPESCRIPT_MARKER, "{}\n");
      await writeSourceWithLiteral(env, "src/x.ts", includedLiteral);
      await writeTestWithLiteral(env, "tests/x.test.ts", includedLiteral);

      const { output } = await literalCommand({ cwd: env.projectDir, json: true, quiet: true });
      const parsed = parseLiteralReuseResult(JSON.parse(output) as unknown);

      expect(parsed.srcReuse.find((f) => f.value === includedLiteral)).toBeUndefined();
      expect(parsed.testDupe.find((f) => f.value === includedLiteral)).toBeUndefined();
    });
  });

  it("literal.allowlist.presets web preset suppresses bundled tokens via literalCommand", async () => {
    const presetToken = ALLOWLISTED_PRESET_TOKEN;
    await withTestEnv(configWithAllowlist({ presets: [WEB_PRESET_ID] }), async (env) => {
      await env.writeRaw(TYPESCRIPT_MARKER, "{}\n");
      await writeSourceWithLiteral(env, "src/api.ts", presetToken);
      await writeTestWithLiteral(env, "tests/api.test.ts", presetToken);

      const { output } = await literalCommand({ cwd: env.projectDir, json: true, quiet: true });
      const parsed = parseLiteralReuseResult(JSON.parse(output) as unknown);

      expect(parsed.srcReuse.find((f) => f.value === presetToken)).toBeUndefined();
    });
  });

  it("literal.allowlist.exclude wins over a preset — findings for the excluded value are still reported", async () => {
    const presetToken = ALLOWLISTED_PRESET_TOKEN;
    await withTestEnv(
      configWithAllowlist({ presets: [WEB_PRESET_ID], exclude: [presetToken] }),
      async (env) => {
        await env.writeRaw(TYPESCRIPT_MARKER, "{}\n");
        await writeSourceWithLiteral(env, "src/api.ts", presetToken);
        await writeTestWithLiteral(env, "tests/api.test.ts", presetToken);

        const { output } = await literalCommand({ cwd: env.projectDir, json: true, quiet: true });
        const parsed = parseLiteralReuseResult(JSON.parse(output) as unknown);

        expect(parsed.srcReuse.find((f) => f.value === presetToken)).toBeDefined();
      },
    );
  });

  it("no spx.config.* file at the project root yields an empty effective allowlist", async () => {
    const wouldBeAllowedByWeb = ALLOWLISTED_PRESET_TOKEN;
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      await unlink(join(env.projectDir, CONFIG_FILENAMES.yaml));
      await env.writeRaw(TYPESCRIPT_MARKER, "{}\n");
      await writeSourceWithLiteral(env, "src/api.ts", wouldBeAllowedByWeb);
      await writeTestWithLiteral(env, "tests/api.test.ts", wouldBeAllowedByWeb);

      const { output } = await literalCommand({ cwd: env.projectDir, json: true, quiet: true });
      const parsed = parseLiteralReuseResult(JSON.parse(output) as unknown);

      expect(parsed.srcReuse.find((f) => f.value === wouldBeAllowedByWeb)).toBeDefined();
    });
  });

  it("unrecognized preset identifier in literal.allowlist.presets causes literalCommand to fail with the validator's error", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      await env.writeRaw(TYPESCRIPT_MARKER, "{}\n");
      await env.writeRaw(
        CONFIG_FILENAMES.yaml,
        `${LITERAL_SECTION}:\n  allowlist:\n    presets:\n      - ${UNKNOWN_PRESET_ID}\n`,
      );

      const result = await literalCommand({ cwd: env.projectDir, json: false, quiet: true });

      expect(result.exitCode).not.toBe(0);
      expect(result.output).toContain(UNKNOWN_PRESET_ID);
    });
  });

  it("files under a node listed in spx/EXCLUDE are not parsed and contribute no occurrences to the index", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      const relative = EXCLUDED_NODE_DIR.replace("spx/", "");
      const excludedLiteral = "literal-inside-excluded-node";

      await env.writeRaw("spx/EXCLUDE", `${relative}\n`);
      await env.writeRaw(`${EXCLUDED_NODE_DIR}/excluded.md`, `# excluded\n`);
      await writeSourceWithLiteral(env, `${EXCLUDED_NODE_DIR}/secret.ts`, excludedLiteral);
      await writeSourceWithLiteral(env, "src/normal.ts", SRC_LITERAL);

      const result = await validateLiteralReuse({ projectRoot: env.projectDir });

      const indexedValues = new Set<string>();
      for (const occurrences of result.indexedOccurrencesByFile.values()) {
        for (const o of occurrences) indexedValues.add(o.value);
      }
      expect(indexedValues.has(excludedLiteral)).toBe(false);
    });
  });

  it("--files mode restricts walking and indexing to the named paths", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      const unlistedLiteral = "unlisted-token";
      await writeSourceWithLiteral(env, "src/included.ts", SRC_LITERAL);
      await writeSourceWithLiteral(env, "src/unlisted.ts", unlistedLiteral);
      await writeTestWithLiteral(env, "tests/included.test.ts", SRC_LITERAL);
      await writeTestWithLiteral(env, "tests/unlisted.test.ts", unlistedLiteral);

      const result = await validateLiteralReuse({
        projectRoot: env.projectDir,
        files: ["src/included.ts", "tests/included.test.ts"],
      });

      const indexedValues = new Set<string>();
      for (const occurrences of result.indexedOccurrencesByFile.values()) {
        for (const o of occurrences) indexedValues.add(o.value);
      }
      expect(indexedValues.has(SRC_LITERAL)).toBe(true);
      expect(indexedValues.has(unlistedLiteral)).toBe(false);
    });
  });

  it("--json output parses through parseLiteralReuseResult without throwing and exposes both finding arrays", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      await env.writeRaw(TYPESCRIPT_MARKER, "{}\n");
      await writeSourceWithLiteral(env, "src/reuse.ts", SRC_LITERAL);
      await writeTestWithLiteral(env, "tests/reuse.test.ts", SRC_LITERAL);
      await writeTestWithLiteral(env, "tests/dupe-1.test.ts", TEST_DUPE_LITERAL);
      await writeTestWithLiteral(env, "tests/dupe-2.test.ts", TEST_DUPE_LITERAL);

      const { output } = await literalCommand({
        cwd: env.projectDir,
        json: true,
        quiet: true,
      });
      const parsed = parseLiteralReuseResult(JSON.parse(output) as unknown);

      expect(parsed.srcReuse.length).toBeGreaterThanOrEqual(1);
      expect(parsed.testDupe.length).toBeGreaterThanOrEqual(1);
      for (const f of parsed.srcReuse) {
        expect(f.remediation).toBe(REMEDIATION.IMPORT_FROM_SOURCE);
      }
      for (const f of parsed.testDupe) {
        expect(f.remediation).toBe(REMEDIATION.REFACTOR_TO_SOURCE_OR_GENERATOR);
      }
    });
  });
});
