import { isAbsolute } from "node:path";

import { describe, expect, it } from "vitest";

import { DEPENDENCIES_SEGMENT, PARENT_SEGMENT, PRODUCT_PATH_SEPARATOR } from "@/test/languages/journal-reporter";
import { JOURNAL_RUN_TERMINAL_STATUS } from "@/test/languages/types";
import {
  observeRealMixedRun,
  observeRealReadingRun,
  observeRealRunWithRejectingSink,
} from "@testing/harnesses/testing/journal-reporter";

describe("journal reporter real programmatic vitest run", () => {
  it("records one module scope and a finding for the failing case over a mixed one-pass, one-fail module, and none for the passing case", async () => {
    await observeRealMixedRun().then((observation) => {
      expect(observation.sink.scopes).toHaveLength(1);
      expect(observation.sink.findings).toHaveLength(1);
      const readPaths = observation.sink.scopes[0]?.readPaths ?? [];
      expect(readPaths).toContain(observation.testFileName);
      expect(readPaths).toContain(observation.lockfileName);
      for (const readPath of readPaths) {
        expect(isAbsolute(readPath)).toBe(false);
        expect(readPath.split(PRODUCT_PATH_SEPARATOR)).not.toContain(DEPENDENCIES_SEGMENT);
        expect(readPath.split(PRODUCT_PATH_SEPARATOR)).not.toContain(PARENT_SEGMENT);
      }
      expect(observation.sink.findings[0]?.moduleId).toBe(observation.sink.scopes[0]?.moduleId);
      expect(observation.sink.findings[0]?.errors.length).toBeGreaterThan(0);
      expect(observation.outcome).toEqual({ started: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.FAILED });
      expect(observation.exitCodeAfterRun).toBe(observation.exitCodeBeforeRun);
    });
  });

  it("rejects the run with the sink's first failure and yields no terminal status when real Vitest catches the rejecting hooks", async () => {
    await observeRealRunWithRejectingSink().then((observation) => {
      expect(observation.issuedFailures.length).toBeGreaterThan(1);
      expect(observation.rejection).toBe(observation.issuedFailures[0]);
      expect(observation.resolved).toBeUndefined();
    });
  });

  it("records the product-relative path of a data file the module opened at run time, which the read recorder registered in the worker reports", async () => {
    await observeRealReadingRun().then((observation) => {
      expect(observation.sink.scopes).toHaveLength(1);
      const readPaths = observation.sink.scopes[0]?.readPaths ?? [];
      expect(readPaths).toContain(observation.dataFileName);
      expect(readPaths).toContain(observation.testFileName);
    });
  });
});
