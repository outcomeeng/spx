import { expect, it } from "vitest";

import {
  formatTypeScriptAbsentSkipMessage,
  formatValidationStageSkipOutput,
  VALIDATION_EXIT_CODES,
  VALIDATION_STEP_DURATION_PATTERN,
} from "@/commands/validation/messages";
import { createValidationDomain, validationCliDefinition } from "@/interfaces/cli/validation";
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
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { withValidationEnv } from "@testing/harnesses/with-validation-env";

export function registerTypeScriptValidationScenarioTests(): void {
  for (const scenario of validationAllTypeScriptScenarioEvidence()) {
    it(scenario.title, { timeout: scenario.timeout }, () => runTypeScriptValidationScenario(scenario));
  }
}

export function registerTypeScriptValidationComplianceTests(): void {
  it("invokes every registered TypeScript stage whose descriptor default is run", () =>
    runTypeScriptDescriptorDefaultCompliance());
  const scenario = validationAllTypeScriptComplianceEvidence();
  it(scenario.title, { timeout: scenario.timeout }, () => runTypeScriptValidationScenario(scenario));
}

async function runTypeScriptDescriptorDefaultCompliance(): Promise<void> {
  await withTempDir("spx-typescript-validation-compliance-", async (productDir) => {
    const calls: string[] = [];
    const controlledStages: readonly ValidationStage[] = typescriptValidationLanguage.stages.map((stage) => ({
      ...stage,
      run: async () => {
        calls.push(stage.name);
        return { exitCode: VALIDATION_EXIT_CODES.SUCCESS, output: stage.name };
      },
    }));
    const result = await runValidationInProcessWithDomains(
      [validationCliDefinition.subcommands.all.commandName],
      [createValidationDomain({ validationStages: controlledStages })],
      { processCwd: () => productDir },
    );
    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(calls).toEqual(
      typescriptValidationLanguage.stages
        .filter((stage) => stage.participation.default === VALIDATION_STAGE_PARTICIPATION.RUN)
        .map((stage) => stage.name),
    );
    for (const stage of typescriptValidationLanguage.stages) {
      if (stage.participation.default === VALIDATION_STAGE_PARTICIPATION.RUN) {
        expect(result.stdout).toContain(stage.name);
        continue;
      }
      const reason = stage.participation.defaultSkipReason;
      if (reason === undefined) throw new Error(`${stage.name} default skip requires a reason`);
      expect(result.stdout).toContain(formatValidationStageSkipOutput(stage.name, reason));
    }
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
      expect(exactStageOutputs.filter((output) =>
        output.startsWith(`${stage.name}:`)
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
