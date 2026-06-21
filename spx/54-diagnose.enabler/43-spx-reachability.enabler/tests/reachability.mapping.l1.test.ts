import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { classifySpxReachability, SPX_REACHABILITY_VERDICT } from "@/domains/diagnose/checks/spx-reachability";
import { VERDICT_BUCKET } from "@/domains/diagnose/types";
import { arbitraryNameToken, arbitrarySpxFloor } from "@testing/generators/diagnose/manifest";
import { arbitraryFloorParts, spxReachabilityReading } from "@testing/generators/diagnose/reachability";

describe("the spx-reachability check classifies spx against the manifest floor", () => {
  it("classifies a probe error as unknown (bucket unknown), whatever the floor", () => {
    fc.assert(
      fc.property(arbitrarySpxFloor(), (floor) => {
        const result = classifySpxReachability(spxReachabilityReading({ errored: true }), floor);
        expect(result.verdict).toBe(SPX_REACHABILITY_VERDICT.UNKNOWN);
        expect(result.bucket).toBe(VERDICT_BUCKET.UNKNOWN);
        expect(result.remediation.length).toBeGreaterThan(0);
      }),
    );
  });

  it("classifies an absent PATH resolution as unreachable (bucket broken)", () => {
    fc.assert(
      fc.property(arbitrarySpxFloor(), (floor) => {
        const result = classifySpxReachability(spxReachabilityReading({ resolvedPath: null }), floor);
        expect(result.verdict).toBe(SPX_REACHABILITY_VERDICT.UNREACHABLE);
        expect(result.bucket).toBe(VERDICT_BUCKET.BROKEN);
        expect(result.remediation.length).toBeGreaterThan(0);
      }),
    );
  });

  it("classifies a resolved version at or above the floor as reachable (bucket healthy), across patch, minor, and major", () => {
    fc.assert(
      fc.property(arbitraryFloorParts(), arbitraryNameToken(), ([major, minor, patch], path) => {
        const floor = `${major}.${minor}.${patch}`;
        const atOrAbove = [
          floor,
          `${major}.${minor}.${patch + 1}`,
          `${major}.${minor + 1}.${patch}`,
          `${major + 1}.${minor}.${patch}`,
        ];
        for (const version of atOrAbove) {
          const result = classifySpxReachability(spxReachabilityReading({ resolvedPath: path, version }), floor);
          expect(result.verdict).toBe(SPX_REACHABILITY_VERDICT.REACHABLE);
          expect(result.bucket).toBe(VERDICT_BUCKET.HEALTHY);
          expect(result.remediation.length).toBeGreaterThan(0);
        }
      }),
    );
  });

  it("classifies a resolved version below the floor as below-floor (bucket degraded), across patch, minor, and major", () => {
    fc.assert(
      fc.property(arbitraryFloorParts(), arbitraryNameToken(), ([major, minor, patch], path) => {
        const floor = `${major}.${minor}.${patch}`;
        const below = [`${major}.${minor}.${patch - 1}`];
        if (minor > 0) below.push(`${major}.${minor - 1}.${patch}`);
        if (major > 0) below.push(`${major - 1}.${minor}.${patch}`);
        for (const version of below) {
          const result = classifySpxReachability(spxReachabilityReading({ resolvedPath: path, version }), floor);
          expect(result.verdict).toBe(SPX_REACHABILITY_VERDICT.BELOW_FLOOR);
          expect(result.bucket).toBe(VERDICT_BUCKET.DEGRADED);
          expect(result.remediation.length).toBeGreaterThan(0);
        }
      }),
    );
  });

  it("classifies a prerelease at the floor's numeric level as below-floor (bucket degraded)", () => {
    fc.assert(
      fc.property(arbitraryFloorParts(), arbitraryNameToken(), ([major, minor, patch], path) => {
        const floor = `${major}.${minor}.${patch}`;
        const version = `${major}.${minor}.${patch}-beta.1`;
        const result = classifySpxReachability(spxReachabilityReading({ resolvedPath: path, version }), floor);
        expect(result.verdict).toBe(SPX_REACHABILITY_VERDICT.BELOW_FLOOR);
        expect(result.bucket).toBe(VERDICT_BUCKET.DEGRADED);
      }),
    );
  });

  it("classifies a resolved but unreadable version as unknown (bucket unknown)", () => {
    fc.assert(
      fc.property(arbitrarySpxFloor(), arbitraryNameToken(), (floor, path) => {
        const result = classifySpxReachability(spxReachabilityReading({ resolvedPath: path, version: null }), floor);
        expect(result.verdict).toBe(SPX_REACHABILITY_VERDICT.UNKNOWN);
        expect(result.bucket).toBe(VERDICT_BUCKET.UNKNOWN);
        expect(result.remediation.length).toBeGreaterThan(0);
      }),
    );
  });

  it("classifies a resolved reading with no manifest floor as unknown (bucket unknown)", () => {
    fc.assert(
      fc.property(arbitraryNameToken(), arbitraryNameToken(), (path, version) => {
        const result = classifySpxReachability(spxReachabilityReading({ resolvedPath: path, version }), undefined);
        expect(result.verdict).toBe(SPX_REACHABILITY_VERDICT.UNKNOWN);
        expect(result.bucket).toBe(VERDICT_BUCKET.UNKNOWN);
        expect(result.remediation.length).toBeGreaterThan(0);
      }),
    );
  });

  it("classifies a resolved non-semver version as unknown (bucket unknown)", () => {
    fc.assert(
      fc.property(arbitrarySpxFloor(), arbitraryNameToken(), arbitraryNameToken(), (floor, path, version) => {
        fc.pre(!/^\s*\d{1,9}\.\d{1,9}\.\d{1,9}/.test(version));
        const result = classifySpxReachability(spxReachabilityReading({ resolvedPath: path, version }), floor);
        expect(result.verdict).toBe(SPX_REACHABILITY_VERDICT.UNKNOWN);
        expect(result.bucket).toBe(VERDICT_BUCKET.UNKNOWN);
        expect(result.remediation.length).toBeGreaterThan(0);
      }),
    );
  });
});
