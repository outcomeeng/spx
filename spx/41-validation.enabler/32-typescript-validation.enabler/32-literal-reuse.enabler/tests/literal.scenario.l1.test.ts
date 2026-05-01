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
  writeLiteralOutputFixture,
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
const literalNoReuseProblemsMessage = "Literal: No problems of type reuse";
const literalVerboseSummary = "Literal: 3 problems (reuse: 1, dupe: 2)";
const literalVerboseReuseHeading = "REUSE";
const literalVerboseDupeHeading = "DUPE";
const fixtureWriterPath = "src/generated-fixture.ts";
const fixtureWriterPayload = "export const GENERATED_STATUS = \"fixture-generated-status\";";
const fixtureWriterCallbackLiteral = "fixture-writer-callback-semantic-value";
const fixtureSessionPath = "spx/21-session-fixture.enabler/tests/session.scenario.l1.test.ts";
const assertionSemanticLiteral = "assertion-semantic-value";
const fixtureProtocolStatus = "PASS";
const fixtureProtocolVerdict = "APPROVED";
const dataSourceLiteral = "semantic-data-source-value";
const jsonOutputLiteral = "semantic-json-output-value";
const sessionManagerLiteral = "semantic-session-manager-value";
const xmlParserLiteral = "semantic-xml-parser-value";
const compoundRoleYamlSourceLiteral = "compound-role-yaml-source-fixture-value";
const compoundRoleAssertionLiteral = "compound-role-assertion-value";
const screamingSnakeFixtureStatus = "SCREAMING_SNAKE_FIXTURE_STATUS";
const screamingSnakeAssertionLiteral = "screaming-snake-assertion-value";
const singleSegmentJsonFixtureLiteral = "single-segment-json-fixture-value";
const singleSegmentAssertionLiteral = "single-segment-assertion-value";
const windowsPathJsonFixtureLiteral = "windows-path-json-fixture-value";
const windowsPathAssertionLiteral = "windows-path-assertion-value";
const testMarkerJsonFixtureLiteral = "test-marker-json-fixture-value";
const testMarkerAssertionLiteral = "test-marker-assertion-value";

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

  it("fixture-writer paths and source payload strings do not contribute occurrences while assertion literals still do", () => {
    const source = `
      async function seed(env) {
        await env.writeRaw("${fixtureWriterPath}", '${fixtureWriterPayload}');
        await env.writeRaw("${fixtureSessionPath}", "# Content\\n");
        expect(actual).toBe("${assertionSemanticLiteral}");
      }
    `;

    const occurrences = collectLiterals(
      source,
      "spx/41-validation.enabler/32-typescript-validation.enabler/32-literal-reuse.enabler/tests/generated.scenario.l1.test.ts",
      DEFAULT_OPTIONS,
    );
    const values = occurrences.map((occurrence) => occurrence.value);

    expect(values).not.toContain(fixtureWriterPath);
    expect(values).not.toContain(fixtureWriterPayload);
    expect(values).not.toContain(fixtureSessionPath);
    expect(values).toContain(assertionSemanticLiteral);
  });

  it("function-boundary literals inside fixture-writer arguments still contribute occurrences", () => {
    const source = `
      async function seed(env) {
        await env.writeRaw("${fixtureWriterPath}", () => {
          return "${fixtureWriterCallbackLiteral}";
        });
      }
    `;

    const occurrences = collectLiterals(
      source,
      "spx/41-validation.enabler/32-typescript-validation.enabler/32-literal-reuse.enabler/tests/generated.scenario.l1.test.ts",
      DEFAULT_OPTIONS,
    );
    const values = occurrences.map((occurrence) => occurrence.value);

    expect(values).not.toContain(fixtureWriterPath);
    expect(values).toContain(fixtureWriterCallbackLiteral);
  });

  it("protocol and status values inside fixture data do not contribute occurrences while assertion literals still do", () => {
    const source = `
      const verdictFixture = {
        status: "${fixtureProtocolStatus}",
        verdict: "${fixtureProtocolVerdict}",
      };
      const { status = "${fixtureProtocolStatus}" } = verdictFixture;
      expect(actual.status).toBe("${fixtureProtocolStatus}");
    `;

    const occurrences = collectLiterals(
      source,
      "spx/36-audit.enabler/tests/audit.scenario.l1.test.ts",
      DEFAULT_OPTIONS,
    );
    const values = occurrences.map((occurrence) => occurrence.value);

    expect(values.filter((value) => value === fixtureProtocolStatus)).toHaveLength(1);
    expect(values).not.toContain(fixtureProtocolVerdict);
  });

  it("compound-role fixture data names do not contribute occurrences while assertion literals still do", () => {
    const source = `
      const yamlSource = "${compoundRoleYamlSourceLiteral}";
      expect(actual).toBe("${compoundRoleAssertionLiteral}");
    `;

    const occurrences = collectLiterals(
      source,
      "spx/41-validation.enabler/tests/compound-role-fixture.scenario.l1.test.ts",
      DEFAULT_OPTIONS,
    );
    const values = occurrences.map((occurrence) => occurrence.value);

    expect(values).not.toContain(compoundRoleYamlSourceLiteral);
    expect(values).toContain(compoundRoleAssertionLiteral);
  });

  it("SCREAMING_SNAKE fixture identifiers classify destructuring defaults as fixture data", () => {
    const source = `
      const VERDICT_FIXTURE = {
        status: "${screamingSnakeFixtureStatus}",
      };
      const { status = "${screamingSnakeFixtureStatus}" } = VERDICT_FIXTURE;
      expect(actual.status).toBe("${screamingSnakeFixtureStatus}");
      expect(actual.label).toBe("${screamingSnakeAssertionLiteral}");
    `;

    const occurrences = collectLiterals(
      source,
      "spx/41-validation.enabler/tests/screaming-snake-fixture.scenario.l1.test.ts",
      DEFAULT_OPTIONS,
    );
    const values = occurrences.map((occurrence) => occurrence.value);

    expect(values.filter((value) => value === screamingSnakeFixtureStatus)).toHaveLength(1);
    expect(values).toContain(screamingSnakeAssertionLiteral);
  });

  it("production-like camelCase names that contain fixture role words still contribute occurrences", () => {
    const source = `
      const dataSource = "${dataSourceLiteral}";
      const jsonOutput = "${jsonOutputLiteral}";
      const sessionManager = "${sessionManagerLiteral}";
      const xmlParser = "${xmlParserLiteral}";
    `;

    const occurrences = collectLiterals(
      source,
      "spx/41-validation.enabler/tests/semantic-names.scenario.l1.test.ts",
      DEFAULT_OPTIONS,
    );
    const values = occurrences.map((occurrence) => occurrence.value);

    expect(values).toContain(dataSourceLiteral);
    expect(values).toContain(jsonOutputLiteral);
    expect(values).toContain(sessionManagerLiteral);
    expect(values).toContain(xmlParserLiteral);
  });

  it("single-segment fixture role names do not contribute occurrences while assertion literals still do", () => {
    const source = `
      const json = "${singleSegmentJsonFixtureLiteral}";
      expect(actual).toBe("${singleSegmentAssertionLiteral}");
    `;

    const occurrences = collectLiterals(
      source,
      "spx/41-validation.enabler/tests/single-segment-fixture.scenario.l1.test.ts",
      DEFAULT_OPTIONS,
    );
    const values = occurrences.map((occurrence) => occurrence.value);

    expect(values).not.toContain(singleSegmentJsonFixtureLiteral);
    expect(values).toContain(singleSegmentAssertionLiteral);
  });

  it("Windows-style tests path segments are treated as test fixture files", () => {
    const source = `
      const json = "${windowsPathJsonFixtureLiteral}";
      expect(actual).toBe("${windowsPathAssertionLiteral}");
    `;

    const occurrences = collectLiterals(
      source,
      "spx\\41-validation.enabler\\tests\\windows-fixture.ts",
      DEFAULT_OPTIONS,
    );
    const values = occurrences.map((occurrence) => occurrence.value);

    expect(values).not.toContain(windowsPathJsonFixtureLiteral);
    expect(values).toContain(windowsPathAssertionLiteral);
  });

  it(".test. filename markers are treated as test fixture files outside tests directories", () => {
    const source = `
      const json = "${testMarkerJsonFixtureLiteral}";
      expect(actual).toBe("${testMarkerAssertionLiteral}");
    `;

    const occurrences = collectLiterals(
      source,
      "src/formatters.test.helpers.ts",
      DEFAULT_OPTIONS,
    );
    const values = occurrences.map((occurrence) => occurrence.value);

    expect(values).not.toContain(testMarkerJsonFixtureLiteral);
    expect(values).toContain(testMarkerAssertionLiteral);
  });

  it("--kind dupe output contains only test↔test duplication problems", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      const fixture = await writeLiteralOutputFixture(env);

      const result = await literalCommand({ cwd: env.projectDir, kind: "dupe" });

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain(`[dupe] "${fixture.dupeLiteral}"`);
      expect(result.output).not.toContain(`[reuse] "${fixture.reuseLiteral}"`);
    });
  });

  it("--kind reuse output contains only src↔test reuse problems", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      const fixture = await writeLiteralOutputFixture(env);

      const result = await literalCommand({ cwd: env.projectDir, kind: "reuse" });

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain(`[reuse] "${fixture.reuseLiteral}"`);
      expect(result.output).not.toContain(`[dupe] "${fixture.dupeLiteral}"`);
    });
  });

  it("--kind reuse with only test↔test duplication problems exits 0 with the no-match message", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      await env.writeRaw(TYPESCRIPT_MARKER, "{}\n");
      await writeTestWithLiteral(env, "tests/dupe-a.test.ts", TEST_DUPE_LITERAL);
      await writeTestWithLiteral(env, "tests/dupe-b.test.ts", TEST_DUPE_LITERAL);

      const result = await literalCommand({ cwd: env.projectDir, kind: "reuse" });

      expect(result.exitCode).toBe(0);
      expect(result.output).toBe(literalNoReuseProblemsMessage);
    });
  });

  it("--files-with-problems output contains unique problem file paths sorted lexicographically", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      const fixture = await writeLiteralOutputFixture(env);

      const result = await literalCommand({ cwd: env.projectDir, filesWithProblems: true });

      expect(result.output.split("\n")).toEqual([
        fixture.dupeFirstTestFile,
        fixture.dupeSecondTestFile,
        fixture.reuseTestFile,
      ]);
    });
  });

  it("--kind reuse --files-with-problems output contains only reuse problem file paths", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      const fixture = await writeLiteralOutputFixture(env);

      const result = await literalCommand({
        cwd: env.projectDir,
        kind: "reuse",
        filesWithProblems: true,
      });

      expect(result.output).toBe(fixture.reuseTestFile);
    });
  });

  it("--literals output contains unique literal values sorted lexicographically", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      const fixture = await writeLiteralOutputFixture(env);

      const result = await literalCommand({ cwd: env.projectDir, literals: true });

      expect(result.output.split("\n")).toEqual([
        `"${fixture.reuseLiteral}"`,
        `"${fixture.dupeLiteral}"`,
      ].sort());
    });
  });

  it("--verbose output groups problems into REUSE and DUPE sections", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      const fixture = await writeLiteralOutputFixture(env);

      const result = await literalCommand({ cwd: env.projectDir, verbose: true });

      expect(result.output).toContain(literalVerboseSummary);
      expect(result.output).toContain(literalVerboseReuseHeading);
      expect(result.output).toContain(fixture.reuseTestFile);
      expect(result.output).toContain(`  line 1: "${fixture.reuseLiteral}" also in ${fixture.reuseSourceFile}:1`);
      expect(result.output).toContain(literalVerboseDupeHeading);
      expect(result.output).toContain(fixture.dupeFirstTestFile);
      expect(result.output).toContain(`  line 1: "${fixture.dupeLiteral}" also in ${fixture.dupeSecondTestFile}:1`);
    });
  });

  it("--kind reuse --json output preserves the full object shape and empties testDupe", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      const fixture = await writeLiteralOutputFixture(env);

      const result = await literalCommand({
        cwd: env.projectDir,
        kind: "reuse",
        json: true,
      });
      const parsed = parseLiteralReuseResult(JSON.parse(result.output) as unknown);

      expect(parsed.srcReuse.map((problem) => problem.value)).toContain(fixture.reuseLiteral);
      expect(parsed.testDupe).toEqual([]);
    });
  });
});
