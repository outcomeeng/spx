/**
 * Level 2: Integration tests for the cross-cutting validation pipeline.
 *
 * Spec: spx/41-validation.enabler/validation.md
 *
 * Routing: Stage 2 → Level 2. Evidence lives in the real `spx validation all`
 * CLI invocation against real fixture projects. Stage 3C glue code where the
 * behavior IS the composition of child steps. No doubles.
 */

import { execa } from "execa";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { LITERAL_SKIP_OUTPUT } from "@/commands/validation/all";
import { CIRCULAR_DEPENDENCY_OUTPUT } from "@/commands/validation/circular";
import { VALIDATION_SUMMARY_STATUS } from "@/commands/validation/format";
import { allValidationCliOptions } from "@/domains/validation";
import { CLI_PATH } from "@test/harness/constants";
import { FIXTURES, withValidationEnv } from "@test/harness/with-validation-env";

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const ALL_TIMEOUT_MS = 120_000;
const TOTAL_STEPS = 6;
const STEP_LINE_PATTERN = /^\[(\d)\/6\]/gm;
const DURATION_PATTERN = /\((\d+(?:\.\d+)?)(ms|s)\)\s*$/;
const STEP_NAMES = {
  CIRCULAR: "Circular dependencies",
  ESLINT: "ESLint",
  TYPESCRIPT: "TypeScript",
  MARKDOWN: "Markdown",
  LITERAL: "Literal",
} as const;
const skippedLiteralToken = "validation-all-skip-literal-token";

describe("spx validation all — pipeline composition (Scenarios)", () => {
  it(
    "S1 GIVEN a clean project WHEN running all THEN every step passes and the pipeline exits 0",
    { timeout: ALL_TIMEOUT_MS },
    async () => {
      await withValidationEnv({ fixture: FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
        const result = await execa("node", [CLI_PATH, "validation", "all"], {
          cwd: path,
          reject: false,
        });

        expect(result.exitCode).toBe(EXIT_SUCCESS);
        expect(result.stdout).toContain(`Validation ${VALIDATION_SUMMARY_STATUS.PASSED}`);
      });
    },
  );

  it(
    "S2 GIVEN a fixture that triggers a pipeline failure WHEN running all THEN the failure output identifies the step that failed",
    { timeout: ALL_TIMEOUT_MS },
    async () => {
      await withValidationEnv({ fixture: FIXTURES.WITH_CIRCULAR_DEPS }, async ({ path }) => {
        const result = await execa("node", [CLI_PATH, "validation", "all"], {
          cwd: path,
          reject: false,
        });

        expect(result.exitCode).toBe(EXIT_FAILURE);
        expect(result.stdout).toContain(CIRCULAR_DEPENDENCY_OUTPUT.FOUND);
        expect(result.stdout).toContain(`Validation ${VALIDATION_SUMMARY_STATUS.FAILED}`);
      });
    },
  );

  it(
    "S3 GIVEN --scope production WHEN running all THEN the pipeline accepts the scope and runs every step in sequence",
    { timeout: ALL_TIMEOUT_MS },
    async () => {
      await withValidationEnv({ fixture: FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
        const result = await execa(
          "node",
          [CLI_PATH, "validation", "all", "--scope", "production"],
          { cwd: path, reject: false },
        );

        const stepMarkers = [...result.stdout.matchAll(STEP_LINE_PATTERN)];
        expect(stepMarkers).toHaveLength(TOTAL_STEPS);
        expect(stepMarkers.map((m) => Number(m[1]))).toEqual([1, 2, 3, 4, 5, 6]);
      });
    },
  );

  it(
    "S4 GIVEN --files pointing at a source file that exists WHEN running all THEN the pipeline accepts the filter and runs every step in sequence",
    { timeout: ALL_TIMEOUT_MS },
    async () => {
      await withValidationEnv({ fixture: FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
        const targetFile = join(path, "src", "clean.ts");

        const result = await execa(
          "node",
          [CLI_PATH, "validation", "all", "--files", targetFile],
          { cwd: path, reject: false },
        );

        const stepMarkers = [...result.stdout.matchAll(STEP_LINE_PATTERN)];
        expect(stepMarkers).toHaveLength(TOTAL_STEPS);
        expect(stepMarkers.map((m) => Number(m[1]))).toEqual([1, 2, 3, 4, 5, 6]);
      });
    },
  );

  it(
    "S5 GIVEN a multi-step pipeline WHEN running all THEN each step's completion line appears before the next step's line in output order",
    { timeout: ALL_TIMEOUT_MS },
    async () => {
      await withValidationEnv({ fixture: FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
        const result = await execa("node", [CLI_PATH, "validation", "all"], {
          cwd: path,
          reject: false,
        });

        const stepMarkers = [...result.stdout.matchAll(STEP_LINE_PATTERN)];
        expect(stepMarkers).toHaveLength(TOTAL_STEPS);
        const stepNumbers = stepMarkers.map((m) => Number(m[1]));
        expect(stepNumbers).toEqual([1, 2, 3, 4, 5, 6]);
      });
    },
  );

  it(
    "S6 GIVEN --skip-literal WHEN running all THEN literal detection is skipped and the other validation stages still run",
    { timeout: ALL_TIMEOUT_MS },
    async () => {
      await withValidationEnv({ fixture: FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
        const srcDir = join(path, "src");
        const testDir = join(path, "spx", "21-literal-skip.enabler", "tests");
        await mkdir(srcDir, { recursive: true });
        await mkdir(testDir, { recursive: true });
        await writeFile(
          join(srcDir, "literal-skip.ts"),
          `export const TOKEN = "${skippedLiteralToken}";\n`,
          "utf8",
        );
        await writeFile(
          join(testDir, "literal-skip.scenario.l1.test.ts"),
          `expect(value).toBe("${skippedLiteralToken}");\n`,
          "utf8",
        );

        const result = await execa(
          "node",
          [CLI_PATH, "validation", "all", allValidationCliOptions.skipLiteral.flag],
          {
            cwd: path,
            reject: false,
          },
        );

        expect(result.exitCode).toBe(EXIT_SUCCESS);
        const stepMarkers = [...result.stdout.matchAll(STEP_LINE_PATTERN)];
        expect(stepMarkers).toHaveLength(TOTAL_STEPS);
        expect(result.stdout).toContain(STEP_NAMES.CIRCULAR);
        expect(result.stdout).toContain(STEP_NAMES.ESLINT);
        expect(result.stdout).toContain(STEP_NAMES.TYPESCRIPT);
        expect(result.stdout).toContain(STEP_NAMES.MARKDOWN);
        expect(result.stdout).toContain(LITERAL_SKIP_OUTPUT);
      });
    },
  );
});

describe("spx validation all — pipeline composition (Compliance)", () => {
  it(
    "C1 GIVEN a fixture whose first step fails WHEN running all THEN subsequent steps still execute (no short-circuit)",
    { timeout: ALL_TIMEOUT_MS },
    async () => {
      await withValidationEnv({ fixture: FIXTURES.WITH_CIRCULAR_DEPS }, async ({ path }) => {
        const result = await execa("node", [CLI_PATH, "validation", "all"], {
          cwd: path,
          reject: false,
        });

        expect(result.exitCode).toBe(EXIT_FAILURE);
        const stepMarkers = [...result.stdout.matchAll(STEP_LINE_PATTERN)];
        expect(stepMarkers).toHaveLength(TOTAL_STEPS);
        expect(result.stdout).toContain(STEP_NAMES.TYPESCRIPT);
        expect(result.stdout).toContain(STEP_NAMES.MARKDOWN);
        expect(result.stdout).toContain(STEP_NAMES.LITERAL);
      });
    },
  );

  it(
    "C2 GIVEN any step failure WHEN running all THEN the pipeline exit code is non-zero",
    { timeout: ALL_TIMEOUT_MS },
    async () => {
      await withValidationEnv({ fixture: FIXTURES.WITH_TYPE_ERRORS }, async ({ path }) => {
        const result = await execa("node", [CLI_PATH, "validation", "all"], {
          cwd: path,
          reject: false,
        });

        expect(result.exitCode).not.toBe(EXIT_SUCCESS);
      });
    },
  );

  it(
    "C3 GIVEN a full pipeline run WHEN inspecting output THEN every step line carries its own duration annotation",
    { timeout: ALL_TIMEOUT_MS },
    async () => {
      await withValidationEnv({ fixture: FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
        const result = await execa("node", [CLI_PATH, "validation", "all"], {
          cwd: path,
          reject: false,
        });

        const lines = result.stdout.split("\n").filter((line) => /^\[\d\/6\]/.test(line));
        expect(lines).toHaveLength(TOTAL_STEPS);
        for (const line of lines) {
          expect(line).toMatch(DURATION_PATTERN);
        }
      });
    },
  );
});

describe("spx validation all — pipeline composition (Properties)", () => {
  it(
    "P1 GIVEN the same fixture WHEN running all twice THEN both runs produce identical pass/fail verdicts",
    { timeout: ALL_TIMEOUT_MS * 2 },
    async () => {
      await withValidationEnv({ fixture: FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
        const first = await execa("node", [CLI_PATH, "validation", "all"], {
          cwd: path,
          reject: false,
        });
        const second = await execa("node", [CLI_PATH, "validation", "all"], {
          cwd: path,
          reject: false,
        });

        expect(second.exitCode).toBe(first.exitCode);
        const firstStepOutcomes = extractStepOutcomes(first.stdout);
        const secondStepOutcomes = extractStepOutcomes(second.stdout);
        expect(secondStepOutcomes).toEqual(firstStepOutcomes);
      });
    },
  );

  it(
    "P2 GIVEN a step that fails in one run and passes in another WHEN inspecting other steps' verdicts THEN other steps' verdicts are unchanged (additivity)",
    { timeout: ALL_TIMEOUT_MS * 2 },
    async () => {
      await withValidationEnv({ fixture: FIXTURES.WITH_TYPE_ERRORS }, async ({ path }) => {
        const withFailure = await execa("node", [CLI_PATH, "validation", "all"], {
          cwd: path,
          reject: false,
        });
        const failingOutcomes = extractStepOutcomes(withFailure.stdout);

        const typeErrorFile = join(path, "src", "has-type-error.ts");
        const original = await readFile(typeErrorFile, "utf8");
        const fixed = original.replace(/const x:\s*number\s*=\s*"[^"]+";?/g, "const x: number = 0;");
        await writeFile(typeErrorFile, fixed, "utf8");

        const withoutFailure = await execa("node", [CLI_PATH, "validation", "all"], {
          cwd: path,
          reject: false,
        });
        const passingOutcomes = extractStepOutcomes(withoutFailure.stdout);

        const stepsIndependentOfTypeScript = [1, 2, 3, 5, 6];
        for (const stepNumber of stepsIndependentOfTypeScript) {
          expect(passingOutcomes.get(stepNumber)).toBe(failingOutcomes.get(stepNumber));
        }
      });
    },
  );
});

/**
 * Parse `[N/6] <step-text>` lines into a map of step-number to a canonical
 * outcome token ("pass", "skip", or "fail"). Outcomes are derived from the
 * step line's leading marker:
 *   - `✓` or "passed" / "No issues"/ "No cycles" / "No type errors" → pass
 *   - `⏭` or "skipped" → skip
 *   - anything else → fail
 */
const VALIDATION_STEP_OUTCOME = {
  PASS: "pass",
  SKIP: "skip",
  FAIL: "fail",
} as const;
type ValidationStepOutcome = (typeof VALIDATION_STEP_OUTCOME)[keyof typeof VALIDATION_STEP_OUTCOME];

function extractStepOutcomes(stdout: string): Map<number, ValidationStepOutcome> {
  const outcomes = new Map<number, ValidationStepOutcome>();
  for (const line of stdout.split("\n")) {
    const match = line.match(/^\[(\d)\/6\]\s+(.+)$/);
    if (!match) continue;
    const step = Number(match[1]);
    const body = match[2];
    if (
      body.includes("✓") || body.includes("No issues found") || body.includes("No cycles")
      || body.includes("No type errors") || body.includes("None found")
    ) {
      outcomes.set(step, VALIDATION_STEP_OUTCOME.PASS);
    } else if (body.includes("⏭") || body.startsWith("Skipping") || body.includes("skipped")) {
      outcomes.set(step, VALIDATION_STEP_OUTCOME.SKIP);
    } else {
      outcomes.set(step, VALIDATION_STEP_OUTCOME.FAIL);
    }
  }
  return outcomes;
}
