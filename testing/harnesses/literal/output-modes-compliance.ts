import { describe, expect, it } from "vitest";

import { literalCommand } from "@/commands/validation/literal";
import { LITERAL_PROBLEM_KIND } from "@/domains/validation/literal-problem-kind";
import { LITERAL_DEFAULTS } from "@/validation/literal/config";
import { parseLiteralReuseResult } from "@/validation/literal/index";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";
import {
  expectedAffectedFiles,
  expectedDefaultLines,
  expectedFixtureFindings,
  expectedLiteralLines,
  expectedNoProblemsOfKind,
} from "@testing/harnesses/literal/output-expectations";

export function registerLiteralOutputModeCompliance(): void {
  describe("output-modes compliance", () => {
    it("ALWAYS: default text output is [kind] \"value\" path:line — one problem per line", async () => {
      await withLiteralFixtureEnv({}, async (env) => {
        const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
        await env.writeReuseFixture(inputs);

        const result = await literalCommand({ cwd: env.productDir, config: LITERAL_DEFAULTS });

        expect(result.exitCode).toBe(1);
        const lines = result.output.split("\n").filter(Boolean);
        expect(lines).toEqual(expectedDefaultLines(expectedFixtureFindings(inputs)));
      });
    });

    it("ALWAYS: --files-with-problems outputs each unique file path per line sorted lexicographically with no line number suffix", async () => {
      await withLiteralFixtureEnv({}, async (env) => {
        const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
        await env.writeReuseFixture(inputs);

        const result = await literalCommand({ cwd: env.productDir, config: LITERAL_DEFAULTS, filesWithProblems: true });

        expect(result.exitCode).toBe(1);
        const lines = result.output.split("\n").filter(Boolean);
        expect(lines).toEqual(expectedAffectedFiles(expectedFixtureFindings(inputs)));
        for (const line of lines) {
          expect(line).not.toMatch(/:\d+$/);
        }
      });
    });

    it("ALWAYS: --literals outputs each unique literal value per line sorted lexicographically", async () => {
      await withLiteralFixtureEnv({}, async (env) => {
        const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
        await env.writeReuseFixture(inputs);

        const result = await literalCommand({ cwd: env.productDir, config: LITERAL_DEFAULTS, literals: true });

        expect(result.exitCode).toBe(1);
        const lines = result.output.split("\n").filter(Boolean);
        expect(lines).toEqual(expectedLiteralLines(expectedFixtureFindings(inputs)));
      });
    });

    it("ALWAYS: --kind excludes non-selected problems from text, verbose, files-with-problems, literals, and json output", async () => {
      await withLiteralFixtureEnv({}, async (env) => {
        const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
        await env.writeReuseFixture(inputs);

        const [
          textResult,
          verboseResult,
          filesResult,
          literalsResult,
          jsonResult,
          dupeTextResult,
          dupeVerboseResult,
          dupeFilesResult,
          dupeLiteralsResult,
          dupeJsonResult,
        ] = await Promise.all([
          literalCommand({ cwd: env.productDir, config: LITERAL_DEFAULTS, kind: LITERAL_PROBLEM_KIND.REUSE }),
          literalCommand({
            cwd: env.productDir,
            config: LITERAL_DEFAULTS,
            kind: LITERAL_PROBLEM_KIND.REUSE,
            verbose: true,
          }),
          literalCommand({
            cwd: env.productDir,
            config: LITERAL_DEFAULTS,
            kind: LITERAL_PROBLEM_KIND.REUSE,
            filesWithProblems: true,
          }),
          literalCommand({
            cwd: env.productDir,
            config: LITERAL_DEFAULTS,
            kind: LITERAL_PROBLEM_KIND.REUSE,
            literals: true,
          }),
          literalCommand({
            cwd: env.productDir,
            config: LITERAL_DEFAULTS,
            kind: LITERAL_PROBLEM_KIND.REUSE,
            json: true,
          }),
          literalCommand({ cwd: env.productDir, config: LITERAL_DEFAULTS, kind: LITERAL_PROBLEM_KIND.DUPE }),
          literalCommand({
            cwd: env.productDir,
            config: LITERAL_DEFAULTS,
            kind: LITERAL_PROBLEM_KIND.DUPE,
            verbose: true,
          }),
          literalCommand({
            cwd: env.productDir,
            config: LITERAL_DEFAULTS,
            kind: LITERAL_PROBLEM_KIND.DUPE,
            filesWithProblems: true,
          }),
          literalCommand({
            cwd: env.productDir,
            config: LITERAL_DEFAULTS,
            kind: LITERAL_PROBLEM_KIND.DUPE,
            literals: true,
          }),
          literalCommand({
            cwd: env.productDir,
            config: LITERAL_DEFAULTS,
            kind: LITERAL_PROBLEM_KIND.DUPE,
            json: true,
          }),
        ]);

        expect(textResult.output).not.toContain(`[${LITERAL_PROBLEM_KIND.DUPE}]`);
        expect(verboseResult.output).not.toContain(LITERAL_PROBLEM_KIND.DUPE.toUpperCase());
        const filesLines = new Set(filesResult.output.split("\n").filter(Boolean));
        expect(filesLines.has(inputs.dupeFirstTestFile)).toBe(false);
        expect(filesLines.has(inputs.dupeSecondTestFile)).toBe(false);
        expect(literalsResult.output).not.toContain(inputs.dupeLiteral);
        const jsonFindings = parseLiteralReuseResult(JSON.parse(jsonResult.output));
        expect(jsonFindings).toEqual(expectedFixtureFindings(inputs, LITERAL_PROBLEM_KIND.REUSE));
        expect(dupeTextResult.output).not.toContain(`[${LITERAL_PROBLEM_KIND.REUSE}]`);
        expect(dupeVerboseResult.output).not.toContain(LITERAL_PROBLEM_KIND.REUSE.toUpperCase());
        const dupeFilesLines = new Set(dupeFilesResult.output.split("\n").filter(Boolean));
        expect(dupeFilesLines.has(inputs.reuseTestFile)).toBe(false);
        expect(dupeLiteralsResult.output).not.toContain(inputs.reuseLiteral);
        expect(parseLiteralReuseResult(JSON.parse(dupeJsonResult.output))).toEqual(
          expectedFixtureFindings(inputs, LITERAL_PROBLEM_KIND.DUPE),
        );
      });
    });

    it("ALWAYS: --kind <k> with no problems of kind <k> produces no-problems-of-kind message and exit 0", async () => {
      await withLiteralFixtureEnv({}, async (env) => {
        const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
        await env.writeTsConfigMarker();
        await env.writeTestFile(inputs.dupeFirstTestFile, inputs.dupeLiteral);
        await env.writeTestFile(inputs.dupeSecondTestFile, inputs.dupeLiteral);

        const result = await literalCommand({
          cwd: env.productDir,
          config: LITERAL_DEFAULTS,
          kind: LITERAL_PROBLEM_KIND.REUSE,
        });

        expect(result.exitCode).toBe(0);
        expect(result.output).toBe(expectedNoProblemsOfKind(LITERAL_PROBLEM_KIND.REUSE));
      });
    });

    it("ALWAYS: exit code reflects filtered problems — 0 when no problems of the selected kind, 1 when any exist", async () => {
      await withLiteralFixtureEnv({}, async (env) => {
        const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
        await env.writeTsConfigMarker();
        await env.writeTestFile(inputs.dupeFirstTestFile, inputs.dupeLiteral);
        await env.writeTestFile(inputs.dupeSecondTestFile, inputs.dupeLiteral);

        const [reuseResult, dupeResult] = await Promise.all([
          literalCommand({ cwd: env.productDir, config: LITERAL_DEFAULTS, kind: LITERAL_PROBLEM_KIND.REUSE }),
          literalCommand({ cwd: env.productDir, config: LITERAL_DEFAULTS, kind: LITERAL_PROBLEM_KIND.DUPE }),
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
          cwd: env.productDir,
          config: LITERAL_DEFAULTS,
          kind: LITERAL_PROBLEM_KIND.REUSE,
          json: true,
        });

        const findings = parseLiteralReuseResult(JSON.parse(result.output));
        expect(findings).toEqual(expectedFixtureFindings(inputs, LITERAL_PROBLEM_KIND.REUSE));
      });
    });
  });
}
