import { expect, it } from "vitest";

import { VALIDATION_STAGE_DISPLAY_NAMES, VALIDATION_STEP_DURATION_PATTERN } from "@/commands/validation/messages";
import { typescriptValidationLanguage } from "@/validation/languages/typescript";
import {
  validationAllTypeScriptComplianceEvidence,
  validationAllTypeScriptScenarioEvidence,
  type ValidationSubprocessScenario,
} from "@testing/generators/validation/validation";
import { expectValidationSubprocessResult, runValidationSubprocess } from "@testing/harnesses/validation/cli";
import { withValidationEnv } from "@testing/harnesses/with-validation-env";

export function registerTypeScriptValidationScenarioTests(): void {
  for (const scenario of validationAllTypeScriptScenarioEvidence()) {
    it(scenario.title, { timeout: scenario.timeout }, () => runTypeScriptValidationScenario(scenario));
  }
}

export function registerTypeScriptValidationMappingTests(): void {
  const expectedStageNames = [
    VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR,
    VALIDATION_STAGE_DISPLAY_NAMES.KNIP,
    VALIDATION_STAGE_DISPLAY_NAMES.ESLINT,
    VALIDATION_STAGE_DISPLAY_NAMES.TYPESCRIPT,
    VALIDATION_STAGE_DISPLAY_NAMES.LITERAL,
  ];
  it.each(expectedStageNames.map((stageName, index) => ({ index, stageName })))(
    "maps descriptor stage $index to $stageName",
    ({ index, stageName }) => {
      expect(typescriptValidationLanguage.stages[index]?.name).toBe(stageName);
    },
  );
  it("contains no stages beyond the ordered mapping", () => {
    expect(typescriptValidationLanguage.stages).toHaveLength(expectedStageNames.length);
  });
}

export function registerTypeScriptValidationComplianceTests(): void {
  const scenario = validationAllTypeScriptComplianceEvidence();
  it(scenario.title, { timeout: scenario.timeout }, () => runTypeScriptValidationScenario(scenario));
}

async function runTypeScriptValidationScenario(scenario: ValidationSubprocessScenario): Promise<void> {
  await withValidationEnv({ fixture: scenario.fixture }, async ({ path }) => {
    const result = await runValidationSubprocess(scenario.args, {
      cwd: path,
      timeout: scenario.timeout,
    });
    expectValidationSubprocessResult(result, scenario);
    const exactStageOutputs = validationStageOutputs(result.stdout);
    for (const expectedOutput of scenario.stdoutIncludes) {
      expect(exactStageOutputs).toContain(expectedOutput);
    }
  });
}

function validationStageOutputs(stdout: string): readonly string[] {
  return stdout.split("\n")
    .filter((line) => /^\[\d+\/\d+\]\s/u.test(line))
    .map((line) =>
      line
        .replace(/^\[\d+\/\d+\]\s/u, "")
        .replace(VALIDATION_STEP_DURATION_PATTERN, "")
        .trim()
    );
}
