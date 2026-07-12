import { expect, it } from "vitest";

import { formatTypeScriptAbsentSkipMessage, VALIDATION_STEP_DURATION_PATTERN } from "@/commands/validation/messages";
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
    for (const stage of typescriptValidationLanguage.stages) {
      expect(exactStageOutputs.filter((output) =>
        output.startsWith(`${stage.name}:`)
        || output.startsWith(`${stage.name} `)
        || output === formatTypeScriptAbsentSkipMessage(stage.name)
      )).toHaveLength(1);
    }
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
