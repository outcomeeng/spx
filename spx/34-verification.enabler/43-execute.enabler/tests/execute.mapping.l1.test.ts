import { describe, expect, it } from "vitest";

import { recorderTerminalStatusFor } from "@/commands/verification-exec";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { JOURNAL_RUN_TERMINAL_STATUS } from "@/test/languages/types";
import { JOURNAL_REPORTER_TEST_GENERATOR } from "@testing/generators/testing/journal-reporter";
import { observeTestRunnerFold, streamingDescriptorYielding } from "@testing/harnesses/verification-exec/harness";

describe("spx-driven verification executor terminal-status mapping", () => {
  it("maps every runner terminal status onto exactly one recorder terminal status through a total function", () => {
    const runnerStatuses = Object.entries(JOURNAL_RUN_TERMINAL_STATUS);

    expect(runnerStatuses.length).toBeGreaterThan(0);
    for (const [name, runnerStatus] of runnerStatuses) {
      expect(recorderTerminalStatusFor(runnerStatus)).toBe(
        JOURNAL_RUN_STATE_STATUS[name as keyof typeof JOURNAL_RUN_STATE_STATUS],
      );
    }
    expect(new Set(runnerStatuses.map(([, runnerStatus]) => recorderTerminalStatusFor(runnerStatus))).size).toBe(
      runnerStatuses.length,
    );
  });

  it("folds every combination of streamed language statuses to failed over interrupted over passed", async () => {
    const combinations = JOURNAL_REPORTER_TEST_GENERATOR.terminalStatusCombinations();

    expect(combinations.length).toBeGreaterThan(0);
    for (const statuses of combinations) {
      const expected = statuses.includes(JOURNAL_RUN_TERMINAL_STATUS.FAILED)
        ? JOURNAL_RUN_TERMINAL_STATUS.FAILED
        : statuses.includes(JOURNAL_RUN_TERMINAL_STATUS.INTERRUPTED)
        ? JOURNAL_RUN_TERMINAL_STATUS.INTERRUPTED
        : JOURNAL_RUN_TERMINAL_STATUS.PASSED;
      await expect(observeTestRunnerFold(statuses.map((status) => streamingDescriptorYielding(status)))).resolves
        .toEqual({ invoked: true, terminalStatus: expected });
    }
  });
});
