import { describe, expect, it } from "vitest";

import { GIT_WORKTREE_TEST_GENERATOR, sampleGitWorktreeTestValue } from "@testing/generators/git-worktree/git-worktree";
import { GIT_TEST_ENVIRONMENT_KEYS } from "@testing/harnesses/git-test-constants";
import { withProcessEnv } from "@testing/harnesses/process-env/process-env";

const PRESENT_BEFORE_KEY = GIT_TEST_ENVIRONMENT_KEYS.DIR;

function sampleEnvironmentCase() {
  const drawn = Object.values(
    sampleGitWorktreeTestValue(
      GIT_WORKTREE_TEST_GENERATOR.environmentValues(Object.values(GIT_TEST_ENVIRONMENT_KEYS)),
    ),
  );
  const [priorValue, duringPresentValue, duringAbsentValue] = drawn;
  const absentBeforeKey = Object.values(GIT_TEST_ENVIRONMENT_KEYS).find(
    (key) => key !== PRESENT_BEFORE_KEY && process.env[key] === undefined,
  );
  if (absentBeforeKey === undefined) {
    throw new Error("No GIT_* key is absent from process.env to exercise the unset-before case");
  }
  return { priorValue, duringPresentValue, duringAbsentValue, absentBeforeKey };
}

describe("withProcessEnv — restoration at its own callback boundary", () => {
  it("restores a key set before and unsets a key absent before when its callback returns", async () => {
    const { priorValue, duringPresentValue, duringAbsentValue, absentBeforeKey } = sampleEnvironmentCase();
    let observedInsidePresent: string | undefined;
    let observedInsideAbsent: string | undefined;
    let observedAfterPresent: string | undefined;
    let observedAfterAbsent: string | undefined;
    let absentKeyHasEntryAfter = true;

    await withProcessEnv({ [PRESENT_BEFORE_KEY]: priorValue }, async () => {
      await withProcessEnv(
        { [PRESENT_BEFORE_KEY]: duringPresentValue, [absentBeforeKey]: duringAbsentValue },
        async () => {
          observedInsidePresent = process.env[PRESENT_BEFORE_KEY];
          observedInsideAbsent = process.env[absentBeforeKey];
        },
      );
      observedAfterPresent = process.env[PRESENT_BEFORE_KEY];
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
    const { priorValue, duringPresentValue, duringAbsentValue, absentBeforeKey } = sampleEnvironmentCase();
    const thrownError = new Error(duringAbsentValue);
    let observedInsidePresent: string | undefined;
    let observedInsideAbsent: string | undefined;
    let observedAfterPresent: string | undefined;
    let observedAfterAbsent: string | undefined;
    let absentKeyHasEntryAfter = true;

    await withProcessEnv({ [PRESENT_BEFORE_KEY]: priorValue }, async () => {
      await expect(
        withProcessEnv(
          { [PRESENT_BEFORE_KEY]: duringPresentValue, [absentBeforeKey]: duringAbsentValue },
          async () => {
            observedInsidePresent = process.env[PRESENT_BEFORE_KEY];
            observedInsideAbsent = process.env[absentBeforeKey];
            throw thrownError;
          },
        ),
      ).rejects.toBe(thrownError);
      observedAfterPresent = process.env[PRESENT_BEFORE_KEY];
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
