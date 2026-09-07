import { describe, expect, it } from "vitest";

import {
  interpretTranscriptLocatorRun,
  RIPGREP_EXIT_CODE,
  TRANSCRIPT_LOCATOR_RUN_OUTCOME,
} from "@/domains/agent/search";

import { arbitraryRipgrepRunCases, RIPGREP_RUN_EXIT_STATUSES } from "@testing/generators/agent/locator";
import { sampleGeneratedValue } from "@testing/generators/sample";

describe("agent search — ripgrep run interpretation", () => {
  it("maps every exit status of a ripgrep run to its locator outcome", () => {
    const cases = sampleGeneratedValue(arbitraryRipgrepRunCases());

    expect(cases.map((runCase) => runCase.exitCode)).toEqual([...RIPGREP_RUN_EXIT_STATUSES]);
    for (const runCase of cases) {
      const interpretation = interpretTranscriptLocatorRun(runCase.result);
      if (runCase.exitCode === RIPGREP_EXIT_CODE.MATCH) {
        expect(interpretation).toEqual({ kind: TRANSCRIPT_LOCATOR_RUN_OUTCOME.PATHS, paths: runCase.printedPaths });
      } else if (runCase.exitCode === RIPGREP_EXIT_CODE.NO_MATCH) {
        expect(interpretation).toEqual({ kind: TRANSCRIPT_LOCATOR_RUN_OUTCOME.PATHS, paths: [] });
      } else if (runCase.exitCode === RIPGREP_EXIT_CODE.ERROR) {
        expect(interpretation).toEqual({ kind: TRANSCRIPT_LOCATOR_RUN_OUTCOME.FAILED, stderr: runCase.result.stderr });
      } else {
        expect(runCase.exitCode).toBeNull();
        expect(interpretation).toEqual({ kind: TRANSCRIPT_LOCATOR_RUN_OUTCOME.UNAVAILABLE });
      }
    }
  });
});
