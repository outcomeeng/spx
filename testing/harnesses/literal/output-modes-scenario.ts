import { describe, expect, it } from "vitest";

import { literalCommand } from "@/commands/validation/literal";
import { LITERAL_PROBLEM_KIND } from "@/domains/validation/literal-problem-kind";
import { validationCliDefinition, validationCommonCliOptions } from "@/interfaces/cli/validation-contract";
import { LITERAL_DEFAULTS } from "@/validation/literal/config";
import { parseLiteralReuseResult } from "@/validation/literal/index";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";
import {
  expectedAffectedFiles,
  expectedFixtureFindings,
  expectedVerboseLines,
} from "@testing/harnesses/literal/output-expectations";
import { runValidationInProcess } from "@testing/harnesses/validation/cli";

export function registerLiteralOutputModeScenarios(): void {
  describe("output-modes — scenarios", () => {
    it("positional path operands scope detection to only the named files and their contributed index", async () => {
      await withLiteralFixtureEnv({}, async (env) => {
        const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
        await env.writeReuseFixture(inputs);

        const result = await runValidationInProcess([
          validationCliDefinition.subcommands.literal.commandName,
          inputs.dupeFirstTestFile,
          inputs.dupeSecondTestFile,
          validationCommonCliOptions.json.flag,
        ], { processCwd: () => env.productDir });

        const findings = parseLiteralReuseResult(JSON.parse(result.stdout));
        expect(findings.srcReuse).toHaveLength(0);
        expect(findings.testDupe.length).toBeGreaterThan(0);
      });
    });

    it("--json produces output parseable through parseLiteralReuseResult without throwing", async () => {
      await withLiteralFixtureEnv({}, async (env) => {
        const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
        await env.writeReuseFixture(inputs);

        const result = await literalCommand({
          cwd: env.productDir,
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
          cwd: env.productDir,
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
          cwd: env.productDir,
          config: LITERAL_DEFAULTS,
          kind: LITERAL_PROBLEM_KIND.REUSE,
        });

        expect(result.exitCode).toBe(1);
        expect(result.output).toContain(`[${LITERAL_PROBLEM_KIND.REUSE}]`);
        expect(result.output).not.toContain(`[${LITERAL_PROBLEM_KIND.DUPE}]`);
      });
    });

    it("--kind reuse --files-with-problems includes only file paths from src-reuse problems", async () => {
      await withLiteralFixtureEnv({}, async (env) => {
        const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
        await env.writeReuseFixture(inputs);

        const result = await literalCommand({
          cwd: env.productDir,
          config: LITERAL_DEFAULTS,
          kind: LITERAL_PROBLEM_KIND.REUSE,
          filesWithProblems: true,
        });

        expect(result.output.split("\n").filter(Boolean)).toEqual(
          expectedAffectedFiles(expectedFixtureFindings(inputs, LITERAL_PROBLEM_KIND.REUSE)),
        );
      });
    });

    it("--verbose groups problems into REUSE and DUPE sections with file headers and per-problem lines", async () => {
      await withLiteralFixtureEnv({}, async (env) => {
        const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
        await env.writeReuseFixture(inputs);

        const result = await literalCommand({ cwd: env.productDir, config: LITERAL_DEFAULTS, verbose: true });

        expect(result.exitCode).toBe(1);
        expect(result.output.split("\n")).toEqual(
          expectedVerboseLines(expectedFixtureFindings(inputs)),
        );
      });
    });
  });
}
