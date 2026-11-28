import { describe, expect, it } from "vitest";

import { allCommand } from "@/commands/validation";
import { formatValidationNoProblemsMessage } from "@/commands/validation/messages";
import type { ValidationCommandResult } from "@/commands/validation/types";
import type { ValidationStage } from "@/validation/languages/types";
import { validationPipelineStages } from "@/validation/registry";
import {
  arbitraryValidationAdditiveStageScenario,
  arbitraryValidationStableVerdictScenario,
  VALIDATION_PIPELINE_DATA,
  type ValidationStableVerdictScenario,
} from "@testing/generators/validation/validation";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { VALIDATION_REPEATED_PIPELINE_TIMEOUT } from "@testing/harnesses/validation/cli";
import {
  extractStepOutcomes,
  VALIDATION_ROOT,
  validationParticipationPolicy,
} from "@testing/harnesses/validation/pipeline";

interface StableVerdictRun {
  readonly result: ValidationCommandResult;
  readonly executedStageVerdicts: readonly ValidationCommandResult[];
}

async function executeStableVerdictRun(
  scenario: ValidationStableVerdictScenario,
): Promise<StableVerdictRun> {
  const executedStageVerdicts: ValidationCommandResult[] = [];
  const validationStages = validationPipelineStages.map(
    (stage, index): ValidationStage => ({
      name: stage.name,
      failsPipeline: true,
      participation: stage.participation,
      run: () => {
        const result = {
          exitCode: scenario.stageFailures[index]
            ? VALIDATION_PIPELINE_DATA.exitCodes.FAILURE
            : VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
          output: scenario.stageFailures[index]
            ? stage.name
            : formatValidationNoProblemsMessage(stage.name),
        };
        executedStageVerdicts.push(result);
        return Promise.resolve(result);
      },
    }),
  );
  const result = await allCommand(
    { cwd: VALIDATION_ROOT, ...scenario.commandOptions, validationStages },
    { now: () => 0 },
  );
  return { result, executedStageVerdicts };
}

describe("validation pipeline properties", () => {
  it(
    "repeated clean runs produce the same verdicts",
    async () => {
      await assertProperty(
        arbitraryValidationStableVerdictScenario(),
        async (generatedScenario) => {
          const first = await executeStableVerdictRun(generatedScenario);
          const second = await executeStableVerdictRun(generatedScenario);

          expect(second.result).toEqual(first.result);
          expect(second.executedStageVerdicts).toEqual(first.executedStageVerdicts);
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    },
    VALIDATION_REPEATED_PIPELINE_TIMEOUT,
  );

  it(
    "fixing TypeScript errors leaves other step verdicts unchanged",
    async () => {
      await assertProperty(
        arbitraryValidationAdditiveStageScenario(),
        async ({ addedStageName, insertionIndex, stageFailures }) => {
          const existingStages = validationPipelineStages.map((stage, index): ValidationStage => ({
            ...stage,
            failsPipeline: true,
            run: () =>
              Promise.resolve({
                exitCode: stageFailures[index]
                  ? VALIDATION_PIPELINE_DATA.exitCodes.FAILURE
                  : VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
                output: stageFailures[index]
                  ? stage.name
                  : formatValidationNoProblemsMessage(stage.name),
              }),
          }));
          const base = await allCommand(
            { cwd: VALIDATION_ROOT },
            { stages: existingStages },
          );
          const addedStage: ValidationStage = {
            name: addedStageName,
            failsPipeline: true,
            participation: validationParticipationPolicy(VALIDATION_PIPELINE_DATA.stageNames.TYPESCRIPT),
            run: () =>
              Promise.resolve({
                exitCode: VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
                output: formatValidationNoProblemsMessage(addedStageName),
              }),
          };
          const extendedStages = [
            ...existingStages.slice(0, insertionIndex),
            addedStage,
            ...existingStages.slice(insertionIndex),
          ];
          const extended = await allCommand(
            { cwd: VALIDATION_ROOT },
            { stages: extendedStages },
          );

          const baseOutcomes = extractStepOutcomes(base.output);
          const extendedOutcomes = extractStepOutcomes(extended.output);
          for (const [index] of existingStages.entries()) {
            const baseStep = index + 1;
            const extendedStep = index < insertionIndex ? baseStep : baseStep + 1;
            const expectedOutcome = stageFailures[index]
              ? VALIDATION_PIPELINE_DATA.outcome.fail
              : VALIDATION_PIPELINE_DATA.outcome.pass;
            expect(baseOutcomes.get(baseStep)).toBe(expectedOutcome);
            expect(extendedOutcomes.get(extendedStep)).toBe(expectedOutcome);
          }
          expect(extendedOutcomes.get(insertionIndex + 1)).toBe(VALIDATION_PIPELINE_DATA.outcome.pass);
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    },
    VALIDATION_REPEATED_PIPELINE_TIMEOUT,
  );
});
