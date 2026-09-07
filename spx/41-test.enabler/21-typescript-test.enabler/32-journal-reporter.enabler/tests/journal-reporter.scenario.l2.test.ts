import { describe, expect, it } from "vitest";

import { JOURNAL_RUN_TERMINAL_STATUS } from "@/test/languages/types";
import { observeRealMixedRun } from "@testing/harnesses/testing/journal-reporter";

describe("journal reporter real programmatic vitest run", () => {
  it("records one module scope and a finding for the failing case over a mixed one-pass, one-fail module, and none for the passing case", async () => {
    await observeRealMixedRun().then((observation) => {
      expect(observation.sink.scopes).toHaveLength(1);
      expect(observation.sink.findings).toHaveLength(1);
      expect(observation.sink.findings[0]?.moduleId).toBe(observation.sink.scopes[0]?.moduleId);
      expect(observation.sink.findings[0]?.errors.length).toBeGreaterThan(0);
      expect(observation.outcome).toEqual({ started: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.FAILED });
      expect(observation.exitCodeAfterRun).toBe(observation.exitCodeBeforeRun);
    });
  });
});
