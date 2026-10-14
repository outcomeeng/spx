import { describe, expect, it } from "vitest";

import { allCommand } from "@/commands/validation";
import { formatValidationNoProblemsMessage } from "@/commands/validation/messages";
import { ALL_VALIDATION_JSON_FIELD } from "@/commands/validation/types";
import { VALIDATION_STAGE_PARTICIPATION, type ValidationStage } from "@/validation/languages/types";
import { validationPipelineStages } from "@/validation/registry";
import { VALIDATION_PIPELINE_DATA } from "@testing/generators/validation/validation";
import { VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT } from "@testing/harnesses/validation/cli";
import { parseValidationJsonOutput, runValidationAll, VALIDATION_ROOT } from "@testing/harnesses/validation/pipeline";
import { PROJECT_FIXTURES, withValidationEnv } from "@testing/harnesses/with-validation-env";

function expectStepSequence(stdout: string): void {
  const stepMarkers = [...stdout.matchAll(VALIDATION_PIPELINE_DATA.stepLinePattern)];
  expect(stepMarkers).toHaveLength(VALIDATION_PIPELINE_DATA.totalSteps);
  expect(stepMarkers.map((match) => Number(match[1]))).toEqual(VALIDATION_PIPELINE_DATA.expectedStepNumbers);
  expect(stepMarkers.map((match) => Number(match[2]))).toEqual(
    VALIDATION_PIPELINE_DATA.expectedStepNumbers.map(() => VALIDATION_PIPELINE_DATA.totalSteps),
  );
}

function expectCanonicalProblemVocabulary(stdout: string): void {
  const completionLines = stdout
    .split(VALIDATION_PIPELINE_DATA.outputLineSeparator)
    .filter((line) => /^\[\d+\/\d+\]/u.test(line));
  expect(completionLines).toHaveLength(VALIDATION_PIPELINE_DATA.totalSteps);
  for (const line of completionLines) {
    if (/\bskipped\b/u.test(line)) continue;
    expect(line).toMatch(/\bproblems?\b/u);
  }
}

describe("validation pipeline compliance", () => {
  it(
    "later steps still run after the first step fails",
    async () => {
      await withValidationEnv(
        { fixture: PROJECT_FIXTURES.WITH_CIRCULAR_DEPS },
        async ({ path }) => {
          const result = await runValidationAll(path);

          expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.FAILURE);
          expectStepSequence(result.stdout);
          expectCanonicalProblemVocabulary(result.stdout);
          expect(result.stdout).toContain(
            VALIDATION_PIPELINE_DATA.stageNames.TYPESCRIPT,
          );
          expect(result.stdout).toContain(
            VALIDATION_PIPELINE_DATA.stageNames.MARKDOWN,
          );
          expect(result.stdout).toContain(
            VALIDATION_PIPELINE_DATA.stageNames.LITERAL,
          );
        },
      );
    },
    VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT,
  );

  it(
    "any step failure makes the pipeline exit non-zero",
    async () => {
      for (const failingStage of validationPipelineStages.filter((stage) => stage.failsPipeline)) {
        const stages = validationPipelineStages.map((stage): ValidationStage => ({
          ...stage,
          run: () =>
            Promise.resolve({
              exitCode: stage.name === failingStage.name
                ? VALIDATION_PIPELINE_DATA.exitCodes.FAILURE
                : VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
              output: stage.name === failingStage.name
                ? stage.name
                : formatValidationNoProblemsMessage(stage.name),
            }),
        }));
        const result = await allCommand({ cwd: VALIDATION_ROOT, quiet: true, validationStages: stages });

        expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.FAILURE);
      }

      await withValidationEnv(
        { fixture: PROJECT_FIXTURES.WITH_TYPE_ERRORS },
        async ({ path }) => {
          const result = await runValidationAll(path);

          expect(result.exitCode).not.toBe(
            VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
          );

          const jsonResult = await runValidationAll(path, [
            VALIDATION_PIPELINE_DATA.quietFlag,
            VALIDATION_PIPELINE_DATA.jsonFlag,
          ]);

          expect(jsonResult.exitCode).not.toBe(
            VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
          );
          expect(parseValidationJsonOutput(jsonResult.stdout).steps).toContainEqual(
            expect.objectContaining({
              [ALL_VALIDATION_JSON_FIELD.NAME]: VALIDATION_PIPELINE_DATA.stageNames.TYPESCRIPT,
              [ALL_VALIDATION_JSON_FIELD.STDOUT]: expect.stringMatching(/\S/u),
              [ALL_VALIDATION_JSON_FIELD.STDERR]: expect.any(String),
            }),
          );
        },
      );
    },
    VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT,
  );

  it(
    "every step line carries a duration annotation",
    async () => {
      await withValidationEnv(
        { fixture: PROJECT_FIXTURES.CLEAN_PROJECT },
        async ({ path }) => {
          const result = await runValidationAll(path);
          const lines = result.stdout
            .split(VALIDATION_PIPELINE_DATA.outputLineSeparator)
            .filter(
              (line) =>
                [...line.matchAll(VALIDATION_PIPELINE_DATA.stepLinePattern)]
                  .length > 0,
            );

          expect(lines).toHaveLength(VALIDATION_PIPELINE_DATA.totalSteps);
          for (const line of lines) {
            expect(line).toMatch(VALIDATION_PIPELINE_DATA.stepDurationPattern);
          }
        },
      );

      const mixedVerdictStages = validationPipelineStages.map((stage): ValidationStage => {
        if (stage.name === VALIDATION_PIPELINE_DATA.stageNames.KNIP) {
          return {
            ...stage,
            participation: {
              ...stage.participation,
              default: VALIDATION_STAGE_PARTICIPATION.SKIP,
              skipReason: stage.name,
            },
          };
        }
        return {
          ...stage,
          participation: stage.participation,
          run: () =>
            Promise.resolve({
              exitCode: stage.name === VALIDATION_PIPELINE_DATA.stageNames.TYPESCRIPT
                ? VALIDATION_PIPELINE_DATA.exitCodes.FAILURE
                : VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
              output: stage.name === VALIDATION_PIPELINE_DATA.stageNames.TYPESCRIPT
                ? stage.name
                : formatValidationNoProblemsMessage(stage.name),
            }),
        };
      });
      const mixedResult = await allCommand({ cwd: VALIDATION_ROOT }, { stages: mixedVerdictStages });
      const mixedLines = mixedResult.output
        .split(VALIDATION_PIPELINE_DATA.outputLineSeparator)
        .filter((line) => [...line.matchAll(VALIDATION_PIPELINE_DATA.stepLinePattern)].length > 0);

      expect(mixedLines).toHaveLength(mixedVerdictStages.length);
      for (const line of mixedLines) {
        expect(line).toMatch(VALIDATION_PIPELINE_DATA.stepDurationPattern);
      }
    },
    VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT,
  );
});
