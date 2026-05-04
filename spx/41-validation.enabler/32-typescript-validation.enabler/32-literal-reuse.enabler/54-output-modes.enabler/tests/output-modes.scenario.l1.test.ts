import { describe, expect, it } from "vitest";

import { LITERAL_PROBLEM_KIND, literalCommand } from "@/commands/validation/literal";
import { LITERAL_DEFAULTS } from "@/validation/literal/config";
import { parseLiteralReuseResult } from "@/validation/literal/index";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";

describe("output-modes — scenarios", () => {
  it("--files scopes detection to only the named files and their contributed index", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
      await env.writeReuseFixture(inputs);

      const result = await literalCommand({
        cwd: env.projectDir,
        config: LITERAL_DEFAULTS,
        files: [inputs.dupeFirstTestFile, inputs.dupeSecondTestFile],
        json: true,
      });

      const findings = parseLiteralReuseResult(JSON.parse(result.output));
      expect(findings.srcReuse).toHaveLength(0);
      expect(findings.testDupe.length).toBeGreaterThan(0);
    });
  });

  it("--json produces output parseable through parseLiteralReuseResult without throwing", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
      await env.writeReuseFixture(inputs);

      const result = await literalCommand({
        cwd: env.projectDir,
        config: LITERAL_DEFAULTS,
        json: true,
      });

      const findings = parseLiteralReuseResult(JSON.parse(result.output));
      expect(Array.isArray(findings.srcReuse)).toBe(true);
      expect(Array.isArray(findings.testDupe)).toBe(true);
      expect(findings.srcReuse.length + findings.testDupe.length).toBeGreaterThan(0);
    });
  });

  it("--kind dupe shows only test-dupe problems in output", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
      await env.writeReuseFixture(inputs);

      const result = await literalCommand({
        cwd: env.projectDir,
        config: LITERAL_DEFAULTS,
        kind: LITERAL_PROBLEM_KIND.DUPE,
      });

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain(`[${LITERAL_PROBLEM_KIND.DUPE}]`);
      expect(result.output).not.toContain(`[${LITERAL_PROBLEM_KIND.REUSE}]`);
    });
  });

  it("--kind reuse shows only src-reuse problems in output", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
      await env.writeReuseFixture(inputs);

      const result = await literalCommand({
        cwd: env.projectDir,
        config: LITERAL_DEFAULTS,
        kind: LITERAL_PROBLEM_KIND.REUSE,
      });

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain(`[${LITERAL_PROBLEM_KIND.REUSE}]`);
      expect(result.output).not.toContain(`[${LITERAL_PROBLEM_KIND.DUPE}]`);
    });
  });

  it("--kind reuse with only test-dupe problems exits 0 with no-problems-of-kind message", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
      await env.writeTsConfigMarker();
      await env.writeTestFile(inputs.dupeFirstTestFile, inputs.dupeLiteral);
      await env.writeTestFile(inputs.dupeSecondTestFile, inputs.dupeLiteral);

      const result = await literalCommand({
        cwd: env.projectDir,
        config: LITERAL_DEFAULTS,
        kind: LITERAL_PROBLEM_KIND.REUSE,
      });

      expect(result.exitCode).toBe(0);
      // eslint-disable-next-line no-restricted-syntax
      expect(result.output).toBe("Literal: No problems of type reuse");
    });
  });

  it("--files-with-problems outputs one unique file path per line sorted lexicographically with no line number", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
      await env.writeReuseFixture(inputs);

      const result = await literalCommand({
        cwd: env.projectDir,
        config: LITERAL_DEFAULTS,
        filesWithProblems: true,
      });

      expect(result.exitCode).toBe(1);
      const lines = result.output.split("\n").filter(Boolean);
      expect(new Set(lines).size).toBe(lines.length);
      expect(lines).toEqual([...lines].sort());
      for (const line of lines) {
        expect(line).not.toMatch(/:\d+$/);
      }
    });
  });

  it("--kind reuse --files-with-problems includes only file paths from src-reuse problems", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
      await env.writeReuseFixture(inputs);

      const result = await literalCommand({
        cwd: env.projectDir,
        config: LITERAL_DEFAULTS,
        kind: LITERAL_PROBLEM_KIND.REUSE,
        filesWithProblems: true,
      });

      const outputFiles = new Set(result.output.split("\n").filter(Boolean));
      expect(outputFiles.has(inputs.reuseTestFile)).toBe(true);
      expect(outputFiles.has(inputs.dupeFirstTestFile)).toBe(false);
      expect(outputFiles.has(inputs.dupeSecondTestFile)).toBe(false);
    });
  });

  it("--literals outputs one unique literal value per line sorted lexicographically", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
      await env.writeReuseFixture(inputs);

      const result = await literalCommand({
        cwd: env.projectDir,
        config: LITERAL_DEFAULTS,
        literals: true,
      });

      expect(result.exitCode).toBe(1);
      const lines = result.output.split("\n").filter(Boolean);
      expect(new Set(lines).size).toBe(lines.length);
      expect(lines).toEqual([...lines].sort());
    });
  });

  it("--verbose groups problems into REUSE and DUPE sections with file headers and per-problem lines", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
      await env.writeReuseFixture(inputs);

      const result = await literalCommand({
        cwd: env.projectDir,
        config: LITERAL_DEFAULTS,
        verbose: true,
      });

      expect(result.exitCode).toBe(1);
      const output = result.output;
      expect(output).toContain(LITERAL_PROBLEM_KIND.REUSE.toUpperCase());
      expect(output).toContain(LITERAL_PROBLEM_KIND.DUPE.toUpperCase());
      expect(output).toContain(inputs.reuseTestFile);
      const problemLines = output.split("\n").filter((l) => l.trimStart().startsWith("line "));
      expect(problemLines.length).toBeGreaterThan(0);
    });
  });

  it("--kind reuse --json sets testDupe to [] and srcReuse to the matching problems", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
      await env.writeReuseFixture(inputs);

      const allResult = await literalCommand({
        cwd: env.projectDir,
        config: LITERAL_DEFAULTS,
        json: true,
      });
      const result = await literalCommand({
        cwd: env.projectDir,
        config: LITERAL_DEFAULTS,
        kind: LITERAL_PROBLEM_KIND.REUSE,
        json: true,
      });

      const allFindings = parseLiteralReuseResult(JSON.parse(allResult.output));
      const filtered = parseLiteralReuseResult(JSON.parse(result.output));
      // testDupe is cleared; srcReuse equals the unfiltered run's srcReuse (independent oracle)
      expect(filtered.testDupe).toHaveLength(0);
      expect(filtered.srcReuse).toEqual(allFindings.srcReuse);
    });
  });
});
