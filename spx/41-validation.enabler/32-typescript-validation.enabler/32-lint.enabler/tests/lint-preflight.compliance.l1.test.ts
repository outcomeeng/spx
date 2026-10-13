import { describe, expect, it } from "vitest";

import { VALIDATION_COMMAND_OUTPUT, VALIDATION_EXIT_CODES } from "@/commands/validation/messages";
import { observeLintPreflight } from "@testing/harnesses/validation/lint-args-compliance";

describe("ESLint command preflight gates", () => {
  it("returns at TypeScript detection before any ESLint collaborator", async () => {
    const observation = await observeLintPreflight({ detection: { present: false }, quiet: true });

    expect(observation.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(observation.detectionCalls).toBe(1);
    expect(observation.downstreamCalls).toBe(0);
  });

  it("rejects a missing flat config before discovery or process execution", async () => {
    const observation = await observeLintPreflight({ detection: { present: true }, quiet: false });

    expect(observation.exitCode).toBe(VALIDATION_EXIT_CODES.FAILURE);
    expect(observation.output).toBe(VALIDATION_COMMAND_OUTPUT.ESLINT_MISSING_CONFIG);
    expect(observation.detectionCalls).toBe(1);
    expect(observation.downstreamCalls).toBe(0);
  });
});
