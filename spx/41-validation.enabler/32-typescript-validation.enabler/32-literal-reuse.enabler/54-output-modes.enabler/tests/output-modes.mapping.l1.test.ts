import { describe, expect, it } from "vitest";

import {
  formatDefaultLiteralProblems,
  formatLiteralValues,
  LITERAL_EXIT_CODES,
  literalCommand,
  OUTPUT_MODE_NAME,
  OUTPUT_MODE_NAMES,
  VERBOSE_PROBLEM_LINE_PREFIX,
} from "@/commands/validation/literal";
import { LITERAL_PROBLEM_KIND } from "@/domains/validation/literal-problem-kind";
import { LITERAL_DEFAULTS } from "@/validation/literal/config";
import { parseLiteralReuseResult } from "@/validation/literal/index";
import {
  LITERAL_TEST_BOUNDS,
  LITERAL_TEST_GENERATOR,
  LITERAL_TEST_GENERATOR_COUNTS,
  LITERAL_TEXT_LAYOUT,
  literalEmptyConfig,
  literalOutputModeOptions,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";
import {
  compareExpectedStrings,
  expectedAffectedFiles,
  expectedDefaultLines,
  expectedFixtureFindings,
  expectedLiteralLines,
  expectedVerboseSections,
  expectedVerboseSummary,
} from "@testing/harnesses/literal/output-expectations";

describe("output-modes — mappings", () => {
  it.each(OUTPUT_MODE_NAMES)(
    "--kind reuse selects srcReuse and --kind dupe selects testDupe in %s mode",
    async (mode) => {
      await withLiteralFixtureEnv(literalEmptyConfig(), async (env) => {
        const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
        await env.writeReuseFixture(inputs);

        const modeOpts = literalOutputModeOptions(mode);

        const [reuseResult, dupeResult] = await Promise.all([
          literalCommand({
            cwd: env.productDir,
            config: LITERAL_DEFAULTS,
            kind: LITERAL_PROBLEM_KIND.REUSE,
            ...modeOpts,
          }),
          literalCommand({
            cwd: env.productDir,
            config: LITERAL_DEFAULTS,
            kind: LITERAL_PROBLEM_KIND.DUPE,
            ...modeOpts,
          }),
        ]);

        expect(reuseResult.exitCode).toBe(LITERAL_EXIT_CODES.FINDINGS);
        expect(dupeResult.exitCode).toBe(LITERAL_EXIT_CODES.FINDINGS);

        if (mode === OUTPUT_MODE_NAME.JSON) {
          const reuseFindings = parseLiteralReuseResult(JSON.parse(reuseResult.output));
          const dupeFindings = parseLiteralReuseResult(JSON.parse(dupeResult.output));
          expect(reuseFindings).toEqual(expectedFixtureFindings(inputs, LITERAL_PROBLEM_KIND.REUSE));
          expect(dupeFindings).toEqual(expectedFixtureFindings(inputs, LITERAL_PROBLEM_KIND.DUPE));
        } else if (mode === OUTPUT_MODE_NAME.TEXT) {
          expect(reuseResult.output).toContain(`[${LITERAL_PROBLEM_KIND.REUSE}]`);
          expect(reuseResult.output).not.toContain(`[${LITERAL_PROBLEM_KIND.DUPE}]`);
          expect(dupeResult.output).toContain(`[${LITERAL_PROBLEM_KIND.DUPE}]`);
          expect(dupeResult.output).not.toContain(`[${LITERAL_PROBLEM_KIND.REUSE}]`);
        } else if (mode === OUTPUT_MODE_NAME.FILES_WITH_PROBLEMS) {
          const reuseFiles = new Set(reuseResult.output.split(LITERAL_TEXT_LAYOUT.lineSeparator).filter(Boolean));
          expect(reuseFiles.has(inputs.reuseTestFile)).toBe(true);
          expect(reuseFiles.has(inputs.dupeFirstTestFile)).toBe(false);
          expect(reuseFiles.has(inputs.dupeSecondTestFile)).toBe(false);
          const dupeFiles = new Set(dupeResult.output.split(LITERAL_TEXT_LAYOUT.lineSeparator).filter(Boolean));
          expect(dupeFiles.has(inputs.dupeFirstTestFile)).toBe(true);
        } else if (mode === OUTPUT_MODE_NAME.LITERALS) {
          expect(reuseResult.output).toContain(inputs.reuseLiteral);
          expect(reuseResult.output).not.toContain(inputs.dupeLiteral);
          expect(dupeResult.output).toContain(inputs.dupeLiteral);
          expect(dupeResult.output).not.toContain(inputs.reuseLiteral);
        } else {
          expect(reuseResult.output).toContain(LITERAL_PROBLEM_KIND.REUSE.toUpperCase());
          expect(reuseResult.output).not.toContain(LITERAL_PROBLEM_KIND.DUPE.toUpperCase());
          expect(dupeResult.output).toContain(LITERAL_PROBLEM_KIND.DUPE.toUpperCase());
          expect(dupeResult.output).not.toContain(LITERAL_PROBLEM_KIND.REUSE.toUpperCase());
        }
      });
    },
  );

  it("default text output: one [kind] \"value\" path:line per problem; reuse problems first, then dupe, each group sorted", async () => {
    await withLiteralFixtureEnv(literalEmptyConfig(), async (env) => {
      const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
      await env.writeReuseFixture(inputs);

      const defaultResult = await literalCommand({ cwd: env.productDir, config: LITERAL_DEFAULTS });
      const lines = defaultResult.output.split(LITERAL_TEXT_LAYOUT.lineSeparator).filter(Boolean);
      const reuseTag = `[${LITERAL_PROBLEM_KIND.REUSE}]`;
      const dupeTag = `[${LITERAL_PROBLEM_KIND.DUPE}]`;
      const reuseLines = lines.filter((l) => l.startsWith(reuseTag));
      const dupeLines = lines.filter((l) => l.startsWith(dupeTag));
      const problemLines = [...reuseLines, ...dupeLines];

      expect(problemLines).toEqual(expectedDefaultLines(inputs));
      expect(problemLines).toEqual(lines);
      expect(reuseLines).toEqual([...reuseLines].sort(compareExpectedStrings));
      expect(dupeLines).toEqual([...dupeLines].sort(compareExpectedStrings));

      const [firstReuse] = expectedFixtureFindings(inputs).srcReuse;
      const sameFileFindings = {
        srcReuse: [
          {
            ...firstReuse,
            value: inputs.dupeLiteral,
            test: {
              ...firstReuse.test,
              line: firstReuse.test.line + LITERAL_TEST_GENERATOR_COUNTS.one,
            },
          },
          firstReuse,
        ],
        testDupe: [],
      };
      const sameFileLines = formatDefaultLiteralProblems(sameFileFindings).split(LITERAL_TEXT_LAYOUT.lineSeparator);
      expect(sameFileLines).toHaveLength(sameFileFindings.srcReuse.length);
      expect(sameFileLines[0]).toContain(`${firstReuse.test.file}:${firstReuse.test.line}`);
      expect(sameFileLines[1]).toContain(
        `${firstReuse.test.file}:${firstReuse.test.line + LITERAL_TEST_GENERATOR_COUNTS.one}`,
      );
    });
  });

  it("--verbose output: summary line stating problem counts; REUSE section with file headers; DUPE section with file headers", async () => {
    await withLiteralFixtureEnv(literalEmptyConfig(), async (env) => {
      const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
      await env.writeReuseFixture(inputs);

      const verboseResult = await literalCommand({ cwd: env.productDir, config: LITERAL_DEFAULTS, verbose: true });
      const output = verboseResult.output;
      const [summary, ...body] = output.split(LITERAL_TEXT_LAYOUT.lineSeparator);
      const counts = expectedVerboseSummary();
      expect(summary).toContain(String(counts.total));
      expect(summary).toContain(LITERAL_PROBLEM_KIND.REUSE);
      expect(summary).toContain(String(counts.reuse));
      expect(summary).toContain(LITERAL_PROBLEM_KIND.DUPE);
      expect(summary).toContain(String(counts.dupe));

      let cursor = 0;
      for (const section of expectedVerboseSections(inputs)) {
        expect(body[cursor]).toBe(section.heading);
        cursor += 1;
        for (const file of section.files) {
          expect(body[cursor]).toBe(file.header);
          cursor += 1;
          for (const problem of file.problems) {
            expect(body[cursor]).toMatch(/^\s+\S/);
            expect(body[cursor]).toContain(problem.literal);
            expect(body[cursor]).toContain(problem.relatedFile);
            cursor += 1;
          }
        }
      }
      expect(body).toHaveLength(cursor);

      // REUSE section appears before DUPE section
      const reuseHeaderIdx = output.indexOf(LITERAL_PROBLEM_KIND.REUSE.toUpperCase());
      const dupeHeaderIdx = output.indexOf(LITERAL_PROBLEM_KIND.DUPE.toUpperCase());
      expect(reuseHeaderIdx).toBeGreaterThanOrEqual(LITERAL_TEST_BOUNDS.foundMinimum);
      expect(dupeHeaderIdx).toBeGreaterThan(reuseHeaderIdx);

      // Fixture file paths appear under the correct sections
      expect(output.indexOf(inputs.reuseTestFile)).toBeGreaterThan(reuseHeaderIdx);
      expect(output.indexOf(inputs.reuseTestFile)).toBeLessThan(dupeHeaderIdx);
      expect(output.indexOf(inputs.dupeFirstTestFile)).toBeGreaterThan(dupeHeaderIdx);

      // Per-problem "line N" entries exist for all findings
      const problemLines = output
        .split(LITERAL_TEXT_LAYOUT.lineSeparator)
        .filter((l) => l.trimStart().startsWith(VERBOSE_PROBLEM_LINE_PREFIX));
      expect(problemLines.length).toBe(expectedDefaultLines(inputs).length);
    });
  });

  it("--files-with-problems output: unique file paths one per line sorted lexicographically with no line number suffix", async () => {
    await withLiteralFixtureEnv(literalEmptyConfig(), async (env) => {
      const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
      await env.writeReuseFixture(inputs);

      const result = await literalCommand({ cwd: env.productDir, config: LITERAL_DEFAULTS, filesWithProblems: true });

      const lines = result.output.split(LITERAL_TEXT_LAYOUT.lineSeparator).filter(Boolean);

      // Unique, sorted, no line number suffix
      expect(new Set(lines).size).toBe(lines.length);
      expect(lines).toEqual([...lines].sort(compareExpectedStrings));
      for (const line of lines) {
        expect(line).not.toMatch(/:\d+$/);
      }

      expect(lines).toEqual(expectedAffectedFiles(inputs));
    });
  });

  it("--literals output: unique literal values one per line sorted lexicographically; strings in double quotes", async () => {
    await withLiteralFixtureEnv(literalEmptyConfig(), async (env) => {
      const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
      await env.writeReuseFixture(inputs);

      const result = await literalCommand({ cwd: env.productDir, config: LITERAL_DEFAULTS, literals: true });

      const lines = result.output.split(LITERAL_TEXT_LAYOUT.lineSeparator).filter(Boolean);

      // Unique, sorted, all values in double quotes
      expect(new Set(lines).size).toBe(lines.length);
      expect(lines).toEqual([...lines].sort(compareExpectedStrings));
      for (const line of lines) {
        expect(line.startsWith("\"") && line.endsWith("\"")).toBe(true);
      }

      expect(lines).toEqual(expectedLiteralLines(inputs));
    });
  });

  it("--literals renders numeric finding values as unquoted decimal text", () => {
    const findings = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.numericDetectionResult());

    expect(formatLiteralValues(findings)).toBe(findings.srcReuse[0]?.value);
  });

  it("--kind reuse returns only srcReuse findings; --kind dupe returns only testDupe findings — both disjoint from unfiltered output", async () => {
    await withLiteralFixtureEnv(literalEmptyConfig(), async (env) => {
      const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
      await env.writeReuseFixture(inputs);

      const [reuseResult, dupeResult] = await Promise.all([
        literalCommand({
          cwd: env.productDir,
          config: LITERAL_DEFAULTS,
          kind: LITERAL_PROBLEM_KIND.REUSE,
          json: true,
        }),
        literalCommand({
          cwd: env.productDir,
          config: LITERAL_DEFAULTS,
          kind: LITERAL_PROBLEM_KIND.DUPE,
          json: true,
        }),
      ]);

      const reuseFindings = parseLiteralReuseResult(JSON.parse(reuseResult.output));
      const dupeFindings = parseLiteralReuseResult(JSON.parse(dupeResult.output));

      expect(reuseFindings).toEqual(expectedFixtureFindings(inputs, LITERAL_PROBLEM_KIND.REUSE));
      expect(dupeFindings).toEqual(expectedFixtureFindings(inputs, LITERAL_PROBLEM_KIND.DUPE));
    });
  });
});
