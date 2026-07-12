import { describe, expect, it } from "vitest";

import {
  LITERAL_EXIT_CODES,
  literalCommand,
  OUTPUT_MODE_NAME,
  OUTPUT_MODE_NAMES,
  type OutputModeName,
  VERBOSE_PROBLEM_LINE_PREFIX,
} from "@/commands/validation/literal";
import { LITERAL_PROBLEM_KIND } from "@/domains/validation/literal-problem-kind";
import {
  literalValidationCliOptions,
  validationCliDefinition,
  validationCommonCliOptions,
} from "@/interfaces/cli/validation-contract";
import { compareAsciiStrings } from "@/lib/state-store";
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
  runValidationInProcess,
  validationCliEmptyOutput,
  validationCliOptionName,
} from "@testing/harnesses/validation/cli";

function literalOutputModeCliArgs(mode: OutputModeName): string[] {
  const args = [
    validationCliDefinition.subcommands.literal.commandName,
    validationCliOptionName(literalValidationCliOptions.kind),
    LITERAL_PROBLEM_KIND.REUSE,
  ];
  switch (mode) {
    case OUTPUT_MODE_NAME.TEXT:
      return args;
    case OUTPUT_MODE_NAME.VERBOSE:
      return [...args, literalValidationCliOptions.verbose.flag];
    case OUTPUT_MODE_NAME.FILES_WITH_PROBLEMS:
      return [...args, literalValidationCliOptions.filesWithProblems.flag];
    case OUTPUT_MODE_NAME.LITERALS:
      return [...args, literalValidationCliOptions.literals.flag];
    case OUTPUT_MODE_NAME.JSON:
      return [...args, validationCommonCliOptions.json.flag];
  }
}

export function registerLiteralOutputModeMappings(): void {
  describe("output-modes — mappings", () => {
    it.each(OUTPUT_MODE_NAMES)("%s mode routes findings to stdout through CLI dispatch", async (mode) => {
      await withLiteralFixtureEnv(literalEmptyConfig(), async (env) => {
        const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
        await env.writeReuseFixture(inputs);

        const result = await runValidationInProcess(literalOutputModeCliArgs(mode), {
          processCwd: () => env.productDir,
        });

        expect(result.exitCode).toBe(LITERAL_EXIT_CODES.FINDINGS);
        expect(result.stdout.length).toBeGreaterThan(LITERAL_TEST_GENERATOR_COUNTS.none);
        expect(result.stderr).toBe(validationCliEmptyOutput());
      });
    });

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
            expect(reuseFindings.testDupe).toHaveLength(LITERAL_TEST_GENERATOR_COUNTS.none);
            expect(reuseFindings.srcReuse.length).toBeGreaterThan(LITERAL_TEST_GENERATOR_COUNTS.none);
            expect(dupeFindings.srcReuse).toHaveLength(LITERAL_TEST_GENERATOR_COUNTS.none);
            expect(dupeFindings.testDupe.length).toBeGreaterThan(LITERAL_TEST_GENERATOR_COUNTS.none);
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
            expect(dupeResult.output).toContain(LITERAL_PROBLEM_KIND.DUPE.toUpperCase());
          }
        });
      },
    );

    it("default text output: one [kind] \"value\" path:line per problem; reuse problems first, then dupe, each group sorted", async () => {
      await withLiteralFixtureEnv(literalEmptyConfig(), async (env) => {
        const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
        await env.writeReuseFixture(inputs);

        const [defaultResult, jsonResult] = await Promise.all([
          literalCommand({ cwd: env.productDir, config: LITERAL_DEFAULTS }),
          literalCommand({ cwd: env.productDir, config: LITERAL_DEFAULTS, json: true }),
        ]);

        const findings = parseLiteralReuseResult(JSON.parse(jsonResult.output));
        const lines = defaultResult.output.split(LITERAL_TEXT_LAYOUT.lineSeparator).filter(Boolean);
        const reuseTag = `[${LITERAL_PROBLEM_KIND.REUSE}]`;
        const dupeTag = `[${LITERAL_PROBLEM_KIND.DUPE}]`;
        const reuseLines = lines.filter((l) => l.startsWith(reuseTag));
        const dupeLines = lines.filter((l) => l.startsWith(dupeTag));
        const problemLines = [...reuseLines, ...dupeLines];

        expect(problemLines.length).toBe(findings.srcReuse.length + findings.testDupe.length);

        // Each problem line is [kind] "value" path:line
        for (const line of problemLines) {
          expect(line).toMatch(/^\[(reuse|dupe)\] ".+" .+:\d+$/);
        }

        // All reuse lines precede all dupe lines — no interleaving
        expect(problemLines).toEqual(lines);

        // Each group sorted within itself
        expect(reuseLines).toEqual([...reuseLines].sort(compareAsciiStrings));
        expect(dupeLines).toEqual([...dupeLines].sort(compareAsciiStrings));
      });
    });

    it("--verbose output: summary line stating problem counts; REUSE section with file headers; DUPE section with file headers", async () => {
      await withLiteralFixtureEnv(literalEmptyConfig(), async (env) => {
        const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
        await env.writeReuseFixture(inputs);

        const [verboseResult, jsonResult] = await Promise.all([
          literalCommand({ cwd: env.productDir, config: LITERAL_DEFAULTS, verbose: true }),
          literalCommand({ cwd: env.productDir, config: LITERAL_DEFAULTS, json: true }),
        ]);

        const findings = parseLiteralReuseResult(JSON.parse(jsonResult.output));
        const output = verboseResult.output;

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
        expect(problemLines.length).toBe(findings.srcReuse.length + findings.testDupe.length);
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
        expect(lines).toEqual([...lines].sort(compareAsciiStrings));
        for (const line of lines) {
          expect(line).not.toMatch(/:\d+$/);
        }

        // Known fixture file paths appear in output
        expect(lines).toContain(inputs.reuseTestFile);
        expect(lines).toContain(inputs.dupeFirstTestFile);
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
        expect(lines).toEqual([...lines].sort(compareAsciiStrings));
        for (const line of lines) {
          expect(line.startsWith("\"") && line.endsWith("\"")).toBe(true);
        }

        // Known fixture literal values appear in quoted form
        expect(lines).toContain(`"${inputs.reuseLiteral}"`);
        expect(lines).toContain(`"${inputs.dupeLiteral}"`);
      });
    });

    it("--kind reuse returns only srcReuse findings; --kind dupe returns only testDupe findings — both disjoint from unfiltered output", async () => {
      await withLiteralFixtureEnv(literalEmptyConfig(), async (env) => {
        const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
        await env.writeReuseFixture(inputs);

        const [allResult, reuseResult, dupeResult] = await Promise.all([
          literalCommand({ cwd: env.productDir, config: LITERAL_DEFAULTS, json: true }),
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

        const allFindings = parseLiteralReuseResult(JSON.parse(allResult.output));
        const reuseFindings = parseLiteralReuseResult(JSON.parse(reuseResult.output));
        const dupeFindings = parseLiteralReuseResult(JSON.parse(dupeResult.output));

        // --kind reuse: srcReuse equals the full unfiltered set; testDupe is cleared
        expect(reuseFindings.testDupe).toHaveLength(LITERAL_TEST_GENERATOR_COUNTS.none);
        expect(reuseFindings.srcReuse).toEqual(allFindings.srcReuse);

        // --kind dupe: testDupe equals the full unfiltered set; srcReuse is cleared
        expect(dupeFindings.srcReuse).toHaveLength(LITERAL_TEST_GENERATOR_COUNTS.none);
        expect(dupeFindings.testDupe).toEqual(allFindings.testDupe);
      });
    });
  });
}
