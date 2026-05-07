import { readdirSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";

import { validationCliDefinition } from "@/domains/validation";
import {
  VALIDATION_PIPELINE_DATA,
  VALIDATION_PIPELINE_SCENARIO_KIND,
  type ValidationPipelineScenario,
  type ValidationStepOutcome,
  type ValidationStructuralMappingScenario,
} from "@testing/generators/validation/validation";
import { expectValidationSubprocessResult, runValidationSubprocess } from "@testing/harnesses/validation/cli";
import { PROJECT_FIXTURES, withValidationEnv } from "@testing/harnesses/with-validation-env";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const VALIDATION_ROOT = resolve(__dirname, "../../../spx/41-validation.enabler");

export function expectValidationStructuralMapping(scenario: ValidationStructuralMappingScenario): void {
  const slugs = listEnablerChildSlugs(resolve(VALIDATION_ROOT, scenario.nodeDirectory));

  expect(slugs).toEqual(scenario.expectedChildren);
}

export async function runValidationPipelineScenario(scenario: ValidationPipelineScenario): Promise<void> {
  switch (scenario.kind) {
    case VALIDATION_PIPELINE_SCENARIO_KIND.CLEAN_PROJECT:
      return runCleanProjectScenario(scenario);
    case VALIDATION_PIPELINE_SCENARIO_KIND.FAILURE_IDENTIFIES_STEP:
      return runFailureIdentifiesStepScenario(scenario);
    case VALIDATION_PIPELINE_SCENARIO_KIND.PRODUCTION_SCOPE:
      return runProductionScopeScenario(scenario);
    case VALIDATION_PIPELINE_SCENARIO_KIND.FILE_SCOPE:
      return runFileScopeScenario(scenario);
    case VALIDATION_PIPELINE_SCENARIO_KIND.STEP_ORDER:
      return runStepOrderScenario(scenario);
    case VALIDATION_PIPELINE_SCENARIO_KIND.SKIP_LITERAL:
      return runSkipLiteralScenario(scenario);
    case VALIDATION_PIPELINE_SCENARIO_KIND.NO_SHORT_CIRCUIT:
      return runNoShortCircuitScenario(scenario);
    case VALIDATION_PIPELINE_SCENARIO_KIND.FAILURE_EXIT_CODE:
      return runFailureExitCodeScenario(scenario);
    case VALIDATION_PIPELINE_SCENARIO_KIND.STEP_DURATION:
      return runStepDurationScenario(scenario);
    case VALIDATION_PIPELINE_SCENARIO_KIND.STABLE_VERDICT:
      return runStableVerdictScenario(scenario);
    case VALIDATION_PIPELINE_SCENARIO_KIND.ADDITIVE_VERDICTS:
      return runAdditiveVerdictsScenario(scenario);
  }
}

function listEnablerChildSlugs(directory: string): Set<string> {
  const entries = readdirSync(directory, { withFileTypes: true });
  const slugs = new Set<string>();
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.endsWith(VALIDATION_PIPELINE_DATA.enablerSuffix)) continue;
    const match = entry.name.match(VALIDATION_PIPELINE_DATA.indexSlugPattern);
    if (!match) continue;
    slugs.add(match[1]);
  }
  return slugs;
}

async function runAll(cwd: string, args: readonly string[] = []): Promise<{
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}> {
  return runValidationSubprocess([validationCliDefinition.subcommands.all.commandName, ...args], {
    cwd,
    timeout: VALIDATION_PIPELINE_DATA.allTimeout,
  });
}

async function runCleanProjectScenario(_scenario: ValidationPipelineScenario): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const result = await runAll(path);

    expectValidationSubprocessResult(result, {
      title: _scenario.title,
      fixture: PROJECT_FIXTURES.CLEAN_PROJECT,
      args: [],
      timeout: _scenario.timeout,
      expectedExitCode: VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
      stdoutIncludes: [`Validation ${VALIDATION_PIPELINE_DATA.summaryStatus.PASSED}`],
      combinedIncludes: [],
      stdoutExcludes: [],
      stderrExcludes: [],
      combinedExcludes: [],
    });
  });
}

async function runFailureIdentifiesStepScenario(_scenario: ValidationPipelineScenario): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.WITH_CIRCULAR_DEPS }, async ({ path }) => {
    const result = await runAll(path);

    expectValidationSubprocessResult(result, {
      title: _scenario.title,
      fixture: PROJECT_FIXTURES.WITH_CIRCULAR_DEPS,
      args: [],
      timeout: _scenario.timeout,
      expectedExitCode: VALIDATION_PIPELINE_DATA.exitCodes.FAILURE,
      stdoutIncludes: [
        VALIDATION_PIPELINE_DATA.circularOutput.FOUND,
        `Validation ${VALIDATION_PIPELINE_DATA.summaryStatus.FAILED}`,
      ],
      combinedIncludes: [],
      stdoutExcludes: [],
      stderrExcludes: [],
      combinedExcludes: [],
    });
  });
}

async function runProductionScopeScenario(_scenario: ValidationPipelineScenario): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const result = await runAll(path, [
      VALIDATION_PIPELINE_DATA.scopeFlag,
      VALIDATION_PIPELINE_DATA.productionScope,
    ]);

    expectStepSequence(result.stdout);
  });
}

async function runFileScopeScenario(_scenario: ValidationPipelineScenario): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const targetFile = join(
      path,
      VALIDATION_PIPELINE_DATA.sourceDirectoryName,
      VALIDATION_PIPELINE_DATA.cleanSourceFileName,
    );
    const result = await runAll(path, [VALIDATION_PIPELINE_DATA.filesFlag, targetFile]);

    expectStepSequence(result.stdout);
  });
}

async function runStepOrderScenario(_scenario: ValidationPipelineScenario): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const result = await runAll(path);

    expectStepSequence(result.stdout);
  });
}

async function runSkipLiteralScenario(_scenario: ValidationPipelineScenario): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    await writeLiteralSkipFixture(path);

    const result = await runAll(path, [VALIDATION_PIPELINE_DATA.skipLiteralFlag]);

    expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
    expectStepSequence(result.stdout);
    expect(result.stdout).toContain(VALIDATION_PIPELINE_DATA.stageNames.CIRCULAR);
    expect(result.stdout).toContain(VALIDATION_PIPELINE_DATA.stageNames.ESLINT);
    expect(result.stdout).toContain(VALIDATION_PIPELINE_DATA.stageNames.TYPESCRIPT);
    expect(result.stdout).toContain(VALIDATION_PIPELINE_DATA.stageNames.MARKDOWN);
    expect(result.stdout).toContain(VALIDATION_PIPELINE_DATA.stageNames.LITERAL);
    expect(result.stdout).toContain(VALIDATION_PIPELINE_DATA.literalSkipOutput);

    const quietResult = await runAll(path, [
      VALIDATION_PIPELINE_DATA.skipLiteralFlag,
      VALIDATION_PIPELINE_DATA.quietFlag,
    ]);

    expect(quietResult.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
    expect(quietResult.stdout).not.toContain(VALIDATION_PIPELINE_DATA.literalSkipOutput);
    expect(quietResult.stdout.trim()).toHaveLength(0);

    const jsonResult = await runAll(path, [
      VALIDATION_PIPELINE_DATA.skipLiteralFlag,
      VALIDATION_PIPELINE_DATA.jsonFlag,
    ]);

    expect(jsonResult.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
    expect(jsonResult.stdout).toContain(VALIDATION_PIPELINE_DATA.literalSkipJsonOutput);
    expect(jsonResult.stdout).not.toContain(VALIDATION_PIPELINE_DATA.literalSkipOutput);

    const productionResult = await runAll(path, [
      VALIDATION_PIPELINE_DATA.scopeFlag,
      VALIDATION_PIPELINE_DATA.productionScope,
      VALIDATION_PIPELINE_DATA.skipLiteralFlag,
    ]);

    expect(productionResult.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
    expectStepSequence(productionResult.stdout);
    expect(productionResult.stdout).toContain(VALIDATION_PIPELINE_DATA.literalSkipOutput);
  });
}

async function runNoShortCircuitScenario(_scenario: ValidationPipelineScenario): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.WITH_CIRCULAR_DEPS }, async ({ path }) => {
    const result = await runAll(path);

    expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.FAILURE);
    expectStepSequence(result.stdout);
    expect(result.stdout).toContain(VALIDATION_PIPELINE_DATA.stageNames.TYPESCRIPT);
    expect(result.stdout).toContain(VALIDATION_PIPELINE_DATA.stageNames.MARKDOWN);
    expect(result.stdout).toContain(VALIDATION_PIPELINE_DATA.stageNames.LITERAL);
  });
}

async function runFailureExitCodeScenario(_scenario: ValidationPipelineScenario): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.WITH_TYPE_ERRORS }, async ({ path }) => {
    const result = await runAll(path);

    expect(result.exitCode).not.toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
  });
}

async function runStepDurationScenario(_scenario: ValidationPipelineScenario): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const result = await runAll(path);
    const lines = result.stdout.split(VALIDATION_PIPELINE_DATA.outputLineSeparator)
      .filter((line) => [...line.matchAll(VALIDATION_PIPELINE_DATA.stepLinePattern)].length > 0);

    expect(lines).toHaveLength(VALIDATION_PIPELINE_DATA.totalSteps);
    for (const line of lines) {
      expect(line).toMatch(VALIDATION_PIPELINE_DATA.stepDurationPattern);
    }
  });
}

async function runStableVerdictScenario(_scenario: ValidationPipelineScenario): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const first = await runAll(path);
    const second = await runAll(path);

    expect(second.exitCode).toBe(first.exitCode);
    expect(extractStepOutcomes(second.stdout)).toEqual(extractStepOutcomes(first.stdout));
  });
}

async function runAdditiveVerdictsScenario(_scenario: ValidationPipelineScenario): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.WITH_TYPE_ERRORS }, async ({ path }) => {
    const withFailure = await runAll(path);
    const failingOutcomes = extractStepOutcomes(withFailure.stdout);

    const typeErrorFile = join(path, ...VALIDATION_PIPELINE_DATA.typeErrorSourceSegments);
    const original = await readFile(typeErrorFile, "utf8");
    const fixed = original.replace(
      VALIDATION_PIPELINE_DATA.typeErrorReplacementPattern,
      VALIDATION_PIPELINE_DATA.typeErrorReplacement,
    );
    await writeFile(typeErrorFile, fixed, "utf8");

    const withoutFailure = await runAll(path);
    const passingOutcomes = extractStepOutcomes(withoutFailure.stdout);

    for (const stepNumber of VALIDATION_PIPELINE_DATA.stepsIndependentOfTypeScript) {
      expect(passingOutcomes.get(stepNumber)).toBe(failingOutcomes.get(stepNumber));
    }
  });
}

async function writeLiteralSkipFixture(path: string): Promise<void> {
  const srcDir = join(path, VALIDATION_PIPELINE_DATA.sourceDirectoryName);
  const testDir = join(path, ...VALIDATION_PIPELINE_DATA.literalSkipTestSegments.slice(0, -1));
  await mkdir(srcDir, { recursive: true });
  await mkdir(testDir, { recursive: true });
  await writeFile(
    join(path, ...VALIDATION_PIPELINE_DATA.literalSkipSourceSegments),
    `export const TOKEN = "${VALIDATION_PIPELINE_DATA.literalSkipToken}";\n`,
    "utf8",
  );
  await writeFile(
    join(path, ...VALIDATION_PIPELINE_DATA.literalSkipTestSegments),
    `expect(value).toBe("${VALIDATION_PIPELINE_DATA.literalSkipToken}");\n`,
    "utf8",
  );
  await writeFile(
    join(path, VALIDATION_PIPELINE_DATA.productionTsconfigFile),
    `${VALIDATION_PIPELINE_DATA.productionTsconfigContent}\n`,
    "utf8",
  );
}

function expectStepSequence(stdout: string): void {
  const stepMarkers = [...stdout.matchAll(VALIDATION_PIPELINE_DATA.stepLinePattern)];
  expect(stepMarkers).toHaveLength(VALIDATION_PIPELINE_DATA.totalSteps);
  expect(stepMarkers.map((match) => Number(match[1]))).toEqual(VALIDATION_PIPELINE_DATA.expectedStepNumbers);
}

function extractStepOutcomes(stdout: string): Map<number, ValidationStepOutcome> {
  const outcomes = new Map<number, ValidationStepOutcome>();
  for (const line of stdout.split(VALIDATION_PIPELINE_DATA.outputLineSeparator)) {
    const [match] = [...line.matchAll(VALIDATION_PIPELINE_DATA.stepLinePattern)];
    if (!match) continue;
    const step = Number(match[1]);
    if (
      line.includes("✓") || line.includes("No issues found") || line.includes("No cycles")
      || line.includes("No type errors") || line.includes("None found")
    ) {
      outcomes.set(step, VALIDATION_PIPELINE_DATA.outcome.pass);
    } else if (line.includes("⏭") || line.startsWith("Skipping") || line.includes("skipped")) {
      outcomes.set(step, VALIDATION_PIPELINE_DATA.outcome.skip);
    } else {
      outcomes.set(step, VALIDATION_PIPELINE_DATA.outcome.fail);
    }
  }
  return outcomes;
}
