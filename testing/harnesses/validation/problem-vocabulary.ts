import { describe, expect, it } from "vitest";

import { allCommand } from "@/commands/validation/all";
import { VALIDATION_STAGE_PROBLEM_MESSAGES } from "@/commands/validation/messages";
import { VALIDATION_STAGE_PARTICIPATION, type ValidationStage } from "@/validation/languages/types";
import { validationPipelineStages } from "@/validation/registry";
import { VALIDATION_PIPELINE_DATA } from "@testing/generators/validation/validation";

function problemMessagesForStage(stageName: string): { readonly clear: string; readonly attention: string } {
  const entry = Object.entries(VALIDATION_STAGE_PROBLEM_MESSAGES).find(([name]) => name === stageName);
  if (entry === undefined) throw new Error(`Validation stage ${stageName} has no problem-message contract`);
  return entry[1];
}

describe("ALWAYS: validation uses problem as its canonical attention-item term", () => {
  for (const [stageName, messages] of Object.entries(VALIDATION_STAGE_PROBLEM_MESSAGES)) {
    it(`${stageName} clear output uses the canonical plural term`, () => {
      expect(messages.clear).toMatch(/\bproblems\b/u);
    });

    it(`${stageName} attention output uses the canonical problem term`, () => {
      expect(messages.attention).toMatch(/\bproblems?\b/u);
    });
  }

  it("preserves each stage's canonical attention message through pipeline execution", async () => {
    const stages = validationPipelineStages.map((stage): ValidationStage => ({
      ...stage,
      participation: { default: VALIDATION_STAGE_PARTICIPATION.RUN },
      run: () =>
        Promise.resolve({
          exitCode: VALIDATION_PIPELINE_DATA.exitCodes.FAILURE,
          output: problemMessagesForStage(stage.name).attention,
        }),
    }));
    const result = await allCommand({ cwd: process.cwd() }, { stages });

    for (const stage of stages) {
      expect(result.output).toContain(problemMessagesForStage(stage.name).attention);
      expect(result.output).toMatch(/\bproblems?\b/u);
    }
  });
});
