import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { DEFAULT_IGNORE_SOURCE_OVERRIDES } from "@/lib/file-inclusion/ignore-source";
import {
  fileContent,
  ignoredPattern,
  PROPERTY_NUM_RUNS,
  readerConfig,
  trackedFilePath,
  untrackedFilePath,
} from "@testing/harnesses/file-inclusion/ignore-source";

describe("ignore-source test harness — properties", () => {
  it("readerConfig merges caller overrides into the reader config shape", () => {
    fc.assert(
      fc.property(fc.boolean(), (noIgnore) => {
        const config = readerConfig({ noIgnore });

        expect(config).toEqual({ overrides: { noIgnore } });
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("sampled worktree fixture values are non-empty and distinct across their path roles", () => {
    fc.assert(
      fc.property(fc.boolean(), () => {
        const tracked = trackedFilePath();
        const untracked = untrackedFilePath();
        const ignored = ignoredPattern();

        expect(tracked.length).toBeGreaterThan(0);
        expect(untracked.length).toBeGreaterThan(0);
        expect(ignored.length).toBeGreaterThan(0);
        expect(new Set([tracked, untracked, ignored]).size).toBe(3);
        expect(fileContent().length).toBeGreaterThan(0);
        expect(readerConfig().overrides).toEqual(DEFAULT_IGNORE_SOURCE_OVERRIDES);
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });
});
