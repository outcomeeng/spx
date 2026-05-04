import { describe, expect, it } from "vitest";

import { LITERAL_PROBLEM_KIND, literalCommand } from "@/commands/validation/literal";
import { LITERAL_DEFAULTS } from "@/validation/literal/config";
import { parseLiteralReuseResult } from "@/validation/literal/index";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";

const OUTPUT_MODE_NAMES = ["text", "verbose", "filesWithProblems", "literals", "json"] as const;
type OutputModeName = (typeof OUTPUT_MODE_NAMES)[number];

type OutputModeOptions = {
  verbose?: boolean;
  filesWithProblems?: boolean;
  literals?: boolean;
  json?: boolean;
};

const OUTPUT_MODE_OPTIONS: Record<OutputModeName, OutputModeOptions> = {
  text: {},
  verbose: { verbose: true },
  filesWithProblems: { filesWithProblems: true },
  literals: { literals: true },
  json: { json: true },
};

describe("output-modes — mappings", () => {
  it.each(OUTPUT_MODE_NAMES)(
    "--kind reuse selects srcReuse and --kind dupe selects testDupe in %s mode",
    async (mode) => {
      await withLiteralFixtureEnv({}, async (env) => {
        const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
        await env.writeReuseFixture(inputs);

        const modeOpts = OUTPUT_MODE_OPTIONS[mode];

        const [reuseResult, dupeResult] = await Promise.all([
          literalCommand({
            cwd: env.projectDir,
            config: LITERAL_DEFAULTS,
            kind: LITERAL_PROBLEM_KIND.REUSE,
            ...modeOpts,
          }),
          literalCommand({
            cwd: env.projectDir,
            config: LITERAL_DEFAULTS,
            kind: LITERAL_PROBLEM_KIND.DUPE,
            ...modeOpts,
          }),
        ]);

        expect(reuseResult.exitCode).toBe(1);
        expect(dupeResult.exitCode).toBe(1);

        if (mode === "json") {
          const reuseFindings = parseLiteralReuseResult(JSON.parse(reuseResult.output));
          const dupeFindings = parseLiteralReuseResult(JSON.parse(dupeResult.output));
          expect(reuseFindings.testDupe).toHaveLength(0);
          expect(reuseFindings.srcReuse.length).toBeGreaterThan(0);
          expect(dupeFindings.srcReuse).toHaveLength(0);
          expect(dupeFindings.testDupe.length).toBeGreaterThan(0);
        } else if (mode === "text") {
          expect(reuseResult.output).toContain(`[${LITERAL_PROBLEM_KIND.REUSE}]`);
          expect(reuseResult.output).not.toContain(`[${LITERAL_PROBLEM_KIND.DUPE}]`);
          expect(dupeResult.output).toContain(`[${LITERAL_PROBLEM_KIND.DUPE}]`);
          expect(dupeResult.output).not.toContain(`[${LITERAL_PROBLEM_KIND.REUSE}]`);
        } else if (mode === "filesWithProblems") {
          const reuseFiles = new Set(reuseResult.output.split("\n").filter(Boolean));
          expect(reuseFiles.has(inputs.reuseTestFile)).toBe(true);
          expect(reuseFiles.has(inputs.dupeFirstTestFile)).toBe(false);
          expect(reuseFiles.has(inputs.dupeSecondTestFile)).toBe(false);
          const dupeFiles = new Set(dupeResult.output.split("\n").filter(Boolean));
          expect(dupeFiles.has(inputs.dupeFirstTestFile)).toBe(true);
        } else if (mode === "literals") {
          expect(reuseResult.output).toContain(inputs.reuseLiteral);
          expect(reuseResult.output).not.toContain(inputs.dupeLiteral);
          expect(dupeResult.output).toContain(inputs.dupeLiteral);
          expect(dupeResult.output).not.toContain(inputs.reuseLiteral);
        } else {
          expect(reuseResult.output).toContain(LITERAL_PROBLEM_KIND.REUSE.toUpperCase());
          expect(dupeResult.output).toContain(LITERAL_PROBLEM_KIND.DUPE.toUpperCase());
        }
      });
    },
  );

  it("default text output: one [kind] \"value\" path:line per problem; reuse problems first, then dupe, each group sorted", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
      await env.writeReuseFixture(inputs);

      const [defaultResult, jsonResult] = await Promise.all([
        literalCommand({ cwd: env.projectDir, config: LITERAL_DEFAULTS }),
        literalCommand({ cwd: env.projectDir, config: LITERAL_DEFAULTS, json: true }),
      ]);

      const findings = parseLiteralReuseResult(JSON.parse(jsonResult.output));
      const lines = defaultResult.output.split("\n").filter(Boolean);
      const reuseTag = `[${LITERAL_PROBLEM_KIND.REUSE}]`;
      const dupeTag = `[${LITERAL_PROBLEM_KIND.DUPE}]`;
      const reuseLines = lines.filter((l) => l.startsWith(reuseTag));
      const dupeLines = lines.filter((l) => l.startsWith(dupeTag));

      // Total lines equals total findings from JSON
      expect(lines.length).toBe(findings.srcReuse.length + findings.testDupe.length);

      // Each line is [kind] "value" path:line
      for (const line of lines) {
        expect(line).toMatch(/^\[(reuse|dupe)\] ".+" .+:\d+$/);
      }

      // All reuse lines precede all dupe lines — no interleaving
      expect([...reuseLines, ...dupeLines]).toEqual(lines);

      // Each group sorted within itself
      expect(reuseLines).toEqual([...reuseLines].sort());
      expect(dupeLines).toEqual([...dupeLines].sort());
    });
  });

  it("--verbose output: summary line stating problem counts; REUSE section with file headers; DUPE section with file headers", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
      await env.writeReuseFixture(inputs);

      const [verboseResult, jsonResult] = await Promise.all([
        literalCommand({ cwd: env.projectDir, config: LITERAL_DEFAULTS, verbose: true }),
        literalCommand({ cwd: env.projectDir, config: LITERAL_DEFAULTS, json: true }),
      ]);

      const findings = parseLiteralReuseResult(JSON.parse(jsonResult.output));
      const output = verboseResult.output;

      // REUSE section appears before DUPE section
      const reuseHeaderIdx = output.indexOf("REUSE");
      const dupeHeaderIdx = output.indexOf("DUPE");
      expect(reuseHeaderIdx).toBeGreaterThanOrEqual(0);
      expect(dupeHeaderIdx).toBeGreaterThan(reuseHeaderIdx);

      // Fixture file paths appear under the correct sections
      expect(output.indexOf(inputs.reuseTestFile)).toBeGreaterThan(reuseHeaderIdx);
      expect(output.indexOf(inputs.reuseTestFile)).toBeLessThan(dupeHeaderIdx);
      expect(output.indexOf(inputs.dupeFirstTestFile)).toBeGreaterThan(dupeHeaderIdx);

      // Per-problem "line N" entries exist for all findings
      const problemLines = output.split("\n").filter((l) => l.trimStart().startsWith("line "));
      expect(problemLines.length).toBe(findings.srcReuse.length + findings.testDupe.length);
    });
  });

  it("--files-with-problems output: unique file paths one per line sorted lexicographically with no line number suffix", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
      await env.writeReuseFixture(inputs);

      const result = await literalCommand({ cwd: env.projectDir, config: LITERAL_DEFAULTS, filesWithProblems: true });

      const lines = result.output.split("\n").filter(Boolean);

      // Unique, sorted, no line number suffix
      expect(new Set(lines).size).toBe(lines.length);
      expect(lines).toEqual([...lines].sort());
      for (const line of lines) {
        expect(line).not.toMatch(/:\d+$/);
      }

      // Known fixture file paths appear in output
      expect(lines).toContain(inputs.reuseTestFile);
      expect(lines).toContain(inputs.dupeFirstTestFile);
    });
  });

  it("--literals output: unique literal values one per line sorted lexicographically; strings in double quotes", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
      await env.writeReuseFixture(inputs);

      const result = await literalCommand({ cwd: env.projectDir, config: LITERAL_DEFAULTS, literals: true });

      const lines = result.output.split("\n").filter(Boolean);

      // Unique, sorted, all values in double quotes
      expect(new Set(lines).size).toBe(lines.length);
      expect(lines).toEqual([...lines].sort());
      for (const line of lines) {
        expect(line.startsWith("\"") && line.endsWith("\"")).toBe(true);
      }

      // Known fixture literal values appear in quoted form
      expect(lines).toContain(`"${inputs.reuseLiteral}"`);
      expect(lines).toContain(`"${inputs.dupeLiteral}"`);
    });
  });

  it("--kind reuse returns only srcReuse findings; --kind dupe returns only testDupe findings — both disjoint from unfiltered output", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
      await env.writeReuseFixture(inputs);

      const [allResult, reuseResult, dupeResult] = await Promise.all([
        literalCommand({ cwd: env.projectDir, config: LITERAL_DEFAULTS, json: true }),
        literalCommand({ cwd: env.projectDir, config: LITERAL_DEFAULTS, kind: LITERAL_PROBLEM_KIND.REUSE, json: true }),
        literalCommand({ cwd: env.projectDir, config: LITERAL_DEFAULTS, kind: LITERAL_PROBLEM_KIND.DUPE, json: true }),
      ]);

      const allFindings = parseLiteralReuseResult(JSON.parse(allResult.output));
      const reuseFindings = parseLiteralReuseResult(JSON.parse(reuseResult.output));
      const dupeFindings = parseLiteralReuseResult(JSON.parse(dupeResult.output));

      // --kind reuse: srcReuse equals the full unfiltered set; testDupe is cleared
      expect(reuseFindings.testDupe).toHaveLength(0);
      expect(reuseFindings.srcReuse).toEqual(allFindings.srcReuse);

      // --kind dupe: testDupe equals the full unfiltered set; srcReuse is cleared
      expect(dupeFindings.srcReuse).toHaveLength(0);
      expect(dupeFindings.testDupe).toEqual(allFindings.testDupe);
    });
  });
});
