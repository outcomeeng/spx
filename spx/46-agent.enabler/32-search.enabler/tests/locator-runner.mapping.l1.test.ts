import { describe, expect, it } from "vitest";

import { RIPGREP_EXIT_CODE, RIPGREP_SIGNAL_DIAGNOSTIC } from "@/lib/ripgrep/runner";

import { arbitraryRipgrepProcessOutcomeCases, RIPGREP_PROCESS_OUTCOME_KIND } from "@testing/generators/agent/locator";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { observeRunnerOutcomes } from "@testing/harnesses/agent/locator";

describe("agent search — ripgrep runner outcome mapping", () => {
  it("maps every process outcome to its run result: exit status, unstartable, or signal-terminated failure", async () => {
    const observations = await observeRunnerOutcomes(sampleGeneratedValue(arbitraryRipgrepProcessOutcomeCases()));

    expect(observations.map((observation) => observation.outcomeCase.kind)).toEqual([
      RIPGREP_PROCESS_OUTCOME_KIND.EXITED,
      RIPGREP_PROCESS_OUTCOME_KIND.EXITED,
      RIPGREP_PROCESS_OUTCOME_KIND.EXITED,
      RIPGREP_PROCESS_OUTCOME_KIND.UNSTARTABLE,
      RIPGREP_PROCESS_OUTCOME_KIND.SIGNALED,
    ]);
    for (const { outcomeCase, result } of observations) {
      if (outcomeCase.kind === RIPGREP_PROCESS_OUTCOME_KIND.EXITED) {
        expect(result.exitCode).toBe(outcomeCase.outcome.exitCode);
        expect(result.stdout).toEqual(outcomeCase.outcome.stdout);
        expect(result.stderr).toBe(outcomeCase.stderrText);
      } else if (outcomeCase.kind === RIPGREP_PROCESS_OUTCOME_KIND.UNSTARTABLE) {
        expect(result.exitCode).toBeNull();
      } else {
        expect(result.exitCode).toBe(RIPGREP_EXIT_CODE.ERROR);
        expect(result.stderr).toBe(`${RIPGREP_SIGNAL_DIAGNOSTIC} ${outcomeCase.outcome.signal}`);
      }
    }
  });
});
