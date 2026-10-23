/**
 * Guarded-supervision spawn boundary: the guarded runner is the only
 * production module that spawns a detached child.
 */

import { describe, expect, it } from "vitest";

import {
  GUARDED_RUNNER_SOURCE_PATH,
  productionDetachedSpawnSites,
} from "@testing/harnesses/process-lifecycle/guarded-supervision";

describe("guarded-supervision spawn boundary", () => {
  it("confines production `detached: true` to the guarded runner", () => {
    expect(productionDetachedSpawnSites()).toEqual([GUARDED_RUNNER_SOURCE_PATH]);
  });
});
