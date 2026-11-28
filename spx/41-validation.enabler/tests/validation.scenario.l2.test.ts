import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createValidationDomain } from "@/interfaces/cli/validation";
import { validationCliDefinition } from "@/interfaces/cli/validation-contract";
import type { ValidationStage } from "@/validation/languages/types";
import { VALIDATION_PIPELINE_DATA } from "@testing/generators/validation/validation";
import {
  createRecordingValidationDomain,
  runValidationInProcess,
  VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT,
} from "@testing/harnesses/validation/cli";
import {
  deferred,
  extractStepOutcomes,
  runValidationAll,
  VALIDATION_ROOT,
  validationParticipationPolicy,
} from "@testing/harnesses/validation/pipeline";
import {
  PROJECT_FIXTURES,
  VALIDATION_FIXTURE_TEXT_ENCODING,
  withValidationEnv,
} from "@testing/harnesses/with-validation-env";

function expectStepSequence(stdout: string): void {
  const stepMarkers = [...stdout.matchAll(VALIDATION_PIPELINE_DATA.stepLinePattern)];
  expect(stepMarkers).toHaveLength(VALIDATION_PIPELINE_DATA.totalSteps);
  expect(stepMarkers.map((match) => Number(match[1]))).toEqual(VALIDATION_PIPELINE_DATA.expectedStepNumbers);
  expect(stepMarkers.map((match) => Number(match[2]))).toEqual(
    VALIDATION_PIPELINE_DATA.expectedStepNumbers.map(() => VALIDATION_PIPELINE_DATA.totalSteps),
  );
}

describe("validation pipeline scenarios", () => {
  it(
    "clean project passes the full validation pipeline",
    async () => {
      await withValidationEnv(
        { fixture: PROJECT_FIXTURES.CLEAN_PROJECT },
        async ({ path }) => {
          const result = await runValidationAll(path);

          expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
          expect(result.stdout).toContain(`Validation ${VALIDATION_PIPELINE_DATA.summaryStatus.PASSED}`);
          expectStepSequence(result.stdout);
          const outcomes = extractStepOutcomes(result.stdout);
          expect(outcomes.size).toBe(VALIDATION_PIPELINE_DATA.totalSteps);
          expect([...outcomes.values()]).not.toContain(
            VALIDATION_PIPELINE_DATA.outcome.fail,
          );
        },
      );
    },
    VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT,
  );

  it(
    "pipeline failure output identifies the failed step",
    async () => {
      await withValidationEnv(
        { fixture: PROJECT_FIXTURES.WITH_CIRCULAR_DEPS },
        async ({ path }) => {
          const result = await runValidationAll(path);

          expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.FAILURE);
          expect(result.stdout).toContain(VALIDATION_PIPELINE_DATA.circularOutput.FOUND);
          expect(`${result.stdout}${result.stderr}`).toContain(
            `Validation ${VALIDATION_PIPELINE_DATA.summaryStatus.FAILED}`,
          );
          const circularSourceFiles = await readdir(
            join(path, VALIDATION_PIPELINE_DATA.sourceDirectoryName),
          );
          for (const sourceFile of circularSourceFiles) {
            expect(result.stdout).toContain(
              join(VALIDATION_PIPELINE_DATA.sourceDirectoryName, sourceFile),
            );
          }
        },
      );
    },
    VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT,
  );

  it(
    "production scope runs every step in sequence",
    async () => {
      await withValidationEnv(
        { fixture: PROJECT_FIXTURES.CLEAN_PROJECT },
        async ({ path }) => {
          const fullConfigPath = join(
            path,
            VALIDATION_PIPELINE_DATA.fullTsconfigFile,
          );
          const fullConfig = JSON.parse(
            await readFile(
              fullConfigPath,
              VALIDATION_FIXTURE_TEXT_ENCODING,
            ),
          ) as {
            include?: string[];
          };
          fullConfig.include = [
            VALIDATION_PIPELINE_DATA.productionScopeFilePattern,
            VALIDATION_PIPELINE_DATA.absentScopeFilePattern,
          ];
          await writeFile(
            fullConfigPath,
            JSON.stringify(fullConfig),
            VALIDATION_FIXTURE_TEXT_ENCODING,
          );
          await writeFile(
            join(path, VALIDATION_PIPELINE_DATA.productionTsconfigFile),
            VALIDATION_PIPELINE_DATA.productionTsconfigContent,
            VALIDATION_FIXTURE_TEXT_ENCODING,
          );
          const scriptsDirectory = join(
            path,
            VALIDATION_PIPELINE_DATA.scriptSourceDirectoryName,
          );
          await mkdir(scriptsDirectory, { recursive: true });
          await writeFile(
            join(
              scriptsDirectory,
              VALIDATION_PIPELINE_DATA.secondarySourceFileName,
            ),
            VALIDATION_PIPELINE_DATA.secondaryTypeErrorSourceContent,
            VALIDATION_FIXTURE_TEXT_ENCODING,
          );

          const fullResult = await runValidationAll(path);
          const result = await runValidationAll(path, [
            VALIDATION_PIPELINE_DATA.scopeFlag,
            VALIDATION_PIPELINE_DATA.productionScope,
          ]);

          const recorder = createRecordingValidationDomain(
            VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
          );
          await runValidationInProcess(
            [
              validationCliDefinition.subcommands.all.commandName,
              VALIDATION_PIPELINE_DATA.scopeFlag,
              VALIDATION_PIPELINE_DATA.productionScope,
            ],
            { domain: recorder.domain, processCwd: () => path },
          );

          expect(fullResult.exitCode).toBe(
            VALIDATION_PIPELINE_DATA.exitCodes.FAILURE,
          );
          expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
          expectStepSequence(result.stdout);
          expect(recorder.calls).toHaveLength(1);
          expect(recorder.calls[0]?.commandName).toBe(
            validationCliDefinition.subcommands.all.commandName,
          );
          expect(recorder.calls[0]?.options.scope).toBe(
            VALIDATION_PIPELINE_DATA.productionScope,
          );
        },
      );
    },
    VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT,
  );

  it(
    "path directory scope runs every step in sequence",
    async () => {
      await withValidationEnv(
        { fixture: PROJECT_FIXTURES.CLEAN_PROJECT },
        async ({ path }) => {
          const outOfScopeDirectory = join(
            path,
            VALIDATION_PIPELINE_DATA.outOfScopeMarkdownDirectoryName,
          );
          await mkdir(outOfScopeDirectory, { recursive: true });
          await writeFile(
            join(
              outOfScopeDirectory,
              VALIDATION_PIPELINE_DATA.outOfScopeMarkdownFileName,
            ),
            VALIDATION_PIPELINE_DATA.outOfScopeMarkdownContent,
          );

          const unscopedResult = await runValidationAll(path, [
            VALIDATION_PIPELINE_DATA.skipCircularFlag,
          ]);
          expect(unscopedResult.exitCode).toBe(
            VALIDATION_PIPELINE_DATA.exitCodes.FAILURE,
          );
          expect(unscopedResult.stdout).toContain(
            VALIDATION_PIPELINE_DATA.stageNames.FORMATTING,
          );

          const targetDirectory = VALIDATION_PIPELINE_DATA.sourceDirectoryName;
          const result = await runValidationAll(path, [
            VALIDATION_PIPELINE_DATA.skipCircularFlag,
            targetDirectory,
          ]);

          expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
          expectStepSequence(result.stdout);
        },
      );
    },
    VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT,
  );

  it(
    "path file scope runs every step in sequence",
    async () => {
      await withValidationEnv(
        { fixture: PROJECT_FIXTURES.CLEAN_PROJECT },
        async ({ path }) => {
          const outOfScopeDirectory = join(
            path,
            VALIDATION_PIPELINE_DATA.outOfScopeMarkdownDirectoryName,
          );
          await mkdir(outOfScopeDirectory, { recursive: true });
          await writeFile(
            join(
              outOfScopeDirectory,
              VALIDATION_PIPELINE_DATA.outOfScopeMarkdownFileName,
            ),
            VALIDATION_PIPELINE_DATA.outOfScopeMarkdownContent,
          );

          const unscopedResult = await runValidationAll(path, [
            VALIDATION_PIPELINE_DATA.skipCircularFlag,
          ]);
          expect(unscopedResult.exitCode).toBe(
            VALIDATION_PIPELINE_DATA.exitCodes.FAILURE,
          );
          expect(unscopedResult.stdout).toContain(
            VALIDATION_PIPELINE_DATA.stageNames.FORMATTING,
          );

          const targetFile = join(
            VALIDATION_PIPELINE_DATA.sourceDirectoryName,
            VALIDATION_PIPELINE_DATA.cleanSourceFileName,
          );
          const result = await runValidationAll(path, [
            VALIDATION_PIPELINE_DATA.skipCircularFlag,
            targetFile,
          ]);
          const recorder = createRecordingValidationDomain(
            VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
          );
          await runValidationInProcess(
            [
              validationCliDefinition.subcommands.all.commandName,
              VALIDATION_PIPELINE_DATA.skipCircularFlag,
              targetFile,
            ],
            { domain: recorder.domain, processCwd: () => path },
          );

          expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
          expectStepSequence(result.stdout);
          expect(recorder.calls).toHaveLength(1);
          expect(recorder.calls[0]?.commandName).toBe(
            validationCliDefinition.subcommands.all.commandName,
          );
          expect(recorder.calls[0]?.options.files).toEqual([targetFile]);
        },
      );
    },
    VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT,
  );

  it(
    "step completion lines stay in pipeline order",
    async () => {
      const secondStageStarted = deferred();
      const releaseSecondStage = deferred();
      const streamedOutput: string[] = [];
      const stages: readonly ValidationStage[] = [
        {
          name: VALIDATION_PIPELINE_DATA.stageNames.ESLINT,
          failsPipeline: true,
          participation: validationParticipationPolicy(VALIDATION_PIPELINE_DATA.stageNames.ESLINT),
          run: () =>
            Promise.resolve({
              exitCode: VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
              output: VALIDATION_PIPELINE_DATA.stageNames.ESLINT,
            }),
        },
        {
          name: VALIDATION_PIPELINE_DATA.stageNames.TYPESCRIPT,
          failsPipeline: true,
          participation: validationParticipationPolicy(VALIDATION_PIPELINE_DATA.stageNames.TYPESCRIPT),
          run: async () => {
            secondStageStarted.resolve();
            await releaseSecondStage.promise;
            return {
              exitCode: VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
              output: VALIDATION_PIPELINE_DATA.stageNames.TYPESCRIPT,
            };
          },
        },
      ];

      const domain = createValidationDomain({ validationStages: stages });
      const run = runValidationInProcess(
        [validationCliDefinition.subcommands.all.commandName],
        {
          domain,
          processCwd: () => VALIDATION_ROOT,
          writeStdout: (output) => streamedOutput.push(output),
        },
      );
      await secondStageStarted.promise;
      try {
        expect(streamedOutput).toHaveLength(1);
        expect(streamedOutput[0]).toContain(
          VALIDATION_PIPELINE_DATA.stageNames.ESLINT,
        );
      } finally {
        releaseSecondStage.resolve();
      }
      const result = await run;
      expect(result.stdout.indexOf(VALIDATION_PIPELINE_DATA.stageNames.ESLINT)).toBeLessThan(
        result.stdout.indexOf(VALIDATION_PIPELINE_DATA.stageNames.TYPESCRIPT),
      );
    },
    VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT,
  );
});
