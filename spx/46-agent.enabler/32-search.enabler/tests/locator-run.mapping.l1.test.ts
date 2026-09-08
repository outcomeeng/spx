import { describe, expect, it } from "vitest";

import {
  interpretTranscriptLocatorRun,
  TRANSCRIPT_LOCATOR_DIAGNOSTIC,
  TRANSCRIPT_LOCATOR_RUN_OUTCOME,
  TranscriptLocatorError,
  TranscriptLocatorUnavailableError,
} from "@/domains/agent/search";
import { RIPGREP_EXIT_CODE } from "@/lib/ripgrep/runner";

import { arbitraryRipgrepRunCases, RIPGREP_RUN_EXIT_STATUSES } from "@testing/generators/agent/locator";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { observeLocatorRuns } from "@testing/harnesses/agent/locator";

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

  it("maps every exit status of a ripgrep run to the locate call's outcome", async () => {
    const observations = await observeLocatorRuns(sampleGeneratedValue(arbitraryRipgrepRunCases()));

    expect(observations.map((observation) => observation.runCase.exitCode)).toEqual([...RIPGREP_RUN_EXIT_STATUSES]);
    for (const { runCase, paths, error } of observations) {
      if (runCase.exitCode === RIPGREP_EXIT_CODE.MATCH) {
        expect(paths).toEqual(runCase.printedPaths);
      } else if (runCase.exitCode === RIPGREP_EXIT_CODE.NO_MATCH) {
        expect(paths).toEqual([]);
      } else if (runCase.exitCode === RIPGREP_EXIT_CODE.ERROR) {
        expect(error).toBeInstanceOf(TranscriptLocatorError);
        expect(error).toMatchObject({ stderr: runCase.result.stderr });
        expect(error).toMatchObject({ message: expect.stringContaining(TRANSCRIPT_LOCATOR_DIAGNOSTIC.FAILED) });
        expect(error).toMatchObject({ message: expect.stringContaining(runCase.result.stderr) });
      } else {
        expect(error).toBeInstanceOf(TranscriptLocatorUnavailableError);
        expect(error).toMatchObject({ message: TRANSCRIPT_LOCATOR_DIAGNOSTIC.UNAVAILABLE });
      }
    }
  });
});
