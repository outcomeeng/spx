import { expect, it } from "vitest";

import {
  formatTypeScriptAbsentSkipMessage,
  formatValidationStageSkipOutput,
  VALIDATION_STEP_DURATION_PATTERN,
} from "@/commands/validation/messages";
import { createValidationDomain } from "@/interfaces/cli/validation";
import { validationCliDefinition } from "@/interfaces/cli/validation-contract";
import { VALIDATION_STAGE_PARTICIPATION, type ValidationStage } from "@/validation/languages/types";
import { typescriptValidationLanguage } from "@/validation/languages/typescript";
import {
  validationAllTypeScriptComplianceEvidence,
  validationAllTypeScriptScenarioEvidence,
  type ValidationSubprocessScenario,
} from "@testing/generators/validation/validation";
import {
  expectValidationSubprocessResult,
  runValidationInProcessWithDomains,
  runValidationSubprocess,
} from "@testing/harnesses/validation/cli";
import { PROJECT_FIXTURES, withValidationEnv } from "@testing/harnesses/with-validation-env";

export function registerTypeScriptValidationScenarioTests(): void {
  for (const scenario of validationAllTypeScriptScenarioEvidence()) {
    it(scenario.title, { timeout: scenario.timeout }, () => runTypeScriptValidationScenario(scenario));
  }
}

export function registerTypeScriptValidationComplianceTests(): void {
  const scenario = validationAllTypeScriptComplianceEvidence();
  it(scenario.title, { timeout: scenario.timeout }, () => runTypeScriptValidationScenario(scenario));
  it("does not invoke a registered stage whose descriptor default is skip", runDescriptorDefaultSkipCompliance);
}

async function runDescriptorDefaultSkipCompliance(): Promise<void> {
  const stage = typescriptValidationLanguage.stages.find((candidate) =>
    candidate.participation.override?.participation === VALIDATION_STAGE_PARTICIPATION.SKIP
  );
  const override = stage?.participation.override;
  if (stage === undefined || override === undefined) {
    throw new Error("TypeScript validation requires a registered skip override for default-participation evidence");
  }
  const defaultSkipStage: ValidationStage = {
    ...stage,
    participation: {
      default: override.participation,
      defaultSkipReason: override.reason,
    },
    run: async () => {
      throw new Error("default-skipped validation stage was invoked");
    },
  };
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const result = await runValidationInProcessWithDomains(
      [validationCliDefinition.subcommands.all.commandName],
      [createValidationDomain({ validationStages: [defaultSkipStage] })],
      { processCwd: () => path },
    );
    expect(result.stdout).toContain(formatValidationStageSkipOutput(stage.name, override.reason));
  });
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
      const stageOutputs = exactStageOutputs.filter((output) =>
        output.startsWith(`${stage.name}:`)
        || output.startsWith(`${stage.name} `)
        || output === formatTypeScriptAbsentSkipMessage(stage.name)
      );
      expect(stageOutputs).toHaveLength(1);
      if (scenario.requiredParticipatingStageNames?.includes(stage.name) === true) {
        expect(stageOutputs).not.toContain(formatTypeScriptAbsentSkipMessage(stage.name));
      }
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
