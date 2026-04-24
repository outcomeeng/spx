import { describe, expect, it } from "vitest";

import { literalCommand } from "@/commands/validation/literal";
import { withTestEnv } from "@/spec/testing/index.js";
import {
  buildIndex,
  collectLiterals,
  defaultVisitorKeys,
  detectReuse,
  type LiteralIndex,
  type LiteralOccurrence,
  parseLiteralReuseResult,
  REMEDIATION,
  validateLiteralReuse,
} from "@/validation/literal/index.js";

import {
  DETECTOR_OPTIONS_DEFAULTS,
  EMPTY_ALLOWLIST,
  INTEGRATION_CONFIG,
  writeSourceWithLiteral,
  writeTestWithLiteral,
} from "./support.js";

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
const ALLOWLISTED_LITERAL = "info";
const EXCLUDED_NODE_DIR = "spx/21-excluded.enabler";

describe("literal-reuse detection — scenarios", () => {
  it("string literal carrying domain meaning in src and in a test file produces a src↔test reuse finding citing both locations", () => {
    const srcIndex = indexSources(["src/status.ts", `export const STATE = "${SRC_LITERAL}";`]);
    const tests = testOccurrences(
      ["tests/status.test.ts", `expect(value).toBe("${SRC_LITERAL}");`],
    );

    const result = detectReuse({
      srcIndex,
      testOccurrencesByFile: tests,
      allowlist: EMPTY_ALLOWLIST,
    });

    const finding = result.srcReuse.find((f) => f.value === SRC_LITERAL);
    expect(finding).toBeDefined();
    expect(finding?.kind).toBe("string");
    expect(finding?.test.file).toBe("tests/status.test.ts");
    expect(finding?.src.map((s) => s.file)).toContain("src/status.ts");
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
    expect(finding?.kind).toBe("number");
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

  it("literal value listed in the project's allowlist produces no finding even when it would otherwise reuse across src and test", () => {
    const srcIndex = indexSources(["src/loglevel.ts", `export const LEVEL = "${ALLOWLISTED_LITERAL}";`]);
    const tests = testOccurrences(["tests/loglevel.test.ts", `expect(level()).toBe("${ALLOWLISTED_LITERAL}");`]);
    const allowlist = new Set<string>([ALLOWLISTED_LITERAL]);

    const result = detectReuse({
      srcIndex,
      testOccurrencesByFile: tests,
      allowlist,
    });

    const anyFinding = [
      ...result.srcReuse.filter((f) => f.value === ALLOWLISTED_LITERAL),
      ...result.testDupe.filter((f) => f.value === ALLOWLISTED_LITERAL),
    ];
    expect(anyFinding).toHaveLength(0);
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
      const enableKey = "LITERAL_VALIDATION_ENABLED";
      const previous = process.env[enableKey];
      process.env[enableKey] = "1";
      try {
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
          expect(f.remediation).toBe(REMEDIATION.EXTRACT_TO_SHARED_TEST_SUPPORT);
        }
      } finally {
        if (previous === undefined) delete process.env[enableKey];
        else process.env[enableKey] = previous;
      }
    });
  });
});
