import { describe, expect, it } from "vitest";

import { GIT_WORKTREE_TEST_GENERATOR, sampleGitWorktreeTestValue } from "@testing/generators/git-worktree/git-worktree";
import { withProcessEnv } from "@testing/harnesses/process-env/process-env";

function sampleEnvironmentCase() {
  const keys = sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.environmentKeys(3));
  const [presentBeforeKey, absentBeforeKey] = keys;
  const [priorValue, duringPresentValue, duringAbsentValue] = Object.values(
    sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.environmentValues(keys)),
  );
  return { presentBeforeKey, absentBeforeKey, priorValue, duringPresentValue, duringAbsentValue };
}

describe("withProcessEnv — restoration at its own callback boundary", () => {
  it("restores a key set before and unsets a key absent before when its callback returns", async () => {
    const { presentBeforeKey, absentBeforeKey, priorValue, duringPresentValue, duringAbsentValue } =
      sampleEnvironmentCase();
    let observedInsidePresent: string | undefined;
    let observedInsideAbsent: string | undefined;
    let observedAfterPresent: string | undefined;
    let observedAfterAbsent: string | undefined;
    let absentKeyHasEntryAfter = true;

    await withProcessEnv({ [presentBeforeKey]: priorValue }, async () => {
      await withProcessEnv(
        { [presentBeforeKey]: duringPresentValue, [absentBeforeKey]: duringAbsentValue },
        async () => {
          observedInsidePresent = process.env[presentBeforeKey];
          observedInsideAbsent = process.env[absentBeforeKey];
        },
      );
      observedAfterPresent = process.env[presentBeforeKey];
      observedAfterAbsent = process.env[absentBeforeKey];
      absentKeyHasEntryAfter = absentBeforeKey in process.env;
    });

    expect(observedInsidePresent).toBe(duringPresentValue);
    expect(observedInsideAbsent).toBe(duringAbsentValue);
    expect(observedAfterPresent).toBe(priorValue);
    expect(observedAfterAbsent).toBeUndefined();
    expect(absentKeyHasEntryAfter).toBe(false);
  });

  it("restores a key set before and unsets a key absent before when its callback rejects", async () => {
    const { presentBeforeKey, absentBeforeKey, priorValue, duringPresentValue, duringAbsentValue } =
      sampleEnvironmentCase();
    const thrownError = new Error(duringAbsentValue);
    let observedInsidePresent: string | undefined;
    let observedInsideAbsent: string | undefined;
    let observedAfterPresent: string | undefined;
    let observedAfterAbsent: string | undefined;
    let absentKeyHasEntryAfter = true;

    await withProcessEnv({ [presentBeforeKey]: priorValue }, async () => {
      await expect(
        withProcessEnv(
          { [presentBeforeKey]: duringPresentValue, [absentBeforeKey]: duringAbsentValue },
          async () => {
            observedInsidePresent = process.env[presentBeforeKey];
            observedInsideAbsent = process.env[absentBeforeKey];
            throw thrownError;
          },
        ),
      ).rejects.toBe(thrownError);
      observedAfterPresent = process.env[presentBeforeKey];
      observedAfterAbsent = process.env[absentBeforeKey];
      absentKeyHasEntryAfter = absentBeforeKey in process.env;
    });

    expect(observedInsidePresent).toBe(duringPresentValue);
    expect(observedInsideAbsent).toBe(duringAbsentValue);
    expect(observedAfterPresent).toBe(priorValue);
    expect(observedAfterAbsent).toBeUndefined();
    expect(absentKeyHasEntryAfter).toBe(false);
  });
});
