import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { classifySpxReachability, SPX_REACHABILITY_VERDICT } from "@/domains/diagnose/checks/spx-reachability";
import { arbitraryNameToken } from "@testing/generators/diagnose/manifest";
import { arbitraryFloorParts, spxReachabilityReading } from "@testing/generators/diagnose/reachability";

describe("a reachable or below-floor verdict reports the resolved spx path and version verbatim in the readings", () => {
  it("reports the resolved path and version verbatim for a reachable verdict", () => {
    fc.assert(
      fc.property(arbitraryFloorParts(), arbitraryNameToken(), ([major, minor, patch], path) => {
        const floor = `${major}.${minor}.${patch}`;
        const version = `${major}.${minor}.${patch + 1}`;
        const result = classifySpxReachability(spxReachabilityReading({ resolvedPath: path, version }), floor);
        expect(result.verdict).toBe(SPX_REACHABILITY_VERDICT.REACHABLE);
        expect(result.readings.path).toBe(path);
        expect(result.readings.version).toBe(version);
      }),
    );
  });

  it("reports the resolved path and version verbatim for a below-floor verdict", () => {
    fc.assert(
      fc.property(arbitraryFloorParts(), arbitraryNameToken(), ([major, minor, patch], path) => {
        const floor = `${major}.${minor}.${patch}`;
        const version = `${major}.${minor}.${patch - 1}`;
        const result = classifySpxReachability(spxReachabilityReading({ resolvedPath: path, version }), floor);
        expect(result.verdict).toBe(SPX_REACHABILITY_VERDICT.BELOW_FLOOR);
        expect(result.readings.path).toBe(path);
        expect(result.readings.version).toBe(version);
      }),
    );
  });
});
