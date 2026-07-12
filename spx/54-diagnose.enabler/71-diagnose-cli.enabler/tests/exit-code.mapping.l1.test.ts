import { describe, expect, it } from "vitest";

import { overallExitCode, VERDICT_EXIT_CODE } from "@/domains/diagnose/fold";
import { OVERALL_VERDICT } from "@/domains/diagnose/types";

describe("the process exit code maps the overall verdict", () => {
  it.each([
    { overall: OVERALL_VERDICT.HEALTHY, code: 0 },
    { overall: OVERALL_VERDICT.DEGRADED, code: 1 },
    { overall: OVERALL_VERDICT.UNKNOWN, code: 2 },
    { overall: OVERALL_VERDICT.BROKEN, code: 3 },
  ])("maps $overall to exit code $code", ({ overall, code }) => {
    expect(overallExitCode(overall)).toBe(code);
    expect(VERDICT_EXIT_CODE[overall]).toBe(code);
  });

  it("assigns every overall verdict a distinct exit code, keying the code to the verdict", () => {
    const overalls = Object.values(OVERALL_VERDICT);
    const codes = overalls.map((overall) => overallExitCode(overall));
    expect(new Set(codes).size).toBe(overalls.length);
  });

  it("reserves exit code 0 for the healthy verdict alone", () => {
    const zeroCoded = Object.values(OVERALL_VERDICT).filter((overall) => overallExitCode(overall) === 0);
    expect(zeroCoded).toEqual([OVERALL_VERDICT.HEALTHY]);
  });
});
