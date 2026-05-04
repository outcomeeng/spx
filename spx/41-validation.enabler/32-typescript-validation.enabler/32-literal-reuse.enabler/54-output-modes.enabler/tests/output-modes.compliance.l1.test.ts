import { describe, expect, it } from "vitest";

import { LITERAL_PROBLEM_KIND, literalCommand } from "@/commands/validation/literal";
import { LITERAL_DEFAULTS } from "@/validation/literal/config";
import { parseLiteralReuseResult } from "@/validation/literal/index";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";

describe("output-modes compliance", () => {
  it("ALWAYS: default text output is [kind] \"value\" path:line — one problem per line", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
      await env.writeReuseFixture(inputs);

      const result = await literalCommand({
        cwd: env.projectDir,
        config: LITERAL_DEFAULTS,
      });

      expect(result.exitCode).toBe(1);
      const lines = result.output.split("\n").filter(Boolean);
      const reusePrefix = `[${LITERAL_PROBLEM_KIND.REUSE}]`;
      const dupePrefix = `[${LITERAL_PROBLEM_KIND.DUPE}]`;
      for (const line of lines) {
        expect(line.startsWith(reusePrefix) || line.startsWith(dupePrefix)).toBe(true);
        expect(line).toMatch(/:\d+$/);
      }
    });
  });

  it("ALWAYS: --files-with-problems outputs each unique file path per line sorted lexicographically with no line number suffix", async () => {
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

  it("ALWAYS: --literals outputs each unique literal value per line sorted lexicographically", async () => {
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

  it("ALWAYS: --kind excludes non-selected problems from text, verbose, files-with-problems, literals, and json output", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
      await env.writeReuseFixture(inputs);

      const [textResult, verboseResult, filesResult, literalsResult, jsonResult] = await Promise.all([
        literalCommand({ cwd: env.projectDir, config: LITERAL_DEFAULTS, kind: LITERAL_PROBLEM_KIND.REUSE }),
        literalCommand({
          cwd: env.projectDir,
          config: LITERAL_DEFAULTS,
          kind: LITERAL_PROBLEM_KIND.REUSE,
          verbose: true,
        }),
        literalCommand({
          cwd: env.projectDir,
          config: LITERAL_DEFAULTS,
          kind: LITERAL_PROBLEM_KIND.REUSE,
          filesWithProblems: true,
        }),
        literalCommand({
          cwd: env.projectDir,
          config: LITERAL_DEFAULTS,
          kind: LITERAL_PROBLEM_KIND.REUSE,
          literals: true,
        }),
        literalCommand({ cwd: env.projectDir, config: LITERAL_DEFAULTS, kind: LITERAL_PROBLEM_KIND.REUSE, json: true }),
      ]);

      expect(textResult.output).not.toContain(`[${LITERAL_PROBLEM_KIND.DUPE}]`);
      expect(verboseResult.output).not.toContain(LITERAL_PROBLEM_KIND.DUPE.toUpperCase());
      const filesLines = new Set(filesResult.output.split("\n").filter(Boolean));
      expect(filesLines.has(inputs.dupeFirstTestFile)).toBe(false);
      expect(filesLines.has(inputs.dupeSecondTestFile)).toBe(false);
      expect(literalsResult.output).not.toContain(inputs.dupeLiteral);
      const jsonFindings = parseLiteralReuseResult(JSON.parse(jsonResult.output));
      expect(jsonFindings.testDupe).toHaveLength(0);
    });
  });

  it("ALWAYS: --kind <k> with no problems of kind <k> produces no-problems-of-kind message and exit 0", async () => {
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

  it("ALWAYS: exit code reflects filtered problems — 0 when no problems of the selected kind, 1 when any exist", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
      await env.writeTsConfigMarker();
      await env.writeTestFile(inputs.dupeFirstTestFile, inputs.dupeLiteral);
      await env.writeTestFile(inputs.dupeSecondTestFile, inputs.dupeLiteral);

      const [reuseResult, dupeResult] = await Promise.all([
        literalCommand({ cwd: env.projectDir, config: LITERAL_DEFAULTS, kind: LITERAL_PROBLEM_KIND.REUSE }),
        literalCommand({ cwd: env.projectDir, config: LITERAL_DEFAULTS, kind: LITERAL_PROBLEM_KIND.DUPE }),
      ]);

      expect(reuseResult.exitCode).toBe(0);
      expect(dupeResult.exitCode).toBe(1);
    });
  });

  it("ALWAYS: --kind with --json emits full problem object with the non-matching kind's array set to []", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
      await env.writeReuseFixture(inputs);

      const result = await literalCommand({
        cwd: env.projectDir,
        config: LITERAL_DEFAULTS,
        kind: LITERAL_PROBLEM_KIND.REUSE,
        json: true,
      });

      const findings = parseLiteralReuseResult(JSON.parse(result.output));
      expect(findings.testDupe).toEqual([]);
      expect(findings.srcReuse.length).toBeGreaterThan(0);
    });
  });
});
